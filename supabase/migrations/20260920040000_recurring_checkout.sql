-- ResumeStride: durable checkout-intent layer for the OPTIONAL recurring
-- USD 19.99 / 30-day subscription, plus an owner-scoped lookup used both by
-- the subscription webhook handler and by explicit cancellation. Mirrors
-- 20260919211000_checkout_intents.sql (billing_intents/billing_checkouts)
-- and 20260920010000_checkout_attempt_throttle.sql byte-for-byte in
-- structure, applied to the separate `billing_subscriptions` identity table
-- added by 20260920020000_recurring_billing.sql instead of
-- `billing_entitlements`. See docs/RECURRING_IMPLEMENTATION.md for the full
-- design and server/billing/handlers.ts for the handler that calls these.
--
-- ADDITIVE ONLY. Does not alter any prior migration. The one-time manual
-- pass's own intent/checkout tables (billing_intents/billing_checkouts) are
-- untouched and unused by anything here — a subscription checkout gets its
-- own separate identity/idempotency tables so the two purchase flows can
-- never cross-contaminate each other's dedup or rate-limit bookkeeping.
--
-- Same SECURITY DEFINER / revoke-then-grant-to-service_role-only pattern as
-- every other billing migration in this repo.

-- ---------------------------------------------------------------------------
-- 1. Trusted subscription-checkout identity — the server's OWN record of
-- which authenticated owner started a given Stripe Checkout Session in
-- mode:'subscription', established BEFORE redirecting to Stripe and BEFORE
-- any webhook is trusted. Parallel to billing_checkouts, minus the
-- expected_amount/expected_currency columns: those exist there to bind a
-- ONE-TIME payment's charged amount; a subscription's invoice amount is
-- instead checked per-invoice against server/billing/recurring.ts's fixed
-- RECURRING_AMOUNT/RECURRING_CURRENCY constants, not against this row.
create table public.billing_subscription_checkouts (
  session_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  price_id text not null,
  live boolean not null,
  created_at timestamptz not null default now(),
  constraint billing_subscription_checkouts_session_id_not_blank check (length(session_id) > 0),
  constraint billing_subscription_checkouts_price_id_not_blank check (length(price_id) > 0)
);
create index billing_subscription_checkouts_owner_id_idx on public.billing_subscription_checkouts (owner_id);

-- ---------------------------------------------------------------------------
-- 2. Durable idempotency before the Stripe call, exactly like
-- billing_intents: an old/uncertain checkout request is never resubmitted
-- as a fresh Stripe session after retention/retry windows expire.
create table public.billing_subscription_intents (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  price_id text not null,
  live boolean not null,
  created_at timestamptz not null default now(),
  session_id text unique references public.billing_subscription_checkouts(session_id)
);
create index billing_subscription_intents_owner_created on public.billing_subscription_intents (owner_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. A separate, durable, per-owner checkout-*attempt* throttle for the
-- subscription route, exactly like billing_checkout_attempts but its own
-- table so the two flows' abuse budgets are independent.
create table public.billing_subscription_checkout_attempts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0)
);

alter table public.billing_subscription_checkouts enable row level security;
alter table public.billing_subscription_intents enable row level security;
alter table public.billing_subscription_checkout_attempts enable row level security;

revoke all on table public.billing_subscription_checkouts, public.billing_subscription_intents, public.billing_subscription_checkout_attempts
  from public, anon, authenticated, service_role;

-- No table-wide SELECT grant is needed for these three (unlike
-- billing_checkouts/billing_subscriptions): nothing in this app reads them
-- directly outside the RPCs below, which run as the owning role and are
-- exempt from RLS on tables they own.

-- ---------------------------------------------------------------------------
-- 4. RPCs.

