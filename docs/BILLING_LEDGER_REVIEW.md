# Billing ledger foundation — review

Scope: a **local, durable storage + atomicity layer** for the one-time,
non-renewing 30-day manual pass already specified in
`server/billing/policy.ts` (`PASS_MS`, `manualPassWindow`,
`assertManualPayment`). This is database schema/RPCs only — **no server
HTTP route, no Stripe webhook handler, no Stripe API call, and no frontend
change are part of this work.** Nothing here was applied to any hosted
Supabase project, no secrets were read or used, and no live API was called.
Public accounts/payments remain disabled per `AGENTS.md`/`HANDOFF.md`.

Files added (and owned by this session — no other file was modified):

- `supabase/migrations/20260919210000_billing_ledger.sql`
- `supabase/tests/billing_ledger.test.sql`
- `docs/BILLING_LEDGER_REVIEW.md` (this file)

## Why this shape

`server/billing/policy.ts`'s own header says it plainly: "This module does
not verify Stripe signatures, persist grants, or authorize requests by
itself... The database must deduplicate the payment identity and serialize
this calculation per user." This migration is that missing persistence
layer. It intentionally does **not** re-decide what counts as a verified
payment — that decision belongs to whatever calls
`billing_apply_verified_payment` (a future server/Stripe integration
authenticating with `server/http/security.ts`'s `authenticate()` and holding
the service-role key). What it does own:

- **Server-only checkout records** (`billing_checkouts`) — the "trusted
  checkout record" `assertManualPayment`'s own comment requires
  (`expected.ownerId must never come from webhook metadata alone`).
- **Idempotency by both Stripe event id and payment id** (`billing_payments`,
  two independent unique constraints, plus a third on checkout session id as
  belt-and-suspenders since this flow issues exactly one payment per
  session).
- **Atomic 30-day stacking per owner**, row-locked so concurrent grant
  attempts for the same account can't race each other.
- **A user-read-only entitlement** (`billing_entitlements`), RLS-scoped to
  `owner_id = auth.uid()`, no write policy at all for `authenticated`.
- **Service-role-only mutation**, via two `SECURITY DEFINER` RPCs with
  `EXECUTE` revoked from `public`/`anon`/`authenticated` and an empty
  `search_path` (every table/column reference schema-qualified, matching
  the sibling `billing_intents` RPCs in
  `20260919211000_checkout_intents.sql`) — the same hardening intent
  `resumes_write_checkpoint`/`resumes_set_revision` already established in
  `supabase/migrations/20260918120000_resume_storage.sql`. `service_role`
  itself gets no `INSERT`/`UPDATE`/`DELETE` grant on any of these tables
  either — only the RPCs (running as the table-owning migration role) can
  write, so "the ledger only changes through validated, atomic, idempotent
  operations" is enforced by grants, not just by convention. `service_role`
  does get a plain `SELECT` grant on all three tables (matching real
  Supabase's own `BYPASSRLS`-carrying `service_role`) — a trusted backend
  legitimately needs to look up ledger/checkout history for support or
  reconciliation; that does not weaken the mutation boundary.

`service_role` is expected to already exist before this migration runs —
it is no longer created here. It didn't exist in this repo's local
PGlite/pgTAP harness (`scripts/test-database.mjs`) when this task started;
the harness has since gained its own `create role service_role nologin
bypassrls;` (parallel work, ahead of this migration in execution order), so
this migration only grants against it. On a real Supabase project
`service_role` is built in.

## Schema

**`public.billing_checkouts`** — one row per Stripe Checkout Session the
server creates, written *before* redirecting the user to Stripe.
| column | notes |
|---|---|
| `session_id` (text, PK) | Stripe Checkout Session id |
| `owner_id` (uuid, FK `auth.users`) | the server's own authenticated user, never client-supplied at payment time |
| `price_id` (text) | the Stripe Price id the server intended to sell |
| `live` (bool) | live vs. test Stripe mode |
| `expected_amount` (bigint) | minor units (cents), matches `assertManualPayment`'s `amountTotal` |
| `expected_currency` (text) | lower-cased ISO code, e.g. `usd` |
| `created_at` | default `now()` |

No `anon`/`authenticated` grant at all — not readable by any client role,
not just RLS-filtered.

**`public.billing_payments`** — the durable ledger; one row per *applied*
payment.
| column | notes |
|---|---|
| `id` (uuid, PK) | |
| `owner_id`, `checkout_session_id` (FK → `billing_checkouts`), `event_id`, `payment_id`, `price_id`, `live`, `amount_total`, `currency` | copied from the verified payment, after matching the trusted checkout |
| `verified_at` | the caller's own authoritative verified-payment timestamp |
| `pass_started_at`, `pass_ended_at` | the exact 30-day (2,592,000-second) window this payment produced |
| `created_at` | default `now()` |

`unique(event_id)`, `unique(payment_id)`, `unique(checkout_session_id)` — any
one alone prevents double-granting the same real-world payment; all three
together close three distinct replay paths (resent webhook event, duplicate
payment notification, and a second attempt against the same checkout
session). No `anon`/`authenticated` grant.

**`public.billing_entitlements`** — one row per owner, the only
user-visible billing state.
| column | notes |
|---|---|
| `owner_id` (uuid, PK, FK `auth.users`) | |
| `paid_through` (timestamptz, nullable) | `null` = never purchased (Free); matches `policy.ts`'s `isPro(paidThrough, now)` exactly |
| `updated_at` | |

`authenticated` gets `SELECT` only, RLS-scoped to `owner_id = auth.uid()`. No
insert/update/delete policy exists for `authenticated` at all.

## RPC contracts (for the server/Stripe integration)

Both are `SECURITY DEFINER`, `search_path` pinned, `EXECUTE` granted to
`service_role` only. Call them from server code holding the service-role
key, never from the browser.

### `public.billing_record_checkout(p_owner_id uuid, p_price_id text, p_live boolean, p_session_id text, p_expected_amount bigint, p_expected_currency text) returns void`

Call **immediately after creating the Stripe Checkout Session**, before
redirecting the browser, using:
- `p_owner_id` — the caller's own authenticated Supabase user id (from
  `authenticate()` in `server/http/security.ts`), never anything from the
  request body.
