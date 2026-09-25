-- ResumeStride: durable refund/chargeback reconciliation for the one-time
-- manual pass. See docs/BILLING_REVERSAL_DESIGN.md for the full policy
-- rationale — including two design defects an earlier, unwired
-- server/billing/reconciliation.ts prototype had (event-time chain reflow,
-- and treating opaque event-id ordering as provider lifecycle authority) —
-- and server/billing/reconciliation.ts itself for the equivalent pure
-- TypeScript policy this file's PL/pgSQL logic mirrors byte-for-byte in
-- intent (SQL cannot call TypeScript, so the fold algorithm is necessarily
-- duplicated here; keep both in sync if the policy ever changes).
--
-- ADDITIVE ONLY. Does not rewrite anything created by prior migrations:
--   - one new column on the EXISTING public.billing_payments table
--     (status, default 'active' — every row inserted by prior code is
--     genuinely still active, since no reversal handling existed before
--     this migration)
--   - one new table, public.billing_reversal_events
--   - one new SECURITY DEFINER RPC, public.billing_apply_reversal_event,
--     service_role-only, same hardening pattern as
--     billing_apply_verified_payment in 20260919210000_billing_ledger.sql
--     (empty search_path, every reference schema-qualified, EXECUTE revoked
--     from public/anon/authenticated, no direct table grant for mutation).
--
-- Ownership is NEVER accepted as an argument to billing_apply_reversal_event
-- — unlike billing_apply_verified_payment (which trusts a server-
-- authenticated caller's owner_id, checked against a trusted
-- billing_checkouts record), this RPC derives the owner strictly by looking
-- up the EXISTING billing_payments row for the given payment_id. A
-- refund/dispute webhook event only ever proves "this payment was
-- reversed" — it must never be trusted for whose account that payment
-- belongs to; a caller (server/billing/handlers.ts) must independently
-- verify the webhook signature before ever calling this RPC, exactly like
-- the existing checkout webhook path.
--
-- POLICY (mirrors server/billing/reconciliation.ts's own header exactly):
--   - A full refund or full chargeback (amount_total exactly matching the
--     original payment's own amount_total) voids that payment.
--   - A chargeback_reversed (a won dispute) only restores a payment
--     currently voided BY A CHARGEBACK SPECIFICALLY, and only for the exact
--     original amount. It can never undo a plain refund — a full refund is
--     permanent even if it follows a disputed charge (the concrete defect
--     an earlier prototype had, and its regression, are both preserved
--     here — see "dispute win cannot restore a refunded payment" below).
--   - A partial-amount refund/chargeback/restoration (amount_total not
--     exactly equal to the payment's own amount_total) is left UNAPPLIED —
--     this repository has made no product/legal decision about what a
--     partial reversal should mean for entitlement time (proportional
--     deduction, no change, and full void are all plausible; none is
--     implemented here). It is surfaced back to the immediate caller via
--     this function's `anomaly` output column only (for logging/alerting),
--     not persisted to a queryable table — a follow-up wanting durable,
--     support-facing visibility into anomalies across time would need its
--     own table; this migration deliberately keeps that out of scope.
--   - Every payment's status is REFOLDED FROM SCRATCH, from the complete SET
--     of its own reversal_events rows, on every call — never a one-shot
--     transition applied only to whatever the row's current status happens
--     to be, and (as of this revision) never decided by an (occurred_at,
--     event_id) sequence at all. Each dispute (grouped by its own carried
--     `dispute_id`, Stripe's own dispute object id) is resolved
--     independently: it is 'won' if and only if it has at least one
--     full-amount 'chargeback' fact AND at least one full-amount
--     'chargeback_reversed' fact, a SET-membership property that is the same
--     regardless of which of the two events this database happened to see
--     first, or whether both share an identical occurred_at. This is the fix
--     for the defect the September20 06:48 review flagged: an
--     (occurred_at, event_id) tiebreak between two OPPOSING facts about the
--     very same dispute is not provider lifecycle authority and can pick the
--     wrong winner on a same-second or out-of-order delivery. A payment can
--     accumulate more than one dispute over its lifetime; it is only
--     restored to 'active' once EVERY dispute raised against it has resolved
--     'won' AND it was never separately, permanently voided by a full
--     refund (see "dispute win cannot restore a refunded payment" below).
--   - Voiding or restoring one payment NEVER reflows another payment's own
--     recorded pass_started_at/pass_ended_at. The owner's recomputed
--     paid_through is the GREATEST of (a) the latest pass_ended_at among
--     that owner's currently-active (status = 'active') one-time-pass
--     payments, and (b) the highest invoice period_end this owner's
--     subscription invoices (public.billing_subscription_invoices,
--     20260920020000_recurring_billing.sql) have ever recorded — see
--     "Coordinating with recurring/subscription billing" below for why (b)
--     is required. Every unaffected one-time payment keeps the exact window
--     billing_apply_verified_payment already durably recorded for it, in
--     true serialized application order. This is the fix for the
--     "counterfactual reflow can shorten a later valid pass" defect flagged
--     against the earlier reconciliation.ts prototype before it was wired
--     into anything.
--
-- Coordinating with recurring/subscription billing: this file does not
-- reverse, void, or otherwise touch a single row of
-- billing_subscriptions/billing_subscription_invoices — a subscription
-- invoice refund/dispute is explicitly still out of scope (see below). But
-- billing_apply_reversal_event's own paid_through recomputation MUST look at
-- billing_subscription_invoices.period_end, not the combined account snapshot
-- granted_paid_through. The snapshot can include a manual pass that was later
-- refunded; preserving that snapshot would accidentally restore refunded time.
-- Each paid invoice contributes only its own verified coverage period.
-- This does NOT mean invoice application prevents overlapping provider
-- charges or reconciles Stripe's own subscription billing schedule — that
-- remains entirely Stripe's concern; this is purely about not letting one
-- source's local ledger recomputation clobber the other source's already
-- durably recorded local grant.
--
-- NOT implemented here (see docs/BILLING_REVERSAL_DESIGN.md for why each is
-- a deliberate product/legal decision this migration does not invent):
--   - Partial refunds/disputes (see above — anomaly only, no time adjusted).
--   - "Already-consumed time" clawback or credit-back of any kind.
--   - Reversing a SUBSCRIPTION invoice itself (a subscription-invoice
--     refund/dispute) — this file only prevents a one-time-pass reversal
--     from clobbering subscription-granted time; it does not add any new
--     reversal handling for the subscription side, which remains separate
--     follow-up work.

alter table public.billing_payments
  add column if not exists status text not null default 'active'
  constraint billing_payments_status_valid check (status in ('active', 'voided_refund', 'voided_chargeback'));

create index if not exists billing_payments_owner_status_idx
  on public.billing_payments (owner_id, status);

-- ---------------------------------------------------------------------------
-- Durable, idempotent reversal-event ledger — one row per Stripe
-- refund/dispute lifecycle event, deduplicated by the provider's own event
-- id exactly like billing_payments deduplicates payments. Append-only: rows
-- here are never updated or deleted; a payment's current status is derived
-- by folding all of its rows (see billing_apply_reversal_event below), not
-- stored redundantly per event.
create table public.billing_reversal_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  payment_id text not null references public.billing_payments (payment_id),
  kind text not null,
  -- Stripe's own dispute object id. Required, non-blank for
  -- chargeback/chargeback_reversed (the only fact used to associate two
  -- opposing events with the SAME dispute — see billing_apply_reversal_event
  -- below); required NULL for refund, which is never itself a dispute.
  dispute_id text,
  occurred_at timestamptz not null,
  amount_total bigint not null,
  created_at timestamptz not null default now(),
  constraint billing_reversal_events_event_id_unique unique (event_id),
  constraint billing_reversal_events_kind_valid check (kind in ('refund', 'chargeback', 'chargeback_reversed')),
  constraint billing_reversal_events_amount_positive check (amount_total > 0),
  constraint billing_reversal_events_dispute_id_shape check (
    (kind = 'refund' and dispute_id is null) or
    (kind in ('chargeback', 'chargeback_reversed') and dispute_id is not null and length(trim(dispute_id)) > 0)
  )
);

create index billing_reversal_events_payment_id_idx on public.billing_reversal_events (payment_id);
create index billing_reversal_events_dispute_id_idx on public.billing_reversal_events (dispute_id) where dispute_id is not null;

alter table public.billing_reversal_events enable row level security;

-- No policy at all for anon/authenticated, matching billing_checkouts/
-- billing_payments: PostgREST rejects every request with "permission
-- denied", not an empty RLS-filtered result. service_role gets SELECT only
-- (support/reconciliation lookups) — the only writer is the RPC below.
revoke all on table public.billing_reversal_events from public, anon, authenticated, service_role;
grant select on table public.billing_reversal_events to service_role;

-- ---------------------------------------------------------------------------
-- A dispute id names exactly one dispute, which can only ever have been
-- raised against exactly one payment for its entire lifetime. dispute_id is
-- NOT unique on billing_reversal_events itself (a dispute has multiple
-- events: created, then won/lost), so this small claim table gives a real,
-- atomic (primary-key-enforced) guarantee that two different payment ids can
-- never both claim the same dispute id, even under true concurrent calls —
-- the same "insert, on conflict do nothing, then verify what actually won"
-- pattern billing_payments/billing_reversal_events already use for their own
-- idempotency keys.
create table public.billing_reversal_disputes (
  dispute_id text primary key,
  payment_id text not null references public.billing_payments (payment_id),
  constraint billing_reversal_disputes_dispute_id_not_blank check (length(trim(dispute_id)) > 0)
);

alter table public.billing_reversal_disputes enable row level security;
revoke all on table public.billing_reversal_disputes from public, anon, authenticated, service_role;
grant select on table public.billing_reversal_disputes to service_role;

-- ---------------------------------------------------------------------------
create or replace function public.billing_apply_reversal_event(
  p_event_id text,
  p_payment_id text,
  p_kind text,
  p_dispute_id text,
  p_occurred_at timestamptz,
  p_amount_total bigint
) returns table (paid_through timestamptz, status text, applied boolean, anomaly text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.billing_payments;
  v_existing public.billing_reversal_events;
  v_existing_count integer;
  v_state text;
  v_this_anomaly text;
  v_new_paid_through timestamptz;
  v_inserted_id uuid;
  v_locked_owner uuid;
  v_dispute_payment_id text;
  v_voided_by_refund boolean;
  v_unresolved_dispute boolean;
  v_has_valid_chargeback boolean;
begin
  if p_event_id is null or length(trim(p_event_id)) = 0
     or p_payment_id is null or length(trim(p_payment_id)) = 0
     or p_kind is null or p_kind not in ('refund', 'chargeback', 'chargeback_reversed')
     or p_occurred_at is null
     or p_amount_total is null or p_amount_total <= 0
  then
    raise exception 'A reversal event requires every field, valid and non-blank';
  end if;

  -- Required non-blank for chargeback/chargeback_reversed (the only fact
  -- used to associate two opposing events with the SAME dispute); required
  -- NULL for refund, which is never itself a dispute. Mirrors
  -- server/billing/reconciliation.ts's canonicalDisputeId exactly.
  if p_kind = 'refund' then
    if p_dispute_id is not null then
      raise exception 'A refund event must not carry a dispute id';
    end if;
  elsif p_dispute_id is null or length(trim(p_dispute_id)) = 0 then
    raise exception 'A % event requires a non-blank dispute id', p_kind;
  end if;

  -- Same plausible-timestamp domain as billing_apply_verified_payment's
  -- p_verified_at: isfinite() rejects Postgres's 'infinity'/'-infinity',
  -- bounds mirror server/billing/policy.ts's timestamp(), and a small
  -- five-minute allowance covers ordinary clock skew, not a real future
  -- event.
  if not isfinite(p_occurred_at)
     or p_occurred_at < timestamptz '1970-01-01T00:00:00Z'
     or p_occurred_at > timestamptz '275760-09-13T00:00:00Z'
     or p_occurred_at > now() + interval '5 minutes'
  then
    raise exception 'Reversal event time is not a plausible timestamp';
  end if;

  -- Idempotency by event_id: a match is a silent no-op only if every other
  -- immutable fact also matches the row already on file (a resent webhook
  -- delivery of the exact same event); anything else reusing the id is a
  -- conflicting reuse (bug or forgery) and must be rejected, not silently
  -- absorbed as "already applied". `is distinct from` (not `<>`) for
  -- dispute_id specifically, since it is legitimately NULL for a refund —
  -- plain `<>` against two NULLs yields NULL/unknown, which would silently
  -- fail to raise on a genuine mismatch.
  select count(*) into v_existing_count from public.billing_reversal_events where event_id = p_event_id;
  if v_existing_count > 1 then
    raise exception 'Conflicting reversal event identifiers already recorded under different ledger rows';
  elsif v_existing_count = 1 then
    select * into v_existing from public.billing_reversal_events where event_id = p_event_id;
    if v_existing.payment_id <> p_payment_id or v_existing.kind <> p_kind
       or v_existing.dispute_id is distinct from p_dispute_id
       or v_existing.occurred_at <> p_occurred_at or v_existing.amount_total <> p_amount_total
    then
      raise exception 'Reversal event % already recorded with different details', p_event_id;
    end if;
    select pay.status, e.paid_through into v_state, v_new_paid_through
    from public.billing_payments pay
    join public.billing_entitlements e on e.owner_id = pay.owner_id
    where pay.payment_id = p_payment_id;
    return query select v_new_paid_through, v_state, false, null::text;
    return;
  end if;

  -- Never trust an owner from the event itself; look one up strictly from
  -- the already-verified payment this event claims to reverse. Row-locked
  -- so a concurrent reversal event for the SAME payment can't race this
  -- call's own refold below.
  select * into v_payment from public.billing_payments where payment_id = p_payment_id for update;
  if not found then
    raise exception 'Reversal event % references unknown payment %', p_event_id, p_payment_id;
  end if;

  -- Row lock scoped per owner, serializing this reversal against any
  -- concurrent billing_apply_verified_payment or billing_apply_reversal_event
  -- call for the same account, exactly like billing_apply_verified_payment's
  -- own per-owner lock.
  select owner_id into v_locked_owner from public.billing_entitlements
  where owner_id = v_payment.owner_id for update;
  if not found then
    raise exception 'No entitlement record for payment % owner', p_payment_id;
  end if;

  -- Atomically claim this dispute id for this payment id. A concurrent call
  -- for a DIFFERENT payment id racing on the same dispute id loses the
  -- primary-key conflict below and is rejected, not silently absorbed.
  if p_dispute_id is not null then
    insert into public.billing_reversal_disputes (dispute_id, payment_id)
    values (p_dispute_id, p_payment_id)
    on conflict (dispute_id) do nothing;
    select payment_id into v_dispute_payment_id
    from public.billing_reversal_disputes where dispute_id = p_dispute_id;
    if v_dispute_payment_id <> p_payment_id then
      raise exception 'Dispute % is already recorded under a different payment', p_dispute_id;
    end if;
  end if;

  insert into public.billing_reversal_events (event_id, payment_id, kind, dispute_id, occurred_at, amount_total)
  values (p_event_id, p_payment_id, p_kind, p_dispute_id, p_occurred_at, p_amount_total)
  on conflict (event_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    -- Lost a race against a concurrent call that inserted the identical
    -- event_id between the pre-check above and this insert. Same
    -- conflicting-details comparison as the pre-check, never silently
    -- treated as this call's own success if the details disagree.
    select * into v_existing from public.billing_reversal_events where event_id = p_event_id;
    if not found or v_existing.payment_id <> p_payment_id or v_existing.kind <> p_kind
       or v_existing.dispute_id is distinct from p_dispute_id
       or v_existing.occurred_at <> p_occurred_at or v_existing.amount_total <> p_amount_total
    then
      raise exception 'Reversal event % already recorded with different details', p_event_id;
    end if;
  end if;

  -- Refold this payment's status from the SET of its own reversal_events
  -- rows — never from an (occurred_at, event_id) sequence. A full refund
  -- permanently voids regardless of any dispute outcome. Each dispute
  -- (grouped by its own dispute_id) is 'won' if and only if it has BOTH a
  -- full-amount 'chargeback' fact AND a full-amount 'chargeback_reversed'
  -- fact — a set-membership property, identical regardless of which of the
  -- two events this database happened to see first or whether they share an
  -- identical occurred_at. Mirrors server/billing/reconciliation.ts's
  -- foldPaymentEvents/resolveDispute exactly.
  select bool_or(amount_total = v_payment.amount_total) into v_voided_by_refund
  from public.billing_reversal_events
  where payment_id = p_payment_id and kind = 'refund';
  v_voided_by_refund := coalesce(v_voided_by_refund, false);

  select bool_or(has_valid_chargeback and not has_valid_reversal) into v_unresolved_dispute
  from (
    select
      bool_or(kind = 'chargeback' and amount_total = v_payment.amount_total) as has_valid_chargeback,
      bool_or(kind = 'chargeback_reversed' and amount_total = v_payment.amount_total) as has_valid_reversal
    from public.billing_reversal_events
    where payment_id = p_payment_id and kind in ('chargeback', 'chargeback_reversed')
    group by dispute_id
  ) per_dispute;
  v_unresolved_dispute := coalesce(v_unresolved_dispute, false);

  if v_voided_by_refund then
    v_state := 'voided_refund';
  elsif v_unresolved_dispute then
    v_state := 'voided_chargeback';
  else
    v_state := 'active';
  end if;

  -- This call's OWN event anomaly, if any — independent of the payment's
  -- overall v_state above (e.g. an orphan chargeback_reversed can coexist
  -- with a payment that is separately, validly voided by a refund).
  v_this_anomaly := null;
  if p_kind in ('refund', 'chargeback') and p_amount_total <> v_payment.amount_total then
    v_this_anomaly := format(
      'Partial %s of %s against a %s payment has no defined entitlement policy; left in its last unambiguous state',
      p_kind, p_amount_total, v_payment.amount_total
    );
  elsif p_kind = 'chargeback_reversed' then
    if p_amount_total <> v_payment.amount_total then
      v_this_anomaly := format(
        'chargeback_reversed amount %s for dispute %s does not match the original payment amount %s; ignored',
        p_amount_total, p_dispute_id, v_payment.amount_total
      );
    else
      select bool_or(kind = 'chargeback' and amount_total = v_payment.amount_total) into v_has_valid_chargeback
      from public.billing_reversal_events
      where payment_id = p_payment_id and dispute_id = p_dispute_id;
      if not coalesce(v_has_valid_chargeback, false) then
        v_this_anomaly := format(
          'chargeback_reversed with no matching chargeback for dispute %s; ignored', p_dispute_id
        );
      end if;
    end if;
  end if;

  update public.billing_payments set status = v_state where payment_id = p_payment_id;

  -- Never reflow any OTHER payment's own recorded pass window, and never
  -- erase valid subscription entitlement: the new paid_through is the
  -- GREATEST of this owner's active one-time passes' own recorded windows
  -- and the highest paid_through their subscription invoices have ever
  -- granted — see the "Coordinating with recurring/subscription billing"
  -- note near the top of this file for why the latter is required.
  select greatest(
    (select max(pass_ended_at) from public.billing_payments
       where owner_id = v_payment.owner_id and billing_payments.status = 'active'),
    (select max(period_end) from public.billing_subscription_invoices
       where owner_id = v_payment.owner_id and outcome = 'granted')
  ) into v_new_paid_through;

  update public.billing_entitlements
  set paid_through = v_new_paid_through, updated_at = now()
  where owner_id = v_payment.owner_id;

  return query select v_new_paid_through, v_state, true, v_this_anomaly;
end;
$$;

revoke execute on function public.billing_apply_reversal_event(text, text, text, text, timestamptz, bigint)
  from public, anon, authenticated;
grant execute on function public.billing_apply_reversal_event(text, text, text, text, timestamptz, bigint)
  to service_role;
