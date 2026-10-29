-- Invalidate deterministic Match analyses created before the relevance, extraction,
-- and evidence-quality policy update. No resume or job content is added or migrated.

create or replace function public.jobs_save_v2(p_owner uuid, p_job jsonb, p_analysis jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_saved uuid;
begin
  if p_analysis is null or jsonb_typeof(p_analysis)<>'object' or octet_length(p_analysis::text)>64000
    or coalesce((p_analysis->>'version')::integer,0)<>2
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

create or replace function public.jobs_account_snapshot_v2(p_owner uuid, p_resume_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_base jsonb;
begin
  if p_owner is null or (p_resume_hash is not null and p_resume_hash !~ '^[0-9a-f]{64}$') then raise exception 'Invalid match snapshot request'; end if;
  update public.saved_jobs set match_invalidated_at=coalesce(match_invalidated_at,now()),
    match_invalidation_reason=coalesce(match_invalidation_reason,'analysis_version_changed'),updated_at=now()
  where owner_id=p_owner and match_analysis is not null and match_analysis_version is distinct from 2;
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

create or replace function public.jobs_replace_match_analysis(p_owner uuid,p_saved_job uuid,p_analysis jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_updated integer;
begin
  if p_owner is null or p_saved_job is null or p_analysis is null or jsonb_typeof(p_analysis)<>'object'
    or octet_length(p_analysis::text)>64000 or coalesce((p_analysis->>'version')::integer,0)<>2
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

update public.saved_jobs
set match_invalidated_at=coalesce(match_invalidated_at,now()),
  match_invalidation_reason=coalesce(match_invalidation_reason,'analysis_version_changed'),
  updated_at=now()
where match_analysis is not null and match_analysis_version is distinct from 2;
