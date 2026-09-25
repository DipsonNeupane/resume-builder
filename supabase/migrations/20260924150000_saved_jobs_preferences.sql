-- ResumeStride V1 saved jobs and recommendation preferences.
--
-- Both tables are server-only. Browser sessions never receive table privileges; the
-- authenticated API verifies the access token and calls the service-role-only RPCs.
-- RLS is still enabled and forced as defense in depth. Saved jobs are never removed
-- when a listing expires or an entitlement changes.

create table public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (length(provider) between 1 and 40),
  provider_job_id text not null check (length(provider_job_id) between 1 and 200),
  dedupe_key text not null check (dedupe_key ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 16000),
  source_url text not null check (length(source_url) between 9 and 2048 and source_url ~ '^https://'),
  expires_at timestamptz,
  provider_available boolean not null default true,
  availability_checked_at timestamptz not null default now(),
  unavailable_at timestamptz,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider, provider_job_id),
  unique (owner_id, dedupe_key),
  unique (owner_id, source_url)
);
create index saved_jobs_owner_saved_idx on public.saved_jobs(owner_id, saved_at desc);

create table public.job_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  criteria jsonb,
  auto_refresh boolean not null default false,
  last_provider_refresh_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_preferences_criteria_object check (
    criteria is null or (jsonb_typeof(criteria) = 'object' and octet_length(criteria::text) <= 2000)
  )
);

alter table public.saved_jobs enable row level security;
alter table public.job_preferences enable row level security;
revoke all on table public.saved_jobs, public.job_preferences from public, anon, authenticated, service_role;
grant select on table public.saved_jobs, public.job_preferences to service_role;
-- No browser-facing policies or grants: all access is through the authenticated API.

create function public.jobs_account_snapshot(p_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_is_pro boolean; v_limit integer; v_result jsonb;
begin
  if p_owner is null then raise exception 'Invalid owner'; end if;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  v_limit := case when v_is_pro then 10000 else 3 end;

  -- expires_at is deliberately populated only from provider-sourced expiry metadata.
  -- Inferred posting-age staleness remains in the immutable snapshot, but can never
  -- drive this definitive availability flag. Absence from a bounded search page is
  -- likewise never treated as proof that a listing disappeared.
  update public.saved_jobs
     set provider_available = false,
         unavailable_at = coalesce(unavailable_at, now()),
         availability_checked_at = now(), updated_at = now()
   where owner_id = p_owner and provider_available and expires_at is not null and expires_at <= now();

  select jsonb_build_object(
    'isPro', v_is_pro,
    'saveLimit', v_limit,
    'preferences', coalesce((select jsonb_build_object(
      'criteria', criteria, 'autoRefresh', auto_refresh,
      'lastProviderRefreshAt', last_provider_refresh_at
    ) from public.job_preferences where owner_id = p_owner),
    jsonb_build_object('criteria', null, 'autoRefresh', false, 'lastProviderRefreshAt', null)),
    'savedJobs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'snapshot', snapshot, 'providerAvailable', provider_available,
      'availabilityCheckedAt', availability_checked_at, 'unavailableAt', unavailable_at,
      'savedAt', saved_at
    ) order by saved_at desc) from public.saved_jobs where owner_id = p_owner), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create function public.jobs_save(p_owner uuid, p_job jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.saved_jobs; v_count integer; v_is_pro boolean; v_limit integer; v_saved public.saved_jobs;
begin
  if p_owner is null or p_job is null or jsonb_typeof(p_job) <> 'object' then raise exception 'Invalid saved job'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 5341));

  select * into v_existing from public.saved_jobs
   where owner_id = p_owner and (
     (provider = p_job->>'provider' and provider_job_id = p_job->>'providerJobId')
     or dedupe_key = p_job->>'dedupeKey' or source_url = p_job->>'sourceUrl'
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

create function public.jobs_remove(p_owner uuid, p_saved_job uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_removed integer;
begin
  delete from public.saved_jobs where id = p_saved_job and owner_id = p_owner;
  get diagnostics v_removed = row_count;
  return v_removed = 1;
end $$;

create function public.jobs_set_preferences(p_owner uuid, p_criteria jsonb, p_auto_refresh boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_owner is null or p_auto_refresh is null or
     (p_criteria is not null and (jsonb_typeof(p_criteria) <> 'object' or octet_length(p_criteria::text) > 2000))
  then raise exception 'Invalid job preferences'; end if;
  insert into public.job_preferences(owner_id, criteria, auto_refresh)
  values(p_owner, p_criteria, p_auto_refresh)
  on conflict(owner_id) do update set criteria = excluded.criteria,
    auto_refresh = excluded.auto_refresh, updated_at = now();
end $$;

-- Search-result observations refresh availability independently of the saved snapshot.
-- A positive observation remains available unless that same observation carries an
-- explicit provider expiry. A missing result in a bounded page is never proof that a
-- saved listing disappeared.
create function public.jobs_mark_seen(p_owner uuid, p_provider_ids text[], p_expires_at timestamptz[], p_expiry_sources text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_updated integer;
begin
  if p_owner is null or p_provider_ids is null or p_expires_at is null or p_expiry_sources is null
    or cardinality(p_provider_ids) > 20 or cardinality(p_provider_ids) <> cardinality(p_expires_at)
    or cardinality(p_provider_ids) <> cardinality(p_expiry_sources)
    or exists (select 1 from unnest(p_expiry_sources) source where source is null or source not in ('provider', 'inferred', 'unknown'))
  then raise exception 'Invalid availability refresh'; end if;
  update public.saved_jobs j set
    provider_available = not (observed.expiry_source = 'provider'
      and observed.expires_at is not null and observed.expires_at <= now()),
    unavailable_at = case when observed.expiry_source = 'provider'
      and observed.expires_at is not null and observed.expires_at <= now()
      then coalesce(j.unavailable_at, now()) else null end,
    expires_at = case when observed.expiry_source = 'provider' then observed.expires_at else null end,
    availability_checked_at = now(), updated_at = now()
  from unnest(p_provider_ids, p_expires_at, p_expiry_sources) observed(provider_id, expires_at, expiry_source)
  where j.owner_id = p_owner and (j.provider || ':' || j.provider_job_id) = observed.provider_id;
  get diagnostics v_updated = row_count;
  insert into public.job_preferences(owner_id,last_provider_refresh_at) values(p_owner,now())
  on conflict(owner_id) do update set last_provider_refresh_at=excluded.last_provider_refresh_at,updated_at=now();
  return v_updated;
end $$;

revoke all on function public.jobs_account_snapshot(uuid), public.jobs_save(uuid,jsonb),
  public.jobs_remove(uuid,uuid), public.jobs_set_preferences(uuid,jsonb,boolean),
  public.jobs_mark_seen(uuid,text[],timestamptz[],text[]) from public, anon, authenticated;
grant execute on function public.jobs_account_snapshot(uuid), public.jobs_save(uuid,jsonb),
  public.jobs_remove(uuid,uuid), public.jobs_set_preferences(uuid,jsonb,boolean),
  public.jobs_mark_seen(uuid,text[],timestamptz[],text[]) to service_role;