create or replace function public.billing_record_subscription_checkout(
  p_owner_id uuid,
  p_price_id text,
  p_live boolean,
  p_session_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted text;
begin
  if p_owner_id is null
     or p_price_id is null or length(trim(p_price_id)) = 0
     or p_live is null
     or p_session_id is null or length(trim(p_session_id)) = 0
  then
    raise exception 'A subscription checkout record requires every field, non-blank';
  end if;

  insert into public.billing_subscription_checkouts (session_id, owner_id, price_id, live)
  values (p_session_id, p_owner_id, p_price_id, p_live)
  on conflict (session_id) do nothing
  returning session_id into v_inserted;

  if v_inserted is null then
    if not exists (
      select 1 from public.billing_subscription_checkouts
      where session_id = p_session_id
        and owner_id = p_owner_id
        and price_id = p_price_id
        and live = p_live
    ) then
      raise exception 'Subscription checkout session % already recorded with different details', p_session_id;
    end if;
  end if;
end;
$$;

revoke execute on function public.billing_record_subscription_checkout(uuid, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.billing_record_subscription_checkout(uuid, text, boolean, text)
  to service_role;

create or replace function public.billing_begin_subscription_intent(
  p_id uuid, p_owner uuid, p_price text, p_live boolean
) returns public.billing_subscription_intents
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.billing_subscription_intents;
begin
  if p_id is null or p_owner is null or p_price is null or p_live is null then
    raise exception 'Invalid subscription checkout request';
  end if;
  -- A distinct advisory-lock key (196) from billing_begin_intent's (194) and
  -- billing_throttle_checkout_attempt's (401): these serialize different,
  -- independent budgets and must never contend with each other.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 196));
  select * into v_row from public.billing_subscription_intents where id = p_id;
  if found then
    if v_row.owner_id <> p_owner or v_row.price_id <> p_price or v_row.live <> p_live then
      raise exception 'Subscription checkout request mismatch';
    end if;
    if v_row.created_at < now() - interval '23 hours' then
      raise exception 'Subscription checkout request expired';
    end if;
    return v_row;
  end if;
  if (select count(*) from public.billing_subscription_intents where owner_id = p_owner and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Subscription checkout request limit reached';
  end if;
  insert into public.billing_subscription_intents (id, owner_id, price_id, live) values (p_id, p_owner, p_price, p_live) returning * into v_row;
  return v_row;
end $$;

create or replace function public.billing_bind_subscription_intent(
  p_id uuid, p_owner uuid, p_session text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.billing_subscription_intents;
begin
  select * into v_row from public.billing_subscription_intents where id = p_id for update;
  if not found or v_row.owner_id is distinct from p_owner or p_session is null or length(p_session) = 0 then
    raise exception 'Invalid subscription checkout binding';
  end if;
  if v_row.session_id is not null and v_row.session_id <> p_session then
    raise exception 'Subscription checkout already bound';
  end if;
  perform public.billing_record_subscription_checkout(p_owner, v_row.price_id, v_row.live, p_session);
  update public.billing_subscription_intents set session_id = p_session where id = p_id;
end $$;

create or replace function public.billing_lookup_subscription_checkout(p_session text)
returns public.billing_subscription_checkouts
language sql stable security definer set search_path = '' as $$
  select c from public.billing_subscription_checkouts c where c.session_id = p_session
$$;

revoke execute on function
  public.billing_begin_subscription_intent(uuid, uuid, text, boolean),
  public.billing_bind_subscription_intent(uuid, uuid, text),
  public.billing_lookup_subscription_checkout(text)
  from public, anon, authenticated;
grant execute on function
  public.billing_begin_subscription_intent(uuid, uuid, text, boolean),
  public.billing_bind_subscription_intent(uuid, uuid, text),
  public.billing_lookup_subscription_checkout(text)
  to service_role;

create or replace function public.billing_throttle_subscription_checkout_attempt(p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.billing_subscription_checkout_attempts%rowtype;
begin
  if p_owner is null then raise exception 'Invalid subscription checkout attempt' using errcode = '22023'; end if;
  -- A distinct advisory-lock key (402) from billing_throttle_checkout_attempt's (401).
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 402));
  select * into v_row from public.billing_subscription_checkout_attempts where owner_id = p_owner for update;
  if not found then
    insert into public.billing_subscription_checkout_attempts (owner_id, window_start, attempt_count) values (p_owner, now(), 1);
    return;
  end if;
  if v_row.window_start < now() - interval '1 hour' then
    update public.billing_subscription_checkout_attempts set window_start = now(), attempt_count = 1 where owner_id = p_owner;
    return;
  end if;
  if v_row.attempt_count >= 20 then
    raise exception 'Too many checkout attempts. Wait up to an hour and try again.' using errcode = '54000';
  end if;
  update public.billing_subscription_checkout_attempts set attempt_count = attempt_count + 1 where owner_id = p_owner;
end $$;
revoke execute on function public.billing_throttle_subscription_checkout_attempt(uuid) from public, anon, authenticated;
grant execute on function public.billing_throttle_subscription_checkout_attempt(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Owner-scoped lookup of a currently in-force subscription (used by the
-- checkout handler's mixed-mode guard AND by explicit cancellation to find
-- which subscription id to cancel — never by trusting a client-supplied
-- subscription id for either purpose). "In force" mirrors the statuses
-- server/billing/recurring.ts and this migration's own CHECK constraint
-- already recognize as a subscription Stripe may still bill against:
-- 'active' and 'trialing' obviously still bill; 'past_due' and 'unpaid'
-- are Stripe still attempting to collect on the SAME subscription, not a
-- terminal state, so they still count as "in force" for both the
-- duplicate-subscription and the manual/recurring mixed-mode guards.
-- 'canceled', 'incomplete', 'incomplete_expired', and 'paused' are excluded:
-- none of those will produce a future invoice on their own.
create or replace function public.billing_lookup_owner_subscription(p_owner_id uuid)
returns public.billing_subscriptions
language sql stable security definer set search_path = '' as $$
  select s from public.billing_subscriptions s
  where s.owner_id = p_owner_id
    and s.status in ('active', 'trialing', 'past_due', 'unpaid')
  order by s.updated_at desc
  limit 1
$$;

revoke execute on function public.billing_lookup_owner_subscription(uuid) from public, anon, authenticated;
grant execute on function public.billing_lookup_owner_subscription(uuid) to service_role;
