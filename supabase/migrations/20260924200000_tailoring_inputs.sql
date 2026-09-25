-- Atomic, service-only inputs for AI tailoring. The browser supplies identities only;
-- resume content, the normalized saved description, entitlement and analysis are joined
-- to the verified owner here so unrelated or cross-account payloads fail closed.
create function public.job_tailoring_inputs(p_owner uuid,p_saved_job uuid,p_version uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_is_pro boolean;
begin
  if p_owner is null or p_saved_job is null or p_version is null then raise exception 'Invalid tailoring source'; end if;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  select jsonb_build_object(
    'versionId',v.id,'savedJobId',j.id,'resume',v.data,'job',j.snapshot,
    'matchAnalysis',case when j.match_invalidated_at is null then j.match_analysis else null end,
    'analysisCurrent',j.match_analysis is not null and j.match_invalidated_at is null,
    'isPro',v_is_pro
  ) into v_result
  from public.job_resume_versions v
  join public.saved_jobs j on j.id=v.saved_job_id and j.owner_id=v.owner_id
  where v.id=p_version and v.saved_job_id=p_saved_job and v.owner_id=p_owner;
  if v_result is null then raise exception 'Tailoring source not found'; end if;
  return v_result;
end $$;

revoke all on function public.job_tailoring_inputs(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.job_tailoring_inputs(uuid,uuid,uuid) to service_role;
