# Parent review clarification

Reducing three provider calls to one is an optimization, not a fix for unbounded retry traffic. A durable throttle covering every checkout attempt is being implemented separately. Do not mark this availability gap closed based on the change below.

# One-time payment webhook/checkout integration — independent audit

Scope: an independent, bounded audit of the one-time ($19.99, non-renewing
30-day manual pass) checkout/webhook integration for concrete, exploitable
correctness gaps — `server/billing/handlers.ts` (`checkout`, `webhook`),
`server/billing/stripe.ts`, `server/billing/policy.ts`, the durable ledger
migrations (`supabase/migrations/20260919210000_billing_ledger.sql`,
`supabase/migrations/20260919211000_checkout_intents.sql`, read but **not
modified**, per task), and their existing tests
(`tests/server/checkout.test.ts`, `tests/billing/*.test.ts`,
`supabase/tests/billing_ledger.test.sql`,
`supabase/tests/checkout_intents.test.sql`, read but not modified). No
network/provider calls, secrets access, deploys, hosted-state changes, or
real charges were made. No recurring/subscription logic was implemented.
This is a **local, mocked-integration-boundary review**, not hosted/sandbox
proof — see `npm run test:server` below for what was actually exercised.

## Method

Read every line of the checkout and webhook code paths and the SQL RPCs
they call (`billing_begin_intent`, `billing_bind_intent`,
`billing_lookup_checkout`, `billing_record_checkout`,
`billing_apply_verified_payment`), then tried to construct a concrete
attack/mistake scenario for each of: amount/currency/quantity tampering,
price substitution, cross-account/owner confusion, webhook replay,
concurrent double-submit, event/session metadata spoofing, mode confusion
(Connect/live-test), stale or forged checkout sessions, and idempotency-key
collision. Cross-checked every JS-layer check (`policy.ts`'s
`assertManualPayment`, the reconciliation block in `webhook()`) against the
independent SQL-layer check in `billing_apply_verified_payment` to see if
either layer alone could be bypassed.

## Confirmed gap (partially mitigated; rate limit still required)

**Checkout's per-hour creation rate limit was bypassable via retry, letting
one authenticated account force unbounded Stripe API calls.**

`billing_begin_intent` (`supabase/migrations/20260919211000_checkout_intents.sql`)
enforces "at most 3 new checkout intents per owner per hour" — but only on
the branch where a **new** row is inserted (`not found`). Once an intent
row exists for a given `requestId` — bound to a session or not — calling
`checkout()` again with that same id (or any of the caller's own past
`requestId`s within the 23-hour window) hits the `found` branch, which does
**not** re-check the rate limit, yet `server/billing/handlers.ts`'s
`checkout()` unconditionally still ran, on every single call:

1. `validateCatalog(stripe, config)` — 2 Stripe API calls
   (`accounts.retrieve` + `prices.retrieve`)
2. `stripe.checkout.sessions.retrieve(...)` or `createPassCheckout(...)` — 1
   more Stripe API call

So a single authenticated account could loop `POST /api/checkout` with an
already-created `requestId` and generate unbounded Stripe API traffic under
this app's own shared secret key, with no server-side throttle at all. That
matters beyond wasted requests: Stripe enforces per-account API rate
limits, so this is a real resource-exhaustion/cost-amplification vector —
one account hammering this endpoint could push the shared key into Stripe's
rate limiting and degrade or break checkout for every other user. It also
directly defeats the purpose `billing_begin_intent`'s own limit was written
for.

This is **not** an entitlement-bypass or payment-amount/ownership bug — no
path was found where it lets anyone acquire a pass without a real,
`assertManualPayment`-verified $19.99 payment tied to their own
authenticated `owner_id`. It is an availability/cost gap in the checkout
endpoint itself.

**Partial mitigation** (`server/billing/handlers.ts`, no migration changes): `validateCatalog`
now only runs when actually minting a **new** Stripe Checkout Session. An
already-bound session's price was already validated and is fixed
immutably on Stripe's side at creation time, so re-validating "is the
current catalog still correct" on every reuse serves no correctness purpose
— it only existed because the call sat unconditionally before the
new-vs-reuse branch. This removes 2 of the 3 Stripe calls from the
reuse path. It does not add a new rate limit (that stays a SQL/migration
concern, explicitly out of scope for this task); it removes the specific
unnecessary amplification this task's scope allows fixing.

Regression test added: `tests/server/checkout.test.ts` →
`'reusing an already-bound checkout skips catalog re-validation; a new one
still validates'`. Asserts, with two independent mock dependency sets, that
(a) reusing an intent already bound to a session calls `validateCatalog`
zero times while still returning the existing session's URL, and (b)
creating a brand-new session still calls `validateCatalog` exactly once
before calling Stripe — so a regression that reintroduces the unconditional
call, or one that accidentally skips catalog validation for genuinely new
sessions, both fail this test.

## Checked and confirmed NOT a bug (no change made)

