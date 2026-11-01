# Latest Claude response — staging execution plan for review (2026-10-28)

Nothing has been pushed or deployed. No resources were created, no remote migration was run, and no
billing, provider or production setting was changed. The only remote actions in this pass were the
read-only Vercel listings described in §3 (`vercel whoami`, `vercel env ls` for names and scopes
only, `vercel project ls`, `vercel ls`, `vercel inspect`).

## 1. Checkpoint commit and worktree status

| Item | Value |
|---|---|
| Worktree | `/Users/dipson/ResumeStride/.claude/worktrees/apwico-launch` |
| Branch | `feat/apwico-launch-tracker` (local only, not pushed) |
| Checkpoint commit | **`9bdc44f97442eda8c0fae32236f85c0cf9e89596`** (`9bdc44f`), "feat: APWICO launch tracker, support-checked tailoring and review package" |
| Parent | `1a883b6` |
| Size | 204 files changed, 8,508 insertions, 910 deletions |
| Worktree status after the commit | clean except `?? docs/launch-review.zip` and this response file |
| `docs/launch-review.zip` | Appears to be the owner's Finder archive (has `__MACOSX` entries, created 11:25 local). Not committed, not modified, not deleted. |
| Main checkout | `/Users/dipson/ResumeStride`, `feature/premium-template-library` at `16e03e3`, 51 status entries — unchanged |
| Other worktrees | not touched |

Before committing I checked the staged diff: a pattern scan for Stripe, OpenAI, Supabase/JWT,
Resend, webhook, private-key, Postgres-URL and Vercel OIDC secrets found nothing. No `.env`,
`.vercel`, log, zip, scratch, `node_modules`, Playwright output or `graphify-out` file was staged.
The only `vercel.json` change in the commit is an earlier `/workspace` route rewrite; it is not a
CSP change.

This file (`docs/launch-review/latest-claude-response.md`) is new and uncommitted.

## 2. What changed since the previous report

### Provenance of accepted suggestions (request 1)

- New migration `supabase/migrations/20261028100000_tailoring_provenance_ai_safeguards.sql` adds
  `job_resume_versions.provenance` (a JSON array, `[]` by default, at most 60 entries and
  200,000 bytes). It lives in the existing table, which the browser cannot read directly.
- The four-argument `job_resume_version_update` is replaced by a five-argument version.
  `p_provenance` defaults to `null`, which keeps the stored record. `job_resume_version_reset`
  clears the record.
- `job_application_documents.provenance` is copied at export, but only when the exported snapshot
  is exactly the stored version. Otherwise it is `null`, meaning "not recorded". The immutability
  trigger covers it, and `applications_document_get` returns it.
- `src/lib/tailoringProvenance.ts` is shared by server and browser. It holds a strict validator,
  the state check against a resume (`current` / `edited` / `removed`), and size bounding.
- `src/features/tailoring/ProvenanceList.tsx` displays the record. The tailoring panel records an
  entry on accept and removes it on undo, and `main.tsx` saves the record with each version
  update. The kept-version view reads the record against the kept snapshot.
- Origins recorded:
  - `ai` — the AI wording as proposed;
  - `user` — the person's own wording, stored alongside the AI wording it replaced;
  - `ai_with_user_fact` — the AI wording, with the fact the person added.

  Each entry also keeps the requirement references and the resume quotes it was checked against.
- Limitation: this is the person's own review record, submitted by their signed-in browser. It is
  not a tamper-proof audit and never shows that any wording is true.

### AI budget and failure handling (request 2)

- **Budget setting:** `product_settings.ai_monthly_budget_micro_usd` defaults to `25000000` and is
  checked to stay between 0 and 25000000. `reserve_ai_budget` reads it. The table check on
  `ai_budget_months` still caps every month at US$25.
- **Hourly allowance:** the 20 requests per hour count only requests that are reserved, in
  progress or succeeded. A separate 60-attempts-per-hour guard counts every attempt.
