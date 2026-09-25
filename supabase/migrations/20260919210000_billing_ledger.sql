-- ResumeStride: durable billing ledger foundation.
--
-- Server-only checkout records, an idempotent verified-payment ledger,
-- atomic 30-day manual-pass stacking per owner, and a user-read-only
-- entitlement row. See docs/BILLING_LEDGER_REVIEW.md for the full RPC
-- contracts, what is deliberately NOT implemented yet (recurring billing,
-- refunds, disputes, receipts, the webhook handler itself), and test
-- results.
--
-- ADDITIVE ONLY. Does not alter anything created by prior migrations.
--
-- This migration implements ONLY the durable-storage/atomicity layer for the
-- one-time, non-renewing 30-day manual pass specified in
-- server/billing/policy.ts (PASS_MS, manualPassWindow, assertManualPayment).
-- It does not verify Stripe webhook signatures, call the Stripe API, or
-- decide what counts as a verified payment — the caller (server code
-- holding the service-role key) must have already done that before calling
-- billing_apply_verified_payment. This migration's job is to make what
-- happens *after* verification atomic, idempotent, and impossible for a
-- client to influence directly.
--
-- Every MUTATION goes through a SECURITY DEFINER RPC granted to
-- `service_role` only, with `revoke ... from public, anon, authenticated`
-- on the underlying tables themselves, an empty `search_path` (every
-- reference schema-qualified) on every function, and no
-- INSERT/UPDATE/DELETE grant for `service_role` either — only the RPCs
-- (running as the table-owning migration role, which Postgres exempts from
-- RLS on tables it owns) can write. `service_role` gets a plain SELECT
-- grant on all three tables, matching real Supabase's own service_role: a
-- trusted backend legitimately needs to look up ledger/checkout history for
-- support or reconciliation, without weakening the mutation boundary above.
--
-- `service_role` is expected to already exist (created by
-- scripts/test-database.mjs locally; built into any real Supabase project)
-- before this migration runs — it is not created here.
grant usage on schema public to service_role;

-- ---------------------------------------------------------------------------
-- 1. Server-only checkout records — the "trusted checkout record"
-- server/billing/policy.ts's assertManualPayment comment requires:
-- "expected.ownerId must never come from webhook metadata alone." Written
-- once by the server integration, before redirecting the user to Stripe
-- Checkout, from data the server itself controls — never from anything the
-- browser sends at checkout time and never from a Stripe webhook payload,
-- which is what billing_apply_verified_payment below checks every verified
-- payment against instead of trusting the payment event's own claims.
create table if not exists public.billing_checkouts (
  session_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  price_id text not null,
  live boolean not null,
  expected_amount bigint not null,
  expected_currency text not null,
  created_at timestamptz not null default now(),
  constraint billing_checkouts_session_id_not_blank check (length(session_id) > 0),
  constraint billing_checkouts_price_id_not_blank check (length(price_id) > 0),
  constraint billing_checkouts_amount_positive check (expected_amount > 0),
  constraint billing_checkouts_currency_lower check (
    expected_currency = lower(expected_currency) and length(expected_currency) = 3
  )
);

create index if not exists billing_checkouts_owner_id_idx on public.billing_checkouts (owner_id);

-- ---------------------------------------------------------------------------
-- 2. Verified-payment ledger — one durable row per successfully applied
-- payment. Three independent unique constraints, each closing a distinct
-- replay path: a resent Stripe webhook event (event_id), a duplicate
-- delivery/notification of the same underlying payment (payment_id), and —
-- belt and suspenders, since this product's checkout flow issues exactly one
-- payment per session by design — at most one applied payment per checkout
-- session (checkout_session_id).
create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  checkout_session_id text not null references public.billing_checkouts(session_id),
  event_id text not null,
  payment_id text not null,
  price_id text not null,
  live boolean not null,
  amount_total bigint not null,
  currency text not null,
  verified_at timestamptz not null,
  pass_started_at timestamptz not null,
  pass_ended_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint billing_payments_event_id_unique unique (event_id),
  constraint billing_payments_payment_id_unique unique (payment_id),
  constraint billing_payments_checkout_unique unique (checkout_session_id),
  constraint billing_payments_amount_positive check (amount_total > 0),
  constraint billing_payments_pass_window_ordered check (pass_ended_at > pass_started_at)
);

