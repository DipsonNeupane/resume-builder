# Optional recurring USD 19.99 / 30-day subscription — LOCAL foundation

Scope: a **local, pure policy module + durable storage/atomicity layer**
for the OPTIONAL recurring subscription described in `HANDOFF.md`/
`README.md`'s launch sequence step 6 ("Add the $19.99 30-day Pro Pass with
optional, explicitly enabled recurring payments only after entitlement,
webhook, refund, and support flows are verified"). The current recurring
Stripe Price ID is supplied through `STRIPE_RECURRING_PRICE_ID`; catalog
validation requires USD 19.99 every 30 days before checkout can open.

**No existing file was modified.** The one-time manual pass
(`server/billing/policy.ts`, `20260919210000_billing_ledger.sql`,
`server/billing/handlers.ts`, `server/billing/stripe.ts`) remains the
default purchase, completely untouched, and is not imported by anything
here. Files added this session:

- `server/billing/recurring.ts` — pure policy (no Stripe/DB calls).
- `tests/billing/recurring.test.ts` — 20 Node test cases.
- `supabase/migrations/20260920020000_recurring_billing.sql` — additive
  schema/RPCs (timestamp after the most recent existing migration,
  `20260920010000_checkout_attempt_throttle.sql`).
- `supabase/tests/recurring_billing.test.sql` — 88 pgTAP assertions.
- `docs/RECURRING_IMPLEMENTATION.md` (this file).

No Stripe/provider call, no database credential, no deployment, no
hosted-schema change, no charge, and no UI are part of this work. Public
accounts/payments remain disabled per `AGENTS.md`. **No handler was
touched or written** — `server/billing/handlers.ts` still contains only
the one-time `checkout`/`webhook` functions; a subscription checkout route
and a subscription-aware webhook handler are explicitly future work (see
"Remaining integration gaps" below), not silently implied by this
migration existing.

## Why a recurring invoice needs a DIFFERENT coordination rule than the one-time pass

The one-time pass (`manualPassWindow` in `server/billing/policy.ts`)
**stacks**: `startsAt = max(currentPaidThrough, verifiedAt)`,
`endsAt = startsAt + 30 days`. That's correct there because each purchase
is an independent, deliberately repeatable add-on the customer chose to
buy again — the task brief confirms "user may buy another while active or
expired."

A recurring invoice is not like that. Stripe decides the billing cadence
and amount on its own subscription schedule; this module must not ALSO add
30 days every time an invoice is paid, or a customer holding **any**
additional prepaid time (most concretely: a manual pass bought on top of
an active subscription) would have that renewal invoice silently grant
*extra*, unpaid-for time on top of what they already have — a real double
-grant, not a hypothetical one.

The chosen rule, implemented identically in both the pure TS layer
(`subscriptionInvoiceGrant`) and the SQL layer
(`billing_apply_subscription_invoice`):

```
new_paid_through = greatest(current_paid_through, invoice.period_end)
```

**Max, never addition.** This single rule closes three distinct problems
at once, and the pgTAP suite has a dedicated test for each:

