-- ResumeStride: LOCAL foundation for the OPTIONAL recurring USD 19.99 /
-- 30-day subscription. See docs/RECURRING_IMPLEMENTATION.md for the full
-- design, what is deliberately NOT implemented (no handler/webhook wiring,
-- no Stripe API calls, no UI), and test results.
--
-- ADDITIVE ONLY. Does not alter 20260919210000_billing_ledger.sql or any
-- other prior migration. The one-time manual pass remains the default
-- purchase and is untouched by anything below; this migration only adds
-- new tables/functions that a future (not-yet-written) subscription
-- webhook handler would call, mirroring the exact SECURITY DEFINER /
-- revoke-then-grant-to-service_role-only pattern the billing ledger
-- migration already established.
--
-- Every mutation goes through a SECURITY DEFINER RPC granted to
-- `service_role` only, with `revoke ... from public, anon, authenticated`
-- on the underlying tables, an empty `search_path` (every reference
-- schema-qualified) on every function, and no direct INSERT/UPDATE/DELETE
-- grant for `service_role` either — only the RPCs can write.
--
-- These RPCs read and write `public.billing_entitlements`
-- (20260919210000_billing_ledger.sql) exactly the way
-- `billing_bind_intent` (20260919211000_checkout_intents.sql) already
-- calls `billing_record_checkout` across a migration boundary: composing
-- with an existing table/RPC from a later additive migration is the
-- established pattern in this repo, not a new one introduced here.

-- ---------------------------------------------------------------------------
-- 1. Trusted subscription identity — the server's OWN record of which owner
-- and price a given Stripe subscription id belongs to. Established ONCE
-- (by a future handler, from the already-authenticated owner who started
-- checkout — never from webhook payload fields) and never rebindable to a
-- different owner or price afterward. Every subsequent invoice event must
-- be checked against this row, exactly like billing_checkouts anchors
-- billing_apply_verified_payment for the one-time pass.
create table public.billing_subscriptions (
  subscription_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  price_id text not null,
  live boolean not null,
  status text not null,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_subscription_id_not_blank check (length(subscription_id) > 0),
  constraint billing_subscriptions_price_id_not_blank check (length(price_id) > 0),
  -- Mirrors the installed Stripe SDK's own Subscription.Status union
  -- (node_modules/stripe/cjs/resources/Subscriptions.d.ts) exactly, matching
  -- server/billing/recurring.ts's SubscriptionStatus type.
  constraint billing_subscriptions_status_known check (
    status in ('active','past_due','canceled','incomplete','incomplete_expired','paused','trialing','unpaid')
  )
);
create index billing_subscriptions_owner_id_idx on public.billing_subscriptions (owner_id);

-- ---------------------------------------------------------------------------
-- 2. Verified invoice ledger. One durable row per processed invoice,
-- whether it granted access or failed — recording BOTH is deliberate: a
-- failed invoice must be visible for support/reconciliation without ever
-- having touched billing_entitlements. `invoice_id` is the sole idempotency
-- key (Stripe invoice ids are already globally unique and stable across
-- redelivery, unlike the one-time flow's event_id/payment_id pair, because
-- there is exactly one invoice per billing cycle rather than an event and a
-- payment intent that can each be retried independently).
create table public.billing_subscription_invoices (
  invoice_id text primary key,
  subscription_id text not null references public.billing_subscriptions(subscription_id),
  owner_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('granted','failed')),
  amount_paid bigint not null default 0 check (amount_paid >= 0),
  currency text not null,
  period_start timestamptz,
  period_end timestamptz,
  verified_at timestamptz not null,
  granted_paid_through timestamptz,
  created_at timestamptz not null default now(),
  constraint billing_subscription_invoices_currency_lower check (
    currency = lower(currency) and length(currency) = 3
  ),
  -- A 'granted' row must carry the period/amount it was granted for and the
  -- resulting paid_through; a 'failed' row must carry none of those — this
  -- makes the outcome self-consistent in the schema itself, not just by
  -- convention in the RPCs below.
  constraint billing_subscription_invoices_granted_shape check (
    (outcome = 'granted' and amount_paid > 0 and period_start is not null and period_end is not null
       and period_end > period_start and granted_paid_through is not null)
    or
    (outcome = 'failed' and amount_paid = 0 and granted_paid_through is null)
  )
);
create index billing_subscription_invoices_owner_id_idx on public.billing_subscription_invoices (owner_id);
create index billing_subscription_invoices_subscription_id_idx on public.billing_subscription_invoices (subscription_id);

alter table public.billing_subscriptions enable row level security;
alter table public.billing_subscription_invoices enable row level security;