create index if not exists billing_payments_owner_id_idx on public.billing_payments (owner_id);

-- ---------------------------------------------------------------------------
-- 3. User-visible entitlement — the ONLY billing table an authenticated user
-- can read at all, and only their own row, and only via SELECT. `paid_through
-- is null` means never purchased (Free tier); matches
-- server/billing/policy.ts's `isPro(paidThrough, now)` exactly.
create table if not exists public.billing_entitlements (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  paid_through timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.billing_checkouts enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_entitlements enable row level security;

-- No policies at all on billing_checkouts/billing_payments for anon or
-- authenticated. Combined with the revoke below, PostgREST rejects every
-- request against them for those roles with "permission denied", not
-- merely an empty, RLS-filtered result set. billing_entitlements is the
-- deliberate exception: a scoped, read-only view of one's own row.
revoke all on table public.billing_checkouts, public.billing_payments, public.billing_entitlements
  from public, anon, authenticated, service_role;

grant select on table public.billing_checkouts, public.billing_payments to service_role;
grant select on table public.billing_entitlements to authenticated, service_role;

create policy billing_entitlements_select_own on public.billing_entitlements
  for select using (owner_id = auth.uid());
-- No insert/update/delete policy for `authenticated`: paired with the
-- revoke above, there is no write path to this table for that role under
-- any circumstances. The only writer is the SECURITY DEFINER RPC below.
-- No RLS policy for `service_role` either — its SELECT grant above is
-- table-wide by design, standard for a role a client never authenticates as.

-- ---------------------------------------------------------------------------
-- 4. RPCs. Both SECURITY DEFINER, empty `search_path` (every table/column
-- reference below is schema-qualified; built-in functions resolve via the
-- always-implicit pg_catalog regardless of search_path), and EXECUTE
-- revoked from everyone except `service_role`.
--
-- 30 days is an exact 2,592,000-second interval, not a calendar '30 days'
-- interval, so it matches server/billing/policy.ts's PASS_MS (a plain
-- millisecond count) exactly regardless of TimeZone/DST.
--
-- Every text/uuid argument below is validated non-null and non-blank, and
-- every boolean/numeric/timestamp argument is validated non-null, BEFORE
-- any comparison against stored data. This matters beyond a plain "reject
-- garbage input" concern: SQL's `<>`/`=` yield NULL (unknown), not true or
-- false, when either side is NULL, so an unguarded mismatch check like
-- `stored.owner_id <> p_owner_id` silently fails to raise if `p_owner_id`
-- is NULL (an `if` on a NULL condition takes the same branch as `if
-- false`) — a real bypass of the fraud/mismatch checks below, not merely a
-- null-safety nicety.

