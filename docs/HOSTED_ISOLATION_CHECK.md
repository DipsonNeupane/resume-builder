# Hosted Supabase Auth/PostgREST two-account isolation check

`scripts/check-hosted-isolation.mjs` is an acceptance harness that exercises
`public.resumes` / `public.resume_revisions` (see
`supabase/migrations/20260918120000_resume_storage.sql` and
`supabase/migrations/20260919150000_resume_storage_bounds.sql`) against a
REAL hosted Supabase project, through real Auth/PostgREST HTTP calls — the
one thing the local pgTAP suite (`supabase/tests/resumes_rls.test.sql`, run
via `npm run test:db`) cannot exercise, since that suite runs entirely inside
one in-process Postgres with a simulated `auth.uid()`, never a real issued
session token or a real PostgREST request. It does not replace that suite.

## Safety

This script refuses to run against anything other than the recovery
project's exact HTTPS origin `https://ntrqseoiwyrvdsobwxaj.supabase.co` —
checked before any network call, both in the CLI entrypoint and inside the
exported `runIsolationChecks()` itself (so a caller that imports and invokes
the function directly, bypassing `main()`, gets the same protection). The
check requires an exact origin match (protocol + hostname, default port
only) with no embedded credentials, no non-default port, no path, no query
string, and no fragment — a URL like
`https://ntrqseoiwyrvdsobwxaj.supabase.co/anything` or
`https://user:pass@ntrqseoiwyrvdsobwxaj.supabase.co` is refused just like a
different hostname would be. This is a fixed guard, not configurable by an
env var, specifically so a wrong or stale `HOSTED_ISOLATION_SUPABASE_URL`
can never point it at production.

It never creates a user, never reads a secret from disk or config, and never
accepts a service-role/admin key. `HOSTED_ISOLATION_USER_A_TOKEN` and
`HOSTED_ISOLATION_USER_B_TOKEN` are decoded (without signature verification
— this script holds no key to verify with) to check the JWT `role` claim: a
run is refused before any network call unless both tokens are `authenticated`
role. A `service_role` token, an admin key, or a non-JWT string in either
token slot is rejected outright.
`HOSTED_ISOLATION_SUPABASE_ANON_KEY` is allowed to be either a legacy
(JWT-shaped) anon key or a newer non-JWT public/publishable key — it is not
required to decode as a JWT — but if it does decode as a JWT with
`role: service_role`, the run is refused the same way.

## Inputs (environment variables only)

| Variable | What it is |
| --- | --- |
| `HOSTED_ISOLATION_SUPABASE_URL` | The recovery project's API URL, e.g. `https://ntrqseoiwyrvdsobwxaj.supabase.co` |
| `HOSTED_ISOLATION_SUPABASE_ANON_KEY` | That project's public/publishable key (never a service-role key) |
| `HOSTED_ISOLATION_USER_A_TOKEN` | An already-issued access token for test account A |
| `HOSTED_ISOLATION_USER_B_TOKEN` | An already-issued access token for test account B (must be a different account than A) |

Obtaining those two tokens (e.g. by signing in as two real or disposable test
accounts in that project and copying their session access tokens) is outside
this script's scope by design — it only ever consumes tokens it's handed, it
never mints them.

## Running it

```
HOSTED_ISOLATION_SUPABASE_URL=https://ntrqseoiwyrvdsobwxaj.supabase.co \
HOSTED_ISOLATION_SUPABASE_ANON_KEY=... \
HOSTED_ISOLATION_USER_A_TOKEN=... \
HOSTED_ISOLATION_USER_B_TOKEN=... \
npm run check:hosted-isolation
```

Exit code is `0` when every check passes, `1` otherwise (including missing
env vars or a project-ref mismatch). Output never prints a token, a user id
in full, or fixture resume content — only check names, pass/fail, and HTTP
status codes.

## What it checks, in order

1. **`tokens-are-authenticated-role`** — both `HOSTED_ISOLATION_USER_A_TOKEN`
   and `HOSTED_ISOLATION_USER_B_TOKEN` decode as JWTs with `role:
   "authenticated"`. Checked before any network call; a service-role token,
   an admin key, or a non-JWT string fails this immediately.
2. **`distinct-test-accounts`** — the two tokens resolve (via
   `GET /auth/v1/user`) to two different account ids.
3. **`forged-owner-insert-rejected`** — account B cannot create a resume row
   with `owner_id` set to account A's id (attempted first, before account A
   has any row of its own, so a broken policy can't hide behind the
   `resumes_owner_unique` constraint instead of actually being exercised).
   Requires the specific rejection PostgREST/Postgres actually produce for a
   `WITH CHECK` violation: HTTP `403` with Postgres error code `42501`
   (`insufficient_privilege`) — not merely "the response wasn't ok", which a
   500 or a dropped connection would also satisfy.
