-- ResumeStride: durable refund/chargeback reconciliation for RECURRING
-- subscription invoices — the gap `docs/BILLING_REVERSAL_DESIGN.md` and
-- `docs/RECURRING_IMPLEMENTATION.md` both flagged as explicitly out of
-- scope for `20260920030000_billing_reversals.sql`: that file's
-- `billing_apply_reversal_event` only ever resolves a payment recorded in
-- `public.billing_payments` (the one-time manual pass). A refund or dispute
-- against a recurring subscription invoice's own charge had NO handling at
-- all — the webhook event would re-retrieve the Charge/Dispute correctly,
-- then fail with "unknown payment" trying to look it up in
-- `billing_payments`, since it was never recorded there.
--
-- This migration mirrors that file's exact policy structure for
-- `public.billing_subscription_invoices` rows instead — same permanence
-- rule (a full refund is permanent even across a later won dispute), same
-- dispute-identity rule (Stripe's own `dispute.id`, never event-id/timestamp
-- ordering, decides a dispute's terminal state as a SET property of its own
-- events), same idempotent-by-event_id, refold-from-scratch-on-every-call
-- design, and same "no reflow of any other, unaffected window" guarantee.
-- See `server/billing/reconciliation.ts`'s header and
-- `20260920030000_billing_reversals.sql`'s header for the full rationale;
-- it is not repeated in full here.
--
-- ADDITIVE ONLY. Does not rewrite the contents of any prior migration file:
--   - two new columns on the EXISTING public.billing_subscription_invoices
--     table (payment_intent_id, status — both default-safe for every row a
--     prior migration/session already inserted: payment_intent_id is
--     nullable and status defaults to 'active', which is genuinely true of
--     every invoice recorded before this file existed, since no reversal
--     handling for invoices existed before now)
--   - two new tables, public.billing_subscription_invoice_reversal_events
--     and public.billing_subscription_invoice_reversal_disputes, structured
--     identically in intent to billing_reversal_events/billing_reversal_disputes
--   - three new SECURITY DEFINER RPCs, all service_role-only, same hardening
--     pattern as every other RPC in this codebase (empty search_path, every
--     reference schema-qualified, EXECUTE revoked from public/anon/authenticated):
--       * billing_record_subscription_invoice_payment_intent — establishes the
--         durable payment_intent -> invoice -> owner mapping, called once by
--         server/billing/handlers.ts's applyInvoiceEvent right after a 'paid'
--         invoice is verified and granted.
--       * billing_lookup_reversal_target — a read-only dispatch helper so
--         applyReversalEvent (handlers.ts) can tell whether a given
--         payment_intent id names a one-time pass or a subscription invoice,
--         from the SAME two durable mappings, before calling the matching
--         apply RPC.
--       * billing_apply_subscription_invoice_reversal_event — the actual
--         fold/apply RPC for a subscription invoice, structurally identical
--         to billing_apply_reversal_event.
--   - one redefinition (create or replace, same signature — not a new
--     overload) of the EXISTING billing_apply_reversal_event, adding a
--     `status = 'active'` filter to the subscription-invoice half of its own
--     paid_through recomputation (see "Why billing_apply_reversal_event is
--     redefined here" below) — the function body changes, but the file that
--     originally created it is untouched.
--
-- Ownership is NEVER accepted as an argument to either apply RPC below —
-- exactly like billing_apply_reversal_event, both derive the owner strictly
-- from an EXISTING, already-verified row (billing_payments.payment_id or
-- billing_subscription_invoices.payment_intent_id). A refund/dispute webhook
-- event only ever proves "this payment_intent was reversed"; it must never
-- be trusted for whose account that payment belongs to.
--
-- POLICY (mirrors billing_apply_reversal_event's own header exactly, with
-- "payment"/"billing_payments" replaced by "subscription invoice
-- payment"/"billing_subscription_invoices"):
--   - A full refund or full chargeback (amount_total exactly matching the
--     invoice's own amount_paid) voids that invoice's granted coverage.
--   - A chargeback_reversed (a won dispute) only restores an invoice
--     currently voided BY A CHARGEBACK SPECIFICALLY, and only for the exact
--     original amount. It can never undo a plain refund.
--   - A partial-amount refund/chargeback/restoration is left UNAPPLIED —
--     same deliberate non-decision as the one-time-pass policy; see
--     `docs/BILLING_REVERSAL_DESIGN.md`, "Already-consumed time and partial
--     refunds — explicitly not invented", which applies identically here.
--     Surfaced via this RPC's own `anomaly` output column only.
--   - Every invoice's status is REFOLDED FROM SCRATCH, from the complete SET
--     of its own reversal_events rows, on every call. Each dispute (grouped
--     by its own `dispute_id`) is resolved independently as a SET-membership
--     property, identical regardless of delivery order.
--   - Voiding or restoring one subscription invoice NEVER reflows any other
--     invoice's or payment's own recorded window. The owner's recomputed
--     paid_through is the GREATEST of (a) the latest pass_ended_at among
--     that owner's currently-active one-time-pass payments, and (b) the
--     highest period_end among that owner's OWN currently-active
--     ('granted' AND status = 'active') subscription invoices — using each
--     survivor invoice's own independent, already-verified period_end, never
--     the combined running `granted_paid_through` snapshot (which can
--     already include time an unrelated, later-voided invoice or manual
--     pass contributed at the moment it was granted, and would silently
--     restore that if reused here — the exact class of bug this repository
--     already fixed once for the one-time-pass side; see
--     `docs/BILLING_REVERSAL_DESIGN.md`'s "September20 07:39 independent
--     acceptance" note).
--
-- Why billing_apply_reversal_event is redefined here: its OWN paid_through
-- recomputation already composes with billing_subscription_invoices (see its
-- original header, "Coordinating with recurring/subscription billing"), but
-- it summed every 'granted' invoice's period_end unconditionally, because no
-- invoice could ever be reversed before this file existed. Now that an
-- invoice CAN be voided by this file's own RPC, a stale, refunded/charged-
-- back invoice's period_end must stop counting toward paid_through when a
-- SEPARATE, unrelated one-time-pass reversal event triggers that same
-- recomputation — otherwise voiding a subscription invoice here and then
-- reversing an unrelated manual pass would resurrect the voided invoice's
-- time through the older function's still-unconditional subquery. Adding
-- `and status = 'active'` is the only change to that function's body; every
-- other line, and its own existing test coverage for the one-time-pass
-- fold/permanence/dispute-identity behavior, is unaffected, since every
-- pre-existing row defaults to status = 'active'.

alter table public.billing_subscription_invoices
  add column if not exists status text not null default 'active'
  constraint billing_subscription_invoices_status_valid check (status in ('active', 'voided_refund', 'voided_chargeback'));

-- One Stripe payment_intent can only ever back one invoice's own settled
-- payment (the two purchase flows — one-time pass vs. recurring invoice —
-- are disjoint checkout flows and never share a payment_intent), so this is
-- a real, concurrency-safe uniqueness guarantee, not just an application
-- convention: two different invoices racing to bind the same payment_intent
-- id cannot both succeed. Nullable — a 'failed' invoice never had a settled
-- payment and never gets one bound.
alter table public.billing_subscription_invoices
  add column if not exists payment_intent_id text
  constraint billing_subscription_invoices_payment_intent_unique unique;

create index if not exists billing_subscription_invoices_owner_status_idx
  on public.billing_subscription_invoices (owner_id, status);

-- ---------------------------------------------------------------------------
-- Durable, idempotent reversal-event ledger for subscription invoices —
-- structurally identical to billing_reversal_events, keyed by invoice_id
-- (billing_subscription_invoices' own primary key) instead of payment_id.
create table public.billing_subscription_invoice_reversal_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  payment_intent_id text not null,
  invoice_id text not null references public.billing_subscription_invoices (invoice_id),
  kind text not null,
  dispute_id text,
  occurred_at timestamptz not null,
  amount_total bigint not null,
  created_at timestamptz not null default now(),
  constraint billing_subscription_invoice_reversal_events_event_id_unique unique (event_id),
  constraint billing_subscription_invoice_reversal_events_kind_valid check (kind in ('refund', 'chargeback', 'chargeback_reversed')),
  constraint billing_subscription_invoice_reversal_events_amount_positive check (amount_total > 0),
  constraint billing_subscription_invoice_reversal_events_dispute_id_shape check (
    (kind = 'refund' and dispute_id is null) or
    (kind in ('chargeback', 'chargeback_reversed') and dispute_id is not null and length(trim(dispute_id)) > 0)
  )
);

create index billing_subscription_invoice_reversal_events_invoice_id_idx
  on public.billing_subscription_invoice_reversal_events (invoice_id);
create index billing_subscription_invoice_reversal_events_dispute_id_idx
  on public.billing_subscription_invoice_reversal_events (dispute_id) where dispute_id is not null;

alter table public.billing_subscription_invoice_reversal_events enable row level security;
revoke all on table public.billing_subscription_invoice_reversal_events from public, anon, authenticated, service_role;
grant select on table public.billing_subscription_invoice_reversal_events to service_role;

-- Same atomic cross-invoice dispute-id exclusivity guarantee as
-- billing_reversal_disputes, scoped to the subscription-invoice domain: a
-- dispute id can only ever belong to one invoice for its entire lifetime.
-- (A dispute id is never shared between the one-time-pass and
-- subscription-invoice domains in practice — a Stripe dispute always
-- references exactly one charge, which belongs to exactly one checkout flow
-- — so the two domains' claim tables are intentionally kept separate rather
-- than unified into one cross-domain table.)
create table public.billing_subscription_invoice_reversal_disputes (
  dispute_id text primary key,
  invoice_id text not null references public.billing_subscription_invoices (invoice_id),
  constraint billing_subscription_invoice_reversal_disputes_not_blank check (length(trim(dispute_id)) > 0)
);

alter table public.billing_subscription_invoice_reversal_disputes enable row level security;
revoke all on table public.billing_subscription_invoice_reversal_disputes from public, anon, authenticated, service_role;
grant select on table public.billing_subscription_invoice_reversal_disputes to service_role;

-- ---------------------------------------------------------------------------
-- Establishes the durable payment_intent -> invoice -> owner mapping, from
-- the invoice's OWN already-retrieved, already-`paid` InvoicePayment only
-- (server/billing/handlers.ts's applyInvoiceEvent, right after
-- billing_apply_subscription_invoice succeeds) — never from a webhook
-- event's own metadata. Idempotent: rebinding the same invoice to the same
-- payment_intent is a no-op; rebinding to a DIFFERENT payment_intent, or
-- binding a non-granted invoice, is rejected outright.
create or replace function public.billing_record_subscription_invoice_payment_intent(
  p_invoice_id text,
  p_payment_intent_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.billing_subscription_invoices;
begin
  if p_invoice_id is null or length(trim(p_invoice_id)) = 0
     or p_payment_intent_id is null or length(trim(p_payment_intent_id)) = 0
  then
    raise exception 'A subscription invoice payment mapping requires both fields, non-blank';
  end if;

  select * into v_invoice from public.billing_subscription_invoices where invoice_id = p_invoice_id for update;
  if not found then
    raise exception 'No subscription invoice record for %', p_invoice_id;
  end if;
  if v_invoice.outcome <> 'granted' then
    raise exception 'Only a granted subscription invoice can be bound to a payment intent, got %', p_invoice_id;
  end if;

  if v_invoice.payment_intent_id is not null then
    if v_invoice.payment_intent_id <> p_payment_intent_id then
      raise exception 'Subscription invoice % already bound to a different payment intent', p_invoice_id;
    end if;
    return;
  end if;

  update public.billing_subscription_invoices
  set payment_intent_id = p_payment_intent_id
  where invoice_id = p_invoice_id;
end;
$$;

revoke execute on function public.billing_record_subscription_invoice_payment_intent(text, text)
  from public, anon, authenticated;
grant execute on function public.billing_record_subscription_invoice_payment_intent(text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Read-only dispatch helper: a Stripe payment_intent id names EITHER a
-- one-time manual pass (billing_payments.payment_id) OR a recurring
-- subscription invoice's own settled payment
-- (billing_subscription_invoices.payment_intent_id) — never both, since the
-- two are disjoint checkout flows. server/billing/handlers.ts's
-- applyReversalEvent calls this before deciding which apply RPC to invoke.
-- Checked regardless of the row's current status/outcome (a repeat dispute
-- event on an already-voided payment/invoice must still route correctly).
create or replace function public.billing_lookup_reversal_target(p_payment_intent_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.billing_payments where payment_id = p_payment_intent_id) then 'manual'
    when exists (
      select 1 from public.billing_subscription_invoices
      where payment_intent_id = p_payment_intent_id and outcome = 'granted'
    ) then 'subscription'
    else null
  end
$$;

revoke execute on function public.billing_lookup_reversal_target(text) from public, anon, authenticated;
grant execute on function public.billing_lookup_reversal_target(text) to service_role;

-- ---------------------------------------------------------------------------
-- The subscription-invoice equivalent of billing_apply_reversal_event —
-- same idempotency, dispute-identity, and no-reflow policy, applied to
-- billing_subscription_invoices instead of billing_payments. See the policy
-- comment near the top of this file; the body below mirrors
-- billing_apply_reversal_event line-for-line except for the table/column
-- names and the "invoice" framing of the anomaly messages.
create or replace function public.billing_apply_subscription_invoice_reversal_event(
  p_event_id text,
  p_payment_intent_id text,
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
  v_invoice public.billing_subscription_invoices;
  v_existing public.billing_subscription_invoice_reversal_events;
  v_existing_count integer;
  v_state text;
  v_this_anomaly text;
  v_new_paid_through timestamptz;
  v_inserted_id uuid;
  v_locked_owner uuid;
  v_dispute_invoice_id text;
  v_voided_by_refund boolean;
  v_unresolved_dispute boolean;
  v_has_valid_chargeback boolean;
begin
  if p_event_id is null or length(trim(p_event_id)) = 0
     or p_payment_intent_id is null or length(trim(p_payment_intent_id)) = 0
     or p_kind is null or p_kind not in ('refund', 'chargeback', 'chargeback_reversed')
     or p_occurred_at is null
     or p_amount_total is null or p_amount_total <= 0
  then
    raise exception 'A subscription invoice reversal event requires every field, valid and non-blank';
  end if;

  if p_kind = 'refund' then
    if p_dispute_id is not null then
      raise exception 'A refund event must not carry a dispute id';
    end if;
  elsif p_dispute_id is null or length(trim(p_dispute_id)) = 0 then
    raise exception 'A % event requires a non-blank dispute id', p_kind;
  end if;

  if not isfinite(p_occurred_at)
     or p_occurred_at < timestamptz '1970-01-01T00:00:00Z'
     or p_occurred_at > timestamptz '275760-09-13T00:00:00Z'
     or p_occurred_at > now() + interval '5 minutes'
  then
    raise exception 'Reversal event time is not a plausible timestamp';
  end if;

  select count(*) into v_existing_count from public.billing_subscription_invoice_reversal_events where event_id = p_event_id;
  if v_existing_count > 1 then
    raise exception 'Conflicting reversal event identifiers already recorded under different ledger rows';
  elsif v_existing_count = 1 then
    select * into v_existing from public.billing_subscription_invoice_reversal_events where event_id = p_event_id;
    if v_existing.payment_intent_id <> p_payment_intent_id or v_existing.kind <> p_kind
       or v_existing.dispute_id is distinct from p_dispute_id
       or v_existing.occurred_at <> p_occurred_at or v_existing.amount_total <> p_amount_total
    then
      raise exception 'Reversal event % already recorded with different details', p_event_id;
    end if;
    select inv.status, e.paid_through into v_state, v_new_paid_through
    from public.billing_subscription_invoices inv
    join public.billing_entitlements e on e.owner_id = inv.owner_id
    where inv.payment_intent_id = p_payment_intent_id;
    return query select v_new_paid_through, v_state, false, null::text;
    return;
  end if;

  -- Never trust an owner from the event itself; look one up strictly from
  -- the already-verified subscription invoice this payment_intent names.
  select * into v_invoice from public.billing_subscription_invoices
  where payment_intent_id = p_payment_intent_id and outcome = 'granted' for update;
  if not found then
    raise exception 'Reversal event % references unknown subscription invoice payment %', p_event_id, p_payment_intent_id;
  end if;

  select owner_id into v_locked_owner from public.billing_entitlements
  where owner_id = v_invoice.owner_id for update;
  if not found then
    raise exception 'No entitlement record for subscription invoice % owner', v_invoice.invoice_id;
  end if;

  if p_dispute_id is not null then
    insert into public.billing_subscription_invoice_reversal_disputes (dispute_id, invoice_id)
    values (p_dispute_id, v_invoice.invoice_id)
    on conflict (dispute_id) do nothing;
    select invoice_id into v_dispute_invoice_id
    from public.billing_subscription_invoice_reversal_disputes where dispute_id = p_dispute_id;
    if v_dispute_invoice_id <> v_invoice.invoice_id then
      raise exception 'Dispute % is already recorded under a different subscription invoice', p_dispute_id;
    end if;
  end if;

  insert into public.billing_subscription_invoice_reversal_events (event_id, payment_intent_id, invoice_id, kind, dispute_id, occurred_at, amount_total)
  values (p_event_id, p_payment_intent_id, v_invoice.invoice_id, p_kind, p_dispute_id, p_occurred_at, p_amount_total)
  on conflict (event_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select * into v_existing from public.billing_subscription_invoice_reversal_events where event_id = p_event_id;
    if not found or v_existing.payment_intent_id <> p_payment_intent_id or v_existing.kind <> p_kind
       or v_existing.dispute_id is distinct from p_dispute_id
       or v_existing.occurred_at <> p_occurred_at or v_existing.amount_total <> p_amount_total
    then
      raise exception 'Reversal event % already recorded with different details', p_event_id;
    end if;
  end if;

  select bool_or(amount_total = v_invoice.amount_paid) into v_voided_by_refund
  from public.billing_subscription_invoice_reversal_events
  where invoice_id = v_invoice.invoice_id and kind = 'refund';
  v_voided_by_refund := coalesce(v_voided_by_refund, false);

  select bool_or(has_valid_chargeback and not has_valid_reversal) into v_unresolved_dispute
  from (
    select
      bool_or(kind = 'chargeback' and amount_total = v_invoice.amount_paid) as has_valid_chargeback,
      bool_or(kind = 'chargeback_reversed' and amount_total = v_invoice.amount_paid) as has_valid_reversal
    from public.billing_subscription_invoice_reversal_events
    where invoice_id = v_invoice.invoice_id and kind in ('chargeback', 'chargeback_reversed')
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

  v_this_anomaly := null;
  if p_kind in ('refund', 'chargeback') and p_amount_total <> v_invoice.amount_paid then
    v_this_anomaly := format(
      'Partial %s of %s against a %s subscription invoice payment has no defined entitlement policy; left in its last unambiguous state',
      p_kind, p_amount_total, v_invoice.amount_paid
    );
  elsif p_kind = 'chargeback_reversed' then
    if p_amount_total <> v_invoice.amount_paid then
      v_this_anomaly := format(
        'chargeback_reversed amount %s for dispute %s does not match the original invoice payment amount %s; ignored',
        p_amount_total, p_dispute_id, v_invoice.amount_paid
      );
    else
      select bool_or(kind = 'chargeback' and amount_total = v_invoice.amount_paid) into v_has_valid_chargeback
      from public.billing_subscription_invoice_reversal_events
      where invoice_id = v_invoice.invoice_id and dispute_id = p_dispute_id;
      if not coalesce(v_has_valid_chargeback, false) then
        v_this_anomaly := format(
          'chargeback_reversed with no matching chargeback for dispute %s; ignored', p_dispute_id
        );
      end if;
    end if;
  end if;

  update public.billing_subscription_invoices set status = v_state where invoice_id = v_invoice.invoice_id;

  -- Never reflow any OTHER invoice's or payment's own recorded window. Uses
  -- each survivor's own independent period_end (never the combined running
  -- granted_paid_through snapshot — see this file's header) and excludes
  -- this or any other subscription invoice this owner has that is currently
  -- voided, exactly mirroring the one-time-pass status='active' filter.
  select greatest(
    (select max(pass_ended_at) from public.billing_payments
       where owner_id = v_invoice.owner_id and billing_payments.status = 'active'),
    (select max(period_end) from public.billing_subscription_invoices
       where owner_id = v_invoice.owner_id and outcome = 'granted' and billing_subscription_invoices.status = 'active')
  ) into v_new_paid_through;

  update public.billing_entitlements
  set paid_through = v_new_paid_through, updated_at = now()
  where owner_id = v_invoice.owner_id;

  return query select v_new_paid_through, v_state, true, v_this_anomaly;
end;
$$;

revoke execute on function public.billing_apply_subscription_invoice_reversal_event(text, text, text, text, timestamptz, bigint)
  from public, anon, authenticated;
grant execute on function public.billing_apply_subscription_invoice_reversal_event(text, text, text, text, timestamptz, bigint)
  to service_role;

-- ---------------------------------------------------------------------------
-- Redefinition (same signature — replaces the existing function body, does
-- not create a new overload) of billing_apply_reversal_event
-- (20260920030000_billing_reversals.sql): identical in every respect except
-- the subscription-invoice half of the paid_through recomputation now also
-- requires status = 'active', so an invoice this file's own RPC has voided
-- can no longer be resurrected by an unrelated one-time-pass reversal event.
-- See "Why billing_apply_reversal_event is redefined here" near the top of
-- this file.
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

  if p_kind = 'refund' then
    if p_dispute_id is not null then
      raise exception 'A refund event must not carry a dispute id';
    end if;
  elsif p_dispute_id is null or length(trim(p_dispute_id)) = 0 then
    raise exception 'A % event requires a non-blank dispute id', p_kind;
  end if;

  if not isfinite(p_occurred_at)
     or p_occurred_at < timestamptz '1970-01-01T00:00:00Z'
     or p_occurred_at > timestamptz '275760-09-13T00:00:00Z'
     or p_occurred_at > now() + interval '5 minutes'
  then
    raise exception 'Reversal event time is not a plausible timestamp';
  end if;

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

  select * into v_payment from public.billing_payments where payment_id = p_payment_id for update;
  if not found then
    raise exception 'Reversal event % references unknown payment %', p_event_id, p_payment_id;
  end if;

  select owner_id into v_locked_owner from public.billing_entitlements
  where owner_id = v_payment.owner_id for update;
  if not found then
    raise exception 'No entitlement record for payment % owner', p_payment_id;
  end if;

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
    select * into v_existing from public.billing_reversal_events where event_id = p_event_id;
    if not found or v_existing.payment_id <> p_payment_id or v_existing.kind <> p_kind
       or v_existing.dispute_id is distinct from p_dispute_id
       or v_existing.occurred_at <> p_occurred_at or v_existing.amount_total <> p_amount_total
    then
      raise exception 'Reversal event % already recorded with different details', p_event_id;
    end if;
  end if;

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

  -- Only line changed from the original 20260920030000_billing_reversals.sql
  -- definition: the subscription-invoice subquery now also requires
  -- status = 'active', so a voided invoice (this migration's own new
  -- capability) can no longer be resurrected here.
  select greatest(
    (select max(pass_ended_at) from public.billing_payments
       where owner_id = v_payment.owner_id and billing_payments.status = 'active'),
    (select max(period_end) from public.billing_subscription_invoices
       where owner_id = v_payment.owner_id and outcome = 'granted' and billing_subscription_invoices.status = 'active')
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
