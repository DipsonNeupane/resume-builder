-- APWICO launch application tracker.
--
-- One application record per saved opportunity: a public.saved_jobs row (provider,
-- extension capture, pasted URL or manual entry) plus its job_application_workflows row.
-- A single `stage` replaces the previous overlapping decision/application_status pair;
-- `closed_reason` is separate so "no response" is never recorded as a rejection.
-- Events explain every stage change and record its origin. Submitted/exported resume
-- documents are immutable snapshots. Plan limits come from one product_settings row.
--
-- Expand step of an expand/contract change. Rows that may exist from internal testing are
-- converted in place. The previous decision/application_status/reminder columns, the
-- job_application_history table and the jobs_workflow_* RPCs are KEPT and synchronized by
-- a trigger, so the previous release keeps working if the app is rolled back. They are
-- removed only by supabase/contract/20261110000000_application_tracker_contract.sql,
-- which is not in this directory and must be applied separately after owner approval.
-- All tables stay server-only (no browser grants, RLS forced); every RPC takes the
-- owner from the verified access token on the server and filters by it.

-- 1. Launch plan settings (single row, owner-editable by SQL; no client access).
create table public.product_settings (
  id boolean primary key default true check (id),
  free_application_limit integer not null default 100 check (free_application_limit between 1 and 10000),
  free_tailoring_trials integer not null default 1 check (free_tailoring_trials between 0 and 5),
  updated_at timestamptz not null default now()
);
insert into public.product_settings(id) values (true);
alter table public.product_settings enable row level security;
alter table public.product_settings force row level security;
revoke all on table public.product_settings from public, anon, authenticated, service_role;
grant select on table public.product_settings to service_role;

create function public.applications_owner_limit(p_owner uuid)
returns integer language plpgsql stable security definer set search_path='' as $$
declare v_is_pro boolean;
begin
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  if v_is_pro then return 10000; end if;
  return (select free_application_limit from public.product_settings where id);
end $$;

-- 2. Manual/external records: a URL is optional and the provider is 'manual'.
alter table public.saved_jobs alter column source_url drop not null;
alter table public.saved_jobs drop constraint if exists saved_jobs_source_url_check;
alter table public.saved_jobs add constraint saved_jobs_source_url_check check (
  (source_url is null and provider = 'manual')
  or (source_url is not null and length(source_url) between 9 and 2048 and source_url ~ '^https://')
);

-- Tracking parameters are removed one by one; meaningful identifiers (gh_jid, jobId,
-- etc.), their order and any fragment are kept. The host is case-insensitive; the path is not.
create or replace function public.jobs_source_identity(p_url text)
returns text language plpgsql immutable set search_path='' as $$
declare v_base text; v_query text; v_kept text[]; v_host text; v_rest text;
  v_fragment text := case when strpos(p_url, '#') > 0 then substr(p_url, strpos(p_url, '#')) else '' end;
begin
  if p_url is null then return null; end if;
  v_base := split_part(split_part(p_url, '#', 1), '?', 1);
  v_query := case when strpos(split_part(p_url, '#', 1), '?') > 0 then split_part(split_part(p_url, '#', 1), '?', 2) else '' end;
  select coalesce(array_agg(part order by ord), '{}') into v_kept
    from unnest(string_to_array(v_query, '&')) with ordinality as q(part, ord)
   where part <> '' and part !~* '^(utm_[a-z_]+|gclid|fbclid|msclkid|mc_[a-z]+|_hs[a-z]+|ref|refid|trk|trackingid|source|src)=';
  v_host := lower(substring(v_base from '^https?://[^/]+'));
  v_rest := substr(v_base, length(coalesce(v_host, '')) + 1);
  return coalesce(v_host, '') || rtrim(v_rest, '/')
    || case when cardinality(v_kept) > 0 then '?' || array_to_string(v_kept, '&') else '' end || v_fragment;
end $$;
revoke all on function public.jobs_source_identity(text) from public, anon, authenticated;
grant execute on function public.jobs_source_identity(text) to service_role;

-- 3. Single-stage workflow model.
alter table public.job_application_workflows
  add column stage text,
  add column closed_reason text,
  add column prior_stage text,
  add column applied_on date,
  add column next_action text not null default '',
  add column next_action_due timestamptz,
  add column origin text not null default 'user',
  add column created_at timestamptz not null default now();

