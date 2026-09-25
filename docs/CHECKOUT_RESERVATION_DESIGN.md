# Shared owner checkout reservation — closing the mixed-mode/two-tabs race

Scope: this task adds a single durable per-owner checkout reservation shared
by the manual pass and the OPTIONAL recurring subscription checkout flows
(`supabase/migrations/20260920050000_owner_checkout_reservation.sql`,
`supabase/tests/owner_checkout_reservation.test.sql`,
`server/billing/reservation.ts`, `server/billing/handlers.ts`,
`tests/billing/reservation.test.ts`, `tests/server/checkout.test.ts`,
`tests/billing/recurring-handler.test.ts`, `scripts/test-database-concurrency.mjs`,
this doc). No live provider calls, credentials, hosted changes, frontend
edits, or deployment were made. Public paid flags remain disabled
(`BILLING_ENABLED`/`BILLING_RECURRING_ENABLED` unset in this repo's own
`.env.example`/CI); nothing here changes that.

## The bug this closes

`docs/RECURRING_IMPLEMENTATION.md`'s "Parent review correction" and several
`HANDOFF.md` entries flagged the same open gap: `checkout()`'s and
`subscribeCheckout()`'s own "does this owner already have an active
subscription / active prepaid pass" preflight checks are plain `SELECT`s with
no lock spanning them. Durable idempotency for each flow's *own* request id
does exist — `billing_begin_intent` (manual, advisory-lock key `194`) and
`billing_begin_subscription_intent` (subscription, key `196`) — but those two
locks are **independent namespaces that never serialize against each other**,
and neither one is held across the preflight check at all, only across each
flow's own intent-row read/insert.

Concretely, before this change:

1. **Manual + subscription race.** Two concurrent requests for the same
   owner — one to `checkout()`, one to `subscribeCheckout()` — could both
   read "no active subscription" / "no active prepaid pass" before either
   one committed anything durable, then both go on to create their own real,
   independently payable Stripe Checkout Session. Completing both would
   charge the owner for a subscription *and* a manual pass that the app's
   own business rule says should never coexist.
2. **Two active subscription checkouts.** Two browser tabs both calling
   `subscribeCheckout()` with two different (client-generated) request ids
   race `billing_begin_subscription_intent` independently — that RPC's own
   advisory lock only serializes *within* its own transaction, not across
   the whole `subscribeCheckout()` call including the Stripe API round trip
   — so both could create their own Checkout Session and, if both are
   completed, produce two live subscriptions for one owner.

## Design: one reservation slot per owner, spanning creation *and* reconciliation

`public.billing_owner_checkout_locks` (owner_id primary key) is a **third,
outer** layer: one row means "this owner has exactly one checkout in flight
right now, and it is this one," regardless of which flow. It does not
replace `billing_intents`/`billing_subscription_intents` — those still
provide each flow's own per-request-id idempotency and creation-rate cap —
it wraps both.

`billing_reserve_owner_checkout(kind, request_id, owner, price, live)` is
called **before** either flow's existing preflight `SELECT`, using a single
shared advisory-lock namespace (`550`) regardless of `kind` — this is what
makes it actually serialize manual against subscription, and subscription
against subscription, which `194`/`196` alone never did. It never raises on
conflict — it always returns whichever row is (now) on file for the owner,
so the caller (`isOwnLock` in `server/billing/reservation.ts`) can cheaply
tell whether that's its own request (kind/request_id/price/live all match —
true whether this call just created the row or a prior call for the
identical request already held it, the ordinary retry-the-same-request-id
path) or a genuinely different in-flight checkout it must not proceed past.

### Release: provider-confirmed terminal status, never a blind TTL

The task explicitly rules out a fixed local expiry: Stripe's default
Checkout Session lifetime is up to 24 hours and is configurable per session,
so guessing at that boundary locally could release a reservation while the
actual Stripe session remains open and payable, letting a second checkout
start alongside it. Every release path in this design is therefore either
provider-confirmed or provably artifact-free:

1. **Provider-confirmed success.** `applyCheckoutEvent` (manual) and
   `applySubscriptionCheckoutEvent` (subscription) each release the owner's
   reservation, scoped to the exact session id, immediately after their
   existing `billing_apply_verified_payment` / `billing_record_subscription`
   call succeeds — this is what lets an owner repeat a manual pass purchase
   after a completed checkout, or later resubscribe.
