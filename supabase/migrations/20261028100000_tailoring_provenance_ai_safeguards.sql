-- Tailoring provenance and AI safeguards. Additive; nothing is dropped except the
-- four-argument job_resume_version_update, which is replaced by a five-argument form
-- (a default argument alongside the old signature would make calls ambiguous).
--
-- 1. Provenance: each accepted tailoring change records whether the kept wording is the
--    AI's, the person's own, or the AI's backed by a fact the person added, with the
--    requirement and resume references it was checked against. It lives on the existing
--    service-role-only job_resume_versions row and is copied into the immutable kept
--    document at export, so historical versions show what was true when exported.
--    Provenance is a record of the person's review decisions as submitted by their
--    signed-in browser; it is not a tamper-proof audit and does not verify truth.
-- 2. The service-wide monthly AI budget is a product setting (default US$25, never above
--    US$25 without a new migration), so staging can lower it to rehearse exhaustion.
-- 3. Requests that fail do not count toward a person's hourly AI allowance or their
--    Free trial runs. A separate attempt cap still bounds repeated failures.
-- 4. Trial runs are reserved before the provider call and released on failure, so two
--    simultaneous requests cannot together exceed the trial.

-- 1. Provenance -----------------------------------------------------------------------

alter table public.job_resume_versions
  add column provenance jsonb not null default '[]'::jsonb,
  add constraint job_resume_versions_provenance_bound check (
    jsonb_typeof(provenance) = 'array' and jsonb_array_length(provenance) <= 60 and octet_length(provenance::text) <= 200000);

alter table public.job_application_documents
  add column provenance jsonb,
  add constraint job_application_documents_provenance_bound check (
    provenance is null or (jsonb_typeof(provenance) = 'array' and jsonb_array_length(provenance) <= 60 and octet_length(provenance::text) <= 200000));