update public.job_application_workflows set
  stage = case
    when application_status in ('preparing','applied','interviewing','offer') then application_status
    when application_status in ('closed','withdrawn') or decision = 'pass' then 'closed'
    else 'saved' end,
  closed_reason = case
    when application_status = 'withdrawn' then 'withdrawn'
    when application_status = 'closed' then 'other'
    when decision = 'pass' and application_status = 'not_applied' then 'archived'
    else null end,
  next_action = case when reminder_enabled then 'Follow up' else '' end,
  next_action_due = case when reminder_enabled then reminder_at else null end;

alter table public.job_application_workflows
  alter column stage set not null,
  alter column stage set default 'saved',
  add constraint job_application_workflows_stage check (stage in ('saved','preparing','applied','interviewing','offer','closed')),
  add constraint job_application_workflows_prior_stage check (prior_stage is null or prior_stage in ('saved','preparing','applied','interviewing','offer','closed')),
  add constraint job_application_workflows_closed_reason check (
    (stage = 'closed' and closed_reason in ('rejected','withdrawn','role_closed','no_response','archived','other'))
    or (stage <> 'closed' and closed_reason is null)),
  add constraint job_application_workflows_next_action check (char_length(next_action) <= 300
    and (next_action_due is null or next_action <> '')),
  add constraint job_application_workflows_origin check (origin in ('user','capture','suggestion','import'));
create index job_application_workflows_owner_due_idx on public.job_application_workflows(owner_id, next_action_due) where next_action_due is not null;

-- Legacy sync (removed in the contract step). Whichever release writes, both shapes stay
-- consistent: a stage/closed-reason change from this release rewrites the legacy pair;
-- a legacy change from the previous release (jobs_workflow_upsert) rewrites the stage.
-- Legacy reminders are not mirrored into next actions after this migration.
create function public.job_application_workflows_legacy_sync()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_stage_written boolean;
  v_legacy_written boolean;
begin
  if tg_op = 'INSERT' then
    v_stage_written := new.stage <> 'saved' or new.closed_reason is not null;
    v_legacy_written := new.application_status <> 'not_applied' or new.decision <> 'review';
  else
    v_stage_written := new.stage is distinct from old.stage or new.closed_reason is distinct from old.closed_reason;
    v_legacy_written := new.application_status is distinct from old.application_status or new.decision is distinct from old.decision;
  end if;
  if v_stage_written then
    new.application_status := case new.stage when 'saved' then 'not_applied'
      when 'closed' then case when new.closed_reason = 'withdrawn' then 'withdrawn' else 'closed' end
      else new.stage end;
    new.decision := case when new.stage = 'saved' then 'review'
      when new.stage = 'closed' and new.closed_reason = 'archived' then 'pass' else 'pursue' end;
  elsif v_legacy_written then
    new.stage := case
      when new.application_status in ('preparing','applied','interviewing','offer') then new.application_status
      when new.application_status in ('closed','withdrawn') or new.decision = 'pass' then 'closed'
      else 'saved' end;
    new.closed_reason := case when new.stage <> 'closed' then null
      when new.application_status = 'withdrawn' then 'withdrawn'
      when new.application_status = 'closed' then 'other' else 'archived' end;
    if tg_op = 'UPDATE' and new.stage is distinct from old.stage then new.prior_stage := old.stage; end if;
  end if;
  return new;
end $$;
revoke all on function public.job_application_workflows_legacy_sync() from public, anon, authenticated;
create trigger job_application_workflows_legacy_sync before insert or update on public.job_application_workflows
  for each row execute function public.job_application_workflows_legacy_sync();

-- 4. Event history (supersedes job_application_history, which is backfilled here).
create table public.job_application_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid not null references public.saved_jobs(id) on delete cascade,
  kind text not null check (kind in ('created','stage_changed','next_action','document_attached','imported')),
  from_stage text check (from_stage is null or from_stage in ('saved','preparing','applied','interviewing','offer','closed')),
  to_stage text check (to_stage is null or to_stage in ('saved','preparing','applied','interviewing','offer','closed')),
  closed_reason text check (closed_reason is null or closed_reason in ('rejected','withdrawn','role_closed','no_response','archived','other')),
  origin text not null check (origin in ('user','capture','suggestion','import')),
  occurred_at timestamptz not null default now()
);
create index job_application_events_owner_job_idx on public.job_application_events(owner_id, saved_job_id, occurred_at desc);
alter table public.job_application_events enable row level security;
alter table public.job_application_events force row level security;
revoke all on table public.job_application_events from public, anon, authenticated, service_role;
grant select on table public.job_application_events to service_role;