4. **`owner-creates-own`** — account A creates its own resume (a fictional
   fixture matching `src/model.ts`'s `Resume` shape and the
   `resume_data_is_valid` SQL constraint; see `buildFixtureResume` in the
   script). Requires HTTP `201`.
5. **`owner-reads-own`** — account A can read the row it just created.
6. **`owner-update-bumps-revision`** — account A updates its resume and the
   server-maintained `revision` counter advances (trigger-controlled, per
   `resumes_set_revision`).
7. **`owner-checkpoint-recorded`** — both the original and updated revisions
   exist as immutable checkpoints in `resume_revisions`.
8. **`other-account-cannot-read`** — account B's `SELECT` for that row
   returns HTTP `200` with an empty array. RLS silently filters the row out
   of B's view; it does not raise an error, so this check requires the exact
   200-plus-empty-array shape rather than merely "no rows in the parsed
   body" — a 500 or an unparseable error body must never be read as
   "denied".
9. **`other-account-cannot-update`** / **`update-attempt-did-not-mutate-row`**
   — account B's `UPDATE` matches zero rows (same HTTP `200` + empty-array
   requirement as check 8), and account A's row is confirmed unchanged
   afterward.
10. **`other-account-cannot-delete`** / **`delete-attempt-did-not-remove-row`**
    — same, for `DELETE`.
11. **`anon-cannot-read`** — a request with no `Authorization` header at all
    (only the `apikey` header) cannot read the row. This deliberately never
    puts `HOSTED_ISOLATION_SUPABASE_ANON_KEY` in the `Authorization: Bearer`
    header: newer publishable keys are not JWTs, so doing that would fail
    auth for the wrong reason instead of exercising anonymous RLS.
12. **`invalid-shape-rejected`** / **`invalid-shape-attempt-did-not-mutate-row`**
    — a direct API write with a malformed `data` shape (an invalid
    `template` value) is rejected by the `resumes_data_shape_valid` check
    constraint (HTTP `400`, Postgres error code `23514`,
    `check_violation` — not merely "the response wasn't ok"), and the
    stored row is confirmed unchanged.
13. **`cleanup-fixture-removed`** — always attempted, even if an earlier
    check fails or throws (see "Cleanup guarantee" below for exactly what
    counts as passing).

If `HOSTED_ISOLATION_SUPABASE_ANON_KEY` happens to decode as a JWT with
`role: "service_role"`, an additional `apikey-is-not-privileged` check is
reported (failing, before any network call) instead of the sequence above.

## Cleanup guarantee

The only row(s) ever deleted are the id(s) this specific run itself created:
the one legitimate fixture from check 4, plus (only if a broken policy let
check 3's forged insert actually succeed) that residue row too — deleted
using account A's own token, since RLS lets an owner delete only their own
row regardless of who inserted it. Nothing is deleted by a broader
owner-scoped or table-wide query. `resume_revisions` rows for that resume
are removed automatically via `ON DELETE CASCADE`.

`cleanup-fixture-removed` requires more than an HTTP `200`: the delete
response's own returned ids must exactly match the set of ids this run meant
to remove (same count, same ids) — a `200` with a partial or empty result
set is reported as a failed cleanup, not a pass. Because the overall `ok`
result is computed only after cleanup finishes (not from an early `return`
inside the check sequence), a failed cleanup — or an unexpected thrown error
during the checks themselves, reported as a failing `unexpected-error` check
— always flips the run's overall result to failed, even if every acceptance
check before it passed.

`resume_owner_limits` (the abuse-prevention counters in
`supabase/migrations/20260919150000_resume_storage_bounds.sql`) for account A
are **not** reset by this cleanup — by the app's own existing design, those
counters deliberately survive a delete/recreate of a resume (see that
migration's own comments and `docs/CLOUD_LIMITS_REVIEW.md`). A nonzero
lifetime counter left on account A after running this script is expected
behavior, not a leftover fixture.

## Testing the harness itself

`tests/server/check-hosted-isolation.test.ts` exercises the script's own
logic — the URL/token guards, request sequencing, pass/fail detection, and
cleanup — against a deterministic mocked `fetch`, with no network access and
no hosted project involved. Run it with `npm run test:server`. It includes
regression cases for: a non-recovery/malformed origin (rejected before any
fetch call, including embedded credentials, a non-default port, a path, a
query string, and a fragment); a service-role token or a non-JWT token in
either user-token slot (rejected before any fetch call); a service-role
`apikey`; a broken policy that would let account B read account A's data; a
forged-owner insert that returns `200`/no error code (must not be read as
rejected) and one that succeeds outright (both reported as a failed
`forged-owner-insert-rejected`, with cleanup still running for the succeeding
case); an unexpected `500` on a denial check (must fail the check instead of
being read as an empty-array pass); a cleanup response that returns `200`
but doesn't actually report the expected id as removed (must fail
`cleanup-fixture-removed` and flip the overall result even though every
acceptance check passed); and a fixture-creation failure correctly skipping
(not throwing on) every dependent check.