- **Retries** (`begin_ai_request`):
  - a request that failed or was invalid can be retried immediately;
  - one that timed out or ended uncertainly returns `cooldown` for 10 minutes.
- **Trial runs:**
  - `product_reserve_trial_run` reserves a run before the provider call, and
    `product_release_trial_run` releases it if the call fails;
  - a reservation stops counting after 5 minutes;
  - `product_trial_status` counts succeeded runs plus live reservations.
- **Bug fixed:** simultaneous Free-trial requests could each pass the "runs remaining" check and
  together record more than three runs.
- **Messages** (`api/tailor.ts`):
  - budget reached (503): "AI suggestions are paused for all accounts until the monthly AI budget
    resets on {date} (UTC). This request did not use your trial or hourly AI allowance. You can
    still edit this resume yourself."
  - hourly limit (429): states the limit of 20 per hour and that failed requests are not counted;
  - attempt limit (429);
  - cooldown (409);
  - trial exhausted (402);
  - provider failures now add "This failed request did not use your trial or hourly AI allowance."
- No substitute output is ever returned. Live spending limits were not changed, and the AI
  provider's own spend limit is separate and untouched.

### Tests added or extended

- `supabase/tests/tailoring_provenance_ai_safeguards.test.sql` — 34 assertions.
- `tests/server/tailoring-provenance-ai.test.ts` — 5 tests through the real handlers on PGlite:
  validation; save, reload and edit; a stale-tab conflict; export and kept record; reset; failure
  without consumption, then retry; cooldown; the allowance ignoring failures; exhaustion, its
  message and recovery; simultaneous trial and budget races.
- Journey A (`tests/paid/journeys.spec.ts`): the stored and kept record; reload; a later edit shows
  "Edited by you since" while the kept view stays "In this version".
- `tests/paid/jobs.spec.ts`:
  - the fact-supported origin and the person's-own-wording origin are both saved;
  - undo removes the undone suggestion's record;
  - the budget-paused message is shown with no suggestions, and the retry recovers.
- `tests/server/launch-facts.test.ts` matches the new allowance rule and the budget default.
- `scripts/test-database-concurrency.mjs` gained two real-PostgreSQL races:
  - four reservations against a lowered US$2 budget;
  - four simultaneous trial reservations with three allowed.

  Neither could be run here (§4).

### Staging review and packaging (requests 4–6)

- `docs/launch-review/STAGING.md` was rewritten. It now has:
  - targets;
  - Phases A–D;
  - the commands that can reach production;
  - expected results;
  - live checks L1–L15;
  - rollback;
  - migration notes.
- New `supabase/checks/catalog_fingerprint.sql`: a read-only, schema-only fingerprint (no rows,
  no identifiers).
- `tracker_rehearsal_before.sql` and `_after.sql` no longer read a migration ledger, because
  production has none. They report catalog markers for the launch objects instead. The after-check
  also reports:
  - `ai_monthly_budget_micro_usd`;
  - `versions_without_provenance`;
  - `trial_runs_reserved`;
  - `old_update_signature`.
- Local Vercel packaging was run and passed (§4).
- `README.md` §0, `docs/apwico-implementation-progress.md` and `HANDOFF.md` were updated, and
  `graphify update .` was run.

## 3. Staging targets — identifiers and verification status

None of these was created or changed. **None is confirmed as a staging target; owner confirmation
is required.**