insert into public.job_application_events(owner_id, saved_job_id, kind, to_stage, origin, occurred_at)
select h.owner_id, h.saved_job_id, 'stage_changed',
  case when h.application_status in ('preparing','applied','interviewing','offer') then h.application_status
       when h.application_status in ('closed','withdrawn') or h.decision='pass' then 'closed' else 'saved' end,
  'user', h.changed_at
from public.job_application_history h;
-- job_application_history and jobs_workflow_list/jobs_workflow_upsert stay for the
-- previous release until the contract step; this release never reads or writes them.

-- 5. Immutable exported/submitted documents.
create table public.job_application_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid not null references public.saved_jobs(id) on delete cascade,
  job_resume_version_id uuid references public.job_resume_versions(id) on delete set null,
  source_kind text not null check (source_kind in ('master','job_version')),
  source_revision bigint,
  format text not null check (format in ('pdf','docx')),
  template text not null check (char_length(template) between 1 and 40),
  resume_snapshot jsonb not null check (jsonb_typeof(resume_snapshot)='object' and octet_length(resume_snapshot::text) <= 8000000),
  content_fingerprint text not null check (content_fingerprint ~ '^[0-9a-f]{64}$'),
  exported_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index job_application_documents_owner_job_idx on public.job_application_documents(owner_id, saved_job_id, exported_at desc);
alter table public.job_application_documents enable row level security;
alter table public.job_application_documents force row level security;
revoke all on table public.job_application_documents from public, anon, authenticated, service_role;
grant select on table public.job_application_documents to service_role;

create function public.job_application_documents_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.owner_id is distinct from old.owner_id or new.saved_job_id is distinct from old.saved_job_id
    or new.source_kind is distinct from old.source_kind or new.source_revision is distinct from old.source_revision
    or new.format is distinct from old.format or new.template is distinct from old.template
    or new.resume_snapshot is distinct from old.resume_snapshot or new.content_fingerprint is distinct from old.content_fingerprint
    or new.exported_at is distinct from old.exported_at
    or (old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at)
    or (new.job_resume_version_id is distinct from old.job_resume_version_id and new.job_resume_version_id is not null)
  then raise exception 'Application documents are immutable'; end if;
  return new;
end $$;
create trigger job_application_documents_immutable before update on public.job_application_documents
  for each row execute function public.job_application_documents_immutable();

-- 6. Shared row shape. Notes/contact stay in the application row, never in events.
create function public.applications_row(p_owner uuid, p_saved_job uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'savedJobId', j.id,
    'stage', coalesce(w.stage, 'saved'), 'closedReason', w.closed_reason, 'priorStage', w.prior_stage,
    'appliedOn', w.applied_on, 'nextAction', coalesce(w.next_action, ''), 'nextActionDue', w.next_action_due,
    'notes', coalesce(w.notes, ''), 'contactName', coalesce(w.contact_name, ''), 'contactDetails', coalesce(w.contact_details, ''),
    'origin', coalesce(w.origin, case when j.provider = 'extension' then 'capture' else 'user' end),
    'revision', coalesce(w.revision, 0), 'createdAt', coalesce(w.created_at, j.saved_at), 'updatedAt', coalesce(w.updated_at, j.saved_at),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'fromStage', e.from_stage, 'toStage', e.to_stage,
        'closedReason', e.closed_reason, 'origin', e.origin, 'occurredAt', e.occurred_at) order by e.occurred_at desc, e.id desc)
      from (select * from public.job_application_events where owner_id = p_owner and saved_job_id = j.id
            order by occurred_at desc, id desc limit 50) e), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'format', d.format, 'template', d.template,
        'sourceKind', d.source_kind, 'jobResumeVersionId', d.job_resume_version_id, 'exportedAt', d.exported_at,
        'submittedAt', d.submitted_at) order by d.exported_at desc)
      from (select * from public.job_application_documents where owner_id = p_owner and saved_job_id = j.id
            order by exported_at desc limit 20) d), '[]'::jsonb))
  from public.saved_jobs j
  left join public.job_application_workflows w on w.saved_job_id = j.id and w.owner_id = p_owner
  where j.id = p_saved_job and j.owner_id = p_owner
