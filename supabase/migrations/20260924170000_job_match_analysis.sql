-- ResumeStride V1 evidence-based job match analysis. Server-only, account-scoped,
-- bounded and explicitly invalidated by versioned input hashes.

alter table public.saved_jobs drop constraint if exists saved_jobs_snapshot_check;
alter table public.saved_jobs add constraint saved_jobs_snapshot_check check (
  jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 40000
);
alter table public.saved_jobs
  add column match_analysis jsonb,
  add column match_analysis_version integer,
  add column match_resume_hash text,
  add column match_job_hash text,
  add column match_context_hash text,
  add column match_invalidated_at timestamptz,
  add column match_invalidation_reason text,
  add constraint saved_jobs_match_analysis_bound check (match_analysis is null or (jsonb_typeof(match_analysis)='object' and octet_length(match_analysis::text)<=64000)),
  add constraint saved_jobs_match_hashes check (
    (match_resume_hash is null or match_resume_hash ~ '^[0-9a-f]{64}$') and
    (match_job_hash is null or match_job_hash ~ '^[0-9a-f]{64}$') and
    (match_context_hash is null or match_context_hash ~ '^[0-9a-f]{64}$')
  );

create table public.job_match_clarifications (
  owner_id uuid not null references auth.users(id) on delete cascade,
  requirement_id text not null check (requirement_id ~ '^[0-9a-f]{16}$'),
  value text not null check (value in ('demonstrated','not_have','unsure')),
  updated_at timestamptz not null default now(),
  primary key(owner_id, requirement_id)
);
alter table public.job_match_clarifications enable row level security;
revoke all on table public.job_match_clarifications from public, anon, authenticated, service_role;
grant select on table public.job_match_clarifications to service_role;

create function public.jobs_match_context(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('clarifications', coalesce((
    select jsonb_object_agg(requirement_id, value) from public.job_match_clarifications where owner_id=p_owner
  ), '{}'::jsonb))
$$;

create function public.jobs_save_v2(p_owner uuid, p_job jsonb, p_analysis jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_saved uuid;
begin
  if p_analysis is null or jsonb_typeof(p_analysis)<>'object' or octet_length(p_analysis::text)>64000
    or coalesce((p_analysis->>'version')::integer,0)<>1
    or coalesce(p_analysis->>'label','') not in ('strong','good','stretch')
    or coalesce(p_analysis->>'resumeHash','') !~ '^[0-9a-f]{64}$'
    or coalesce(p_analysis->>'jobHash','') !~ '^[0-9a-f]{64}$'
    or coalesce(p_analysis->>'contextHash','') !~ '^[0-9a-f]{64}$'
  then raise exception 'Invalid match analysis'; end if;
  v_result := public.jobs_save(p_owner,p_job);
  v_saved := (v_result->>'savedJobId')::uuid;
  update public.saved_jobs set match_analysis=p_analysis, match_analysis_version=(p_analysis->>'version')::integer,
    match_resume_hash=p_analysis->>'resumeHash', match_job_hash=p_analysis->>'jobHash',
    match_context_hash=p_analysis->>'contextHash', match_invalidated_at=null,
    match_invalidation_reason=null, updated_at=now()
  where id=v_saved and owner_id=p_owner;
  return v_result;
end $$;

create function public.jobs_account_snapshot_v2(p_owner uuid, p_resume_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_base jsonb;
begin
  if p_owner is null or (p_resume_hash is not null and p_resume_hash !~ '^[0-9a-f]{64}$') then raise exception 'Invalid match snapshot request'; end if;
  update public.saved_jobs set match_invalidated_at=coalesce(match_invalidated_at,now()),
    match_invalidation_reason=coalesce(match_invalidation_reason,'analysis_version_changed'),updated_at=now()
  where owner_id=p_owner and match_analysis is not null and match_analysis_version is distinct from 1;
  if p_resume_hash is not null then
    update public.saved_jobs set match_invalidated_at=coalesce(match_invalidated_at,now()),
      match_invalidation_reason=coalesce(match_invalidation_reason,'resume_changed'), updated_at=now()
    where owner_id=p_owner and match_analysis is not null and match_resume_hash is distinct from p_resume_hash;
  end if;
  v_base := public.jobs_account_snapshot(p_owner);
  v_base := jsonb_set(v_base,'{preferences,clarifications}',coalesce((select jsonb_object_agg(requirement_id,value) from public.job_match_clarifications where owner_id=p_owner),'{}'::jsonb),true);
  v_base := jsonb_set(v_base,'{savedJobs}',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'snapshot',snapshot,'providerAvailable',provider_available,'availabilityCheckedAt',availability_checked_at,
    'unavailableAt',unavailable_at,'savedAt',saved_at,'matchAnalysis',case when (v_base->>'isPro')::boolean then match_analysis else null end,
    'analysisCurrent',match_analysis is not null and match_invalidated_at is null,
    'analysisInvalidationReason',match_invalidation_reason
  ) order by saved_at desc) from public.saved_jobs where owner_id=p_owner),'[]'::jsonb),true);
  return v_base;
end $$;

create function public.jobs_set_match_clarification(p_owner uuid,p_requirement_id text,p_value text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_owner is null or p_requirement_id !~ '^[0-9a-f]{16}$' or p_value not in ('demonstrated','not_have','unsure') then raise exception 'Invalid match clarification'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,37));
  if not exists(select 1 from public.job_match_clarifications where owner_id=p_owner and requirement_id=p_requirement_id)
    and (select count(*) from public.job_match_clarifications where owner_id=p_owner)>=100
  then raise exception 'Match clarification limit reached'; end if;
  insert into public.job_match_clarifications(owner_id,requirement_id,value) values(p_owner,p_requirement_id,p_value)
  on conflict(owner_id,requirement_id) do update set value=excluded.value,updated_at=now();
  update public.saved_jobs set match_invalidated_at=coalesce(match_invalidated_at,now()),match_invalidation_reason='clarifications_changed',updated_at=now()
  where owner_id=p_owner and match_analysis is not null;