2. **Provider-confirmed abandonment.** The webhook now also handles Stripe's
   own `checkout.session.expired` event (added to
   `server/billing/handlers.ts`'s event dispatch as a new
   `applyCheckoutExpiredEvent`), which fires once the session's *real*
   `expires_at` passes. It re-retrieves the session from Stripe and only
   releases after confirming the re-retrieved `status` is itself `'expired'`
   (never trusting the event payload alone, matching every other handler in
   this file), then releases by owner + kind + exact session id — dispatched
   on the retrieved session's own `mode`, since manual and subscription
   checkouts share this one webhook endpoint.
3. **Provably-safe recovery for an UNBOUND reservation** (no session id was
   ever recorded — either the create call never reached Stripe, or it
   succeeded but the bind that would have recorded its id was lost). This is
   the only path that can release a reservation without waiting for Stripe
   to tell us, and it never guesses: `server/billing/stripe.ts` already
   sends a stable idempotency key (`pass:${owner}:${requestId}` /
   `sub:${owner}:${requestId}`) on every session-create call.
   `tryRecoverStuckLock` (`server/billing/reservation.ts`) re-issues the
   *exact same* create call for the stuck reservation's own recorded
   `owner_id`/`request_id`/`kind`. Stripe's idempotency layer guarantees this
   either returns the session that was actually created the first time (a
   genuine "lost bind," now resolved and bound — the slot stays legitimately
   occupied) or raises one of Stripe's own **definite, pre-creation**
   rejection types (`StripeInvalidRequestError`, `StripeAuthenticationError`,
   `StripePermissionError`, `StripeRateLimitError` —
   `isDefinitelyNoProviderArtifact`), which alone proves nothing was created
   and is the only condition that releases the slot. A connection error, a
   generic `StripeAPIError`, a timeout, or any non-Stripe error leaves
   whether a session now exists genuinely ambiguous and is never treated as
   proof — the reservation stays held. **Recovery never frees the slot for
   the *new*, different request that triggered it** — it only ever resolves
   the *stuck* reservation itself, leaving the caller to retry its own
   reservation attempt afterward if (and only if) that resolution actually
   released it.

A reservation that already has a session bound is **never** touched by
recovery, no matter how old — only paths 1 and 2 above may ever release a
bound reservation. `checkout()`/`subscribeCheckout()` themselves do not add
any release-on-error logic: a same-request-id retry after any failure
(catalog validation, throttle, a lost bind) naturally reuses the same
unbound-or-bound reservation row and resolves it through the ordinary
idempotent-retry path, and a genuinely abandoned attempt is eventually
resolved the next time anything (a different request, or Stripe's own
`checkout.session.expired`) touches that owner's slot.

## Verification

- **`supabase/tests/owner_checkout_reservation.test.sql`** (pgTAP, 23
  assertions): reserve/retry-same-request idempotency, a competing
  manual-vs-subscription reservation correctly reports the *other* kind
  rather than throwing, owner isolation, bind/rebind/conflicting-rebind,
  release-by-session (exact match required, wrong session/kind is a
  no-op, idempotent against redelivery), release-by-request-id (only ever
  applies to an unbound row, never a bound one, even with a matching
  request id), the exactly-one-of-session/request-id input contract, and
  cross-role denial (function execute + direct table `SELECT`) for
  `authenticated`.
- **`tests/billing/reservation.test.ts`** (Node test runner, mocked RPCs):
  `isOwnLock` field-by-field matching; `acquireOwnerCheckoutLock` returning
  immediately for an already-own reservation, retrying once after recovery
  frees a stuck one, and rejecting with `HttpError(409)` both when recovery
  fails and when a freed slot is won by a third party before the retry;
  `tryRecoverStuckLock` never touching a bound reservation, resolving a lost
  bind via the same idempotency key without ever freeing the slot for the
  new request, never releasing on an ambiguous failure
  (`Error`/`StripeConnectionError`/`StripeAPIError`), releasing only on
  Stripe's four definite rejection types, and treating a `bindIntent`
  failure *after* a real create as ambiguous (never releasing a possibly-live
  session); `isDefinitelyNoProviderArtifact`'s exact classification.