| Role | Identifier | How it was identified / verified |
|---|---|---|
| **Production database — never a staging target** | Supabase `ggwwzwqykkncgupdimxp` | In the `vercel.json` CSP, `docs/EXTERNAL_SETUP_STATUS.md`, `scripts/validate-task63-cloud.mjs`, and the public `VITE_SUPABASE_URL` host in the main checkout's `.env.local` (only variable names and that public host were read). Its migration state was last recorded on 2026-09-25 (`docs/PRODUCTION_CATALOG_RECONCILIATION_2026-09-25.md`); **not re-checked**. |
| Staging database, **candidate A** | Supabase `ntrqseoiwyrvdsobwxaj` ("ResumeStride Recovery Drill") | From `HANDOFF.md`, `docs/OWNER_LAUNCH_TODO.md` and `scripts/check-hosted-isolation.mjs` (which allows only this project). Restore created 2026-09-20 03:48 UTC; migrations 1–15 applied by SQL editor; one retained fictional canary. **Current state unverified.** |
| Staging database, **candidate B** | none — a new project, e.g. `apwico-staging` | Would require creating a resource, possibly with a paid compute add-on. Not created. |
| Production web project | Vercel `dipsons-projects/resumestride`, project `prj_W7PZMjcFj5LnmPtZ2x9QGwIkP6tC`, team `team_5diMdtyzJJlmwjNvMzL2BMN1` | Read-only `vercel env ls`: **29 variables, all Production-scoped, 0 Preview.** The main checkout's `.vercel/project.json` links to it. |
| Current production deployment (rollback reference) | `dpl_3Qvdo3Dd9XPuYVrBw9Y3AQzN8QVN`, `https://resumestride-7uhzqkegd-dipsons-projects.vercel.app`, created 2026-10-14 02:03 UTC | Read-only `vercel ls` and `vercel inspect`. Its source commit was not determined. |
| Staging web, **option 1 (recommended)** | a new Vercel project, e.g. `apwico-staging` | Not created. It removes any chance of a staging command touching `resumestride`. |
| Staging web, **option 2** | Preview scope of `resumestride` | Would add Preview-scoped variables to the production project's settings. Not done. |
| Billing | Stripe sandbox `acct_1QqPbG7sBbdVbWSQ`, test-mode keys only | From `docs/EXTERNAL_SETUP_STATUS.md`. **Not checked this session.** |
| Other Vercel projects | `project-kdi8e`, `project-7fs0r`, `spendpulse-mvp` | Listed only; not inspected; not used |

Local tooling:
- Vercel CLI 59.23.2, signed in.
- `psql` 18 at `/usr/local/opt/libpq/bin/psql`, not on `PATH`.
- Stripe CLI at `/usr/local/bin/stripe`.
- **Supabase CLI not installed.**
- **No PostgreSQL server binaries.**

## 4. Test and packaging results

Full suite run on 2026-10-28, 17:07–17:13 UTC; the rehearsal was re-run at 17:40 UTC after the
check files changed. Complete logs are in `docs/launch-review/test-results/`.

| Check | Result |
|---|---|
| Build | PASS |
| Server typecheck | PASS |
| Server tests | **522/522 pass** |
| Database tests (all migrations, then the contract step and every test again) | **801 ok, 0 not ok** |
| SEO | 30/30 pass |
| Performance budgets | PASS |
| Brand check | PASS |
| Migration rehearsal (39 files, fictional rows) | PASS — markers false before and true after; 0 disagreements; 0 closed rows without a reason; 0 browser grants; 100 / 1 / 3; budget 25000000; 0 versions without provenance; 0 reservations left; old signature 0 |
| Default browser suite | 115/115 pass |
| Auth browser suite | 42/42 pass |
| Paid browser suite (journeys A–E included) | 98/98 pass |
| `vercel build --standalone` + `prepare-vercel-output.mjs` | PASS, offline. It used a copy of `project.json` (settings only, no environment values pulled) and deployed nothing; the temporary `.vercel` link was removed from the worktree afterwards. Logged in `12-vercel-standalone-build.txt`. |
| `check-packaged-functions.mjs` | PASS, offline load check: every handler loads and fails closed, and the PDF and DOCX renderers resolve. Hosted execution unverified. Logged in `13-packaged-functions.txt`. |
| `npm run test:db:concurrency` (real PostgreSQL) | **NOT RUN** — no PostgreSQL server binaries. I tried fetching the PostgreSQL 17 Homebrew package without installing it; it needs `icu4c@79`, `openssl@4`, `krb5` and `json-c`, which are not installed. |