$$;

create function public.applications_list(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(public.applications_row(p_owner, j.id) order by j.saved_at desc, j.id desc), '[]'::jsonb)
  from public.saved_jobs j where j.owner_id = p_owner
$$;

-- Validated stage transition + event. Shared by update, create and import paths.
create function public.applications_apply(
  p_owner uuid, p_saved_job uuid, p_expected_revision integer, p_fields jsonb, p_origin text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing public.job_application_workflows; v_stage text; v_reason text; v_from text;
  v_applied date; v_next text; v_due timestamptz; v_found boolean;
begin
  if p_owner is null or p_saved_job is null or p_fields is null or jsonb_typeof(p_fields) <> 'object'
    or p_origin not in ('user','capture','suggestion','import') or p_expected_revision is null or p_expected_revision < 0
  then raise exception 'Invalid application update'; end if;
  if not exists(select 1 from public.saved_jobs where id = p_saved_job and owner_id = p_owner)
  then raise exception 'Saved job not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text || ':' || p_saved_job::text, 301));
  select * into v_existing from public.job_application_workflows where saved_job_id = p_saved_job and owner_id = p_owner for update;
  v_found := found;
  if (v_found and v_existing.revision <> p_expected_revision) or (not v_found and p_expected_revision <> 0)
  then raise exception 'Application conflict'; end if;

  v_from := case when v_found then v_existing.stage else null end;
  v_stage := coalesce(p_fields->>'stage', v_from, 'saved');
  v_reason := case when p_fields ? 'closedReason' then p_fields->>'closedReason' else v_existing.closed_reason end;
  if v_stage <> 'closed' then v_reason := null; end if;
  if v_stage = 'closed' and v_reason is null then raise exception 'Closed reason required'; end if;
  v_applied := case when p_fields ? 'appliedOn' then nullif(p_fields->>'appliedOn', '')::date else v_existing.applied_on end;
  if v_stage = 'applied' and v_applied is null then v_applied := (now() at time zone 'UTC')::date; end if;
  if v_applied is not null and v_applied > (now() at time zone 'UTC')::date + 1 then raise exception 'Invalid application update'; end if;
  v_next := case when p_fields ? 'nextAction' then coalesce(p_fields->>'nextAction', '') else coalesce(v_existing.next_action, '') end;
  v_due := case when p_fields ? 'nextActionDue' then nullif(p_fields->>'nextActionDue', '')::timestamptz else v_existing.next_action_due end;

  insert into public.job_application_workflows(owner_id, saved_job_id, stage, closed_reason, prior_stage, applied_on,
    next_action, next_action_due, notes, contact_name, contact_details, origin, revision)
  values (p_owner, p_saved_job, v_stage, v_reason, null, v_applied, v_next, v_due,
    coalesce(p_fields->>'notes', ''), coalesce(p_fields->>'contactName', ''), coalesce(p_fields->>'contactDetails', ''), p_origin, 1)
  on conflict (saved_job_id) do update set
    stage = excluded.stage, closed_reason = excluded.closed_reason,
    prior_stage = case when public.job_application_workflows.stage is distinct from excluded.stage
      then public.job_application_workflows.stage else public.job_application_workflows.prior_stage end,
    applied_on = excluded.applied_on, next_action = excluded.next_action, next_action_due = excluded.next_action_due,
    notes = case when p_fields ? 'notes' then excluded.notes else public.job_application_workflows.notes end,
    contact_name = case when p_fields ? 'contactName' then excluded.contact_name else public.job_application_workflows.contact_name end,
    contact_details = case when p_fields ? 'contactDetails' then excluded.contact_details else public.job_application_workflows.contact_details end,
    origin = excluded.origin, revision = public.job_application_workflows.revision + 1, updated_at = now()
  where public.job_application_workflows.owner_id = p_owner;

  if v_from is distinct from v_stage or (v_stage = 'closed' and v_existing.closed_reason is distinct from v_reason) then
    insert into public.job_application_events(owner_id, saved_job_id, kind, from_stage, to_stage, closed_reason, origin)
    values (p_owner, p_saved_job, case when v_found then 'stage_changed' else case when p_origin = 'import' then 'imported' else 'created' end end,
      v_from, v_stage, v_reason, p_origin);
  end if;
  if v_found and (v_existing.next_action is distinct from v_next or v_existing.next_action_due is distinct from v_due) then
    insert into public.job_application_events(owner_id, saved_job_id, kind, origin) values (p_owner, p_saved_job, 'next_action', p_origin);
  end if;
  delete from public.job_application_events where id in (
    select id from public.job_application_events where owner_id = p_owner and saved_job_id = p_saved_job
    order by occurred_at desc, id desc offset 200);
  return public.applications_row(p_owner, p_saved_job);
end $$;

create function public.applications_update(p_owner uuid, p_saved_job uuid, p_expected_revision integer, p_fields jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select public.applications_apply(p_owner, p_saved_job, p_expected_revision, p_fields, 'user')
$$;

-- Creates a manual/pasted-URL application. A URL that already identifies one of the
-- owner's records returns that record instead of a duplicate; company/title alone
-- never deduplicates (different openings at one company are legitimate).
create function public.applications_create(p_owner uuid, p_job jsonb, p_fields jsonb, p_origin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing uuid; v_count integer; v_limit integer; v_saved uuid;
begin
  if p_owner is null or p_job is null or jsonb_typeof(p_job) <> 'object' or p_job->>'provider' <> 'manual'
    or p_origin not in ('user','import') then raise exception 'Invalid application'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 5341));
  if p_job->>'sourceUrl' is not null then
    select id into v_existing from public.saved_jobs where owner_id = p_owner
      and public.jobs_source_identity(source_url) = public.jobs_source_identity(p_job->>'sourceUrl') limit 1;
    if found then return jsonb_build_object('savedJobId', v_existing, 'alreadySaved', true); end if;
  end if;
  v_limit := public.applications_owner_limit(p_owner);
  select count(*) into v_count from public.saved_jobs where owner_id = p_owner;
  if v_count >= v_limit then raise exception using errcode = 'P0001', message = case when v_limit >= 10000
    then 'Saved-job safety limit reached' else 'Free application limit reached' end; end if;
  insert into public.saved_jobs(owner_id, provider, provider_job_id, dedupe_key, snapshot, source_url)
  values (p_owner, 'manual', p_job->>'providerJobId', p_job->>'dedupeKey', p_job, p_job->>'sourceUrl')
  returning id into v_saved;
  perform public.applications_apply(p_owner, v_saved, 0, p_fields, p_origin);
  return jsonb_build_object('savedJobId', v_saved, 'alreadySaved', false);
end $$;

-- Owner-scoped identity rows for import duplicate review (no snapshot content).
create function public.applications_identities(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('savedJobId', id, 'sourceIdentity', public.jobs_source_identity(source_url),
    'company', snapshot->>'company', 'title', snapshot->>'title')), '[]'::jsonb)
  from public.saved_jobs where owner_id = p_owner
