## Independent follow-up verification

Parent corrected migration timestamp to20260920010000; all migrations remain local-only. Only SQLSTATE54000 maps to429; other RPC failures return generic503. Added outage regression and real PostgreSQL concurrent25-request test: exactly20 accepted,5 rejected, persisted20. Server60/60, typecheck, pgTAP182 plus historical3, and5 native race checks passed. Local evidence only; deploy and hosted checks remain pending.

# Checkout-attempt throttle — closing the retry-amplification gap

Scope: this task adds a durable, per-owner rate limit on `checkout()` attempts
themselves (`server/billing/handlers.ts`,
`supabase/migrations/20260920010000_checkout_attempt_throttle.sql`,
`supabase/tests/checkout_attempt_throttle.test.sql`,
`tests/server/checkout.test.ts`, this doc). No other migration, payment
semantics, recurring/refund logic, public UI, or unrelated feature was
touched. No network/provider calls, secrets access, deploys, hosted-state
changes, or real charges were made.

## Why the prior fix (docs/PAYMENT_HANDLER_REVIEW.md) was a partial mitigation, not a fix

That review correctly identified and fixed a real bug: `checkout()` used to
run `validateCatalog` (2 Stripe calls) unconditionally on *every* call,
including replays of an already-bound `requestId`, so a single account could
force 3 Stripe calls per replay indefinitely. Gating `validateCatalog` behind
actual new-session creation removed 2 of those 3 calls on the reuse path.

**It explicitly did not add a rate limit on `checkout()` itself** — its own
"Remaining, already-documented, out-of-scope gaps" section says so directly:

> The intent-creation rate limit itself (3/hour) still lives entirely in the
> migration and was not changed... A durable, migration-level cap on
> reuse-path calls (e.g., a cooldown column) would close the remaining edge
> (an attacker can still spam the one unavoidable `sessions.retrieve` call on
> the reuse path) but requires a schema change outside this task's scope.

So after that fix, a single authenticated account could still loop
`POST /api/checkout` and force **1 Stripe API call per request, unbounded**,
via any of:

1. **A bound intent** (`intent.session_id` set) — every replay calls
   `stripe.checkout.sessions.retrieve(intent.session_id)`, unthrottled.
2. **An unbound intent that already exists** (created, never completed
   binding) — `billing_begin_intent`'s "found" branch returns the existing
   row without re-checking its own 3/hour creation limit (by design — that
   limit only gates *new* rows), so replaying that `requestId` reaches
   `createPassCheckout` (a `stripe.checkout.sessions.create` call) every
   time.
3. **A brand-new intent per call** — `billing_begin_intent`'s 3/hour
   creation limit does cap this specifically, but only for *new* `owner_id`
   creations; it says nothing about (1) or (2) above, and does not bound
   `checkout()`'s call rate as a whole once combined with retries against
   already-created rows.

This is exactly the "unbounded retry calls" the prior review named and
declined to fix, not a new discovery.

## Fix

Added `public.billing_checkout_attempts`, a single-row-per-owner fixed-window
counter (`owner_id primary key`, `window_start`, `attempt_count`), and
`public.billing_throttle_checkout_attempt(p_owner uuid)`, a `SECURITY
DEFINER` RPC with `set search_path = ''`, matching the existing
`billing_intents`/`billing_begin_intent` pattern in
`20260919211000_checkout_intents.sql`:

- **Service-only.** `revoke all ... from public, anon, authenticated,
  service_role` on the table (even `service_role` cannot read/write it
  directly — only the function, running as its owner, can); `revoke all` /
  `grant execute ... to service_role` on the function. Mirrors
  `billing_intents`, not the more permissive `billing_entitlements`/
  `billing_checkouts` pattern that grants `service_role` direct `SELECT`.
- **Atomic concurrency.** `pg_advisory_xact_lock(hashtextextended(p_owner::text, 401))`
  (tag `401`, distinct from the `194` used by `billing_begin_intent` and the
  `293` used by `reserve_ai_budget`/`finish_ai_budget`) serializes concurrent
  attempts from the same owner before the read-modify-write, so a burst of
  parallel requests cannot all observe the same pre-increment count and all
  pass.
- **Bounded storage.** Exactly one row per owner, enforced by the primary
  key — a fixed-window counter that resets itself in place once the hour
  elapses, not an ever-growing per-attempt ledger (unlike
  `billing_intents`/`ai_budget_requests`, which intentionally keep one row
  per request for idempotency/replay-detection reasons that don't apply
  here).