PGlite runs one query at a time. The server-level simultaneity tests therefore exercise the race
between application steps, not PostgreSQL row locks; the real-PostgreSQL harness covers those.

New screenshots in `docs/launch-review/screenshots/`, all inspected:
- `a12-kept-provenance.png`;
- `a13-version-provenance-edited.png`;
- `t2-ai-budget-paused.png`;
- a refreshed `t1-unsupported-review.png`.

The samples in `samples/` were regenerated from this run.

## 5. Staging commands, dependencies and expected results

Placeholders, never committed: `STAGING_REF`, `STAGING_DB_URL` (direct connection to staging
only), `PROD_DB_URL` (a read-only role is preferred), `PREVIEW_URL`. Here, `psql` means
`/usr/local/opt/libpq/bin/psql`.

### Phase A — local preparation (no network)

| # | Step | Status |
|---|---|---|
| A1 | Checkpoint commit `9bdc44f` is the rehearsed revision | done |
| A2 | Full local suite | done (§4) |
| A3 | Vercel packaging check | done (§4) |
| A4 | Migration rehearsal | done (§4) |
| A5 | `PGBIN=<postgresql-17>/bin npm run test:db:concurrency` — expected: every line `PASS` | **not run**; needs PostgreSQL 17 installed locally |
| A6 | Staging-only CSP: a throwaway copy of `vercel.json` with `connect-src 'self' https://$STAGING_REF.supabase.co`. Never committed to the checkpoint branch. | after targets are confirmed |
| A7 | Supabase CLI install | optional; this plan uses only `psql` |

### Phase B — read-only remote checks

| # | Command | Target | Expected |
|---|---|---|---|
| B1 | `vercel env ls` (names and scopes) | Vercel `resumestride` | done: 29 Production-scoped, 0 Preview |
| B2 | `psql "$STAGING_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -f supabase/checks/catalog_fingerprint.sql > staging-fp.txt` | staging | file produced; `migration_ledger` line recorded |
| B3 | the same command with `PROD_DB_URL` (or the file pasted into the production SQL editor, read-only) → `prod-fp.txt` | **production, read-only, schema only** | `migration_ledger\|absent`; catalog matches migrations 1–15 with the two recorded drifts |
| B4 | `diff prod-fp.txt staging-fp.txt` | local | no difference. If they differ, first bring staging to production's exact state. |
| B5 | `psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/checks/hosted_preflight.sql > preflight.txt` | staging | recorded for comparison |
| B6 | Stripe dashboard (test mode): the sandbox account and test price IDs exist | Stripe test | IDs recorded |

### Phase C — staging changes (only after targets are confirmed)

| # | Command / action | Expected |
|---|---|---|
| C1 | Back up staging: dashboard backup, or `pg_dump "$STAGING_DB_URL" -Fc -f staging-before.dump`, stored outside the repository | dump file non-empty |
| C2 | Seed fictional rows: fictional sign-ups, and a saved job each where the schema allows | rows exist |
| C3 | `for f in $(ls supabase/migrations/*.sql \| sed -n '16,33p'); do psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$f" \|\| break; done` | no `ERROR`; the last file applied is `20261013160000_v2_allowance_override.sql`; on an error the loop stops with that file rolled back. None of the 24 pending files opens its own transaction. |
| C3b | `psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/checks/tracker_rehearsal_before.sql > before.txt` | all four markers `f`; workflow and history counts recorded |
| C3c | the C3 loop with `sed -n '34,39p'` | no `ERROR`; the last file is `20261028100000_tailoring_provenance_ai_safeguards.sql` |
| C3d | no migration ledger is created on either database; whether production gets one is a separate owner decision | — |
| C4 | Web target: option 1 or option 2 from §3. All variables are scoped to staging or preview only; see the list below the table. | Production variable list unchanged |
| C5 | Staging Supabase Auth: Site URL and redirect URLs set to `PREVIEW_URL` | saved |
| C6 | Stripe **test mode**: webhook endpoint `PREVIEW_URL/api/stripe-webhook` | endpoint shows test mode |
| C7 | From a directory linked to the staging project: `vercel build --standalone`, then `node scripts/prepare-vercel-output.mjs`, then `vercel deploy --prebuilt` — **never `--prod`** | a `…vercel.app` URL, not aliased to any production domain |
| C8 | Optional, staging only: `update public.product_settings set ai_monthly_budget_micro_usd = 1 where id;`, later restored to `25000000` | see L15 |

