# Cloud storage bounds + server-side JSON validation — review

Scope: close the "High: cloud storage consumption is not bounded per
account" and "Full resume structure validation is currently client-side"
gaps recorded in `docs/SECURITY_REVIEW.md`. Local, bounded task: a new
additive SQL migration plus PGlite/pgTAP tests. **Nothing in this change was
applied to any hosted Supabase project**, no UI/`main.tsx`/`model.ts` files
were touched, no packages were installed, nothing was committed, and no
secrets/network access were involved. This file is the record an independent
reviewer (Codex, or a future agent) should read before accepting the change
or applying it hosted.

## What was added

- `supabase/migrations/20260919150000_resume_storage_bounds.sql` — additive
  only. Does not alter, drop, or replace anything in
  `supabase/migrations/20260918120000_resume_storage.sql` (that file is
  byte-for-byte unchanged; verify with `git diff` before trusting this
  claim). Adds:
  - `public.resume_limit_config` — a single-row, operator-tunable table of
    caps (see below). No grant to `anon`/`authenticated` at all.
  - `public.resume_owner_limits` — per-account (not per-document) lifetime
    checkpoint count, lifetime checkpoint bytes, and a write-rate window. No
    grant to `anon`/`authenticated` at all; written only by two new
    `SECURITY DEFINER` trigger functions.
  - `resume_data_is_valid(jsonb)` and helper functions — a full field/type/
    enum/count/length validator mirroring `src/model.ts`'s `isResume()`,
    wired in as a `NOT VALID` `CHECK` constraint on `resumes.data`.
  - `resumes_enforce_owner_limits()` (`BEFORE INSERT OR UPDATE` on
    `resumes`) — rejects a write that would exceed the configured
    rate/history/byte cap, with a clear, actionable error message.
  - `resumes_track_owner_limits()` (`AFTER INSERT OR UPDATE` on `resumes`)
    — records the checkpoint the write just produced.
- `supabase/tests/resume_storage_bounds.test.sql` — 34 new pgTAP tests
  (plan 34), all passing.