- **Limit:** 20 attempts per owner per rolling-reset hour (an attempt is
  every call to `checkout()` that gets past body/auth validation — new,
  unbound-retry, and bound-retry alike). Raises `errcode 54000` with the
  message `Too many checkout attempts. Wait up to an hour and try again.`
  when exceeded.
- **Does not touch or weaken `billing_intents`'s existing 3/hour
  *creation* limit** — no existing migration file was modified. The two
  limits are independent and compose: creating new intents is still capped
  at 3/hour; total checkout attempts of any kind are now separately capped
  at 20/hour.

`server/billing/handlers.ts`'s `checkout()` calls
`billing_throttle_checkout_attempt` immediately after `billing_begin_intent`
returns and **before the branch that decides `sessions.retrieve` vs.
`validateCatalog` + `sessions.create`** — so it runs unconditionally ahead of
every Stripe network call in `checkout()`, for a new intent, an unbound
existing intent, and a bound existing intent alike. A throttled attempt
raises `HttpError(429, 'Too many checkout attempts. Wait up to an hour and
try again.')`, routed through the existing `safeError` handler (no Stripe id,
internal detail, or stack trace reaches the client — same boundary already
covered by `unexpected provider details and secrets never reach client
errors` in `tests/server/security.test.ts`).

## Verification

- **`tests/server/checkout.test.ts`** (Node test runner, mocked Stripe/DB):
  - Updated `'durable intent and binding bracket Stripe call before redirect
    is returned'`'s call-order assertion to include
    `billing_throttle_checkout_attempt`.
  - Added `'checkout-attempt throttle runs before any Stripe call, for
    bound, unbound and new intents alike'`: for both an already-bound
    intent (`session_id` set) and a new/unbound one (`session_id: null`), a
    throttle RPC failure yields **HTTP 429 and zero Stripe calls**
    (`retrieve` and `create` both instrumented and asserted empty), and the
    response body never mentions `stripe`.
  - `npm run test:server` — **59/59 passed** (58 pre-existing + 1 new; the
    existing call-order test's update is not a new test, so net is +1),
    0 failures.
- **`supabase/tests/checkout_attempt_throttle.test.sql`** (pgTAP, 9
  assertions), run via `npm run test:db` alongside every other migration
  test file:
  - **Boundary:** 20 attempts for one owner succeed; the 21st raises
    `54000` with the exact safe-retry message.
  - **Per-owner independence:** a second owner's first attempt succeeds
    immediately while the first owner is still throttled, and the first
    owner's throttled state is unaffected by the second owner's activity.
  - **Reset:** after forcibly expiring the window (`window_start` moved back
    2 hours, done via `reset role` — the same superuser-context technique
    `checkout_intents.test.sql` already uses to simulate `billing_intents`
    idempotency expiry, since the table has no direct grants for any
    request-time role), a **full fresh run of 20 more attempts succeeds and
    the 21st is rejected again** — proving an actual window reset, not
    merely "one more attempt happened to pass."
  - **Cross-role denial:** `authenticated` gets `42501 permission denied`
    calling the RPC directly and reading the table directly (both, not just
    one — the RPC being service-only doesn't matter if the table itself
    were readable/writable).
  - **Invalid input:** a null owner raises `22023 Invalid checkout attempt`
    rather than silently no-op'ing or throttling a null key.
  - `npm run test:db` — **182/182 pgTAP assertions passed** across every
    migration test file (173 pre-existing + 9 new), 0 failures, full
    transcript read.
- `npm run check:server` — passed, no type errors.
- No `supabase/migrations/2026091921*.sql`, `supabase/migrations/2026091922*.sql`,
  `supabase/migrations/2026091923*.sql`, or any other existing migration/test
  file was modified — confirmed via `git status`/reading each file
  unchanged. Payment amount/currency/price/owner verification, refund/
  reversal handling, the 30-day manual-pass policy, and all public UI are
  untouched.

## Remaining, unchanged, out-of-scope gaps

Everything listed as remaining in `docs/PAYMENT_HANDLER_REVIEW.md`'s own
"Remaining, already-documented, out-of-scope gaps" section is still open and
was not in scope here: no refund/dispute/chargeback handling, no
`checkout.session.expired` cleanup of abandoned `billing_checkouts` rows, no
admin/support UI for payment history, and none of this has been applied to
any hosted Supabase project or exercised against real Stripe
sandbox/live delivery — this is a local, mocked-integration-boundary and
local-pgTAP verification only.