Environment and configuration dependencies for C4. These are names only; staging or test values,
never production values:

- **Database (staging values):** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **App:** `APP_ORIGIN=$PREVIEW_URL`.
- **Feature flags:**
  - `EXPORTS_ENABLED`, `AI_ENABLED`;
  - `VITE_PAID_FEATURES_UI_ENABLED`, `VITE_BILLING_UI_ENABLED`;
  - `BILLING_ENABLED`, `RECURRING_BILLING_ENABLED`, `BILLING_RECURRING_ENABLED`;
  - `SUBSCRIPTION_OFFERS_ENABLED`.
- **Providers:**
  - `OPENAI_API_KEY` — a key with its own provider spend limit;
  - `TECHMAP_API_KEY`.
- **Stripe (test mode):**
  - `STRIPE_MODE=test`;
  - `STRIPE_SECRET_KEY=sk_test_…`;
  - `STRIPE_WEBHOOK_SECRET` from the test endpoint;
  - `STRIPE_ACCOUNT_ID`;
  - test price IDs: `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_RECURRING_PRICE_ID`,
    `STRIPE_PASS_PRICE_ID`, `STRIPE_TEMPLATE_PRICE_MAP`.
- **Reminder email:** `RESEND_API_KEY`, `BILLING_EMAIL_FROM`, `CRON_SECRET`.
- **Security policy:** the staging-only CSP from A6.

Vercel does not run cron jobs on preview deployments, so L12 triggers the reminder dispatch by hand.

### Expected results after C3c (read-only)

Command: `psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/checks/tracker_rehearsal_after.sql > after.txt`

| Output | Expected |
|---|---|
| `tracker_120000`, `trial_140000`, `requirement_edits_150000`, `provenance_281000` | all `t` |
| `stage, closed_reason, rows` | totals equal the pre-migration workflow totals |
| `stage_legacy_disagreements` | 0 |
| `closed_without_reason` | 0 |
| `browser_grants` | 0 |
| `free_application_limit`, `free_tailoring_trials`, `free_trial_ai_runs` | 100, 1, 3 |
| `ai_monthly_budget_micro_usd` | 25000000 |
| `versions_without_provenance`, `trial_runs_reserved`, `old_update_signature` | 0, 0, 0 |
| `events` vs `legacy_history_rows` | `events` ≥ `legacy_history_rows` |

A fresh staging catalog fingerprint should match a local database with all 39 migrations, for the
application objects. PGlite's catalog differs slightly from hosted Postgres.

### Phase D — production actions (not part of this rehearsal; each needs separate approval)

1. Fresh production backup.
2. Re-run B3 and B4 on production immediately before the change; stop on any difference.
3. Apply the same 24 files with the same loop against `PROD_DB_URL`, in an agreed window.
4. Set production Vercel variables, then `vercel deploy --prebuilt --prod` of the rehearsed revision.
5. The contract step, much later and separately.

### Commands that can link to or change production (none is used in Phases A–C)

- Any `vercel` command run from `/Users/dipson/ResumeStride`, which is linked to the production
  project.