- **`tests/server/checkout.test.ts`**: updated the existing call-order
  assertions to include the new `billing_reserve_owner_checkout` /
  `billing_bind_owner_checkout` calls; added a handler-level test proving a
  concurrent, still-open subscription reservation blocks a manual `checkout()`
  call before any other business-rule check even runs (asserts the call list
  is exactly `['billing_reserve_owner_checkout']`); added four
  `checkout.session.expired` webhook tests (manual release, subscription
  release, a re-retrieved-as-still-open session releasing nothing regardless
  of the event type, and an unknown session releasing nothing).
- **`tests/billing/recurring-handler.test.ts`**: updated the subscription
  preflight malformed-entitlement-shape test's call-order assertion for the
  new reservation call.
- **`scripts/test-database-concurrency.mjs`** (native PostgreSQL, real
  concurrent connections): three new race scenarios — (1) a manual and a
  subscription `billing_reserve_owner_checkout` launched concurrently for the
  same owner admit exactly one; (2) two concurrent subscription reservations
  (two tabs, two request ids) for the same owner admit exactly one; (3) a
  concurrent reservation for a *different* owner never interferes with an
  existing one. Also made the script's PostgreSQL-binary discovery portable
  (`PGBIN` still wins if set; otherwise probes common Homebrew
  Intel/Apple-Silicon and Postgres.app locations across several versions
  instead of one hardcoded path) since the exact local install location
  varies by machine.
- `npm run check:server` — **passed**, no type errors.
- `npm run test:server` — **149/149 passed** (132 pre-existing + 17 new: 12
  in `tests/billing/reservation.test.ts`, 5 in `tests/server/checkout.test.ts`),
  0 failures.
- `npm run test:db` — **352/352 pgTAP assertions passed** (329 pre-existing +
  23 new), 0 `not ok` lines, every test file emitted its plan.
- `npm run test:db:concurrency` — **could not run in this session.** No local
  PostgreSQL binary was found at `PGBIN`, any of the probed Homebrew
  Intel/Apple-Silicon paths (versions 17 down to 14), `/Applications/Postgres.app`,
  or `/opt/homebrew/bin`/`/usr/local/bin` — this sandbox has no local
  PostgreSQL install at all (an earlier `HANDOFF.md` entry already recorded a
  Homebrew install failure in a prior session on old Command Line Tools; a
  later session worked around it with a temporary `@embedded-postgres`
  package it did not commit). The three new race scenarios above were
  written and are ready to run, but **were not independently executed against
  real concurrent connections this session** — do not report them as passing
  until someone with a working local PostgreSQL (or the embedded-postgres
  workaround) actually runs `npm run test:db:concurrency` and records the
  result here. The pgTAP suite above does independently exercise the same
  RPCs' logic, including owner isolation, but pgTAP's `BEGIN`/`ROLLBACK`
  harness runs everything on one connection in sequence — it cannot exercise
  genuine concurrent-connection contention for the advisory lock the way the
  native harness does.

## What this deliberately does not change

`billing_intents`/`billing_subscription_intents` and their own 3/hour
creation caps, `billing_checkout_attempts`/`billing_subscription_checkout_attempts`
throttles, the recurring invoice/entitlement stacking policy, cancellation,
and refund/dispute reconciliation are all untouched — this task only adds
the outer reservation layer and the two webhook release paths. Preserved
behaviors, unchanged by this work and covered by existing regressions: an
owner can repeat manual pass purchases after a completed checkout (release
on `checkout.session.completed`, path 1 above); retrying the identical
request id after an ambiguous Stripe outcome (a network error mid-create, a
lost bind) reuses the same reservation and resolves via Stripe's own
idempotency key, never creating a second payable session.

## Parent correction September20 11:46

Automatic release after a rejected retry is unsafe: the first attempt might already have created a session. Recovery now retains all uncertain reservations, including typed Stripe errors. It also refuses recreation when the original reservation is23h old or timestamp is invalid/future. Earlier claims that these errors prove no artifact are superseded. Provider-confirmed reconciliation remains required. Parent local149 server/352 SQL checks passed; native concurrency could not start (initdb ENOENT).