$$;

-- Records the exact exported document for an application. Called only after a
-- successful export. The resume snapshot is copied, so later master/version edits
-- never change it.
create function public.applications_attach_document(
  p_owner uuid, p_saved_job uuid, p_version uuid, p_format text, p_template text, p_snapshot jsonb, p_fingerprint text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_kind text := 'master'; v_revision bigint; v_id uuid; v_existing uuid;
begin
  if p_owner is null or p_saved_job is null or p_format not in ('pdf','docx') or p_snapshot is null
    or jsonb_typeof(p_snapshot) <> 'object' or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid application document'; end if;
  if not exists(select 1 from public.saved_jobs where id = p_saved_job and owner_id = p_owner) then raise exception 'Saved job not found'; end if;
  if p_version is not null then
    select revision into v_revision from public.job_resume_versions where id = p_version and owner_id = p_owner and saved_job_id = p_saved_job;
    if not found then raise exception 'Job resume not found'; end if;
    v_kind := 'job_version';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text || ':' || p_saved_job::text, 302));
  -- An identical retry of the same export is recorded once.
  select id into v_existing from public.job_application_documents where owner_id = p_owner and saved_job_id = p_saved_job
    and content_fingerprint = p_fingerprint and format = p_format and template = p_template limit 1;
  if found then return jsonb_build_object('documentId', v_existing, 'created', false); end if;
  if (select count(*) from public.job_application_documents where owner_id = p_owner and saved_job_id = p_saved_job) >= 20
  then raise exception 'Application document limit reached'; end if;
  insert into public.job_application_documents(owner_id, saved_job_id, job_resume_version_id, source_kind, source_revision, format, template, resume_snapshot, content_fingerprint)
  values (p_owner, p_saved_job, p_version, v_kind, v_revision, p_format, p_template, p_snapshot, p_fingerprint) returning id into v_id;
  insert into public.job_application_events(owner_id, saved_job_id, kind, origin) values (p_owner, p_saved_job, 'document_attached', 'user');
  return jsonb_build_object('documentId', v_id, 'created', true);