- `vercel deploy --prod`, `promote`, `rollback`, `alias set` or `redeploy` on `resumestride`.
- `vercel env add`, `rm` or `pull` on `resumestride`; `vercel pull --environment=production`.
- `supabase link --project-ref ggwwzwqykkncgupdimxp`, then any `--linked` command.
- `supabase db push`: with no ledger it would try to apply all 39 files.
- `supabase db dump --linked` or `pg_dump "$PROD_DB_URL"`: copies production data.
- `psql "$PROD_DB_URL"` with any DDL or DML, including `supabase/contract/*`.
- `node scripts/validate-task63-cloud.mjs`: pinned to production; creates and deletes fixture rows.
- `scripts/provision-stripe-catalog.ts --live`, `stripe … --live`, or any `sk_live_` key.
- `scripts/benchmark-tailoring-costs.ts` in a provider mode: spends on whichever key is set.
- `git push` to a branch connected to Vercel Git deployments, if any.
- `scripts/check-hosted-isolation.mjs`: writes fictional rows to candidate A; a staging change,
  allowed only after A is confirmed.

## 6. Rollback

- **Web:** stop using the preview, or deploy the previous release's source as a second preview
  against the same staging database.
  - Expected: it loads, and saved jobs keep their stage through the legacy sync trigger.
  - It cannot show manual applications, events, kept documents, next actions, the trial,
    requirement edits or provenance.
  - The current production deployment predates migrations 16–33, so whether it runs on the
    migrated schema is exactly what this preview checks.
- **Compatibility of file 39 with code built from `1a883b6` or earlier launch work:**
  - a four-argument `job_resume_version_update` call still resolves (tested);
  - a trial run recorded without a reservation is stored as succeeded;
  - extra returned keys are ignored.
- **AI budget:** `update public.product_settings set ai_monthly_budget_micro_usd = 25000000 where id;`
  (staging only).
- **Database:** the migrations are expand-only, with no down migrations. Restore from C1 with
  `pg_restore --clean -d "$STAGING_DB_URL" staging-before.dump`, or discard candidate B entirely.
- **Contract step:** `supabase/contract/20261110000000_application_tracker_contract.sql` is
  destructive. It is **excluded** from this rehearsal and from the first production window.
  Locally, `npm run test:db` replays it and passes.

## 7. Remaining live checks (all unverified)

| # | Check |
|---|---|
| L1–L7 | Hosted sign-in: signed out; sign-in return; email links; draft and reload; token revoked after logout; second account isolated; draft recovered |
| L8 | Real Techmap results |
| L9 | Real OpenAI output on 3 or more fictional resumes |
| L10 | PDF export in the deployed function |
| L11 | Stripe test checkout, portal cancellation and renewal webhook |
| L12 | Reminder delivery: manual `/api/dispatch-billing-notices` call, sent once |
| L13 | www→apex redirect |
| L14 | Provenance on staging: three origins; reload; export; kept view; a later edit shows "Edited by you since" |
| L15 | Budget exhaustion on staging: paused message; no provider call; trial unchanged; recovery after restore |

## 8. Blockers

1. Owner and counsel approval of the terms and privacy notice. Counsel should also say whether a
   renewal notice is legally required.
2. **Confirm the staging targets:** database (candidate A `ntrqseoiwyrvdsobwxaj` or a new
   project) and web target (a new Vercel project, recommended, or Preview scope on
   `resumestride`). Also provide staging and test credentials and the staging-only CSP.
3. Re-inspect production's catalog read-only. As last recorded, production has no ledger and 24
   pending migrations.
4. Run the real-PostgreSQL concurrency harness (needs PostgreSQL 17 locally).
5. The staging rehearsal and live checks L1–L15.
6. Owner decision on the AI monthly budget. It is now a setting, never above US$25 without a
   migration; the provider spend limit is separate.
7. Screen-reader, 200–400% zoom and real-device testing.
8. Review and merge of the checkpoint commit. Nothing is pushed.

Minor items, not blocking:
- a PDF entry can split between bullets across a page break;
- signed-out workspace pages have no header sign-in button;
- the legacy individual-template billing code is still present;
- "View exact version" pagination can differ from the PDF;
- provenance is a browser-submitted review record, not an audit.

## 9. Owner decision requested

Confirm the staging database and the web target. After that, everything from C1 to C8 and the live
checks can run as one bounded operation. Nothing in Phase D runs without separate approval.
