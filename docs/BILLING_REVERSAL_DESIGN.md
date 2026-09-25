# September20 (follow-up) — recurring invoice reversals

Closes the gap every prior entry in this document names as the standing exclusion: "this file does not reverse, void, or otherwise touch a single row of billing_subscriptions/billing_subscription_invoices — a subscription invoice refund/dispute is explicitly still out of scope." Before this session, a `charge.refunded`/dispute event whose underlying charge belonged to a recurring subscription invoice (not a one-time pass) would re-retrieve correctly, then fail — `billing_apply_reversal_event` looks a payment up strictly in `billing_payments`, where a subscription invoice's charge was never recorded, so the call threw "unknown payment" and the webhook returned a retryable 503 forever, with no defined outcome.

Scope: `server/billing/recurring.ts`, `server/billing/handlers.ts`, `tests/billing/*`, one new additive migration (`supabase/migrations/20260920060000_recurring_invoice_reversals.sql`), one new pgTAP file (`supabase/tests/recurring_invoice_reversals.test.sql`), and this document. No frontend, provider-credential, hosted, or deployment change. `server/billing/reservation.ts` and its own checkout-reservation recovery logic (the most recently reviewed and corrected part of this codebase, per `HANDOFF.md`'s "reservation recovery review" entry) were not touched.

**Durable, verified payment_intent → invoice → owner mapping — established from retrieved provider objects only.** A `charge.refunded`/dispute webhook event only ever carries a `payment_intent` id (via the re-retrieved Charge/Dispute, exactly like the existing one-time-pass path) — never an invoice id, and never anything this codebase should trust from event/browser metadata for *ownership*. The missing link is built once, durably, at the moment `applyInvoiceEvent` (`handlers.ts`) processes a `'paid'` invoice: the invoice is now retrieved with `expand:['payments']`, and its own settled `InvoicePayment` (required to be exactly one, non-paginated, `status==='paid'`, `payment.type==='payment_intent'` — the same "reject pagination/multiple items instead of trusting the first" discipline this handler already applies to invoice line items and subscription items elsewhere) supplies the `payment_intent` id. `assertVerifiedSubscriptionInvoice` (`recurring.ts`) now requires this `paymentIntentId` as part of the same already-verified-against-Stripe fact bundle every other field goes through. Immediately after `billing_apply_subscription_invoice` grants the invoice, the new `billing_record_subscription_invoice_payment_intent` RPC durably binds `payment_intent_id` onto that specific `billing_subscription_invoices` row — idempotent (rebinding the same pair is a no-op), rejecting a conflicting rebind, rejecting a non-`granted` invoice, and additionally protected by a real table-level `unique` constraint on `payment_intent_id` (a genuine concurrency guarantee, not just an application check: two different invoices racing to claim the same payment_intent cannot both win). Ownership is *never* passed as an argument anywhere in this chain — it is always looked up from the row this mapping already anchors, exactly like every other RPC in this file's lineage.

**Routing, not a merged RPC.** `applyReversalEvent` (`handlers.ts`) now calls a new read-only `billing_lookup_reversal_target(payment_intent_id)` RPC before deciding which apply RPC to call: it returns `'manual'` if the id is a `billing_payments.payment_id`, `'subscription'` if it is a `granted` `billing_subscription_invoices.payment_intent_id`, or `null` for neither. A `'subscription'` result routes to the new `billing_apply_subscription_invoice_reversal_event`; anything else (including `null`) falls through to the existing, completely unmodified-in-behavior `billing_apply_reversal_event` call path — so an id belonging to neither domain (e.g. a reversal delivered before its own purchase event finished recording) still fails closed with that function's existing "unknown payment" error and retryable 503, exactly as before this routing existed. The one-time-pass and subscription-invoice RPCs were kept separate rather than merged into one dispatching function, so neither one's already-reviewed behavior/error semantics for its own domain could be disturbed by the other's addition.

**Same policy, mirrored exactly, not reinvented.** `billing_apply_subscription_invoice_reversal_event` is structurally a byte-for-byte mirror of `billing_apply_reversal_event` — same idempotent-by-event-id ledger, same dispute-identity (Stripe's own `dispute.id`, never event-id/timestamp ordering) resolving a dispute as a SET-membership property of its own events, same full-refund permanence over a later dispute win, same partial-amount-is-an-anomaly-only non-decision, same atomic cross-invoice dispute-id-exclusivity claim table. Nothing here invents a new partial-refund policy for subscriptions that the one-time pass doesn't already deliberately decline to invent.

**Preserving unaffected paid windows — independent `period_end`, never the combined `granted_paid_through` snapshot.** `billing_subscription_invoices.granted_paid_through` is a *running snapshot* recorded at the moment an invoice was granted (`greatest(then-current paid_through, this invoice's own period_end)`) — it can already reflect a combined ceiling that a *different*, possibly later-voided invoice or manual pass contributed. Reusing it when recomputing after a reversal would risk exactly the "counterfactual reflow" bug this document's own history already fixed once for the one-time-pass side (see the "September20 07:39 independent acceptance" note below). Both `billing_apply_subscription_invoice_reversal_event` and the redefined `billing_apply_reversal_event` instead take `max(period_end)` over each owner's own *currently-active* (`outcome='granted' and status='active'`) subscription invoices — each survivor's own independent, never-reflowed period, exactly mirroring how the one-time-pass side already uses each survivor's own recorded `pass_ended_at` rather than reconstructing anything. `supabase/tests/recurring_invoice_reversals.test.sql`'s owner-I fixture proves this precisely: an out-of-order-arriving older-cycle invoice (`in_i2`, own period ending Jan15) gets `granted_paid_through` recorded as the *combined* Feb1 ceiling (set by a separate invoice, `in_i1`) at grant time; voiding `in_i1` afterward correctly falls back to `in_i2`'s own Jan15, not the Feb1 snapshot that would silently resurrect `in_i1`'s just-voided contribution.

**Why `billing_apply_reversal_event` needed to change at all.** Its own subscription-invoice subquery (added by the "Fix 2"/"independent acceptance" work below) summed every `outcome='granted'` invoice's `period_end` *unconditionally*, because no subscription invoice could ever be voided before this session. Now that one can be, that subquery needed the same `status='active'` filter added — otherwise voiding a subscription invoice via the new RPC, then separately reversing an unrelated one-time pass, would resurrect the voided invoice's time through the older function's still-unconditional sum. This is a `create or replace function` with an *identical signature* inside the new migration file — not an edit to `20260920030000_billing_reversals.sql` itself, and not a new overload. `supabase/tests/recurring_invoice_reversals.test.sql`'s owner-H fixture is the direct regression: subscription invoice grants Jun1, a manual pass stacks to Jul1, the subscription invoice is refunded (falls back correctly to the manual pass's own Jul1 — proving the new RPC alone doesn't over-void), and *then* the manual pass itself is refunded via `billing_apply_reversal_event` — asserting `paid_through` becomes `null`, not resurrected to Jun1. Every pre-existing row defaults `status='active'`, so this change is behaviorally invisible to every previously-passing case (confirmed: `billing_reversals.test.sql`'s own owner-D fixture, which exercises this exact function on data with no voided subscription invoices, is unchanged and still passes).

**Verification — actually executed this session, not hand-traced:**
- `npm run check:server` — passed, zero errors.
- `npm run test:server` — **157/157 passed** (grew from 120: new cases in `tests/billing/recurring-handler.test.ts` for payment-intent binding/validation on `invoice.paid`, `tests/billing/recurring.test.ts` for the new required `paymentIntentId` field, and `tests/billing/reversal-webhook.test.ts` for lookup-based routing to both RPCs, a lookup-RPC-failure retry case, and a neither-domain fallback case).
- `npm run test:db` — **398/398 pgTAP assertions passed, 0 not ok** (352 pre-existing + 46 new in `supabase/tests/recurring_invoice_reversals.test.sql`: access control for all three new RPCs/two new tables, the payment-intent mapping RPC's full validation surface including the real unique-constraint concurrency guarantee, `billing_lookup_reversal_target`'s three outcomes, full refund/chargeback/dispute-win/permanence/partial-anomaly/dispute-exclusivity parity with the one-time-pass suite, and the two targeted owner-H/owner-I regressions described above).

**Remaining gaps, unchanged or newly scoped by this session:**
- Partial refunds/disputes on a subscription invoice still have no invented policy (anomaly only) — same standing non-decision as the one-time pass.
- A dispute id's uniqueness is enforced *within* each domain (one-time-pass vs. subscription-invoice) but not *across* them by a shared table — documented in the new migration's own header as an accepted scope limit, since a real Stripe dispute always references exactly one charge belonging to exactly one of these two disjoint checkout flows, never both.
- Whether a customer holding both an active subscription and manual-pass prepaid time is itself a supported product state remains unmade (unchanged — see `checkout()`/`subscribeCheckout()`'s existing conservative mixed-mode rejection in `handlers.ts`).
- No hosted/live Stripe round trip exercised the actual `invoice.payments` expand shape this session assumed from the installed SDK's own `.d.ts`; a real test-mode subscription refund/dispute has not been triggered.
- Hosted application, real webhook delivery, and true multi-connection concurrency remain unverified — the same standing caveat every migration in this repository carries.

---

# September20 (follow-up) — dispute identity replaces event-id ordering; subscription entitlement protected from reversal recomputation

This session addressed the two remaining release blockers the "Parent review
September20 06:48 follow-up" section (near the bottom of this document)
flagged against the wiring above: (1) same-second/opposing dispute lifecycle
events relying on lexical event-id ordering, and (2) manual-pass reversal
recomputation being able to erase valid subscription-invoice entitlement.
Scope stayed within `server/billing`, `tests/billing`, this migration file
(`supabase/migrations/20260920030000_billing_reversals.sql` — still
unapplied anywhere, additive-only, safe to edit directly rather than layer a
new migration on top of it), `supabase/tests/billing_reversals.test.sql`,
and this doc. No frontend, provider, or hosted/deployment change.

**Fix 1 — dispute identity, not event-id/timestamp ordering, is now
authoritative.** `ReversalEvent` (`server/billing/reconciliation.ts`) and
`billing_reversal_events` (the SQL migration) both gained a required
`disputeId`/`dispute_id` fact: Stripe's own dispute object id, non-blank for
`chargeback`/`chargeback_reversed`, and required `null` for `refund` (a
refund is never itself a dispute). `server/billing/handlers.ts`'s
`applyReversalEvent` now passes the dispute's own re-retrieved `id` through
on every call.

A dispute is resolved as a SET-membership property of its own events —
`'won'` if and only if it has at least one full-amount `chargeback` fact AND
at least one full-amount `chargeback_reversed` fact for the SAME
`disputeId` — never by comparing which of the two events has an earlier
`occurredAt` or a lexicographically smaller event id. This is a strictly
stronger correctness property than "sort correctly": it doesn't just resolve
a timestamp *tie* correctly, it produces the correct final answer even when
the "won" fact is durably recorded in the ledger *before* the "created" fact
exists at all (a genuinely out-of-order delivery, not just a same-second
tie) — see `tests/billing/reconciliation.test.ts`'s two same-timestamp tests
and `supabase/tests/billing_reversals.test.sql`'s
`evt_c2_reversed_first`/`evt_c2_created_second` pair. A payment can
accumulate more than one dispute over its lifetime (grouped independently by
`disputeId`); it is restored to `active` only once EVERY dispute raised
against it has resolved `won` — proven by a dedicated "multiple disputes"
regression in both the TS and SQL suites, and by a regression proving that
resolving one dispute never restores a *different* dispute on the same
payment. Full-refund permanence (a full refund is permanent even across any
number of dispute outcomes) is unchanged and still independently regression-
tested. A dispute id is additionally guaranteed, at the SQL layer, to belong
to exactly one payment for its entire lifetime — enforced by a real primary-
key-backed claim table (`billing_reversal_disputes`), not just an
application-level check, so two different payments racing to claim the same
dispute id cannot both succeed even under true concurrency.

**Fix 2 — reversal recomputation can no longer erase subscription
entitlement.** `billing_apply_reversal_event`'s `paid_through`
recomputation previously read `max(pass_ended_at)` over the owner's active
`billing_payments` rows ONLY. An owner holding both a one-time pass (later
refunded/charged back) and a separate active subscription
(`billing_subscriptions`/`billing_subscription_invoices`,
`20260920020000_recurring_billing.sql`) would have their subscription-
granted access silently erased (dropped to whatever the one-time passes
alone summed to, possibly `null`) purely because a reversal event landed on
the UNRELATED one-time pass. The fix: `paid_through` is now
`greatest(max(pass_ended_at) over active one-time payments, max(
granted_paid_through) over 'granted' subscription invoices)` for that owner.
This is safe to combine with a plain `greatest()` because
`granted_paid_through` is itself already monotonically non-decreasing per
owner (`billing_apply_subscription_invoice` only ever moves it forward,
never touched by anything in this file) — it can only ever raise the floor,
never be the value this file wrongly lowers. Regression:
`supabase/tests/billing_reversals.test.sql`'s owner-D fixture (a
subscription invoice granting through Jun1, then a manual pass stacking on
top to Jul1, then refunding the manual pass) asserts `paid_through` falls
back to the subscription's own Jun1 grant, not `null`.

**This does NOT mean invoice application (or anything in this fix) prevents
overlapping provider charges or reconciles Stripe's own subscription billing
schedule.** That remains entirely Stripe's concern (Stripe decides
subscription billing cadence, proration, and duplicate-charge prevention on
its own side); this fix is purely about not letting one LOCAL ledger
source's recomputation clobber a different LOCAL ledger source's already
durably recorded grant. No new coordination between the manual-pass and
subscription purchase FLOWS themselves (e.g. preventing a customer from
holding both) was added or was in scope — see "Recurring/subscription
billing overlap" in the remaining-gaps list below, which remains open.

**Verification — actually executed this session, not hand-traced:**
- `npm run check:server` — **passed** (zero errors) after fixing two
  self-inflicted doc-comment syntax breaks (an errant `*/` mid-comment)
  introduced while editing `reconciliation.ts`'s header comments; both were
  caught by this exact command and fixed before proceeding.
- `npm run test:server` — **120/120 passed**. `tests/billing/
  reconciliation.test.ts` grew from 25 to 32 cases (7 new: disputeId
  validation, cross-payment dispute-id exclusivity, two same-timestamp/
  opposing-order convergence tests, multiple-independent-disputes voided/
  restored, and dispute isolation). `tests/billing/reversal-webhook.test.ts`
  grew from 9 to 10 cases (dispute id now asserted on every chargeback/
  chargeback_reversed call, plus a new "second dispute carries its own
  distinct id" case). No other existing suite changed or regressed.
- `npm run test:db` — **306/306 pgTAP assertions passed, 0 not-ok**
  (12 ai_budget + 70 billing_ledger + **36 billing_reversals** [was 24; +12
  new: disputeId required/forbidden validation ×3, cross-payment dispute-id
  exclusivity, same-timestamp lexically-adversarial convergence, out-of-
  order-delivery convergence ×2, multiple-disputes voided/restored ×2,
  subscription-entitlement-preserved fixture/regression ×3] + 9
  checkout_attempt_throttle + 9 checkout_intents + 16 pdf_allowance + 88
  recurring_billing + 42 resume_storage_bounds + 24 resumes_rls, plus the
  separate historical-accounting assertions printed before the per-file
  suites). Full command output was inspected directly (`grep -c "^not ok"`
  returned 0, `grep -c "^ok "` returned 306), not summarized from memory.

**Remaining gaps (unchanged from before this session, still open):**
- Partial refunds/disputes still have no invented policy (anomaly only).
- Recurring/subscription billing overlap: this session ONLY prevents a
  one-time-pass reversal from clobbering subscription-granted time. It does
  NOT add reversal handling for a subscription invoice itself (a
  subscription-invoice refund/dispute), and does NOT coordinate whether a
  customer holding both purchase types simultaneously is itself a supported
  or intended product state — that product decision remains unmade.
  Provider-side (Stripe) prevention of overlapping/duplicate charges is
  entirely out of this module's scope; nothing here claims to affect it.
- Hosted application, a real Stripe test-mode round trip, and true
  multi-connection concurrency (the new `billing_reversal_disputes` claim
  table's primary key is expected to correctly serialize a real concurrent
  race, but this was reasoned about, not load-tested) remain unverified —
  same standing caveat every migration in this repo carries.

---



This session addressed BOTH material design gaps the September20 03:15 UTC
independent review below flagged against the original prototype, then wired
the result into a durable, service-role-only SQL layer and the existing
Stripe webhook handler. It did **not** touch recurring/subscription billing
(`server/billing/recurring.ts`, `20260920020000_recurring_billing.sql`) —
that remains explicitly separate follow-up work; see "Remaining gaps"
below.

**Gap 1 fixed — no more provider-timestamp sort / arrival-order mismatch.**
`server/billing/reconciliation.ts`'s `recomputeEntitlement` no longer sorts
grants by `grantOrder` and rebuilds a stacking chain from scratch. It now
takes each grant's `passStartedAt`/`passEndedAt` as a **fixed historical
fact** — exactly what `billing_apply_verified_payment` already durably
recorded, once, in true serialized per-owner application order — and never
re-derives or reorders it. There is no longer any assumption that a
provider-supplied timestamp matches the ledger's own application order,
because the function no longer needs that order at all.

**Gap 2 fixed — no more counterfactual reflow that can shorten prepaid
time.** The recomputed `paidThrough` is simply the latest `passEndedAt`
among currently-active (non-voided) grants. Voiding or restoring one
payment changes ONLY that payment's own contribution to the `max`; every
other, unaffected payment keeps the exact window it was already committed
with. A concrete regression proves this: `tests/billing/reconciliation.test.ts`'s
`"refunding an earlier stacked grant never shortens a later, unrelated
grant already recorded on top of it"` and the SQL-level equivalent in
`supabase/tests/billing_reversals.test.sql` (owner A: pi_a1 Jan1–Jan31,
pi_a2 stacked Jan31–Mar2; refunding pi_a1 leaves `paid_through` at pi_a2's
own recorded Mar2, never reflowed down to "pi_a2's own purchase time + 30
days"). See `server/billing/reconciliation.ts`'s updated header comment on
`recomputeEntitlement` for the full mechanical explanation.

The opaque-event-id-ordering concern is narrowed, not eliminated by fiat:
`compareEvents`'s `(occurredAt, eventId)` tiebreak now only orders a
**single payment's own** events against each other (deciding that one
payment's final state) — it is never used to order grants or events
belonging to different payments, which is what the original review's
concern was actually about (a global replay order). A true same-millisecond
tie between two lifecycle events for the *same* payment is not expected
from Stripe (it timestamps dispute/refund events individually) but remains
a documented, narrow residual assumption — see "Remaining gaps" below.

**Wiring.** `supabase/migrations/20260920030000_billing_reversals.sql` adds
(additively — no existing migration file rewritten): a `status` column on
`billing_payments` (default `'active'`, since no reversal handling existed
before this file), the append-only `billing_reversal_events` table
(idempotent by Stripe event id, same pattern as `billing_payments`), and
`billing_apply_reversal_event` — a `SECURITY DEFINER`, `service_role`-only
RPC that refolds a payment's ENTIRE event history from scratch on every
call (never a one-shot transition off the current status), so a
Stripe webhook delivered out of chronological order still converges to the
chronologically-correct final state. `server/billing/handlers.ts`'s
`webhook()` now also routes `charge.refunded`, `charge.dispute.created`,
and `charge.dispute.closed` (only when `dispute.status === 'won'`) to this
RPC, via a new `applyReversalEvent()` — re-retrieving the Charge/Dispute
fresh from Stripe by id first (the same defense-in-depth
`applyCheckoutEvent` already applies to the Checkout Session), and deriving
`payment_id` from that trusted object, never from webhook metadata. Owner
identity is **never** passed to `billing_apply_reversal_event` at all — it
is looked up strictly from the existing, already-verified `billing_payments`
row for that `payment_id`, so a forged or mismatched owner claim in a
reversal event has no path to matter.

**Remaining gaps (see "Already-consumed time and partial refunds" and
"Verification" below for detail):**
- Partial refunds/disputes still have no invented policy — anomaly only,
  surfaced via the RPC's own `anomaly` output column, not persisted to a
  queryable table. A support-facing anomaly ledger is future work.
- Recurring/subscription billing overlap (an active manual pass alongside
  an active subscription, or a refund touching a subscription invoice) is
  explicitly untouched — flagged as separate follow-up, not this task.
- Hosted application, a real Stripe test-mode round trip, and true
  multi-connection concurrency are not part of this session (same standing
  caveat every other migration in this repo carries).
- This session could not execute `npm run check:server` / `npm run
  test:server` / `npm run test:db` itself (shell command execution required
  approval that did not resolve in this session); see "Verification" for
  exact status and what still needs an actual run before this is trusted.

---

# September20 03:15 UTC — independent review of the original prototype (superseded above)

Parent reproduced and fixed a state-machine defect: chargeback → full refund → dispute won previously restored a refunded grant. Full refund now takes permanent precedence. Added explicit ledger-count and identifier bounds missing from the original bounded-input claim. Regression failed before fix; server84/84 and check:server pass after correction (logs /tmp/resumestride-reversal-before.log and /tmp/resumestride-reversal-independent.log).

Remaining material design gaps: sorting grants by provider timestamp is not necessarily equivalent to the existing database ledger's serialized arrival-order stacking. Counterfactual reflow can shorten a later valid pass when an earlier pass is refunded after time has elapsed. The original claim that this is inherently safe is NOT accepted. Before wiring, preserve actual recorded grant intervals/order and resolve how unused valid prepaid time is protected. Equal-time dispute-event ordering by opaque event ID is also not provider lifecycle authority; require retrieved current dispute/refund facts. No live handler imports this module. Partial refunds and duplicate semantic provider events still need an explicit durable integration design.

Both gaps above are addressed by the September20 wiring session at the top of this document — this section is retained verbatim as the historical record of what was found and why the redesign was necessary.

# Reversed one-time purchase reconciliation — design

Scope: what a customer's one-time-pass entitlement
(`billing_entitlements.paid_through` / `server/billing/policy.ts`'s
`isPro(paidThrough, now)`) becomes after a full refund, a chargeback, or a
chargeback later reversed by the provider (a won dispute), and the durable
plumbing that applies that policy from real Stripe webhook events. Files:

- `server/billing/reconciliation.ts` — the pure policy function and its
  types (kept for independent testability and as the one place the fold
  algorithm's rationale is documented in prose; not itself called by any
  handler — see "Why the pure function isn't imported by the RPC" below).
- `tests/billing/reconciliation.test.ts` — Node test coverage for the pure
  function.
- `tests/billing/reversal-webhook.test.ts` — Node test coverage for
  `webhook()`'s new event routing/re-retrieval/ownership logic, mocking
  Stripe and the database (does not exercise the real RPC/SQL).
- `supabase/migrations/20260920030000_billing_reversals.sql` — the durable,
  service-role-only SQL layer that encodes the SAME policy and is the one
  actually wired into production: `billing_payments.status`, the
  `billing_reversal_events` ledger, and the `billing_apply_reversal_event`
  RPC.
- `supabase/tests/billing_reversals.test.sql` — pgTAP coverage for that RPC.
- `server/billing/handlers.ts`'s `webhook()` — routes
  `charge.refunded`/`charge.dispute.created`/`charge.dispute.closed` Stripe
  events to `billing_apply_reversal_event`, via the new `applyReversalEvent`
  helper.
- This document.

No `src/`, no frontend, and no `server/billing/recurring.ts`/
`20260920020000_recurring_billing.sql` (recurring/subscription billing) was
touched. No live Stripe credential, hosted Supabase apply, real webhook
delivery, or deployment is part of this work — see "Verification" below for
exactly what was and wasn't run this session.

## Why the pure function isn't imported by the RPC

SQL cannot call TypeScript, so `billing_apply_reversal_event` necessarily
re-implements the same fold algorithm in PL/pgSQL rather than importing
`server/billing/reconciliation.ts` directly. The two are kept deliberately
parallel — same states, same transition rules, same partial-amount
anomaly behavior — and this document/the two files' own header comments
are the mechanism keeping them in sync; there is no compiler enforcing
that today. If the policy ever changes, both files need the matching edit,
and both test suites need the matching new case.

## The problem with "subtract 30 days from paid_through"

The existing manual-pass model (`PASS_MS`, `manualPassWindow` in
`server/billing/policy.ts`) stacks: a new payment's window starts at
`max(current paid_through, verified_at)`. `paid_through` is a single scalar
— it does not remember *which* payments produced it, in what order, or
whether any later payment already consumed part of an earlier one's time.
Once a payment is reversed, naively recomputing `paid_through -= 30 days`
is wrong in every one of these cases:

- **Multiple stacked passes.** If pass A (30 days) and pass B (30 days)
  both stacked, `paid_through` is 60 days out. Refunding A and subtracting
  30 days leaves 30 days — but that 30 days still includes A's shadow: B
  was originally computed as starting *after* A's end, and should instead
  start at its own purchase time once A is gone.
- **An earlier (not the most recent) pass reversed.** The naive
  subtraction has no way to distinguish "the most recent purchase was
  refunded" from "an older purchase in the middle of the stack was
  refunded"; the correct new `paid_through` depends on every surviving
  grant's own time, not just how many were reversed.
- **Gaps / expiry.** If a customer's pass fully expired before their next
  purchase, that next purchase's window starts fresh, not from the old
  (expired) end. A later refund of some *other* payment must not
  accidentally splice these apart or together.
- **Duplicate or out-of-order event delivery.** Providers redeliver
  webhooks and do not guarantee delivery order matches chronological
  payment order. A recomputation keyed off "the order events happened to
  arrive in" can produce a different, delivery-order-dependent result for
  the exact same set of real-world facts.
- **A chargeback later reversed (dispute won, funds restored).** The
  provider's own lifecycle for a chargeback is not always terminal; a
  reconciliation policy that treats "chargeback" as a one-way, permanent
  void cannot correctly restore the customer's entitlement once the dispute
  resolves in the merchant's favor.

## The chosen policy: fixed recorded windows, never reflowed

`recomputeEntitlement(grants, events)` / `billing_apply_reversal_event`
never rebuild a stacking chain and never move a survivor's own window. Each
lives from only:

- **`PurchaseGrant`** — one immutable fact per originally verified payment:
  `paymentId` (the same stable id `billing_payments.payment_id` already
  enforces uniqueness on), `passStartedAt`/`passEndedAt` (the **exact
  window `billing_apply_verified_payment` already durably recorded for
  this specific payment**, once, in true serialized per-owner application
  order — never recomputed, reordered, or re-derived by this function),
  and `amountTotal` (the original charge amount, needed only to recognize
  a *full* reversal of that same payment). The SQL layer needs no
  equivalent grant type at all — it reads `passStartedAt`/`passEndedAt`
  straight off the `billing_payments` row it already locked.
- **`ReversalEvent`** — one immutable fact per reversal-lifecycle event:
  `eventId` (the provider's own event id, for exact deduplication —
  mirroring `billing_payments`'s `unique(event_id)`), `paymentId`,
  `kind` (`'refund' | 'chargeback' | 'chargeback_reversed'`), `disputeId`
  (Stripe's own dispute object id — required non-blank for
  `chargeback`/`chargeback_reversed`, required `null` for `refund`; see the
  September20 follow-up section at the top of this document — this field did
  not exist in the version of this type this section originally described),
  `occurredAt`, and `amountTotal` (the amount reversed or restored).

The algorithm:

1. **Validate and canonicalize.** Every id is required non-blank; every
   timestamp/amount is bounded (see `timestamp`/`positiveAmount` in the
   module — the same fail-closed domain `server/billing/policy.ts`'s own
   `timestamp()` uses); a grant's `passEndedAt` must exceed its
   `passStartedAt`. An event whose `paymentId` names a grant not present
   in the supplied ledger is rejected outright — this function never
   guesses at a payment it wasn't told about.
2. **Deduplicate.** A grant or event id that repeats with **identical**
   fields is a harmless no-op (the same ledger row read twice, or the same
   webhook delivered twice). A repeat with **different** fields is treated
   as a data-integrity violation and throws — silently picking one of two
   disagreeing "facts" about the same immutable id would hide a real bug
   or a forged event, so this function refuses rather than guesses.
3. **Resolve each payment's final state independently, as a SET property of
   its own events — not a sequential fold in any order.** (As of the
   September20 follow-up section at the top of this document — an earlier
   version of this step folded events in ascending `(occurredAt, eventId)`
   order, which is no longer true; see that section for exactly why.) A
   full-amount `refund` permanently voids the payment regardless of any
   dispute. Every `chargeback`/`chargeback_reversed` event is grouped by its
   own `disputeId`; each such dispute is `'won'` if and only if it has AT
   LEAST ONE full-amount `chargeback` fact AND AT LEAST ONE full-amount
   `chargeback_reversed` fact for that same `disputeId` — a property of the
   complete set, identical regardless of which of the two facts this
   function (or the SQL ledger) happened to receive first, and regardless of
   whether they share an identical `occurredAt`. The payment is voided by
   chargeback if ANY of its disputes is not won; it is only restored to
   `active` once EVERY dispute raised against it has resolved `won` (and it
   was never separately, permanently voided by a full refund). Anything else
   well-formed but semantically nonsensical (a restore with no matching
   chargeback for that specific dispute id, a restore for the wrong amount,
   a partial-amount refund/chargeback — see below) is **not** applied; the
   payment is left in its last unambiguous state and the event is reported
   in the result's `anomalies` array (`anomaly` output column in SQL) for a
   human or a product decision, instead of the function silently choosing a
   consumer-destructive or consumer-favorable interpretation nobody
   specified. Because every payment's status is refolded from the SET of its
   own recorded events on every call, an event that arrives chronologically
   "late" (or even one recorded before the fact it logically depends on)
   still lands correctly once every relevant fact is on file — this is what
   makes the result correct under real, guaranteed-at-least-once,
   not-necessarily-ordered Stripe webhook delivery, without ever trusting an
   event-id or timestamp comparison to decide a dispute's own outcome.
4. **Take the latest recorded end among survivors, unchanged.**
   `paidThrough` is `max(passEndedAt)` over every grant that did NOT end up
   voided in step 3 — using each survivor's own already-recorded
   `passEndedAt` exactly as committed, never recomputing it. A voided
   grant simply drops out of that `max`; a restored grant (a won dispute)
   simply rejoins it. No other survivor's window is ever touched. This is
   the direct fix for the design defect an earlier version of this
   function had: rebuilding the whole chain by re-sorting grants and
   re-stacking each survivor at `max(previous survivor's end, its own
   grantOrder)` could move a later, completely unrelated grant's start
   time earlier once an earlier grant was voided — retroactively
   shortening prepaid time a customer already validly held. Because a
   survivor's own recorded end is, by construction, already at least as
   large as every earlier grant it was stacked on top of at the time it
   was applied, taking a plain `max` over survivors is always correct
   without re-deriving anything.
5. Return `{ paidThrough, voidedPaymentIds, anomalies }` (or, in SQL,
   `(paid_through, status, applied, anomaly)` for the one payment this
   call concerned). `paidThrough` is `null` when no grant survives —
   directly comparable with `isPro(paidThrough, now)`.

   **This pure function only knows about one-time-pass `PurchaseGrant`s —
   it has no concept of a subscription invoice at all.** The SQL RPC
   (`billing_apply_reversal_event`) that actually applies this to
   `billing_entitlements.paid_through` additionally takes the `greatest()`
   of this `max(passEndedAt)` and the owner's own highest subscription-
   granted `paid_through` (`billing_subscription_invoices.
   granted_paid_through`) — see the September20 follow-up section at the
   top of this document ("Fix 2") for why that composition is required and
   what it protects against.

**Determinism / permutation invariance.** The pure function's outer loop
does not depend on input array order at all (grant/event dictionaries are
keyed by id and the final `max` is order-independent); `voidedPaymentIds`
is explicitly sorted before returning so equal inputs in any order produce
an identical result. `tests/billing/reconciliation.test.ts` proves this
directly with several shuffled permutations of a multi-grant, multi-event
ledger. The SQL RPC achieves the equivalent property by refolding a
payment's full event history (ordered by `(occurred_at, event_id)`, not by
insertion/call order) on every single call — see
`supabase/tests/billing_reversals.test.sql`'s regression that delivers a
refund, a chargeback, and a dispute-win deliberately out of chronological
call order and asserts the final state still matches true chronological
order.

## Already-consumed time and partial refunds — explicitly not invented

**Already-consumed time.** This entitlement model is a single
forward-looking expiry timestamp, not a metered ledger of days the
customer has or hasn't "used" yet. Recomputing `paidThrough` is therefore
inherently safe with respect to the past: if the counterfactual chain ends
before "now", the customer simply reads as expired the moment this result
is applied — indistinguishable from any ordinary expiry — and nothing
about days that already elapsed while the (now-voided) pass was active is
rewritten, logged, or clawed back retroactively. This function does not
implement, and this design does not propose, any separate "credit back
already-used days" or "charge the customer for time already consumed"
policy; those require an actual product/legal decision this repository has
not made (per `AGENTS.md`, this module must not invent one), and would need
their own explicit fact type (a record of exactly when access was actually
exercised, which nothing in this codebase currently captures) if ever
built.

**Partial refunds and partial disputes.** `assertManualPayment` (`server/
billing/policy.ts`) currently only ever accepts one fixed-price purchase
(`amountTotal === 1999`), so there is no existing precedent anywhere in
this codebase for what a partial-amount refund should mean in terms of
time: proportional days, no time change at all, and refund-as-pure-goodwill
-gesture are all plausible real-world policies, and picking one here would
be inventing consumer-facing (and possibly legally-relevant) policy this
task explicitly says not to invent. `recomputeEntitlement` therefore
**never** partially adjusts a grant's duration. A reversal event whose
`amountTotal` does not exactly equal the original grant's `amountTotal` is
left unapplied (the payment's prior state is unchanged) and is surfaced in
the `anomalies` array with a specific reason, so a human/product decision
can be made deliberately later — rather than this function ever silently
choosing full-void, no-op, or proportional-reduction on their behalf.

## What is now wired, and what still isn't

**Authenticated, signed provider retrieval — done.** `webhook()` already
verifies the Stripe signature (`verifyEvent`) before any event is acted on.
`applyReversalEvent` additionally re-retrieves the Charge/Dispute fresh
from Stripe by id (`stripe.charges.retrieve`/`stripe.disputes.retrieve`)
rather than trusting the webhook payload's own embedded object — the same
defense-in-depth `applyCheckoutEvent` already applies to the Checkout
Session. `payment_id` is taken from that retrieved object, and the owner is
never taken from the event at all (see "Ownership" below).

**Durable, transactional persistence — done.** `billing_apply_reversal_event`
is `SECURITY DEFINER`, idempotent by `event_id` (own unique constraint on
`billing_reversal_events`, same conflicting-reuse-vs-exact-retry check
`billing_apply_verified_payment` already established), and takes a
per-owner row lock (`billing_entitlements ... for update`) plus a
per-payment row lock (`billing_payments ... for update`) before refolding
and writing — serializing a concurrent new purchase against a concurrent
reversal for the same owner, and a concurrent duplicate reversal delivery
for the same payment, exactly like `billing_apply_verified_payment`'s own
per-owner lock already does for the purchase side.

**Ownership — never trusted from the event.** `billing_apply_reversal_event`
takes no owner argument. It looks the owner up strictly via the existing
`billing_payments` row for the given `payment_id` — a row that only exists
because `billing_apply_verified_payment` already verified it once, against
a trusted `billing_checkouts` record, before ever writing it. A
refund/dispute event can prove "this payment was reversed"; it can never
retarget whose account that means.

**What still isn't done — see "Remaining gaps" at the top of this
document** for the full list (partial-refund policy, recurring-billing
interaction, hosted/live verification, true concurrency, and this
session's own inability to execute the test suites — see Verification
below).

## Verification

**This session could not run `npm run check:server` / `npm run
test:server` / `npm run test:db` itself** — every shell command invoking
`npm`, a `node_modules/.bin` binary, or a file outside the repository
required interactive approval that did not resolve during this session.
No test numbers in this section are this session's own execution; do not
treat this reconciliation as trusted until one of the following has
actually happened and this section is updated with the real, observed
counts:

- `npm run check:server` — expected to pass; reviewed by hand for type
  errors (the new `reconciliation.ts` shape change, the new
  `handlers.ts` helper functions and their control-flow-derived
  `let`-variable assignment) but not compiler-verified this session.
- `npm run test:server` — `tests/billing/reconciliation.test.ts` was
  rewritten in full for the new `PurchaseGrant` shape and the no-reflow
  policy (25 cases, replacing the prior 21); the new
  `tests/billing/reversal-webhook.test.ts` adds 9 more, mocking Stripe and
  the database to check event routing/re-retrieval/ownership only (not the
  real SQL). Every existing suite (`policy.test.ts`, `stripe.test.ts`,
  `recurring.test.ts`, `tests/server/*.test.ts`) was left untouched and
  should be unaffected, since `handlers.ts`'s existing checkout/webhook
  exports and behavior for `checkout.session.*` events are unchanged (only
  refactored into a helper function, `applyCheckoutEvent`, with identical
  logic) and no other module imports `reconciliation.ts`'s exports.
- `npm run test:db` — `supabase/tests/billing_reversals.test.sql` (24
  pgTAP assertions) was hand-traced against the new
  `20260920030000_billing_reversals.sql` migration's logic (each expected
  value in the file's comments/`results_eq` calls was independently
  computed, not copied from a run) but not executed against PGlite this
  session. Every other existing `supabase/tests/*.test.sql` file and
  migration is untouched.

**Whoever picks this up next must run all three before trusting this
work**, and update this section with the actual pass/fail counts — per
this repository's own standing convention (see `HANDOFF.md`/`docs/
SECURITY_REVIEW.md`), a change is not "verified" until it has actually been
executed, not merely reasoned about.

## Parent review September20 06:48 follow-up

Fixed a test TypeScript call signature, ambiguous SQL status reference, and mutable refund retry facts (use signed event amount after validating it against fetched charge total). Added regression for additional refunds between deliveries. Server typecheck passed and 113/113 Node tests passed. Initial pgTAP run found contradictory expected paid-through after sole payment refund; corrected expected value to null, matching the subsequent test and intended policy. Database rerun passed: 294/294 pgTAP assertions, exit0.

Still blocking release: same-second dispute lifecycle events rely on lexical event-ID order, which cannot establish lifecycle truth; require dispute identity and terminal-state precedence. Reversal recomputation also ignores recurring invoice grants and can erase independently paid subscription access; coordinate sources before enabling combined billing. No hosted migration/deployment was performed.

**Both blockers above are addressed by the September20 (follow-up) section
at the top of this document** — dispute identity (`disputeId`) now replaces
event-id/timestamp ordering as the authority for a dispute's own terminal
state, and `billing_apply_reversal_event`'s `paid_through` recomputation now
composes with `billing_subscription_invoices.granted_paid_through` so it can
no longer erase subscription-granted entitlement. `npm run check:server`,
`npm run test:server` (120/120), and `npm run test:db` (306/306, 0 not-ok)
were all actually executed in that session, not hand-traced.

## September20 07:39 independent acceptance

Dispute identity/set-based outcome fixes reviewed; server typecheck and120/120 Node tests passed. Subscription preservation initially used combined granted_paid_through and retained refunded manual time. Parent regression reproduced that error, fixed to independent invoice period_end. Final306/306 pgTAP passed. Still local only; no hosted/Stripe acceptance implied.