end $$;

create function public.applications_document_get(p_owner uuid, p_document uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id', id, 'savedJobId', saved_job_id, 'format', format, 'template', template,
    'sourceKind', source_kind, 'sourceRevision', source_revision, 'jobResumeVersionId', job_resume_version_id,
    'exportedAt', exported_at, 'submittedAt', submitted_at, 'contentFingerprint', content_fingerprint, 'resume', resume_snapshot)
  from public.job_application_documents where id = p_document and owner_id = p_owner
$$;

-- Applied only on explicit user confirmation; an Apply/View click never calls this.
create function public.applications_confirm_submitted(
  p_owner uuid, p_saved_job uuid, p_expected_revision integer, p_document uuid, p_applied_on date
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_applied_on is null or p_applied_on > (now() at time zone 'UTC')::date + 1 then raise exception 'Invalid application update'; end if;
  if p_document is not null then
    update public.job_application_documents set submitted_at = coalesce(submitted_at, now())
    where id = p_document and owner_id = p_owner and saved_job_id = p_saved_job;
    if not found then raise exception 'Application document not found'; end if;
  end if;
  return public.applications_apply(p_owner, p_saved_job, p_expected_revision,
    jsonb_build_object('stage', 'applied', 'appliedOn', p_applied_on), 'user');
end $$;

-- 7. Plan limits read from product_settings everywhere they are enforced or reported.
create or replace function public.jobs_account_snapshot(p_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_is_pro boolean; v_result jsonb;
begin
  if p_owner is null then raise exception 'Invalid owner'; end if;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  update public.saved_jobs set provider_available=false,
    unavailable_at=coalesce(unavailable_at,now()), availability_checked_at=now(), updated_at=now()
    where owner_id=p_owner and provider_available and expires_at is not null and expires_at<=now();
  select jsonb_build_object('isPro',v_is_pro,'saveLimit',public.applications_owner_limit(p_owner),
    'savedCount',(select count(*) from public.saved_jobs where owner_id=p_owner),
    'preferences',coalesce((select jsonb_build_object('criteria',criteria,'autoRefresh',auto_refresh,
      'lastProviderRefreshAt',last_provider_refresh_at) from public.job_preferences where owner_id=p_owner),
      jsonb_build_object('criteria',null,'autoRefresh',false,'lastProviderRefreshAt',null)),
    'savedJobs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'snapshot',snapshot,
      'providerAvailable',provider_available,'availabilityCheckedAt',availability_checked_at,
      'unavailableAt',unavailable_at,'savedAt',saved_at) order by saved_at desc)
      from public.saved_jobs where owner_id=p_owner),'[]'::jsonb)) into v_result;
  return v_result;
end $$;