drop function public.job_resume_version_update(uuid,uuid,bigint,jsonb);
-- p_provenance null keeps the stored provenance unchanged.
create function public.job_resume_version_update(p_owner uuid,p_version uuid,p_expected_revision bigint,p_data jsonb,p_provenance jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.job_resume_versions;
begin
  if p_owner is null or p_version is null or p_expected_revision is null or p_expected_revision<1
    or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8000000
    or (p_provenance is not null and jsonb_typeof(p_provenance)<>'array') then raise exception 'Invalid job resume update'; end if;
  update public.job_resume_versions set data=p_data,provenance=coalesce(p_provenance,provenance),revision=revision+1,updated_at=now()
    where id=p_version and owner_id=p_owner and revision=p_expected_revision returning * into v_row;
  if not found then
    if exists(select 1 from public.job_resume_versions where id=p_version and owner_id=p_owner) then raise exception 'Job resume conflict'; end if;
    raise exception 'Job resume not found';
  end if;
  return to_jsonb(v_row);
end $$;
revoke all on function public.job_resume_version_update(uuid,uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.job_resume_version_update(uuid,uuid,bigint,jsonb,jsonb) to service_role;

-- Resetting from the master replaces every tailored change, so its provenance goes too.
create or replace function public.job_resume_version_reset(p_owner uuid,p_version uuid,p_expected_revision bigint,p_data jsonb,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_master public.resumes; v_row public.job_resume_versions;
begin
  if p_owner is null or p_version is null or p_expected_revision is null or p_expected_revision<1
    or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8000000
    or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid job resume reset'; end if;
  select * into v_master from public.resumes where owner_id=p_owner;
  update public.job_resume_versions set data=p_data,provenance='[]'::jsonb,revision=revision+1,
    source_master_resume_id=v_master.id,source_master_revision=v_master.revision,
    source_master_fingerprint=p_fingerprint,updated_at=now()
    where id=p_version and owner_id=p_owner and revision=p_expected_revision returning * into v_row;
  if not found then
    if exists(select 1 from public.job_resume_versions where id=p_version and owner_id=p_owner) then raise exception 'Job resume conflict'; end if;
    raise exception 'Job resume not found';
  end if;
  return to_jsonb(v_row);
end $$;

create or replace function public.job_application_documents_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.owner_id is distinct from old.owner_id or new.saved_job_id is distinct from old.saved_job_id
    or new.source_kind is distinct from old.source_kind or new.source_revision is distinct from old.source_revision
    or new.format is distinct from old.format or new.template is distinct from old.template
    or new.resume_snapshot is distinct from old.resume_snapshot or new.content_fingerprint is distinct from old.content_fingerprint
    or new.provenance is distinct from old.provenance
    or new.exported_at is distinct from old.exported_at
    or (old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at)
    or (new.job_resume_version_id is distinct from old.job_resume_version_id and new.job_resume_version_id is not null)
  then raise exception 'Application documents are immutable'; end if;
  return new;
end $$;

-- Provenance is copied only when the exported snapshot is exactly the stored version, so
-- a kept document never carries provenance for different wording. Otherwise it is null
-- ("not recorded"), never a guess.
create or replace function public.applications_attach_document(
  p_owner uuid, p_saved_job uuid, p_version uuid, p_format text, p_template text, p_snapshot jsonb, p_fingerprint text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_kind text := 'master'; v_revision bigint; v_data jsonb; v_provenance jsonb; v_id uuid; v_existing uuid;
begin
  if p_owner is null or p_saved_job is null or p_format not in ('pdf','docx') or p_snapshot is null
    or jsonb_typeof(p_snapshot) <> 'object' or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid application document'; end if;
  if not exists(select 1 from public.saved_jobs where id = p_saved_job and owner_id = p_owner) then raise exception 'Saved job not found'; end if;
  if p_version is not null then
    select revision, data, provenance into v_revision, v_data, v_provenance from public.job_resume_versions where id = p_version and owner_id = p_owner and saved_job_id = p_saved_job;
    if not found then raise exception 'Job resume not found'; end if;
    v_kind := 'job_version';
    if v_data is distinct from p_snapshot then v_provenance := null; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text || ':' || p_saved_job::text, 302));
  -- An identical retry of the same export is recorded once.
  select id into v_existing from public.job_application_documents where owner_id = p_owner and saved_job_id = p_saved_job
    and content_fingerprint = p_fingerprint and format = p_format and template = p_template limit 1;
  if found then return jsonb_build_object('documentId', v_existing, 'created', false); end if;
  if (select count(*) from public.job_application_documents where owner_id = p_owner and saved_job_id = p_saved_job) >= 20
  then raise exception 'Application document limit reached'; end if;
  insert into public.job_application_documents(owner_id, saved_job_id, job_resume_version_id, source_kind, source_revision, format, template, resume_snapshot, content_fingerprint, provenance)
  values (p_owner, p_saved_job, p_version, v_kind, v_revision, p_format, p_template, p_snapshot, p_fingerprint, v_provenance) returning id into v_id;
  insert into public.job_application_events(owner_id, saved_job_id, kind, origin) values (p_owner, p_saved_job, 'document_attached', 'user');
  return jsonb_build_object('documentId', v_id, 'created', true);
end $$;

create or replace function public.applications_document_get(p_owner uuid, p_document uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id', id, 'savedJobId', saved_job_id, 'format', format, 'template', template,
    'sourceKind', source_kind, 'sourceRevision', source_revision, 'jobResumeVersionId', job_resume_version_id,
    'exportedAt', exported_at, 'submittedAt', submitted_at, 'contentFingerprint', content_fingerprint, 'resume', resume_snapshot,
    'provenance', provenance)
  from public.job_application_documents where id = p_document and owner_id = p_owner
$$;

-- 2. Configurable monthly AI budget ---------------------------------------------------

-- Integer micro-US dollars. Lowering it is a testing safeguard; the table check on
-- ai_budget_months still caps any month at US$25, so raising it needs a new migration.
alter table public.product_settings
  add column ai_monthly_budget_micro_usd bigint not null default 25000000
    check (ai_monthly_budget_micro_usd between 0 and 25000000);

-- 3. Failed requests do not use a person's hourly allowance -------------------------

create or replace function public.reserve_ai_budget(p_request uuid, p_owner uuid, p_max_micro_usd bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', timezone('UTC', now()))::date;
  v_request public.ai_budget_requests%rowtype;
  v_budget public.ai_budget_months%rowtype;
  v_cap bigint;
begin
  if p_request is null or p_owner is null or p_max_micro_usd is null or p_max_micro_usd not between 1 and 1000000 then
    raise exception 'Invalid AI reservation' using errcode = '22023';
  end if;
  -- Serialize replay IDs even across a month rollover.
  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 293));
  select * into v_request from public.ai_budget_requests where request_id = p_request;
  if found then
    if v_request.owner_id is distinct from p_owner or v_request.reserved_micro_usd <> p_max_micro_usd then
      raise exception 'AI request mismatch' using errcode = '22023';
    end if;
    -- Replayed/uncertain requests NEVER authorize a second provider call.
    return false;
  end if;
  insert into public.ai_budget_months(month_start) values(v_month) on conflict do nothing;
  select * into v_budget from public.ai_budget_months where month_start = v_month for update;
  select ai_monthly_budget_micro_usd into v_cap from public.product_settings where id;
  if v_budget.reserved_micro_usd + v_budget.spent_micro_usd + p_max_micro_usd > least(coalesce(v_cap, 25000000), 25000000) then
    raise exception 'AI monthly budget reached' using errcode = '54000';
  end if;
  -- Per-account guards, serialized under the shared month lock. The allowance counts
  -- requests that are running or succeeded; the attempt cap counts every request so
  -- repeated failures stay bounded.
  if (select count(*) from public.ai_budget_requests where owner_id=p_owner and created_at > now()-interval '1 hour'
      and status in ('reserved','in_progress','succeeded')) >= 20 then
    raise exception 'AI request limit reached' using errcode = '54000';
  end if;
  if (select count(*) from public.ai_budget_requests where owner_id=p_owner and created_at > now()-interval '1 hour') >= 60 then
    raise exception 'AI attempt limit reached' using errcode = '54000';
  end if;
  insert into public.ai_budget_requests(request_id,owner_id,month_start,reserved_micro_usd)
    values(p_request,p_owner,v_month,p_max_micro_usd);
  update public.ai_budget_months set reserved_micro_usd=reserved_micro_usd+p_max_micro_usd where month_start=v_month;
  return true;
end $$;

-- A request that failed cleanly may be retried at once. One that timed out or ended
-- uncertainly may still have been billed, so the same content waits ten minutes
-- ('cooldown') rather than risk paying twice.
create or replace function public.begin_ai_request(
  p_request uuid,
  p_owner uuid,
  p_max_micro_usd bigint,
  p_feature text,
  p_model text,
  p_request_fingerprint text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.ai_budget_requests%rowtype;
  v_recent text;
  v_reserved boolean;
begin
  if p_request is null or p_owner is null or p_max_micro_usd is null
    or p_feature is null or p_feature !~ '^[a-z][a-z0-9_]{0,39}$'
    or p_model is null or char_length(p_model) not between 1 and 200
    or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid AI reservation' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || p_request_fingerprint, 841));
  select * into v_existing from public.ai_budget_requests where request_id = p_request;
  if found then
    if v_existing.owner_id is distinct from p_owner
      or v_existing.reserved_micro_usd <> p_max_micro_usd
      or v_existing.feature <> p_feature
      or v_existing.model <> p_model
      or v_existing.request_fingerprint is distinct from p_request_fingerprint then
      raise exception 'AI request mismatch' using errcode = '22023';
    end if;
    return 'duplicate';
  end if;

  select status into v_recent from public.ai_budget_requests
    where owner_id = p_owner
      and request_fingerprint = p_request_fingerprint
      and feature = p_feature
      and model = p_model
      and created_at > now() - interval '10 minutes'
      and status not in ('failed','invalid')
    order by case when status in ('reserved','in_progress','succeeded') then 0 else 1 end
    limit 1;
  if v_recent in ('timed_out','uncertain') then return 'cooldown'; end if;
  if v_recent is not null then return 'duplicate'; end if;

  v_reserved := public.reserve_ai_budget(p_request, p_owner, p_max_micro_usd);
  if not v_reserved then return 'duplicate'; end if;
  update public.ai_budget_requests
  set feature = p_feature, model = p_model, request_fingerprint = p_request_fingerprint
  where request_id = p_request;
  return 'reserved';
end $$;

-- 4. Trial runs are reserved before the provider call --------------------------------

alter table public.product_tailoring_trial_runs
  add column status text not null default 'succeeded' check (status in ('reserved','succeeded'));

-- A reservation older than five minutes belongs to a request that can no longer be
-- running (functions stop after 60 seconds), so it stops counting.
create function public.product_trial_runs_used(p_owner uuid)
returns integer language sql stable security definer set search_path='' as $$
  select count(*)::integer from public.product_tailoring_trial_runs
  where owner_id = p_owner and (status = 'succeeded' or recorded_at > now() - interval '5 minutes')
$$;

create or replace function public.product_trial_status(p_owner uuid, p_saved_job uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_trial public.product_tailoring_trials; v_runs integer; v_allowed integer; v_trials integer;
begin
  select free_trial_ai_runs, free_tailoring_trials into v_allowed, v_trials from public.product_settings where id;
  select * into v_trial from public.product_tailoring_trials where owner_id = p_owner;
  v_runs := public.product_trial_runs_used(p_owner);
  return jsonb_build_object(
    'enabled', v_trials > 0,
    'used', v_trial.owner_id is not null,
    'savedJobId', v_trial.saved_job_id,
    'runsRemaining', greatest(0, v_allowed - v_runs),
    'runsAllowed', v_allowed,
    'appliesToJob', p_saved_job is not null and v_trial.saved_job_id = p_saved_job and v_runs < v_allowed,
    'available', v_trials > 0 and (v_trial.owner_id is null or (p_saved_job is not null and v_trial.saved_job_id = p_saved_job and v_runs < v_allowed)));
end $$;

-- 'reserved' (go ahead), 'duplicate' (this request id already holds or used a run),
-- 'exhausted' (no runs left) or 'unavailable' (the trial is not bound to this job).
create function public.product_reserve_trial_run(p_owner uuid, p_saved_job uuid, p_request uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_allowed integer; v_status text;
begin
  if p_owner is null or p_saved_job is null or p_request is null then raise exception 'Invalid trial run'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 517));
  if not exists(select 1 from public.product_tailoring_trials where owner_id = p_owner and saved_job_id = p_saved_job) then return 'unavailable'; end if;
  select status into v_status from public.product_tailoring_trial_runs where request_id = p_request and owner_id = p_owner;
  if v_status = 'succeeded' then return 'duplicate'; end if;
  delete from public.product_tailoring_trial_runs where request_id = p_request and owner_id = p_owner and status = 'reserved';
  select free_trial_ai_runs into v_allowed from public.product_settings where id;
  if public.product_trial_runs_used(p_owner) >= v_allowed then return 'exhausted'; end if;
  insert into public.product_tailoring_trial_runs(request_id, owner_id, status) values (p_request, p_owner, 'reserved');
  return 'reserved';
end $$;

create or replace function public.product_record_trial_run(p_owner uuid, p_saved_job uuid, p_request uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_owner is null or p_saved_job is null or p_request is null then raise exception 'Invalid trial run'; end if;
  if not exists(select 1 from public.product_tailoring_trials where owner_id = p_owner and saved_job_id = p_saved_job) then return false; end if;
  insert into public.product_tailoring_trial_runs(request_id, owner_id, status) values (p_request, p_owner, 'succeeded')
    on conflict (request_id) do update set status = 'succeeded', recorded_at = now()
    where public.product_tailoring_trial_runs.status = 'reserved' and public.product_tailoring_trial_runs.owner_id = p_owner;
  return found;
end $$;

create function public.product_release_trial_run(p_owner uuid, p_request uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_owner is null or p_request is null then raise exception 'Invalid trial run'; end if;
  delete from public.product_tailoring_trial_runs where request_id = p_request and owner_id = p_owner and status = 'reserved';
  return found;
end $$;

revoke all on function public.product_trial_runs_used(uuid), public.product_reserve_trial_run(uuid,uuid,uuid),
  public.product_release_trial_run(uuid,uuid) from public, anon, authenticated;
grant execute on function public.product_trial_runs_used(uuid), public.product_reserve_trial_run(uuid,uuid,uuid),
  public.product_release_trial_run(uuid,uuid) to service_role;