- `supabase/tests/resumes_rls.test.sql` — the pre-existing 24 tests, **logic
  and assertions unchanged**; only the `data` JSON fixtures were expanded
  from a minimal `{"name":"..."}` stub to a full valid `Resume` shape, since
  the new shape constraint now rejects the old stub for any write that
  actually reaches it (see "Fixture changes" below for the precise,
  reviewable diff of what changed and why each spot needed it or didn't).
  All 24 still pass, same pass/fail expectations as before.
- `scripts/test-database.mjs` — now loads every file in
  `supabase/migrations/` in filename-sorted (chronological) order instead of
  one hard-coded path, and runs every file in `supabase/tests/` in
  filename-sorted order, aggregating pass/fail and requiring each file to
  report its own TAP plan line. `npm run test:db` is otherwise unchanged to
  run.

## Result

```
npm run test:db
```

`resume_storage_bounds.test.sql`: 34/34 pass.
`resumes_rls.test.sql`: 24/24 pass (unchanged expectations).
**58/58 total**, exit code 0. Full transcript was inspected line-by-line
this session, not just the summary — every `ok`/`not ok` line was read.

## Caps chosen, and why

All four caps live in `resume_limit_config` (one row, `id = true`), so an
operator can retune any of them with a plain `UPDATE` — no redeploy, no new
migration — and so the tests below can cheaply exercise the reject-at-cap
path by lowering a cap temporarily rather than looping thousands of times.

| Cap | Default | Reasoning |
|---|---|---|
| `max_revisions_per_owner` | 5000 lifetime checkpoints per account | Bounds worst-case row count/table growth from one abusive account. Deliberately generous for real usage — see "Unresolved / honest limitations" below for why this is a hard, non-resetting lifetime ceiling rather than a rolling one. |
| `max_revision_bytes_per_owner` | 50,000,000 bytes (50 MB), lifetime sum across all checkpoints | The dominant, cheap early cutoff against large-payload abuse: at the existing unchanged 8,000,000-byte per-row ceiling (`resumes_data_size_bounded`, from the prior migration), an abuser sending near-max-size payloads hits this cap in a handful of writes — well before the count or rate caps would ever engage. Ordinary resumes are typically well under 100 KB, so this is not reachable through legitimate use. |
| `rate_window_seconds` / `max_writes_per_window` | 60s / 240 | The app's own client debounces autosave to 350ms, so a single tab's theoretical maximum sustained save rate is ≈2.86/s (~172/min). 240/min (4/s) gives real headroom above that (including a couple of concurrent tabs/devices for the same signed-in account) while still bounding a direct-API abuser to a fixed, cheap-to-reason-about ceiling. |

Every rejection raises a `plpgsql` exception (`errcode = 'P0001'`) with a
specific, human-readable message naming the limit and pointing at
`support@resumestride.com` — this is the "clear, actionable SQL error" the
task asked for, not a generic constraint-violation code. **No UI reads or
surfaces this message yet** (out of scope — no `main.tsx`/`services/`
changes were made); today it would surface to a real user only as
Supabase's generic error text if cloud saving were enabled and someone hit
it, which is an honest gap, not a claimed feature (see below).

## Why writes are rejected, never revisions deleted

Per the task's explicit instruction, reaching a cap **rejects the next
write**; it never prunes or deletes an existing checkpoint. This is a real,
load-bearing product tradeoff, not just an implementation detail: it means
there is currently **no self-service way for an account to reduce its own
history once near a cap** — the only paths are (a) export/backup, contact
support, and have an operator manually raise that account's effective cap
(by design there is currently no per-account override, only the one global
`resume_limit_config` row — a future admin tool would need to add one), or
(b) delete the account/document entirely. This is honestly a blunt
instrument for a real production launch, and is explicitly flagged as
unresolved below rather than presented as finished.

## Concurrency safety

- **Same-account concurrent saves** (two tabs/devices) are already
  serialized by Postgres's own row locking: a second `UPDATE` targeting the
  same `resumes` row (unique per `owner_id`) blocks until the first's
  transaction commits or rolls back, so the second transaction's `BEFORE`
  triggers — including the new limit-enforcement trigger — do not even begin
  running until the first is done. `resumes_enforce_owner_limits()`
  additionally takes an explicit `SELECT ... FOR UPDATE` lock on the
  `resume_owner_limits` row as defense in depth, not as the only thing
  preventing a lost update.
- **A rejected write is atomic**: Postgres rolls back the entire failed
  statement, including any tentative change the same trigger invocation
  made. The enforcement function only performs its actual counter mutation
  (the rate-window `UPDATE`) after every check has already passed, and
  history/byte checks are pure reads — so a rejected write provably consumes
  no rate-limit budget and writes no checkpoint. Verified directly by pgTAP
  tests 7, 8, 29, and 30 (a stale write and a cap-exceeding write both leave
  every counter and every checkpoint row untouched).

## Bypass paths specifically checked (per the task's explicit callouts)

- **Delete/recreate loop.** `resume_owner_limits` is keyed by `owner_id`
  only — it is **not** a child of `resumes` (no FK to `resumes.id`, no `ON
  DELETE CASCADE` from a resume row). Deleting and recreating a resume
  document cascades away that document's own `resume_revisions` rows (existing,
  correct, unchanged behavior — a legitimate user action), but does **not**
  reset the owner-level lifetime counters, because nothing ties them to the
  document's lifecycle. Proven by pgTAP test 27: delete a resume at lifetime
  count 3, recreate it, and the new count is 4, not 1. The per-document
  `revision` counter (a different, pre-existing concept) correctly does
  reset to 1 for the new document — that's expected and fine; it's the
  abuse-prevention counter that must not reset, and doesn't.
- **Spoofed counters via a hand-crafted request.** The enforcement/tracking
  functions use `coalesce(auth.uid(), new.owner_id)`, never bare
  `new.owner_id`, to decide which account's counters to charge. This closes
  a real gap: Postgres fires multiple `BEFORE ROW` triggers in alphabetical
  order by trigger name, so the new limit-enforcement trigger would
  otherwise run *before* the prior migration's `resumes_set_revision`
  trigger (the one that actually forces `owner_id` back to the row's real
  owner on `UPDATE`). Row Level Security's own `WITH CHECK` only inspects
  the *final* row after all `BEFORE` triggers finish, so it can't see or
  block an in-between value. A hand-crafted `PATCH` request that updates the
  caller's own row (satisfying RLS's `USING` clause) while also setting
  `owner_id` to a different account's id in the request body would, without
  this fix, have the write still land correctly-owned (thanks to
  `resumes_set_revision`) while silently charging the *other* account's
  rate-limit/history bucket instead of the real caller's — letting an
  attacker write for free while corrupting a victim's counters. `auth.uid()`
  comes from the verified JWT, independent of anything in the trigger's view
  of the row, and cannot be forged without a different session. Proven by
  pgTAP tests 20–23: after such a spoofed update, the target account's
  counter is unchanged and the real caller's counter is the one that moved.
  (The `new.owner_id` fallback only matters when `auth.uid()` is null — a
  privileged/service-role/superuser write with no JWT claim, a context that
  already bypasses RLS and is not client-reachable.)

