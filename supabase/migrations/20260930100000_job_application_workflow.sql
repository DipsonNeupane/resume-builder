-- Owner-scoped, manually maintained application workflow. This table is product
-- storage, not analytics: notes/contact details never enter product event records.
create table public.job_application_workflows (
  owner_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid primary key references public.saved_jobs(id) on delete cascade,
  decision text not null default 'review' check (decision in ('review','pursue','pass')),
  application_status text not null default 'not_applied' check (application_status in ('not_applied','preparing','applied','interviewing','offer','closed','withdrawn')),
  notes text not null default '' check (octet_length(notes) <= 16000),
  contact_name text not null default '' check (char_length(contact_name) <= 200),
  contact_details text not null default '' check (char_length(contact_details) <= 500),
  reminder_enabled boolean not null default false,
  reminder_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  check ((reminder_enabled and reminder_at is not null) or (not reminder_enabled and reminder_at is null))
);

create index job_application_workflows_owner_updated_idx
  on public.job_application_workflows(owner_id, updated_at desc);

alter table public.job_application_workflows enable row level security;
revoke all on table public.job_application_workflows from public, anon, authenticated, service_role;
grant select on table public.job_application_workflows to service_role;

create table public.job_application_history (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid not null references public.saved_jobs(id) on delete cascade,
  decision text not null check (decision in ('review','pursue','pass')),
  application_status text not null check (application_status in ('not_applied','preparing','applied','interviewing','offer','closed','withdrawn')),
  changed_at timestamptz not null default now()
);
create index job_application_history_owner_job_idx
  on public.job_application_history(owner_id, saved_job_id, changed_at desc);
alter table public.job_application_history enable row level security;
revoke all on table public.job_application_history from public, anon, authenticated, service_role;
grant select on table public.job_application_history to service_role;

create function public.jobs_workflow_list(p_owner uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'savedJobId',saved_job_id,'decision',decision,'applicationStatus',application_status,
    'notes',notes,'contactName',contact_name,'contactDetails',contact_details,
    'reminderEnabled',reminder_enabled,'reminderAt',reminder_at,'revision',revision,'updatedAt',updated_at,
    'history',coalesce((select jsonb_agg(jsonb_build_object(
      'decision',h.decision,'applicationStatus',h.application_status,'changedAt',h.changed_at
    ) order by h.changed_at desc) from (select decision,application_status,changed_at
      from public.job_application_history where owner_id=p_owner and saved_job_id=job_application_workflows.saved_job_id
      order by changed_at desc limit 100) h),'[]'::jsonb)
  ) order by updated_at desc),'[]'::jsonb)
  from public.job_application_workflows where owner_id=p_owner
$$;

