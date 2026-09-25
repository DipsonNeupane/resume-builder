-- 12,000 UTF-16 characters each for reviewed/original descriptions, bounded metadata,
-- and UTF-8/JSON overhead. Preserve RLS and existing save/entitlement RPCs unchanged.
alter table public.saved_jobs drop constraint saved_jobs_snapshot_check;
alter table public.saved_jobs add constraint saved_jobs_snapshot_check check (
  jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 160000
);
alter table public.job_resume_versions drop constraint job_resume_versions_snapshot_bound;
alter table public.job_resume_versions add constraint job_resume_versions_snapshot_bound check (
  jsonb_typeof(job_snapshot) = 'object' and octet_length(job_snapshot::text) <= 160000
);

-- Preserve the existing service-only grant and include account-owned search preferences
-- in deterministic capture analysis. No provider request is needed.
create or replace function public.jobs_match_context(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'criteria', (select criteria from public.job_preferences where owner_id=p_owner),
    'clarifications', coalesce((select jsonb_object_agg(requirement_id, value)
      from public.job_match_clarifications where owner_id=p_owner), '{}'::jsonb)
  )
$$;

-- Strip only recognized tracking parameters; retain query-based job identifiers.
-- This lets an imported clean URL meet an existing provider URL without merging
-- two distinct postings whose only identity is a meaningful query parameter.
create function public.jobs_source_identity(p_url text)
returns text language plpgsql immutable set search_path='' as $$
declare v_url text := split_part(p_url, '#', 1); v_query text;
  v_fragment text := case when strpos(p_url, '#') > 0 then substr(p_url, strpos(p_url, '#')) else '' end;
begin
  if strpos(v_url, '?') > 0 then
    v_query := split_part(v_url, '?', 2);
    if not exists (select 1 from unnest(string_to_array(v_query, '&')) part
      where part !~* '^(utm_[a-z_]+|gclid|fbclid)=[^&]*$') then
      v_url := split_part(v_url, '?', 1);
    else
      return rtrim(split_part(v_url, '?', 1), '/') || '?' || v_query || v_fragment;
    end if;
  end if;
  return rtrim(v_url, '/') || v_fragment;
end $$;
revoke all on function public.jobs_source_identity(text) from public, anon, authenticated;
grant execute on function public.jobs_source_identity(text) to service_role;

create or replace function public.jobs_save(p_owner uuid, p_job jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.saved_jobs; v_count integer; v_is_pro boolean; v_limit integer; v_saved public.saved_jobs;
begin
  if p_owner is null or p_job is null or jsonb_typeof(p_job) <> 'object' then raise exception 'Invalid saved job'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 5341));

  select * into v_existing from public.saved_jobs
   where owner_id = p_owner and (
     (provider = p_job->>'provider' and provider_job_id = p_job->>'providerJobId')
     or dedupe_key = p_job->>'dedupeKey' or public.jobs_source_identity(source_url) = public.jobs_source_identity(p_job->>'sourceUrl')
   ) limit 1;
  if found then
    return jsonb_build_object('savedJobId', v_existing.id, 'alreadySaved', true);
  end if;

  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  v_limit := case when v_is_pro then 10000 else 3 end;
  select count(*) into v_count from public.saved_jobs where owner_id = p_owner;
  if v_count >= v_limit then
    raise exception using errcode = 'P0001', message = case when v_is_pro
      then 'Saved-job safety limit reached' else 'Free saved-job limit reached' end;
  end if;

  insert into public.saved_jobs(owner_id, provider, provider_job_id, dedupe_key, snapshot, source_url, expires_at, provider_available)
  values (p_owner, p_job->>'provider', p_job->>'providerJobId', p_job->>'dedupeKey', p_job,
    p_job->>'sourceUrl',
    case when p_job#>>'{expiry,source}' = 'provider'
      then nullif(p_job#>>'{expiry,expiresAt}', '')::timestamptz else null end,
    not coalesce(p_job#>>'{expiry,source}' = 'provider'
      and nullif(p_job#>>'{expiry,expiresAt}', '')::timestamptz <= now(), false))
  returning * into v_saved;
  return jsonb_build_object('savedJobId', v_saved.id, 'alreadySaved', false);
end $$;