end $$;

-- Supplies only the authenticated owner's immutable bookmark plus current account
-- context for a server-side deterministic refresh. The browser cannot call this RPC.
create function public.jobs_saved_match_inputs(p_owner uuid,p_saved_job uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_snapshot jsonb; v_criteria jsonb; v_is_pro boolean;
begin
  if p_owner is null or p_saved_job is null then raise exception 'Invalid saved match request'; end if;
  select snapshot into v_snapshot from public.saved_jobs where id=p_saved_job and owner_id=p_owner;
  if v_snapshot is null then raise exception 'Saved job not found'; end if;
  select criteria into v_criteria from public.job_preferences where owner_id=p_owner;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  return jsonb_build_object(
    'snapshot',v_snapshot,'criteria',v_criteria,'isPro',v_is_pro,
    'clarifications',coalesce((select jsonb_object_agg(requirement_id,value)
      from public.job_match_clarifications where owner_id=p_owner),'{}'::jsonb)
  );
end $$;

create function public.jobs_replace_match_analysis(p_owner uuid,p_saved_job uuid,p_analysis jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_updated integer;
begin
  if p_owner is null or p_saved_job is null or p_analysis is null or jsonb_typeof(p_analysis)<>'object'
    or octet_length(p_analysis::text)>64000 or coalesce((p_analysis->>'version')::integer,0)<>1
    or coalesce(p_analysis->>'label','') not in ('strong','good','stretch')
    or coalesce(p_analysis->>'resumeHash','') !~ '^[0-9a-f]{64}$'
    or coalesce(p_analysis->>'jobHash','') !~ '^[0-9a-f]{64}$'
    or coalesce(p_analysis->>'contextHash','') !~ '^[0-9a-f]{64}$'
  then raise exception 'Invalid match analysis'; end if;
  update public.saved_jobs set match_analysis=p_analysis,match_analysis_version=(p_analysis->>'version')::integer,
    match_resume_hash=p_analysis->>'resumeHash',match_job_hash=p_analysis->>'jobHash',
    match_context_hash=p_analysis->>'contextHash',match_invalidated_at=null,
    match_invalidation_reason=null,updated_at=now()
  where id=p_saved_job and owner_id=p_owner;
  get diagnostics v_updated=row_count;
  return v_updated=1;
end $$;

create function public.jobs_invalidate_job_analyses(p_owner uuid,p_provider_ids text[],p_job_hashes text[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_updated integer;
begin
  if p_owner is null or p_provider_ids is null or p_job_hashes is null or cardinality(p_provider_ids)>20
    or cardinality(p_provider_ids)<>cardinality(p_job_hashes)
    or exists(select 1 from unnest(p_job_hashes) h where h !~ '^[0-9a-f]{64}$') then raise exception 'Invalid match invalidation'; end if;
  update public.saved_jobs j set match_invalidated_at=coalesce(j.match_invalidated_at,now()),
    match_invalidation_reason='job_changed',updated_at=now()
  from unnest(p_provider_ids,p_job_hashes) observed(provider_id,job_hash)
  where j.owner_id=p_owner and (j.provider||':'||j.provider_job_id)=observed.provider_id
    and j.match_analysis is not null and j.match_job_hash is distinct from observed.job_hash;
  get diagnostics v_updated=row_count; return v_updated;
end $$;

create or replace function public.jobs_set_preferences(p_owner uuid, p_criteria jsonb, p_auto_refresh boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_changed boolean;
begin
  if p_owner is null or p_auto_refresh is null or (p_criteria is not null and (jsonb_typeof(p_criteria)<>'object' or octet_length(p_criteria::text)>2000)) then raise exception 'Invalid job preferences'; end if;
  select criteria is distinct from p_criteria into v_changed from public.job_preferences where owner_id=p_owner;
  v_changed := coalesce(v_changed,true);
  insert into public.job_preferences(owner_id,criteria,auto_refresh) values(p_owner,p_criteria,p_auto_refresh)
  on conflict(owner_id) do update set criteria=excluded.criteria,auto_refresh=excluded.auto_refresh,updated_at=now();
  if v_changed then update public.saved_jobs set match_invalidated_at=coalesce(match_invalidated_at,now()),match_invalidation_reason='preferences_changed',updated_at=now() where owner_id=p_owner and match_analysis is not null; end if;
end $$;

revoke all on function public.jobs_match_context(uuid),public.jobs_save_v2(uuid,jsonb,jsonb),
  public.jobs_account_snapshot_v2(uuid,text),public.jobs_set_match_clarification(uuid,text,text),
  public.jobs_saved_match_inputs(uuid,uuid),public.jobs_replace_match_analysis(uuid,uuid,jsonb),
  public.jobs_invalidate_job_analyses(uuid,text[],text[]) from public,anon,authenticated;
grant execute on function public.jobs_match_context(uuid),public.jobs_save_v2(uuid,jsonb,jsonb),
  public.jobs_account_snapshot_v2(uuid,text),public.jobs_set_match_clarification(uuid,text,text),
  public.jobs_saved_match_inputs(uuid,uuid),public.jobs_replace_match_analysis(uuid,uuid,jsonb),
  public.jobs_invalidate_job_analyses(uuid,text[],text[]) to service_role;