-- No policies at all for anon/authenticated on either table, combined with
-- the revoke below: PostgREST rejects every request with "permission
-- denied", not an empty RLS-filtered result. Unlike billing_entitlements,
-- there is deliberately no user-read policy here yet — a future read-only
-- "my subscription" surface is UI/handler work, explicitly out of scope for
-- this migration (see docs/RECURRING_IMPLEMENTATION.md). The unified
-- entitlement (`billing_entitlements.paid_through`) a subscriber actually
-- cares about is already user-readable today via that existing table.
revoke all on table public.billing_subscriptions, public.billing_subscription_invoices
  from public, anon, authenticated, service_role;

grant select on table public.billing_subscriptions, public.billing_subscription_invoices to service_role;

-- ---------------------------------------------------------------------------
-- 3. RPCs.
--
-- Every text/uuid argument is validated non-null and non-blank, and every
-- boolean/numeric/timestamp argument is validated non-null, BEFORE any
-- comparison against stored data — matching billing_apply_verified_payment's
-- own reasoning: SQL's `<>`/`=` against a NULL operand yields NULL (unknown),
-- so an unguarded mismatch check silently fails to raise when a caller
-- (bug or forgery) passes NULL for the very field a check depends on.

create or replace function public.billing_record_subscription(
  p_owner_id uuid,
  p_subscription_id text,
  p_price_id text,
  p_live boolean,
  p_status text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted text;
begin
  if p_owner_id is null
     or p_subscription_id is null or length(trim(p_subscription_id)) = 0
     or p_price_id is null or length(trim(p_price_id)) = 0
     or p_live is null
     or p_status is null
     or p_status not in ('active','past_due','canceled','incomplete','incomplete_expired','paused','trialing','unpaid')
  then
    raise exception 'A subscription record requires every field, non-blank, with a known status';
  end if;

  insert into public.billing_subscriptions (subscription_id, owner_id, price_id, live, status)
  values (p_subscription_id, p_owner_id, p_price_id, p_live, p_status)
  on conflict (subscription_id) do nothing
  returning subscription_id into v_inserted;

  if v_inserted is null then
    -- Identity (owner/price/live) can NEVER be rebound once established —
    -- an exact-match retry (a genuine no-op) is fine; a different
    -- owner/price/live under the same subscription_id is a bug or forgery
    -- attempt. Status IS allowed to differ from the stored row on a plain
    -- re-call of this function (this function is also how a future
    -- customer.subscription.updated handler would record a bare status
    -- transition); only identity is immutable here.
    if not exists (
      select 1 from public.billing_subscriptions
      where subscription_id = p_subscription_id
        and owner_id = p_owner_id
        and price_id = p_price_id
        and live = p_live
    ) then
      raise exception 'Subscription % already recorded with a different owner, price, or mode', p_subscription_id;
    end if;
    update public.billing_subscriptions
    set status = p_status, updated_at = now()
    where subscription_id = p_subscription_id;
  end if;
end;
$$;

revoke execute on function public.billing_record_subscription(uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.billing_record_subscription(uuid, text, text, boolean, text)
  to service_role;

create or replace function public.billing_lookup_subscription(p_subscription_id text)
returns public.billing_subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select s from public.billing_subscriptions s where s.subscription_id = p_subscription_id
$$;

revoke execute on function public.billing_lookup_subscription(text) from public, anon, authenticated;
grant execute on function public.billing_lookup_subscription(text) to service_role;

-- Cancellation / bare status transitions (e.g. customer.subscription.updated
-- toggling cancel_at_period_end, or customer.subscription.deleted setting
-- status='canceled'). Deliberately touches ONLY billing_subscriptions —
-- there is no reference to billing_entitlements anywhere in this function's
-- body, which is what makes "cancellation preserves paid_through" true by
-- construction rather than by a caller's discipline. Access already granted
-- by prior paid invoices lapses naturally via isPro()/paid_through, never by
-- an explicit retraction here.
create or replace function public.billing_update_subscription_status(
  p_subscription_id text,
  p_owner_id uuid,
  p_status text,
  p_cancel_at_period_end boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.billing_subscriptions;
begin
  if p_subscription_id is null or length(trim(p_subscription_id)) = 0
     or p_owner_id is null
     or p_status is null
     or p_status not in ('active','past_due','canceled','incomplete','incomplete_expired','paused','trialing','unpaid')
     or p_cancel_at_period_end is null
  then
    raise exception 'A subscription status update requires every field, non-blank, with a known status';
  end if;

  select * into v_row from public.billing_subscriptions where subscription_id = p_subscription_id for update;
  if not found then
    raise exception 'No trusted subscription record for %', p_subscription_id;
  end if;
  if v_row.owner_id <> p_owner_id then
    raise exception 'Subscription % does not belong to the claimed owner', p_subscription_id;
  end if;

  update public.billing_subscriptions
  set status = p_status, cancel_at_period_end = p_cancel_at_period_end, updated_at = now()
  where subscription_id = p_subscription_id;
end;
$$;

revoke execute on function public.billing_update_subscription_status(text, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.billing_update_subscription_status(text, uuid, text, boolean)
  to service_role;

-- A failed, uncollectible, or voided invoice: recorded for audit, grants
-- NOTHING. Idempotent by invoice_id, same conflicting-reuse reasoning as
-- billing_apply_verified_payment.
create or replace function public.billing_record_failed_subscription_invoice(
  p_subscription_id text,
  p_invoice_id text,
  p_owner_id uuid,
  p_currency text,
  p_verified_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.billing_subscriptions;
  v_existing public.billing_subscription_invoices;
  v_currency text;
begin
  if p_subscription_id is null or length(trim(p_subscription_id)) = 0
     or p_invoice_id is null or length(trim(p_invoice_id)) = 0
     or p_owner_id is null
     or p_currency is null or length(trim(p_currency)) = 0
     or p_verified_at is null
  then
    raise exception 'A failed invoice record requires every field, non-blank';
  end if;
  if not isfinite(p_verified_at)
     or p_verified_at < timestamptz '1970-01-01T00:00:00Z'
     or p_verified_at > timestamptz '275760-09-13T00:00:00Z'
     or p_verified_at > now() + interval '5 minutes'
  then
    raise exception 'Verified invoice time is not a plausible timestamp';
  end if;

  v_currency := lower(p_currency);

  select * into v_subscription from public.billing_subscriptions where subscription_id = p_subscription_id;
  if not found then
    raise exception 'No trusted subscription record for %', p_subscription_id;
  end if;
  if v_subscription.owner_id <> p_owner_id then
    raise exception 'Failed invoice does not match its trusted subscription record for %', p_subscription_id;
  end if;

  select * into v_existing from public.billing_subscription_invoices where invoice_id = p_invoice_id;
  if found then
    if v_existing.subscription_id <> p_subscription_id
       or v_existing.owner_id <> p_owner_id
       or v_existing.outcome <> 'failed'
    then
      raise exception 'Invoice % already recorded with conflicting details', p_invoice_id;
    end if;
    return;
  end if;

  insert into public.billing_subscription_invoices (
    invoice_id, subscription_id, owner_id, outcome, amount_paid, currency, verified_at
  ) values (
    p_invoice_id, p_subscription_id, p_owner_id, 'failed', 0, v_currency, p_verified_at
  )
  on conflict (invoice_id) do nothing;
end;
$$;

revoke execute on function public.billing_record_failed_subscription_invoice(text, text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.billing_record_failed_subscription_invoice(text, text, uuid, text, timestamptz)
  to service_role;

-- A genuinely paid invoice. This is the ONLY function in this migration
-- that ever writes to billing_entitlements, and it does so with
-- `greatest(current, period_end)` — never addition — so that:
--   * a customer's own manual-pass prepaid time beyond this invoice's
--     period is never shortened, overwritten, or "charged again" for, and
--   * duplicate or out-of-order invoice delivery for the same subscription
--     can only ever move paid_through forward to a later period end, never
--     double it and never move it backward.
-- This mirrors server/billing/recurring.ts's subscriptionInvoiceGrant
-- exactly; see that module for the full rationale.
create or replace function public.billing_apply_subscription_invoice(
  p_subscription_id text,
  p_invoice_id text,
  p_owner_id uuid,
  p_price_id text,
  p_live boolean,
  p_amount_paid bigint,
  p_currency text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_verified_at timestamptz
) returns table (paid_through timestamptz, applied boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.billing_subscriptions;
  v_existing public.billing_subscription_invoices;
  v_current timestamptz;
  v_next timestamptz;
  v_inserted_id text;
  v_currency text;
begin
  if p_subscription_id is null or length(trim(p_subscription_id)) = 0
     or p_invoice_id is null or length(trim(p_invoice_id)) = 0
     or p_owner_id is null
     or p_price_id is null or length(trim(p_price_id)) = 0
     or p_live is null
     or p_amount_paid is null or p_amount_paid <= 0
     or p_currency is null or length(trim(p_currency)) = 0
     or p_period_start is null
     or p_period_end is null
     or p_verified_at is null
  then
    raise exception 'A verified subscription invoice requires every field, non-blank';
  end if;

  if not isfinite(p_period_start) or not isfinite(p_period_end) or p_period_end <= p_period_start then
    raise exception 'Invoice period is not a plausible, ordered interval';
  end if;
  if p_period_end - p_period_start > interval '366 days' then
    raise exception 'Invoice period is implausibly long';
  end if;
  if not isfinite(p_verified_at)
     or p_verified_at < timestamptz '1970-01-01T00:00:00Z'
     or p_verified_at > timestamptz '275760-09-13T00:00:00Z'
     or p_verified_at > now() + interval '5 minutes'
  then
    raise exception 'Verified invoice time is not a plausible timestamp';
  end if;

  v_currency := lower(p_currency);

  -- Idempotency by invoice_id: an exact-match retry is a no-op; a
  -- conflicting reuse of the same invoice id is rejected outright.
  select * into v_existing from public.billing_subscription_invoices where invoice_id = p_invoice_id;
  if found then
    if v_existing.subscription_id <> p_subscription_id
       or v_existing.owner_id <> p_owner_id
       or v_existing.outcome <> 'granted'
       or v_existing.amount_paid <> p_amount_paid
       or v_existing.currency <> v_currency
       or v_existing.period_start <> p_period_start
       or v_existing.period_end <> p_period_end
    then
      raise exception 'Invoice % already recorded with conflicting details', p_invoice_id;
    end if;
    return query select v_existing.granted_paid_through, false;
    return;
  end if;

  select * into v_subscription from public.billing_subscriptions where subscription_id = p_subscription_id;
  if not found then
    raise exception 'No trusted subscription record for %', p_subscription_id;
  end if;

  -- Defense in depth after provider verification: the invoice must match
  -- the server's own trusted subscription record, not just carry a valid
  -- signature. Price/owner authority comes from THIS row, never from the
  -- invoice/webhook payload's own claims about itself.
  if v_subscription.owner_id <> p_owner_id
     or v_subscription.price_id <> p_price_id
     or v_subscription.live <> p_live
  then
    raise exception 'Verified invoice does not match its trusted subscription record for %', p_subscription_id;
  end if;

  -- Row lock scoped per owner on the SAME shared entitlement table the
  -- one-time pass writes to, serializing this against a concurrent manual
  -- pass purchase or another invoice for the same owner.
  insert into public.billing_entitlements (owner_id, paid_through)
  values (p_owner_id, null)
  on conflict (owner_id) do nothing;

  select billing_entitlements.paid_through into v_current
  from public.billing_entitlements where owner_id = p_owner_id for update;

  -- The prepaid-time coordination policy: move forward to this invoice's
  -- own period end, never past it, never below whatever is already there.
  v_next := greatest(coalesce(v_current, p_period_end), p_period_end);

  insert into public.billing_subscription_invoices (
    invoice_id, subscription_id, owner_id, outcome, amount_paid, currency,
    period_start, period_end, verified_at, granted_paid_through
  ) values (
    p_invoice_id, p_subscription_id, p_owner_id, 'granted', p_amount_paid, v_currency,
    p_period_start, p_period_end, p_verified_at, v_next
  )
  on conflict (invoice_id) do nothing
  returning invoice_id into v_inserted_id;

  if v_inserted_id is null then
    -- Lost a race against a concurrent call for the same invoice_id between
    -- the pre-check above and this insert. Same conflicting-details check
    -- as the pre-check.
    select * into v_existing from public.billing_subscription_invoices where invoice_id = p_invoice_id;
    if not found
       or v_existing.subscription_id <> p_subscription_id
       or v_existing.owner_id <> p_owner_id
       or v_existing.outcome <> 'granted'
       or v_existing.amount_paid <> p_amount_paid
       or v_existing.currency <> v_currency
       or v_existing.period_start <> p_period_start
       or v_existing.period_end <> p_period_end
    then
      raise exception 'Invoice % already recorded with conflicting details', p_invoice_id;
    end if;
    return query select v_existing.granted_paid_through, false;
    return;
  end if;

  update public.billing_entitlements
  set paid_through = v_next, updated_at = now()
  where owner_id = p_owner_id;

  -- Same greatest()-not-overwrite reasoning as v_next above: an
  -- out-of-order (earlier-cycle) invoice arriving after a later one must
  -- not move the tracked period end backward either.
  update public.billing_subscriptions
  set status = 'active',
      current_period_end = greatest(coalesce(current_period_end, p_period_end), p_period_end),
      updated_at = now()
  where subscription_id = p_subscription_id;

  return query select v_next, true;
end;
$$;

revoke execute on function public.billing_apply_subscription_invoice(text, text, uuid, text, boolean, bigint, text, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.billing_apply_subscription_invoice(text, text, uuid, text, boolean, bigint, text, timestamptz, timestamptz, timestamptz)
  to service_role;