create function public.jobs_workflow_upsert(
  p_owner uuid, p_saved_job uuid, p_decision text, p_application_status text,
  p_notes text, p_contact_name text, p_contact_details text,
  p_reminder_enabled boolean, p_reminder_at timestamptz, p_expected_revision integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.job_application_workflows; v_existing public.job_application_workflows;
begin
  if p_owner is null or p_saved_job is null
    or p_decision not in ('review','pursue','pass')
    or p_application_status not in ('not_applied','preparing','applied','interviewing','offer','closed','withdrawn')
    or p_notes is null or octet_length(p_notes)>16000
    or p_contact_name is null or char_length(p_contact_name)>200
    or p_contact_details is null or char_length(p_contact_details)>500
    or p_reminder_enabled is null
    or p_expected_revision is null or p_expected_revision < 0
    or (p_reminder_enabled and p_reminder_at is null)
    or (p_reminder_enabled and p_reminder_at<=now())
    or (not p_reminder_enabled and p_reminder_at is not null)
  then raise exception 'Invalid job workflow'; end if;
  if not exists(select 1 from public.saved_jobs where id=p_saved_job and owner_id=p_owner)
  then raise exception 'Saved job not found'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||p_saved_job::text,301));
  select * into v_existing from public.job_application_workflows
  where saved_job_id=p_saved_job and owner_id=p_owner for update;
  if found and v_existing.revision<>p_expected_revision then raise exception 'Job workflow conflict'; end if;
  if not found and p_expected_revision<>0 then raise exception 'Job workflow conflict'; end if;

  insert into public.job_application_workflows(
    owner_id,saved_job_id,decision,application_status,notes,contact_name,contact_details,
    reminder_enabled,reminder_at,revision
  ) values (
    p_owner,p_saved_job,p_decision,p_application_status,p_notes,p_contact_name,p_contact_details,
    p_reminder_enabled,p_reminder_at,1
  ) on conflict(saved_job_id) do update set
    decision=excluded.decision, application_status=excluded.application_status,
    notes=excluded.notes, contact_name=excluded.contact_name, contact_details=excluded.contact_details,
    reminder_enabled=excluded.reminder_enabled, reminder_at=excluded.reminder_at,
    revision=public.job_application_workflows.revision+1, updated_at=now()
  where public.job_application_workflows.owner_id=p_owner
  returning * into v_row;
  if v_row is null then raise exception 'Saved job not found'; end if;
  if v_existing is null or v_existing.decision is distinct from v_row.decision
    or v_existing.application_status is distinct from v_row.application_status then
    insert into public.job_application_history(owner_id,saved_job_id,decision,application_status)
    values(p_owner,p_saved_job,v_row.decision,v_row.application_status);
    delete from public.job_application_history where id in (
      select id from public.job_application_history
      where owner_id=p_owner and saved_job_id=p_saved_job
      order by changed_at desc,id desc offset 100
    );
  end if;
  return jsonb_build_object(
    'savedJobId',v_row.saved_job_id,'decision',v_row.decision,'applicationStatus',v_row.application_status,
    'notes',v_row.notes,'contactName',v_row.contact_name,'contactDetails',v_row.contact_details,
    'reminderEnabled',v_row.reminder_enabled,'reminderAt',v_row.reminder_at,'revision',v_row.revision,'updatedAt',v_row.updated_at,
    'history',coalesce((select jsonb_agg(jsonb_build_object(
      'decision',h.decision,'applicationStatus',h.application_status,'changedAt',h.changed_at
    ) order by h.changed_at desc) from (select decision,application_status,changed_at
      from public.job_application_history where owner_id=p_owner and saved_job_id=p_saved_job
      order by changed_at desc limit 100) h),'[]'::jsonb)
  );
end $$;

revoke all on function public.jobs_workflow_list(uuid),
  public.jobs_workflow_upsert(uuid,uuid,text,text,text,text,text,boolean,timestamptz,integer)
  from public, anon, authenticated;
grant execute on function public.jobs_workflow_list(uuid),
  public.jobs_workflow_upsert(uuid,uuid,text,text,text,text,text,boolean,timestamptz,integer)
  to service_role;

-- Defense in depth: creating a new job-specific resume requires the owner's
-- persisted pursue decision. Existing versions remain readable after a later pass.
create or replace function public.job_resume_version_create(p_owner uuid,p_saved_job uuid,p_data jsonb,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_is_pro boolean; v_job jsonb; v_master public.resumes; v_row public.job_resume_versions;
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
  if not exists(select 1 from public.job_application_workflows
    where owner_id=p_owner and saved_job_id=p_saved_job and decision='pursue')
  then raise exception 'Pursue decision required'; end if;
  select * into v_master from public.resumes where owner_id=p_owner;
  insert into public.job_resume_versions(owner_id,saved_job_id,job_snapshot,source_master_resume_id,source_master_revision,source_master_fingerprint,data)
  values(p_owner,p_saved_job,v_job,v_master.id,v_master.revision,p_fingerprint,p_data) returning * into v_row;
  return jsonb_build_object('created',true,'version',to_jsonb(v_row));
end $$;
