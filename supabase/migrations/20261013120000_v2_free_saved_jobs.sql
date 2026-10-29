-- V2 Free accounts can organize and track ten applications. The existing Pro
-- safety ceiling, ownership model, advisory lock and snapshot bounds remain.
create or replace function public.jobs_account_snapshot(p_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_is_pro boolean; v_limit integer; v_result jsonb;
begin
  if p_owner is null then raise exception 'Invalid owner'; end if;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  v_limit := case when v_is_pro then 10000 else 10 end;
  update public.saved_jobs set provider_available=false,
    unavailable_at=coalesce(unavailable_at,now()), availability_checked_at=now(), updated_at=now()
    where owner_id=p_owner and provider_available and expires_at is not null and expires_at<=now();
  select jsonb_build_object('isPro',v_is_pro,'saveLimit',v_limit,
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
declare v_existing public.saved_jobs; v_count integer; v_is_pro boolean; v_limit integer; v_saved public.saved_jobs;
begin
  if p_owner is null or p_job is null or jsonb_typeof(p_job)<>'object' then raise exception 'Invalid saved job'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,5341));
  select * into v_existing from public.saved_jobs where owner_id=p_owner and
    ((provider=p_job->>'provider' and provider_job_id=p_job->>'providerJobId') or dedupe_key=p_job->>'dedupeKey'
      or public.jobs_source_identity(source_url)=public.jobs_source_identity(p_job->>'sourceUrl')) limit 1;
  if found then return jsonb_build_object('savedJobId',v_existing.id,'alreadySaved',true); end if;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  v_limit := case when v_is_pro then 10000 else 10 end;
  select count(*) into v_count from public.saved_jobs where owner_id=p_owner;
  if v_count>=v_limit then raise exception using errcode='P0001', message=case when v_is_pro
    then 'Saved-job safety limit reached' else 'Free saved-job limit reached' end; end if;
  insert into public.saved_jobs(owner_id,provider,provider_job_id,dedupe_key,snapshot,source_url,expires_at,provider_available)
  values(p_owner,p_job->>'provider',p_job->>'providerJobId',p_job->>'dedupeKey',p_job,p_job->>'sourceUrl',
    case when p_job#>>'{expiry,source}'='provider' then nullif(p_job#>>'{expiry,expiresAt}','')::timestamptz else null end,
    not coalesce(p_job#>>'{expiry,source}'='provider' and nullif(p_job#>>'{expiry,expiresAt}','')::timestamptz<=now(),false))
  returning * into v_saved;
  return jsonb_build_object('savedJobId',v_saved.id,'alreadySaved',false);
end $$;

revoke all on function public.jobs_account_snapshot(uuid), public.jobs_save(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.jobs_account_snapshot(uuid), public.jobs_save(uuid,jsonb) to service_role;