- `p_session_id` — the Checkout Session's own `id` (known synchronously from
  the Stripe API response that created it).
- `p_price_id`, `p_expected_amount`, `p_expected_currency` — from the
  server's configured catalog (`STRIPE_PASS_PRICE_ID`, `1999`, `usd`),
  never from client input.
- `p_live` — whether this is the live or test Stripe key/mode.

Idempotent for an exact-match retry (e.g. your own request retried after a
network timeout before you saw the first response): a second call with
identical arguments is a silent no-op. A second call with the **same**
`p_session_id` but **different** other fields raises (a real bug or
forgery attempt, never silently accepted).

### `public.billing_apply_verified_payment(p_owner_id uuid, p_session_id text, p_event_id text, p_payment_id text, p_price_id text, p_live boolean, p_amount_total bigint, p_currency text, p_verified_at timestamptz) returns table(paid_through timestamptz, applied boolean)`

Call from your webhook handler **after**:
1. Verifying the Stripe webhook signature.
2. Confirming, independently of the event payload alone if you want the
   same defense-in-depth `assertManualPayment` documents (an authoritative
   Stripe API lookup, not just trusting the event body) that the payment is
   `mode: 'payment'`, `status: 'paid'`, and belongs to the correct Stripe
   account/live-mode.

Arguments:
- `p_owner_id` — must be the account you associated with the Checkout
  Session yourself (e.g. looked up via `p_session_id` from your own
  `billing_checkouts` row, or carried through your own server-side session
  state) — **never taken from webhook metadata alone**, matching
  `assertManualPayment`'s comment.
- `p_session_id` — the same Checkout Session id passed to
  `billing_record_checkout`.
- `p_event_id` — the Stripe webhook event's own `id` (`evt_...`).
- `p_payment_id` — the underlying payment identity (e.g. the
  `payment_intent` id).
- `p_price_id`, `p_live`, `p_amount_total`, `p_currency` — the actual
  verified payment facts.
