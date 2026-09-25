-- One persistent, account-owned job-specific resume per saved job. These rows
-- deliberately do not foreign-key to resumes or saved_jobs: deleting either
-- source must not cascade-delete work the owner already created.

create table public.job_resume_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid not null,
  job_snapshot jsonb not null,
  source_master_resume_id uuid,
  source_master_revision bigint,
  source_master_fingerprint text not null,
  data jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, saved_job_id),
  constraint job_resume_versions_snapshot_bound check (jsonb_typeof(job_snapshot)='object' and octet_length(job_snapshot::text)<=40000),
  constraint job_resume_versions_data_bound check (jsonb_typeof(data)='object' and octet_length(data::text)<=8000000),
  constraint job_resume_versions_fingerprint check (source_master_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint job_resume_versions_revision check (revision >= 1)
);
create index job_resume_versions_owner_updated_idx on public.job_resume_versions(owner_id, updated_at desc);

alter table public.job_resume_versions enable row level security;
revoke all on table public.job_resume_versions from public, anon, authenticated, service_role;
grant select on table public.job_resume_versions to service_role;
-- Browser clients never access this table directly. Authentication and
-- ownership are enforced by the API before these service-only RPCs are used.

create function public.job_resume_master(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when r.id is null then null else jsonb_build_object('id',r.id,'revision',r.revision,'data',r.data) end
  from (select p_owner owner_id) requested
  left join public.resumes r on r.owner_id=requested.owner_id
$$;

create function public.job_resume_versions_list(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,'savedJobId',v.saved_job_id,'jobSnapshot',v.job_snapshot,
    'sourceMasterResumeId',v.source_master_resume_id,'sourceMasterRevision',v.source_master_revision,
    'sourceMasterFingerprint',v.source_master_fingerprint,'revision',v.revision,
    'createdAt',v.created_at,'updatedAt',v.updated_at,
    'savedJobExists',exists(select 1 from public.saved_jobs j where j.id=v.saved_job_id and j.owner_id=p_owner)
  ) order by v.updated_at desc),'[]'::jsonb)
  from public.job_resume_versions v where v.owner_id=p_owner
$$;

create function public.job_resume_version_create(p_owner uuid,p_saved_job uuid,p_data jsonb,p_fingerprint text)
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
  select * into v_master from public.resumes where owner_id=p_owner;
  insert into public.job_resume_versions(owner_id,saved_job_id,job_snapshot,source_master_resume_id,source_master_revision,source_master_fingerprint,data)
  values(p_owner,p_saved_job,v_job,v_master.id,v_master.revision,p_fingerprint,p_data) returning * into v_row;
  return jsonb_build_object('created',true,'version',to_jsonb(v_row));
end $$;

create function public.job_resume_version_get(p_owner uuid,p_version uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_row public.job_resume_versions;
begin
  select * into v_row from public.job_resume_versions where id=p_version and owner_id=p_owner;
  if not found then raise exception 'Job resume not found'; end if;
  return to_jsonb(v_row);
end $$;

create function public.job_resume_version_update(p_owner uuid,p_version uuid,p_expected_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.job_resume_versions;
begin
  if p_owner is null or p_version is null or p_expected_revision is null or p_expected_revision<1
    or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8000000 then raise exception 'Invalid job resume update'; end if;
  update public.job_resume_versions set data=p_data,revision=revision+1,updated_at=now()
    where id=p_version and owner_id=p_owner and revision=p_expected_revision returning * into v_row;
  if not found then
    if exists(select 1 from public.job_resume_versions where id=p_version and owner_id=p_owner) then raise exception 'Job resume conflict'; end if;
    raise exception 'Job resume not found';
  end if;
  return to_jsonb(v_row);
end $$;

create function public.job_resume_version_reset(p_owner uuid,p_version uuid,p_expected_revision bigint,p_data jsonb,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_master public.resumes; v_row public.job_resume_versions;
begin
  if p_owner is null or p_version is null or p_expected_revision is null or p_expected_revision<1
    or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8000000
    or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid job resume reset'; end if;
  select * into v_master from public.resumes where owner_id=p_owner;
  update public.job_resume_versions set data=p_data,revision=revision+1,
    source_master_resume_id=v_master.id,source_master_revision=v_master.revision,
    source_master_fingerprint=p_fingerprint,updated_at=now()
    where id=p_version and owner_id=p_owner and revision=p_expected_revision returning * into v_row;
  if not found then
    if exists(select 1 from public.job_resume_versions where id=p_version and owner_id=p_owner) then raise exception 'Job resume conflict'; end if;
    raise exception 'Job resume not found';
  end if;
  return to_jsonb(v_row);
end $$;

revoke all on function public.job_resume_master(uuid),public.job_resume_versions_list(uuid),public.job_resume_version_create(uuid,uuid,jsonb,text),
  public.job_resume_version_get(uuid,uuid),public.job_resume_version_update(uuid,uuid,bigint,jsonb),
  public.job_resume_version_reset(uuid,uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.job_resume_master(uuid),public.job_resume_versions_list(uuid),public.job_resume_version_create(uuid,uuid,jsonb,text),
  public.job_resume_version_get(uuid,uuid),public.job_resume_version_update(uuid,uuid,bigint,jsonb),
  public.job_resume_version_reset(uuid,uuid,bigint,jsonb,text) to service_role;
