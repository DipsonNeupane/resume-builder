-- Authoritative Free recommendation-refresh cadence. The existing
-- job_preferences.last_provider_refresh_at timestamp is also the short-lived
-- reservation marker: the per-owner advisory lock makes check+reserve atomic, while
-- release restores the exact previous timestamp only if no later successful refresh
-- has replaced this reservation.
create function public.jobs_reserve_recommendation_refresh(p_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_is_pro boolean;
  v_last timestamptz;
  v_reserved timestamptz := clock_timestamp();
begin
  if p_owner is null then raise exception 'Invalid job refresh' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 9137));

  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  if v_is_pro then
    return jsonb_build_object('allowed', true, 'isPro', true, 'reservedAt', null,
      'previousRefreshAt', null, 'nextRefreshAt', null);
  end if;

  select last_provider_refresh_at into v_last
    from public.job_preferences where owner_id = p_owner for update;
  if v_last is not null and v_last > v_reserved - interval '24 hours' then
    return jsonb_build_object('allowed', false, 'isPro', false, 'reservedAt', null,
      'previousRefreshAt', v_last, 'nextRefreshAt', v_last + interval '24 hours');
  end if;

  insert into public.job_preferences(owner_id, last_provider_refresh_at)
    values(p_owner, v_reserved)
  on conflict(owner_id) do update set last_provider_refresh_at = excluded.last_provider_refresh_at,
    updated_at = now();
  return jsonb_build_object('allowed', true, 'isPro', false, 'reservedAt', v_reserved,
    'previousRefreshAt', v_last, 'nextRefreshAt', v_reserved + interval '24 hours');
end $$;

create function public.jobs_release_recommendation_refresh(
  p_owner uuid, p_reserved_at timestamptz, p_previous_refresh_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_updated integer;
begin
  if p_owner is null or p_reserved_at is null or not isfinite(p_reserved_at)
    or (p_previous_refresh_at is not null and
      (not isfinite(p_previous_refresh_at) or p_previous_refresh_at > p_reserved_at))
  then raise exception 'Invalid job refresh release' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 9137));
  update public.job_preferences set last_provider_refresh_at = p_previous_refresh_at,
    updated_at = now()
    where owner_id = p_owner and last_provider_refresh_at = p_reserved_at;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end $$;

revoke all on function public.jobs_reserve_recommendation_refresh(uuid),
  public.jobs_release_recommendation_refresh(uuid,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.jobs_reserve_recommendation_refresh(uuid),
  public.jobs_release_recommendation_refresh(uuid,timestamptz,timestamptz)
  to service_role;