create or replace function public.jobs_save(p_owner uuid, p_job jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.saved_jobs; v_count integer; v_limit integer; v_saved public.saved_jobs;
begin
  if p_owner is null or p_job is null or jsonb_typeof(p_job)<>'object' or p_job->>'provider'='manual' then raise exception 'Invalid saved job'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,5341));
  select * into v_existing from public.saved_jobs where owner_id=p_owner and
    ((provider=p_job->>'provider' and provider_job_id=p_job->>'providerJobId') or dedupe_key=p_job->>'dedupeKey'
      or public.jobs_source_identity(source_url)=public.jobs_source_identity(p_job->>'sourceUrl')) limit 1;
  if found then return jsonb_build_object('savedJobId',v_existing.id,'alreadySaved',true); end if;
  v_limit := public.applications_owner_limit(p_owner);
  select count(*) into v_count from public.saved_jobs where owner_id=p_owner;
  if v_count>=v_limit then raise exception using errcode='P0001', message=case when v_limit>=10000
    then 'Saved-job safety limit reached' else 'Free application limit reached' end; end if;
  insert into public.saved_jobs(owner_id,provider,provider_job_id,dedupe_key,snapshot,source_url,expires_at,provider_available)
  values(p_owner,p_job->>'provider',p_job->>'providerJobId',p_job->>'dedupeKey',p_job,p_job->>'sourceUrl',
    case when p_job#>>'{expiry,source}'='provider' then nullif(p_job#>>'{expiry,expiresAt}','')::timestamptz else null end,
    not coalesce(p_job#>>'{expiry,source}'='provider' and nullif(p_job#>>'{expiry,expiresAt}','')::timestamptz<=now(),false))
  returning * into v_saved;
  return jsonb_build_object('savedJobId',v_saved.id,'alreadySaved',false);
end $$;

-- 8. Starting a job-specific resume is "Prepare my application": it requires an open
-- application and moves a saved record to preparing (recorded as a user event).
create or replace function public.job_resume_version_create(p_owner uuid,p_saved_job uuid,p_data jsonb,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_is_pro boolean; v_job jsonb; v_master public.resumes; v_row public.job_resume_versions; v_stage text; v_revision integer;
begin
  if p_owner is null or p_saved_job is null or p_data is null or jsonb_typeof(p_data)<>'object'
    or octet_length(p_data::text)>8000000 or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid job resume'; end if;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if not coalesce(v_is_pro,false) then raise exception 'Active Pro required'; end if;
  select snapshot into v_job from public.saved_jobs where id=p_saved_job and owner_id=p_owner;
  if v_job is null then raise exception 'Saved job not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||p_saved_job::text,193));
  select * into v_row from public.job_resume_versions where owner_id=p_owner and saved_job_id=p_saved_job;
  if found then return jsonb_build_object('created',false,'version',to_jsonb(v_row)); end if;
  select stage, revision into v_stage, v_revision from public.job_application_workflows where owner_id=p_owner and saved_job_id=p_saved_job;
  if v_stage = 'closed' then raise exception 'Application closed'; end if;
  if v_stage is null or v_stage = 'saved' then
    perform public.applications_apply(p_owner, p_saved_job, coalesce(v_revision,0), jsonb_build_object('stage','preparing'), 'user');
  end if;
  select * into v_master from public.resumes where owner_id=p_owner;
  insert into public.job_resume_versions(owner_id,saved_job_id,job_snapshot,source_master_resume_id,source_master_revision,source_master_fingerprint,data)
  values(p_owner,p_saved_job,v_job,v_master.id,v_master.revision,p_fingerprint,p_data) returning * into v_row;
  return jsonb_build_object('created',true,'version',to_jsonb(v_row));
end $$;

revoke all on function public.applications_owner_limit(uuid), public.applications_row(uuid,uuid), public.applications_list(uuid),
  public.applications_apply(uuid,uuid,integer,jsonb,text), public.applications_update(uuid,uuid,integer,jsonb),
  public.applications_create(uuid,jsonb,jsonb,text), public.applications_identities(uuid),
  public.applications_attach_document(uuid,uuid,uuid,text,text,jsonb,text), public.applications_document_get(uuid,uuid),
  public.applications_confirm_submitted(uuid,uuid,integer,uuid,date),
  public.jobs_account_snapshot(uuid), public.jobs_save(uuid,jsonb), public.job_resume_version_create(uuid,uuid,jsonb,text),
  public.job_application_documents_immutable()
  from public, anon, authenticated;
grant execute on function public.applications_owner_limit(uuid), public.applications_list(uuid),
  public.applications_update(uuid,uuid,integer,jsonb), public.applications_create(uuid,jsonb,jsonb,text),
  public.applications_identities(uuid), public.applications_attach_document(uuid,uuid,uuid,text,text,jsonb,text),
  public.applications_document_get(uuid,uuid), public.applications_confirm_submitted(uuid,uuid,integer,uuid,date),
  public.jobs_account_snapshot(uuid), public.jobs_save(uuid,jsonb), public.job_resume_version_create(uuid,uuid,jsonb,text)
  to service_role;