## JSON shape validation

`resume_data_is_valid(jsonb)` mirrors `src/model.ts`'s `isResume()`
field-by-field: `version`, every string field's type and length (50,000
chars for most fields, 200 for the two heading fields — matching the
client's own caps), the `template`/`paper`/`direction` enums, the `accent`
hex-color pattern, the `language` pattern, section/entry counts (≤30
sections, ≤100 entries per section), and every entry field's type/length.

Two fields are **deliberately tolerant of being absent**, per the task's
explicit instruction, mirroring `migrate()`'s defaulting behavior rather
than `isResume()`'s strict runtime shape:

- `noExperience` (added after this table's original P0-05 launch).
- `section.kind` (added in the same later session as `noExperience`).

Every other field is required and strictly typed, because every other field
predates cloud storage, so any row this constraint will ever validate (once
validated — see "Hosted data" below) was written by a client new enough to
always include them.

**A real correctness bug was found and fixed while writing this**:
`jsonb_array_length`/`jsonb_array_elements` raise a hard Postgres error on
non-array input (unlike `->`/`->>`, which are null-safe for any input
shape), and — contrary to what the pattern superficially looks like — plain
SQL `AND`/`OR` is **not** guaranteed to short-circuit left-to-right in
Postgres (the documentation explicitly says so, under "Expression Evaluation
Rules", and recommends `CASE` where evaluation order actually matters). A
naive `jsonb_typeof(x)='array' and jsonb_array_length(x)<=30` could still
evaluate the right-hand side even when `x` isn't an array, turning a
malformed `sections`/`entries` field (e.g. a client sending a string there
instead) into an uncaught internal error instead of the intended clean,
catchable `23514` check-violation. Every array-length/array-elements
operation is inside a `CASE WHEN` branch (which *is* guaranteed to
short-circuit) instead. Covered by pgTAP test 12 (`sections` set to a JSON
string, not an array — asserts a clean `23514`, not a crash).

### Hosted data — inspect before validating, do not apply blind

The `resumes_data_shape_valid` constraint is added with `NOT VALID`: it is
enforced on every new write from the moment it's applied, but existing rows
are **not** scanned. This migration has **not** been applied to any hosted
project by this work. Before it ever is, per the task's explicit
instruction not to perform destructive cleanup or validate against unseen
hosted data:

1. Run, against the real hosted table, before applying anything:
   `select id, owner_id from public.resumes where not public.resume_data_is_valid(data);`
   Per `HANDOFF.md`, the original storage migration *was* applied to the
   hosted project on 2026-09-18 via the SQL Editor, but the public
   deployment has always shipped with empty `VITE_SUPABASE_*` build
   overrides (cloud inert in production), so there is a real chance this
   query returns zero rows — but that must be confirmed, not assumed, by
   whoever applies this migration hosted.
2. Resolve or consciously accept whatever it finds (there is no
   auto-migration path for old rows in this change — writing one, if
   needed, is separate future work).
3. Only then run, as a deliberate separate step:
   `alter table public.resumes validate constraint resumes_data_shape_valid;`

None of steps 1–3 were performed by this session.

## Fixture changes to `resumes_rls.test.sql` (24 pre-existing tests)

The new shape constraint applies to *every* new write, not just ones this
migration's own test file makes, so the pre-existing tests' minimal
`{"name":"A"}`-style `data` fixtures started failing on writes that
otherwise pass RLS (own-account inserts/updates) — 12 of the 24 tests
initially broke this way when the bounds migration was added, purely from
now-invalid fixture *shape*, with zero change to any test's logic or
expected result. Every such fixture was expanded to a full, valid `Resume`
JSON object (only the `name` field varies meaningfully; every other field is
filler needed to satisfy the shape constraint). Writes expected to fail for
reasons unrelated to shape (RLS ownership denial, `resume_revisions`' fully
revoked grant, a stale/zero-row-matching `WHERE` clause) did not strictly
need the change — those either never reach the `CHECK` at all, or the test
already asserted the relevant non-shape error code before the row-shape
constraint would matter — but most were normalized anyway for consistency
and to avoid relying on evaluation-order assumptions. **No assertion,
expected error code, or test description was changed** — `git diff
supabase/tests/resumes_rls.test.sql` is the exact, reviewable proof of this;
every changed line is a `data`/`set data =` JSON literal only.

## What this does NOT do (explicitly out of scope, read before relying on this)

- **Not applied to any hosted Supabase project.** Applying it requires the
  hosted-data inspection above as a separate, deliberate step.
- **No UI/client changes.** The clear SQL error messages this migration
  raises are not surfaced anywhere in `src/` — a real user hitting one today
  (if cloud saving were enabled) would see whatever generic error handling
  `useCloudResume.ts`/`services/resumes.ts` already has for an unexpected
  Postgres error, not the friendly cap-specific text. Wiring that up is
  separate future work.
- **No per-account override / no self-service history reduction.** One
  global config row, no per-account exceptions, and reaching the history/byte
  cap has no in-app remedy other than contacting support for a manual
  operator change — an honest limitation, not a placeholder for something
  secretly better.
- **No id-uniqueness enforcement server-side.** `src/model.ts`'s `isResume()`
  also requires every section/entry `id` to be unique across the whole
  document; `resume_data_is_valid` does not replicate that specific check
  (it was judged a data-integrity nicety, not one of the caps/shape
  properties this task named — fields/types/enums/count/byte limits — and
  adding it would have meant a stateful, more expensive validator). Flagging
  this explicitly rather than silently omitting it.
- **No real hosted/concurrent-load test.** All concurrency reasoning above
  is argued from Postgres's documented row-locking semantics and verified
  against PGlite's single-connection simulation (sequential `set local role`
  switches, matching this codebase's existing testing pattern) — there is no
  true multi-connection concurrent-write test here, hosted or otherwise, and
  the task's own scope excluded any hosted/network activity.
- **Rate-limit window is wall-clock, single-tier.** One fixed 60-second
  sliding-ish window (it resets fully rather than truly sliding) with one
  fixed per-window cap; there is no separate longer-horizon rate limit (e.g.
  a daily cap distinct from the per-minute one). For the threat this closes
  (a direct-API script hammering the endpoint), the byte-aggregate cap in
  practice becomes the binding constraint far sooner than the rate window
  would for any large-payload abuse; the rate window mainly bounds
  many-small-writes churn. This is a reasonable but not exhaustively
  hardened design — flagged honestly rather than claimed complete.

## Reproduction

```
npm run test:db
```

Exact commands to (separately, later, deliberately) verify against a real
Supabase project are the same ones already documented in
`supabase/tests/resumes_rls.test.sql`'s header (`supabase start` → `supabase
db reset` → `supabase test db`), now covering this file too since it's
picked up by the same `supabase/tests/*.test.sql` convention.

## Acceptance checklist for independent review

- [ ] Confirm `supabase/migrations/20260918120000_resume_storage.sql` is
      byte-for-byte unchanged (`git diff` against the prior commit).
- [ ] Re-run `npm run test:db` independently; confirm 58/58 and exit code 0.
- [ ] Read `supabase/migrations/20260919150000_resume_storage_bounds.sql`
      end to end, in particular the `coalesce(auth.uid(), new.owner_id)`
      reasoning and the `CASE WHEN` guards around every
      `jsonb_array_length`/`jsonb_array_elements` call.
- [ ] Confirm no file under `src/` changed
      (`git status`/`git diff -- src` should be empty from this session).
- [ ] Decide whether the chosen caps (5000 revisions / 50 MB / 240 writes
      per 60s) are the right numbers for actual launch, or should be tuned
      before hosted application — they are configurable via
      `resume_limit_config` without a new migration either way.
- [ ] Before ever applying this hosted: run the hosted-data inspection query
      in "Hosted data" above and decide how to handle any non-conforming
      rows it finds; do not run `VALIDATE CONSTRAINT` blind.

## Independent Codex review — September 19, 12:36 UTC

Baseline reproduced58/58. Four new regression cases FAILED before correction: missing required string, missing enum, missing section title, null section kind were accepted. SQL bool_and ignores null, and CHECK accepts null; passing ordinary enum/type cases did not cover this bypass. Corrected the not-yet-applied additive migration to coalesce per-field/per-child predicates to false and require the final CHECK expression IS TRUE. Original applied migration untouched. Four rejection regressions retained (62 total).

Not yet launch-approved. Additional findings: existing hosted revision histories are not seeded into new owner counters, so preexisting storage is not charged; hosted inspection/backfill strategy needed. Server ID uniqueness and some client/server Unicode length semantics differ. Lifetime rejection has no support/self-service recovery UI, and autosave does not yet distinguish permanent cap errors from transient failures. True concurrent connection tests, hosted identity tests and rate/config operational tuning remain pending. Do not apply hosted solely because local tests pass.

## Historical accounting — September 19, 13:07 UTC

Added LOCAL-only20260919160000_resume_history_accounting.sql. It locks resume/history/counter tables in one transaction, aggregates retained history counts and JSON bytes by owner, and raises counters with GREATEST instead of resetting them. Existing document/history rows are not deleted or rewritten. Accounts already over a cap will be unable to save until operator remediation; cap-specific UI is still pending. Deleted history from before counter tracking cannot be reconstructed, so this bounds retained preexisting data plus tracked writes, not an unverifiable total since account creation.

Database harness now seeds a legacy resume and two checkpoints BEFORE bounds migration, verifies post-migration count and exact bytes, then deletes document and reruns reconciliation to verify retained counters do not reset. This also confirms NOT VALID accepts old malformed stored rows without claiming they conform. Hosted rollout requires inspection, a maintenance/lock timeout plan and reconciliation of migration history; nothing applied hosted.

## September 19, 13:39 UTC — permanent cloud storage errors
Codex added permanent history/storage-cap handling to all cloud write error paths. A recognized P0001 cap pauses automatic saves, preserves editor content, explains that edits are unsaved, and exposes JSON backup and explicit retry controls. Transient errors retain existing backoff. Account transitions reset the blocked state. No active Claude was found; no duplicate job started.

Verification: `npm run build` passed (existing bundle-size warning); `npm run test:auth` passed **19/19** in 28.7s (exec91679). New regression proves linked autosave stops retrying after a cap, newer edits remain exportable, and explicit retry sends another write. Initial compile caught missing API type properties; corrected before successful build. These are mocked-account tests, not hosted security certification. Create/consent and conflict recovery need targeted retry-path tests; the retry control clears the block, and those flows may still require their original save/resolve action. Database migrations remain unapplied hosted. Public cloud remains disabled; no deployment, video creation or publishing.


## September 19, 14:14 UTC — remaining storage-cap recovery tests
Added three mocked-account regressions for first-create cap recovery, conflicting existing-row recovery, and deleted-row recreation recovery. All use newer editor text after the cap; conflict tests verify a blocked resolution click issues no write. Existing behavior passed without source changes: clearing the block reoffers first-save consent; conflicts retain the explicit keep/recreate action before saving. Targeted first-save check passed1/1; full `npm run test:auth` exec31667 passed **22/22 in33.1s**. Only tests/docs changed this session, so no duplicate app build. This closes the targeted retry-path coverage gap, not hosted security/concurrency gates.

Process inspection found Claude PID73004 open in this repository (15+hours, S+); another PID72437 belongs to pet-profile. No evidence of task completion or active editing was inferred from process presence; no new Claude job dispatched. Public cloud stays disabled, no hosted migration/deployment/publishing. Remaining priorities: server ID uniqueness and hosted isolation/concurrency/recovery, navigation skipping, installed-extension smoke test, production integrations.


## September 19, 14:47 UTC — server document ID uniqueness
Added global section/entry ID uniqueness to the unapplied storage-bounds migration, matching client isResume's shared namespace. Nested array expansion is guarded for malformed entries. Three rejection regressions exposed acceptance before correction: duplicate section IDs, duplicate entries across sections, and entry/section collisions. Unique Unicode IDs remain accepted (fourth new regression). Final local test: **66/66 pgTAP plus3 historical-accounting assertions passed**; log /tmp/resumestride-db-id-review.log. Only migration/tests/docs changed; no frontend build needed. Original hosted migration untouched, nothing applied hosted. Existing legacy rows remain NOT VALID and require inspection before rollout. True concurrency, hosted account isolation/recovery and Unicode length parity remain separate gates.

Claude processes still present (including previously identified repo PID73004); no new job dispatched or completion inferred. Public accounts remain disabled. Next local priorities include forward-navigation bypasses and installed-extension verification; production integrations and release authorization remain outstanding.