- `p_verified_at` — your own authoritative timestamp for when the payment
  was confirmed (e.g. the event's `created` time, as a `timestamptz`).

Behavior:
- **Any argument null, or any text argument blank** (`p_owner_id`,
  `p_session_id`, `p_event_id`, `p_payment_id`, `p_price_id`, `p_live`,
  `p_amount_total` (also rejected if `<= 0`), `p_currency`,
  `p_verified_at`): raises immediately, before any lookup. This is not just
  input hygiene — every mismatch check further down uses SQL `<>`/`=`,
  which evaluate to `UNKNOWN` (neither true nor false) when either side is
  `NULL`, and `if unknown then ...` never fires. Without this upfront
  guard, a `NULL` in the right argument would silently skip a mismatch
  check rather than trip it.
- **`p_verified_at` non-finite or implausible**: Postgres's special
  `infinity`/`-infinity` timestamptz values are rejected explicitly
  (`isfinite()`), as is anything before the Unix epoch or after
  `275760-09-13` — the same domain `server/billing/policy.ts`'s
  `timestamp()` enforces (a millisecond epoch count between `0` and
  `8_640_000_000_000_000`, JavaScript's max `Date`). A `p_verified_at` more
  than 5 minutes ahead of the database's own `now()` is also rejected (a
  payment cannot have been verified in the future; the 5-minute allowance
  is only for ordinary clock skew between your server and the database).
- **Duplicate `event_id` or `payment_id`** (already present in
  `billing_payments`) **where every other immutable fact on the existing
  row also matches this call** (owner, checkout session, price, live,
  amount, currency): returns the entitlement's current `paid_through` with
  `applied = false`. No exception, no second grant — safe to call from a
  retried/at-least-once webhook delivery, and also covers a different
  `event_id` legitimately re-notifying about the same real `payment_id`.
- **Duplicate `event_id` or `payment_id` where any of those other facts
  disagree with the row already on file**: raises — a reused identifier
  with different owner/session/price/mode/amount/currency is treated as a
  conflicting reuse (bug or forgery), never silently absorbed as "already
  applied". The same check runs again if a concurrent call wins a race for
  the same identifiers between this function's own pre-check and its
  insert — that path looks up whichever row actually committed and applies
  the identical comparison, so a race against a different owner's payment
  can't be reported back as this caller's own success.
- **No matching `billing_checkouts` row for `p_session_id`**: raises. You
  must call `billing_record_checkout` before this.
- **Any of `owner_id`/`price_id`/`live`/`amount_total`/`currency` mismatched
  against the trusted checkout row**: raises, nothing is written. This is
  the DB-side mirror of `assertManualPayment`'s checks, evaluated against
  *this specific checkout's own recorded facts* rather than a hard-coded
  constant, so it still holds if the price catalog ever changes.
- **Genuine new payment**: atomically computes the new pass window —
  `pass_started_at = greatest(current paid_through (or this payment if
  never purchased), p_verified_at)`, `pass_ended_at = pass_started_at +
  2,592,000 seconds` (exactly `PASS_MS`, not a calendar `'30 days'`
  interval, so it can't drift from `policy.ts` around a DST transition) —
  inserts the ledger row, updates `billing_entitlements`, and returns the
  new `paid_through` with `applied = true`. A per-owner row lock
  (`... for update`) serializes this against any concurrent call for the
  same owner.

There is no separate "read entitlement" RPC — read `billing_entitlements`
directly as the signed-in user (RLS already scopes it), or as `service_role`
if a server-side check is needed.

## What this deliberately does NOT do — remaining lifecycle work

Read this before assuming billing is "done":

- **No webhook handler, no Stripe signature verification, no Stripe API
  calls anywhere in this change.** Both RPCs trust their caller to have
  already done that work; they are the storage/atomicity layer underneath
  it, not a replacement for it.
- **No recurring/subscription billing.** `HANDOFF.md`'s existing plan notes
  an optional recurring renewal may be offered later, explicitly opt-in; this
  schema only models the one-time manual pass. If recurring billing is
  built, it needs its own explicit-consent, cancellation, and
  overlapping-charge-prevention design — do not bolt it onto
  `billing_apply_verified_payment` without revisiting this file.
- **Refunds/chargebacks/disputes** are now handled by a separate additive
  migration, `20260920030000_billing_reversals.sql` (a `status` column on
  `billing_payments`, the `billing_reversal_events` ledger, and the
  `billing_apply_reversal_event` RPC), wired into `server/billing/
  handlers.ts`'s `webhook()`. See `docs/BILLING_REVERSAL_DESIGN.md` for the
  full policy and its own "Remaining gaps"/"Verification" sections — in
  particular, partial refunds/disputes still have no invented policy, and
  that session could not itself execute `npm run test:db`/`test:server`/
  `check:server` to confirm the new migration and handler changes.
- **No cancellation flow** — not applicable to a non-renewing pass by
  design (nothing recurs to cancel), but will matter the moment recurring
  billing exists.
- **No receipts/email delivery** — Stripe's own receipt emails are the only
  receipt today; nothing here generates or stores one.
- **No admin/support UI** for looking up a user's payment history — the data
  is queryable by `service_role` (see the SELECT grant above) but no
  interface exists yet.
- **No checkout-session expiry cleanup** — an abandoned `billing_checkouts`
  row (user never completed payment) is retained forever; harmless (it's
  never actioned without a matching verified payment) but worth a retention
  policy eventually.
- **Not applied to any hosted Supabase project.** Apply via `supabase db
  push` or the project's SQL editor only after independent review, then
  verify one real end-to-end checkout/webhook/entitlement round trip signed
  in as a real test account before relying on it in the app — the same
  standard prior migrations in this repo hold themselves to.
- **`server/billing/policy.ts`'s `assertManualPayment`** (`accountId`,
  `mode`, `status` checks) still matters and is not superseded by this
  migration — it's the layer that decides a payment is even eligible before
  your server calls `billing_apply_verified_payment` at all. This migration
  adds a second, independent check (against the trusted checkout record)
  for the fields that can be checked purely from stored facts
  (`owner_id`/`price_id`/`live`/`amount_total`/`currency`); it does not
  duplicate the Stripe-account-identity check, which requires knowing the
  live Stripe account id server-side.

## Local verification

Ran via the existing `npm run test:db` (PGlite/pgTAP + the minimal Supabase
auth schema in `scripts/test-database.mjs`, which by the end of this session
also defines `anon`/`authenticated`/`service_role` — the last one added by
parallel work on `server/http`/Stripe integration happening alongside this
task, not by this file). This harness does not cover hosted
Auth/PostgREST/webhook configuration, Stripe's own API, or real concurrent
multi-connection load — same caveat every other migration in this repo
carries.

**68/68 `billing_ledger.test.sql` assertions pass**, alongside every other
suite in the same run (`ai_budget.test.sql`, `checkout_intents.test.sql`,
`pdf_allowance.test.sql`, `resume_storage_bounds.test.sql`,
`resumes_rls.test.sql` — all unrelated parallel work, all still green). Full
transcript inspected line by line, not just the summary; no `not ok` or
`# Looks like` lines anywhere.

What the 68 tests actually cover, matching this task's required scenarios:
- **Explicit null/blank rejection**: every one of
  `billing_apply_verified_payment`'s nine arguments individually null (or
  blank for text arguments, or `<= 0` for the amount) is rejected, each as
  its own regression, plus the equivalent set for
  `billing_record_checkout`'s six arguments (owner, price, live, amount,
  currency each tested null/blank/invalid once). None of these write a
  ledger row or entitlement.