1. **Manual-pass overlap (entitlement accounting only).** If a subscriber's `paid_through` already extends past this
   invoice's `period_end` (because they *also* bought a manual pass), the
   invoice is still recorded in the ledger for accounting, but
   `paid_through` does not move — the prepaid time is neither shortened nor
   double-counted. Test: `recurring_billing.test.sql` assertions 58-64
   ("the manual pass stacks a full 30 days onto the existing
   subscription-granted paid_through" through "the overlapping renewal
   invoice is still recorded in the ledger for accounting/audit").
2. **Out-of-order webhook delivery.** Stripe does not guarantee invoice
   webhooks arrive in chronological order. Applying a later cycle's
   invoice first, then an earlier cycle's invoice, must not move
   `paid_through` backward or grant the earlier cycle's time on top of the
   later one. Test: assertions 52-57.
3. **Idempotent redelivery.** The same invoice id applied twice is a
   provable no-op (`applied=false`, unchanged `paid_through`), checked
   against every immutable fact of the original row exactly like the
   one-time ledger's `billing_apply_verified_payment` already does for
   `event_id`/`payment_id`. Test: assertions 48-51.

`applied` in the RPC's `(paid_through, applied)` return shape means "this
call wrote a genuinely new invoice ledger row" — matching
`billing_apply_verified_payment`'s own convention exactly — **not**
"`paid_through` advanced." An out-of-order invoice is still a real,
distinct invoice worth recording (`applied=true`) even though it doesn't
move `paid_through` forward. Conflating those two meanings was an actual
mistake caught while writing the pgTAP suite (assertion 54 initially
asserted `applied=false` for a genuinely new but non-advancing invoice;
fixed to assert `applied=true`, matching the one-time ledger's existing
semantics, before this doc was written).

## A real bug found and fixed while building this, not just implemented blind

The first draft of `billing_apply_subscription_invoice` unconditionally set
`billing_subscriptions.current_period_end = p_period_end` on every
successful call — so an out-of-order (earlier-cycle) invoice arriving
*after* a later one would move the subscription's own tracked period end
**backward**, even though `paid_through` itself was correctly protected by
`greatest()`. A dedicated pgTAP regression (assertion 56, "the tracked
current_period_end also does not move backward for the out-of-order
invoice") caught this before it was fixed with the same
`greatest(coalesce(current_period_end, p_period_end), p_period_end)`
pattern used for `paid_through`.

## Installed Stripe SDK shape — checked, not assumed

`node_modules/stripe` is `22.6.2`. Its own `.d.ts` files were read before
writing any type in `recurring.ts`, because this API version differs from
older Stripe documentation/tutorials in two ways that would have produced
a plausible-looking but wrong integration if assumed from memory:

- **`Subscription` has NO top-level `current_period_end` /
  `current_period_start`** in this SDK version
  (`node_modules/stripe/cjs/resources/Subscriptions.d.ts`) — those moved to
  each subscription item. A future handler must not read
  `subscription.current_period_end`; it does not exist on the type.
- **`Invoice` DOES have top-level `period_start`/`period_end`**
  (`node_modules/stripe/cjs/resources/Invoices.d.ts`), which is exactly
  what this module grants against, and its subscription reference is
  nested at `invoice.parent.subscription_details.subscription`, not a
  top-level `invoice.subscription`.
- `Subscription.Status` is `'active' | 'canceled' | 'incomplete' |
  'incomplete_expired' | 'past_due' | 'paused' | 'trialing' | 'unpaid' |
  OtherString`; `Invoice.Status` is `'draft' | 'open' | 'paid' |
  'uncollectible' | 'void' | null`. `server/billing/recurring.ts`'s
  `SubscriptionStatus`/`InvoiceStatus` types mirror these exactly (minus
  the `OtherString` escape hatch — an unrecognized value fails closed via
  `isSubscriptionStatus`/the SQL `CHECK` constraint, it is never silently
  accepted as a known status).

No Stripe API call was made to arrive at this — it is purely reading the
already-installed package's own type declarations, which is what the task
asked for ("Read installed Stripe types if needed; no provider calls").

## `server/billing/recurring.ts` — pure policy

Mirrors the existing `policy.ts`/`reconciliation.ts` convention: no Stripe
call, no database access, no mutation of inputs, its own private
`timestamp()`/`nonBlank()` validators (deliberately not shared across
modules, matching how `policy.ts` and `reconciliation.ts` already each
keep their own copy).

| export | purpose |
|---|---|
| `RECURRING_AMOUNT` / `RECURRING_CURRENCY` | `1999` / `'usd'` — the $19.99 recurring price's fixed facts |
| `SubscriptionStatus`, `isSubscriptionStatus` | closed union mirroring the installed Stripe SDK, with a type guard that fails closed on anything else |
| `InvoiceStatus` | mirrors the installed Stripe SDK |
| `TrustedSubscription` | the server's own owner/price/live binding for one subscription id — established once, never client-derived |
| `VerifiedSubscriptionInvoice` | already-extracted, already-verified-against-Stripe-directly invoice facts |
| `assertVerifiedSubscriptionInvoice` | throws unless every fact (account, live, price, subscription id, currency, amount, quantity, status==='paid', ordered period) matches the trusted record and expected config — no client-supplied price/owner authority, by construction: `expected` must come from server config + the trusted record |
| `assertFailedSubscriptionInvoice` | same identity checks, for the failure path; explicitly rejects `status==='paid'` (a paid invoice must never be routed through the no-grant path) |
| `subscriptionInvoiceGrant(paidThrough, periodEnd)` | the `greatest()` coordination rule, returns `{ paidThrough, advanced }` |
| `failedInvoiceGrant(paidThrough)` | identity function — documents/tests that a failed invoice changes nothing |
| `cancellationPreservesEntitlement(paidThrough)` | identity function — documents/tests that cancellation changes nothing |
| `willRenew(status, cancelAtPeriodEnd)` | display-only helper, does not touch entitlement |

20 Node test cases in `tests/billing/recurring.test.ts` cover: acceptance
of a genuine invoice, rejection of every individual mismatched fact,
rejection when the *expected* authority itself is wrong (proving the
assertion can't be fooled by a caller passing bad "expected" values
either), out-of-order/reversed/implausibly-long periods, the failed-invoice
identity path, first-grant/no-op/exact-boundary/advance/out-of-order/
idempotent behavior of `subscriptionInvoiceGrant`, invalid timestamps
across every function, and the two identity functions.

## SQL layer — `20260920020000_recurring_billing.sql`

Two additive tables, both `REVOKE ALL` from `public/anon/authenticated/
service_role` with `service_role` regranted `SELECT` only (same pattern as
`billing_checkouts`/`billing_payments`); every mutation is a `SECURITY
DEFINER` function with `search_path=''`, `EXECUTE` revoked from
`public/anon/authenticated`, granted only to `service_role`.

**`billing_subscriptions`** — the trusted identity record (parallel to
`billing_checkouts`): `subscription_id` (PK), `owner_id`, `price_id`,
`live`, `status` (checked against the same 8-value enum as
`SubscriptionStatus`), `cancel_at_period_end`, `current_period_end`.
Identity (`owner_id`/`price_id`/`live`) can never be rebound once a
`subscription_id` is recorded — enforced by `billing_record_subscription`
raising on any mismatch, exactly like `billing_record_checkout` already
does for `session_id`.

**`billing_subscription_invoices`** — the verified ledger, one row per
processed invoice, `invoice_id` as the sole idempotency key (Stripe invoice
ids are stable and globally unique, unlike the one-time flow's
event-id/payment-id pair — there is exactly one invoice per billing cycle).
A `CHECK` constraint enforces that `outcome='granted'` rows always carry a
positive amount, an ordered period, and a `granted_paid_through`, while
`outcome='failed'` rows carry none of those — self-consistent by schema,
not just by RPC discipline.

RPCs:

- `billing_record_subscription(owner, subscription_id, price_id, live,
  status)` — establish/status-transition the trusted record; identity is
  immutable, status is not.
- `billing_lookup_subscription(subscription_id)` — read-only, for a future
  handler to bind an incoming invoice's owner before trusting anything else
  about it (parallel to `billing_lookup_checkout`).
- `billing_apply_subscription_invoice(...)` — the grant path. Validates
  every field non-null/non-blank, an ordered and plausible (≤366 day)
  period, a plausible `verified_at` (same epoch/future-skew bounds as
  `billing_apply_verified_payment`), matches the invoice against the
  trusted subscription record (owner/price/live — defense in depth after
  provider verification), applies `greatest()` under a per-owner row lock
  on the SAME `billing_entitlements` table the one-time pass writes to,
  and records the invoice. Idempotent by `invoice_id`; a conflicting reuse
  (same id, different facts) raises rather than silently merging.
- `billing_record_failed_subscription_invoice(...)` — audit-only,
  identity-checked, **contains no reference to `billing_entitlements`
  anywhere in its body** — a failed invoice cannot grant access by
  construction, not by caller discipline.
- `billing_update_subscription_status(...)` — cancellation / bare status
  transitions (`cancel_at_period_end` toggling, eventual
  `customer.subscription.deleted` → `status='canceled'`). **Also contains
  no reference to `billing_entitlements`** — cancellation preserves
  `paid_through` by construction. Access already paid for lapses naturally
  via `isPro(paidThrough, now)`, never by explicit retraction.

Composing with the existing `20260919210000_billing_ledger.sql` migration
across a migration-file boundary (writing into `billing_entitlements` from
a function defined in this later migration) is the same established
pattern `billing_bind_intent` already uses when it calls
`billing_record_checkout` from `20260919211000_checkout_intents.sql` — not
a new precedent introduced here.

## Test results (this session, local only)

- `npm run test:server` — **101/101 passed** (20 new + 81 pre-existing,
  none weakened).
- `npm run check:server` — passed, no errors.
- `npm run test:db` — **88 new pgTAP assertions passed** in
  `recurring_billing.test.sql`, plus all pre-existing suites unweakened
  (12 AI budget + 70 billing ledger + 9 checkout throttle + 9 checkout
  intents + 16 PDF allowance + 42 storage bounds + 24 RLS = 182, plus the
  3 historical-accounting assertions run directly by
  `scripts/test-database.mjs`). Zero `not ok` lines; exit code 0.

This is local PGlite/Postgres + a minimal Supabase `auth` schema, not the
real Supabase local stack (`supabase test db`) or hosted Auth/PostgREST.
It also does not exercise true multi-connection concurrency — the
`ON CONFLICT`/pre-check race-path inside `billing_apply_subscription_invoice`
shares its comparison logic byte-for-byte with the extensively-tested
pre-check path, but is not itself triggered by a real concurrent
connection in this single-connection harness (the same caveat every other
migration's own pgTAP suite in this repo already carries).

## What this explicitly does NOT implement

- **No handler/route.** `server/billing/handlers.ts` is unmodified. There
  is no `POST /api/billing/subscribe` (or similar) that creates a Stripe
  Checkout Session in `mode: 'subscription'`, and no webhook branch for
  `invoice.paid` / `invoice.payment_failed` /
  `customer.subscription.updated` / `customer.subscription.deleted`. Every
  RPC above is written to be called by such a handler, but nothing calls
  them yet outside the pgTAP suite.
- **No Stripe API call of any kind**, catalog validation, or session
  creation — `server/billing/stripe.ts` is unmodified and has no
  subscription-mode equivalent of `createPassCheckout`/`validateCatalog`.
- **No Stripe subscription schedule / plan-change support.** This
  migration and module assume exactly one recurring price purchased
  as-is; proration, plan upgrades/downgrades, trial periods, and Stripe
  Billing "schedules" are **not** designed for and **not** claimed to work
  — do not assume `billing_apply_subscription_invoice`'s period-length
  sanity bound (366 days) or `assertVerifiedSubscriptionInvoice`'s
  quantity/amount checks accommodate any of those.
- **No explicit opt-in UI.** No consent screen, no "subscribe" button, no
  account-page subscription status/cancel control. `src/` is untouched.
- **No read policy for `authenticated`** on `billing_subscriptions` /
  `billing_subscription_invoices` (deliberately — see the migration's own
  comment). A subscriber's actual entitlement is already visible today via
  the existing `billing_entitlements` RLS-scoped row; a "my subscription"
  detail view (next renewal date, cancel button) needs its own explicit
  read surface, not designed here.
- **Refund/dispute/chargeback handling for subscription invoices — now
  implemented**, by `20260920060000_recurring_invoice_reversals.sql` and
  `server/billing/handlers.ts`'s `applyReversalEvent`/`applyInvoiceEvent`.
  See `docs/BILLING_REVERSAL_DESIGN.md`'s "Recurring invoice reversals"
  section for the full design, policy, and verification. In short: a
  `charge.refunded`/dispute event's payment_intent is routed (via the new
  `billing_lookup_reversal_target` RPC) to either the existing one-time-pass
  RPC or a new, structurally identical `billing_apply_subscription_invoice_reversal_event`
  RPC, using a durable payment_intent → invoice → owner mapping established
  once, from the invoice's own retrieved, already-`paid` `InvoicePayment`
  (never from webhook metadata), when `invoice.paid` is first processed.
  This does NOT add any new coordination between the manual-pass and
  subscription purchase FLOWS themselves (preventing a customer from holding
  both remains the existing, separate conservative-rejection guard in
  `handlers.ts`'s `checkout()`/`subscribeCheckout()`), and does not change
  Stripe's own subscription billing schedule in any way.
- **No dunning/retry policy beyond "a failed invoice grants nothing."**
  Stripe's own Smart Retries and what to do after N consecutive failures
  (e.g. proactively canceling) are not designed.
- **No secrets, deployment, or hosted migration application.** Nothing was
  applied to any Supabase project; nothing was pushed anywhere.

## Remaining integration gaps, in rough priority order

1. **A subscription checkout route.** Needs its own durable-intent pattern
   (mirroring `billing_begin_intent`/`billing_bind_intent` in
   `20260919211000_checkout_intents.sql`) for `mode: 'subscription'`
   Stripe Checkout Sessions, plus a subscription-specific catalog
   validation (`price.type === 'recurring'`, correct interval) parallel to
   `validateCatalog` in `server/billing/stripe.ts`.
2. **A subscription-aware webhook branch.** Must call
   `billing_record_subscription` on the FIRST sight of a subscription
   (from `checkout.session.completed` with `mode: 'subscription'`, using
   the session's own already-authenticated owner — never event metadata),
   then route `invoice.paid` → `billing_apply_subscription_invoice`,
   `invoice.payment_failed`/`invoice.marked_uncollectible`/
   `invoice.voided` → `billing_record_failed_subscription_invoice`, and
   `customer.subscription.updated`/`customer.subscription.deleted` →
   `billing_update_subscription_status`. Each branch must retrieve the
   invoice/subscription directly from Stripe (not trust the webhook
   payload's own claims), exactly like `webhook()` in `handlers.ts`
   already does for the one-time pass via
   `stripe.checkout.sessions.retrieve(...)`.
3. **An explicit opt-in UI surface**, gated behind its own feature flag
   (this app's convention per `BillingPanel`/`VITE_BILLING_UI_ENABLED`),
   showing the recurring option as clearly non-default, plus a
   cancel/resume control that calls whatever server route wraps
   `billing_update_subscription_status`.
4. **Real Stripe test-mode lifecycle verification**: create a real test
   subscription, trigger real `invoice.paid`/`invoice.payment_failed`
   test-clock advances, confirm the actual webhook payload shape matches
   what this module's types assume (the installed-SDK type check above
   reduces this risk but does not replace exercising the real API).
5. **Hosted application** of `20260920020000_recurring_billing.sql` after
   the still-pending hosted migration-ledger reconciliation work described
   in `HANDOFF.md` (do not blindly `db push`).
6. ~~**Subscription-invoice refund/dispute policy**~~ — done, see
   `20260920060000_recurring_invoice_reversals.sql` and
   `docs/BILLING_REVERSAL_DESIGN.md`'s "Recurring invoice reversals" section.
7. **A user-facing "my subscription" read surface** (next renewal date,
   cancel-at-period-end status) — needs its own RLS policy or read RPC;
   deliberately not added in this migration.

None of the above is implemented, wired, or claimed to work end-to-end.
This session's deliverable is the local, tested coordination policy and
storage layer those integration points will call.

## Parent review correction

The greatest(current_paid_through, invoice.period_end) rule does NOT prevent Stripe charging for prepaid overlap. Provider subscription scheduling/credit coordination is still required before this can launch. Do not describe these local ledger tests as proving no duplicate customer charges. Parent independently ran server typecheck and 101/101 Node tests successfully September20; provider integration remains absent.

## September20 08:53 parent boundary review

Partial handlers exist but remain disabled and unaccepted for launch. Added explicit renewalOptIn:true checkout contract; invoice grants now use purchased line.period and reject multiple/paginated lines. Typecheck and128/128 local server tests passed. Pending-session mixed-mode races and subscription reversal mapping still unresolved; no hosted/provider acceptance claimed.

## September20 (follow-up) — recurring invoice refund/dispute reconciliation

Closed the gap named throughout this document and `HANDOFF.md`: subscription-invoice refunds/disputes had no handling at all (a `charge.refunded`/dispute event against a recurring invoice's own charge would re-retrieve correctly, then fail with "unknown payment" trying to look it up in `billing_payments`, since a subscription invoice was never recorded there). See `docs/BILLING_REVERSAL_DESIGN.md`'s "Recurring invoice reversals" section for the full design; summary here for this file's own integration-gap tracking.

New additive migration `20260920060000_recurring_invoice_reversals.sql` adds `payment_intent_id`/`status` columns to `billing_subscription_invoices`, a `billing_subscription_invoice_reversal_events`/`billing_subscription_invoice_reversal_disputes` ledger pair structurally identical to the one-time-pass reversal tables, and three RPCs: `billing_record_subscription_invoice_payment_intent` (establishes the durable payment_intent → invoice → owner mapping from the invoice's own retrieved `payments` expansion, never webhook metadata), `billing_lookup_reversal_target` (read-only dispatch: does a payment_intent belong to the one-time-pass or subscription-invoice domain), and `billing_apply_subscription_invoice_reversal_event` (the fold/apply RPC, mirroring `billing_apply_reversal_event`'s permanence/dispute-identity/no-reflow policy exactly). `billing_apply_reversal_event` itself is also redefined (same signature, in the new migration file, not editing the original) so its own paid_through recomputation excludes a now-possible voided subscription invoice.

`server/billing/recurring.ts`'s `VerifiedSubscriptionInvoice` gained a required `paymentIntentId` field, validated by `assertVerifiedSubscriptionInvoice`. `server/billing/handlers.ts`'s `applyInvoiceEvent` now expands `payments` on the retrieved invoice, requires exactly one non-paginated settled `payment_intent`-type payment, and binds it via the new RPC right after a paid invoice is granted. `applyReversalEvent` now calls `billing_lookup_reversal_target` before deciding which apply RPC to call, so a payment_intent belonging to neither domain still falls through to the existing "unknown payment" fail-closed/retry behavior unchanged.

**Verification, actually executed this session:** `npm run check:server` passed (zero errors). `npm run test:server` **157/157 passed** (grew from 128: new `recurring-handler.test.ts` cases for payment-intent binding/validation, `recurring.test.ts` cases for the new required field, and new `reversal-webhook.test.ts` cases for lookup-based routing to both RPCs and lookup-failure retry). `npm run test:db` **398/398 pgTAP assertions passed, 0 not ok** (352 pre-existing + 46 new in `supabase/tests/recurring_invoice_reversals.test.sql`, including two targeted regressions: owner H proves a voided subscription invoice's period no longer resurrects via `billing_apply_reversal_event`'s recomputation once a separate manual-pass refund triggers it; owner I proves a surviving invoice's own independent `period_end` is used on recompute, never that survivor's own `granted_paid_through` snapshot, which could already reflect a combined ceiling the just-voided invoice contributed).

**Not done / explicitly out of scope, same as the one-time-pass side:** partial refunds/disputes on a subscription invoice (anomaly only, no invented policy); a dispute id is not cross-checked for uniqueness between the one-time-pass and subscription-invoice domains (documented as an accepted, practically-impossible-collision scope limit in the migration's own header, since a Stripe dispute always references exactly one charge belonging to exactly one checkout flow); no coordination of whether a customer holding both purchase types is itself a supported product state; no hosted/live Stripe verification of the real `invoice.payments` expansion shape against this session's assumptions (reasoned from the installed SDK's own `.d.ts`, not exercised against a live invoice); `server/billing/reservation.ts` and its own recovery-correctness logic were not touched or reviewed this session. No frontend, provider-credential, or deployment change; public paid flags remain off.