- **Amount/currency/quantity/price tampering**: `webhook()`'s reconciliation
  block re-fetches the session fresh from Stripe by id (never trusts the
  event body beyond the id) and independently checks the `PaymentIntent`'s
  `amount_received`/`currency`/`status`, the line item's `price.id`/
  `quantity`, and the session's `amount_total`/`currency`/`mode`/
  `payment_status`/`livemode` via `assertManualPayment` — all against
  literal constants (`1999`, `usd`, `payment`, `paid`, quantity `1`) or the
  server's own `config`, never against client- or webhook-metadata-supplied
  values. `billing_apply_verified_payment` repeats the
  owner/price/live/amount/currency check independently against the
  *trusted checkout row*, not just the app-layer constants, so a bypass
  would need to defeat both layers simultaneously.
- **Owner/beneficiary spoofing**: `record.owner_id` (the entitlement
  beneficiary) always comes from `billing_lookup_checkout`, a row written
  by the *authenticated* `checkout()` call before Stripe redirect — never
  from `event.data.object.metadata` or the success-URL query string. The
  existing test `signed payment uses provider facts and trusted owner,
  never event or session metadata` (`tests/server/checkout.test.ts`)
  already covers a forged `metadata.owner_id: 'attacker'` payload.
- **Cross-environment/Connect confusion**: `verifyEvent` rejects any event
  where `event.livemode !== config.live` or `event.account` is present
  (a forwarded Connect-account event) before anything else runs.
- **Webhook replay / duplicate delivery**: three independent unique
  constraints in `billing_payments` (`event_id`, `payment_id`,
  `checkout_session_id`), each idempotent for an exact-match resend and
  each raising (not silently absorbing) a conflicting reuse under a
  different owner/session/price/amount/currency — already covered by
  `supabase/tests/billing_ledger.test.sql`.
- **Concurrent double-submit** (double-click "Buy"): `billing_begin_intent`
  takes a per-owner advisory transaction lock before its own
  insert-or-return, so concurrent calls with the same `requestId` observe a
  consistent row; both converge on the same Stripe session via the shared
  Stripe idempotency key (`pass:${owner}:${requestId}`), and
  `billing_bind_intent`'s "already bound to a *different* session" check
  only fires on an actual mismatch.
- **Stale/expired/already-completed session reuse**: a Stripe Checkout
  Session's `url` becomes `null` once completed or expired; `checkout()`
  already treats a missing/wrong-origin `url` as "no longer open" (409),
  independent of this session's fix.
- **Price-catalog change mid-flight**: `billing_begin_intent`'s
  found-branch mismatch check (`price_id`/`live`/`owner_id`) means a
  `requestId` created under an old `STRIPE_PASS_PRICE_ID` cannot be
  silently reused once the configured price changes — it raises instead.
- **Raw webhook body handling**: the exact raw bytes (not a re-serialized
  JSON string) are passed to `stripe.webhooks.constructEvent`, and
  `boundedBody` enforces the real byte count regardless of a spoofed
  `Content-Length` header — both already covered by existing tests.
- **Error-path information leakage**: `safeError` returns only
  `HttpError`'s own message for expected rejections and a fixed generic
  503 for everything else (including the reconciliation/persistence
  failures in `webhook()`), so no Stripe id, internal error text, or stack
  trace reaches the response body — already covered by
  `unexpected provider details and secrets never reach client errors`.

## Remaining, already-documented, out-of-scope gaps (unchanged by this task)

Per `docs/BILLING_LEDGER_REVIEW.md` and `HANDOFF.md`, still open and
explicitly not touched here (recurring billing and migrations were out of
scope for this task):

- No refund/dispute/chargeback handling — `paid_through` does not reflect a
  later-reversed payment.
- No `checkout.session.expired` handling / cleanup of abandoned
  `billing_checkouts` rows (harmless but unbounded retention).
- No admin/support UI for payment history (data is queryable by
  `service_role` only).
- Not applied to any hosted Supabase project; no real Stripe
  sandbox/live end-to-end delivery has been exercised.
- The intent-creation rate limit itself (3/hour) still lives entirely in
  the migration and was not changed — this task only removed the
  unnecessary Stripe-call amplification on top of it, per the "no migration
  changes" constraint. A durable, migration-level cap on reuse-path calls
  (e.g., a cooldown column) would close the remaining edge (an attacker can
  still spam the one unavoidable `sessions.retrieve` call on the reuse
  path) but requires a schema change outside this task's scope.

## Verification

- `npm run test:server` — **58/58 passed** (57 pre-existing + 1 new
  regression), 0 failures. Local Node test runner against mocked
  Stripe/Supabase dependencies — this is an integration-boundary check, not
  a hosted Stripe sandbox delivery or a real charge.
- `npm run check:server` — passed, no type errors.
- No `supabase/migrations/*`, `supabase/tests/*`, `tests/billing/*`, or any
  file outside `server/billing/handlers.ts`,
  `tests/server/checkout.test.ts`, and this doc was changed.
