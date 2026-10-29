-- The one Free tailoring trial includes the full evidence view for its bound application,
-- but jobs_account_snapshot_v2 returned match_analysis only to Pro, so the trial's own
-- application showed "Evidence is not available yet". The persisted payload is now also
-- returned for that single trial-bound application. Other Free saved jobs still receive
-- none (defense in depth; their preview comes from an explicit refresh), and the server
-- (shapeAccountSnapshot -> analysisView) still shapes every view before the browser.
-- Behavior is otherwise identical to 20261007190000_job_match_quality_v2.sql.
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
    'unavailableAt',unavailable_at,'savedAt',saved_at,'matchAnalysis',case when (v_base->>'isPro')::boolean
      or id = (select t.saved_job_id from public.product_tailoring_trials t where t.owner_id = p_owner) then match_analysis else null end,
    'analysisCurrent',match_analysis is not null and match_invalidated_at is null,
    'analysisInvalidationReason',match_invalidation_reason
  ) order by saved_at desc, id desc) from public.saved_jobs where owner_id=p_owner),'[]'::jsonb),true);
  return v_base;
end $$;
revoke all on function public.jobs_account_snapshot_v2(uuid,text) from public, anon, authenticated;
grant execute on function public.jobs_account_snapshot_v2(uuid,text) to service_role;
