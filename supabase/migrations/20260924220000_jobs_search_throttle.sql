-- Pre-launch security audit finding: POST /api/jobs-search had no durable per-owner
-- rate limit. The provider-fetch cache (server/jobs/cache.ts) is keyed by the exact
-- normalized search signature (title/countryCode/workplace), so an authenticated
-- account could bypass it entirely by varying the title on every request, forcing an
-- unbounded number of Techmap provider calls and database writes under this app's
-- shared credentials. This adds the same bounded, single-row-per-owner throttle
-- pattern already used for checkout (see 20260920010000_checkout_attempt_throttle.sql),
-- scoped independently to job search so it never interacts with billing's counters or
-- limits. The window is generous (40 requests / 10 minutes) so normal browsing —
-- refining a search several times — is unaffected; it only stops sustained abuse.
create table public.jobs_search_attempts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0)
);
alter table public.jobs_search_attempts enable row level security;
revoke all on public.jobs_search_attempts from public, anon, authenticated, service_role;

create function public.jobs_throttle_search_attempt(p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.jobs_search_attempts%rowtype;
begin
  if p_owner is null then raise exception 'Invalid job search attempt' using errcode = '22023'; end if;
  -- Serialize concurrent attempts from the same owner so a burst of parallel requests
  -- cannot all read the same pre-increment count and all pass.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 402));
  select * into v_row from public.jobs_search_attempts where owner_id = p_owner for update;
  if not found then
    insert into public.jobs_search_attempts(owner_id, window_start, attempt_count) values (p_owner, now(), 1);
    return;
  end if;
  if v_row.window_start < now() - interval '10 minutes' then
    update public.jobs_search_attempts set window_start = now(), attempt_count = 1 where owner_id = p_owner;
    return;
  end if;
  if v_row.attempt_count >= 40 then
    raise exception 'Too many job searches. Wait a few minutes and try again.' using errcode = '54000';
  end if;
  update public.jobs_search_attempts set attempt_count = attempt_count + 1 where owner_id = p_owner;
end $$;
revoke all on function public.jobs_throttle_search_attempt(uuid) from public, anon, authenticated;
grant execute on function public.jobs_throttle_search_attempt(uuid) to service_role;