- **Non-finite/implausible timestamps**: `infinity`, `-infinity`, a time
  before the Unix epoch, and a time far in the future are each rejected as
  their own regression.
- **Conflicting reuse of an already-applied identifier**: reusing an
  already-used `event_id` under a *different owner*, and reusing an
  already-used `payment_id` under a *different checkout session*, a
  *different amount*, and a *different price id*, are each independently
  rejected (not silently treated as a no-op) — distinguished from the
  legitimate "different event id, same real payment" no-op case, which is
  also tested and still succeeds silently.
- **Anon access**: cannot read any of the three tables, cannot call either
  RPC.
- **Other-user access / no authenticated forged grants**: a signed-in
  `authenticated` session cannot read `billing_checkouts`/`billing_payments`
  at all, cannot `INSERT`/`UPDATE` `billing_entitlements` directly (self-
  granting or self-extending a pass), and cannot call either RPC (`EXECUTE`
  revoked) — covers the literal forged-grant attempt, not just a read-side
  check.
- **Duplicate payment, no extension**: the same `event_id`+`payment_id`
  resent is a no-op (`applied=false`, `paid_through` unchanged); a *new*
  `event_id` reusing an already-used `payment_id` is also a no-op — the
  "resent webhook" and "duplicate payment notification" cases are tested
  separately.
- **Active/expired passes**: a second genuine payment verified while the
  first pass is still active stacks a full 30 days onto the *remaining*
  time (`Jan 31 → Mar 2`, not from "now"); a third genuine payment verified
  *after* the (now-stacked) pass has expired starts fresh from its own
  payment time (`Jun 1 → Jul 1`), not from the stale expired value —
  exercises both branches of the stacking formula, not just one.
- **Invalid amount/currency/price mismatch against the trusted checkout
  record**: four separate mismatches (`amount`, `currency`, `price_id`,
  `live`/test-mode) each independently rejected with no ledger row or
  entitlement change written, plus a payment claiming a different owner
  than its checkout record, plus a payment referencing a session with no
  checkout record at all.
- **Cross-owner isolation**: two independent owners' checkouts/payments/
  entitlements never interact; each can read only their own entitlement row
  via RLS.
- **`billing_record_checkout` idempotency**: an exact-match retry is silent;
  a same-session-id-different-owner retry raises rather than silently
  reusing the first owner's session.

Not run/out of scope this session, same as every other DB-layer change in
this repo so far: hosted Supabase execution, real Stripe sandbox/live
end-to-end verification, and true multi-connection concurrent-call testing.
In particular, `billing_apply_verified_payment`'s ON-CONFLICT race branch
(reached only when a second concurrent call commits a matching
event/payment/checkout row between this call's own pre-check and its
insert) is not triggered by a real concurrent connection here — this
harness is single-connection. That branch runs the exact same
conflicting-details comparison as the pre-check branch, which the 4
conflicting-reuse regressions above exercise directly; the race path's
correctness rests on that code identity plus Postgres's documented
row-locking/unique-constraint semantics, not on an independent concurrency
test — same argue-from-locking-semantics pattern this repo's other
migrations already use for similar races.