create or replace function public.billing_record_checkout(
  p_owner_id uuid,
  p_price_id text,
  p_live boolean,
  p_session_id text,
  p_expected_amount bigint,
  p_expected_currency text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency text;
  v_inserted text;
begin
  if p_owner_id is null
     or p_price_id is null or length(trim(p_price_id)) = 0
     or p_live is null
     or p_session_id is null or length(trim(p_session_id)) = 0
     or p_expected_amount is null or p_expected_amount <= 0
     or p_expected_currency is null or length(trim(p_expected_currency)) = 0
  then
    raise exception 'A checkout record requires every field, non-blank';
  end if;

  v_currency := lower(p_expected_currency);

  insert into public.billing_checkouts (session_id, owner_id, price_id, live, expected_amount, expected_currency)
  values (p_session_id, p_owner_id, p_price_id, p_live, p_expected_amount, v_currency)
  on conflict (session_id) do nothing
  returning session_id into v_inserted;

  if v_inserted is null then
    -- session_id already recorded. An exact-match retry (the same server
    -- call retried after a network error before it saw its own success) is
    -- a harmless no-op; anything else recorded under the same session id is
    -- a real bug or forgery attempt and must not be silently accepted. Every
    -- value compared here is already guaranteed non-null by the guard
    -- above, so `=` cannot silently go unknown.
    if not exists (
      select 1 from public.billing_checkouts
      where session_id = p_session_id
        and owner_id = p_owner_id
        and price_id = p_price_id
        and live = p_live
        and expected_amount = p_expected_amount
        and expected_currency = v_currency
    ) then
      raise exception 'Checkout session % already recorded with different details', p_session_id;
    end if;
  end if;
end;
$$;

revoke execute on function public.billing_record_checkout(uuid, text, boolean, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.billing_record_checkout(uuid, text, boolean, text, bigint, text)
  to service_role;

create or replace function public.billing_apply_verified_payment(
  p_owner_id uuid,
  p_session_id text,
  p_event_id text,
  p_payment_id text,
  p_price_id text,
  p_live boolean,
  p_amount_total bigint,
  p_currency text,
  p_verified_at timestamptz
) returns table (paid_through timestamptz, applied boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.billing_checkouts;
  v_existing public.billing_payments;
  v_existing_count integer;
  v_current timestamptz;
  v_pass_started timestamptz;
  v_pass_ended timestamptz;
  v_inserted_id uuid;
  v_currency text;
begin
  if p_owner_id is null
     or p_session_id is null or length(trim(p_session_id)) = 0
     or p_event_id is null or length(trim(p_event_id)) = 0
     or p_payment_id is null or length(trim(p_payment_id)) = 0
     or p_price_id is null or length(trim(p_price_id)) = 0
     or p_live is null
     or p_amount_total is null or p_amount_total <= 0
     or p_currency is null or length(trim(p_currency)) = 0
     or p_verified_at is null
  then
    raise exception 'A verified payment requires every field, non-blank';
  end if;

  -- `isfinite` rejects Postgres's special 'infinity'/'-infinity' timestamptz
  -- values, which would otherwise pass `is not null` yet break the interval
  -- arithmetic below (an "eternal" pass). The bounds mirror
  -- server/billing/policy.ts's own timestamp() domain exactly: its lower
  -- bound (value >= 0) is the Unix epoch; its upper bound
  -- (8_640_000_000_000_000 ms) is JavaScript's maximum representable Date,
  -- 275760-09-13. The `now()` check additionally rejects a payment claimed
  -- to have been verified in the future relative to this database's own
  -- clock — a small five-minute allowance covers ordinary clock skew
  -- between the calling server and the database, not a real future date.
  if not isfinite(p_verified_at)
     or p_verified_at < timestamptz '1970-01-01T00:00:00Z'
     or p_verified_at > timestamptz '275760-09-13T00:00:00Z'
     or p_verified_at > now() + interval '5 minutes'
  then
    raise exception 'Verified payment time is not a plausible timestamp';
  end if;

  v_currency := lower(p_currency);

  -- Idempotency by event id OR payment id, but a match is only ever a
  -- silent no-op if every other immutable fact also matches the row
  -- already on file — a different event id notifying about the same real
  -- payment (owner/session/price/live/amount/currency all identical) is a
  -- legitimate no-op; anything claiming a used event_id/payment_id while
  -- disagreeing on owner, session, price, mode, amount, or currency is a
  -- conflicting reuse (bug or forgery) and must be rejected, not silently
  -- absorbed as "already applied". Every field on both sides is guaranteed
  -- non-null here (the guard above, and this table's own NOT NULL columns),
  -- so `<>` cannot silently go unknown.
  select count(*) into v_existing_count
  from public.billing_payments
  where event_id = p_event_id or payment_id = p_payment_id;

  if v_existing_count > 1 then
    raise exception 'Conflicting payment identifiers already recorded under different ledger rows';
  elsif v_existing_count = 1 then
    select * into v_existing
    from public.billing_payments
    where event_id = p_event_id or payment_id = p_payment_id;

    if v_existing.owner_id <> p_owner_id
       or v_existing.payment_id <> p_payment_id
       or v_existing.checkout_session_id <> p_session_id
       or v_existing.price_id <> p_price_id
       or v_existing.live <> p_live
       or v_existing.amount_total <> p_amount_total
       or v_existing.currency <> v_currency
    then
      raise exception 'Payment identifier already recorded with conflicting details';
    end if;

    return query
      select e.paid_through, false
      from public.billing_entitlements e
      where e.owner_id = p_owner_id;
    return;
  end if;

  select * into v_checkout from public.billing_checkouts where session_id = p_session_id;
  if not found then
    raise exception 'No trusted checkout record for session %', p_session_id;
  end if;

  -- Defense in depth after provider verification: the actual payment must
  -- match the server's own trusted checkout record, not just carry a valid
  -- Stripe signature.
  if v_checkout.owner_id <> p_owner_id
     or v_checkout.price_id <> p_price_id
     or v_checkout.live <> p_live
     or v_checkout.expected_amount <> p_amount_total
     or v_checkout.expected_currency <> v_currency
  then
    raise exception 'Verified payment does not match its trusted checkout record for session %', p_session_id;
  end if;

  -- Row lock scoped per owner, serializing concurrent grant attempts for the
  -- same account so stacking below is always computed against a current,
  -- stable value rather than a stale read racing another payment.
  insert into public.billing_entitlements (owner_id, paid_through)
  values (p_owner_id, null)
  on conflict (owner_id) do nothing;

  -- Explicitly qualified: unqualified `paid_through` here would be
  -- ambiguous against this function's own RETURNS TABLE output parameter
  -- of the same name (a real ambiguous-column error, not just shadowing).
  select billing_entitlements.paid_through into v_current
  from public.billing_entitlements where owner_id = p_owner_id for update;

  -- Mirrors manualPassWindow exactly: an active pass stacks the new 30 days
  -- onto its own remaining time; a null or already-expired paid_through
  -- starts fresh from the verified payment time.
  v_pass_started := greatest(coalesce(v_current, p_verified_at), p_verified_at);
  v_pass_ended := v_pass_started + interval '2592000 seconds';

  insert into public.billing_payments (
    owner_id, checkout_session_id, event_id, payment_id, price_id, live,
    amount_total, currency, verified_at, pass_started_at, pass_ended_at
  ) values (
    p_owner_id, p_session_id, p_event_id, p_payment_id, p_price_id, p_live,
    p_amount_total, v_currency, p_verified_at, v_pass_started, v_pass_ended
  )
  on conflict do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    -- Lost a race against a concurrent call that committed a matching
    -- event/payment/checkout row between the pre-check above and this
    -- insert. Look up whatever actually won and apply the SAME conflicting-
    -- details check as the pre-check: a collision from a genuinely
    -- equivalent retry is a no-op, but a collision against a row for a
    -- different owner/session/price/mode/amount/currency must still raise
    -- rather than silently reporting a "success" that isn't this call's
    -- own payment.
    select count(*) into v_existing_count from public.billing_payments
    where event_id = p_event_id or payment_id = p_payment_id or checkout_session_id = p_session_id;
    if v_existing_count <> 1 then
      raise exception 'Conflicting payment identifiers already recorded under different ledger rows';
    end if;
    select * into v_existing
    from public.billing_payments
    where event_id = p_event_id or payment_id = p_payment_id or checkout_session_id = p_session_id;

    if not found
       or v_existing.owner_id <> p_owner_id
       or v_existing.payment_id <> p_payment_id
       or v_existing.checkout_session_id <> p_session_id
       or v_existing.price_id <> p_price_id
       or v_existing.live <> p_live
       or v_existing.amount_total <> p_amount_total
       or v_existing.currency <> v_currency
    then
      raise exception 'Payment identifier already recorded with conflicting details';
    end if;

    return query
      select e.paid_through, false
      from public.billing_entitlements e
      where e.owner_id = p_owner_id;
    return;
  end if;

  update public.billing_entitlements
  set paid_through = v_pass_ended, updated_at = now()
  where owner_id = p_owner_id;

  return query select v_pass_ended, true;
end;
$$;

revoke execute on function public.billing_apply_verified_payment(uuid, text, text, text, text, boolean, bigint, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.billing_apply_verified_payment(uuid, text, text, text, text, boolean, bigint, text, timestamptz)
  to service_role;
