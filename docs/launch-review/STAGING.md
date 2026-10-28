# Staging rehearsal — targets, phases, exact commands and expected results

**Status: staging rehearsal authorized; staging migration state reported complete.** The owner
reports that the existing **ResumeStride Recovery Drill** staging database has migrations
**1–39** applied and production has **1–30**. Verify staging's ledger read-only with staging-only
credentials before the checks. Do not reapply migrations, run `supabase db push`, or migrate
production. No remote data may be deleted.

Reviewed against the repository on 2026-10-28. The CSP in `vercel.json` hard-codes the production Supabase origin, so staging builds need a staging-only CSP.

1. **Migration state is intentionally different.** The owner reports staging migrations **1–39**
   and production migrations **1–30**. This task targets staging only; the difference does not
   authorize production migration or production data access. Verify staging read-only, then run
   checks without applying migration files or using `supabase db push`.
## 1. Targets (identified, not yet confirmed)

| Role | Identifier | Status / evidence |
|---|---|---|
| **Production database — out of scope** | not used | No production connection or credential is needed for this rehearsal. |
| Staging database | Supabase project `ntrqseoiwyrvdsobwxaj` — "ResumeStride Recovery Drill" | Existing project; owner reports migrations 1–39 applied. Verify ledger and checks read-only with staging credentials. |
| Production web project | out of scope | Do not inspect or use for the staging task. |
| Current production deployment | out of scope | Do not inspect or use for the staging task. |
| Staging web | Existing authorized staging Vercel target | Target identity/credentials not available in this environment; do not use `resumestride` or add Preview variables there. |
| Billing | out of scope | No billing action or credential is needed for staging checks. |

Local machine: Vercel CLI 59.23.2 is signed in, but its available project is the production-linked
`resumestride`; no staging Vercel target credentials are available here. `STAGING_DB_URL` is not
set and `psql` is unavailable on `PATH`; Supabase CLI is not installed. Never inspect or reuse
Production environment values. The main checkout `/Users/dipson/ResumeStride` is linked to the
production project; this worktree is not linked.

Required staging-only values, never committed: `STAGING_REF=ntrqseoiwyrvdsobwxaj`,
`STAGING_DB_URL` (direct connection to this project), Supabase staging API URL/key(s), and the
existing staging Vercel deployment target. Do not use production credentials.

## 2. Phase A — local preparation (no network)

| # | Step | Status |
|---|---|---|
| A1 | Checkpoint commit on `feat/apwico-launch-tracker` (parent `1a883b6`); `git rev-parse HEAD` is the rehearsed revision | done by this package; not pushed |
| A2 | Full local suite, logs in `test-results/00–11` | run 2026-10-28 (see `00-summary.txt`) |
| A3 | `vercel build --standalone` → `prepare-vercel-output.mjs` → `check-packaged-functions.mjs` | **passed** 2026-10-28 (`test-results/12`, `13`); offline load check, not hosted execution |
| A4 | `node scripts/rehearse-tracker-migrations.mjs` (all 39 migrations on PGlite with fictional pre-launch rows) | passed (`test-results/08`) |
| A5 | `PGBIN=<postgresql-17>/bin npm run test:db:concurrency` — real-PostgreSQL races, including the new AI-budget and trial races | **not run**: no PostgreSQL server binaries on this machine. Needs a local PostgreSQL 17 install. Expected: every line `PASS`. |
| A6 | Prepare the staging-only CSP: a throwaway copy of `vercel.json` whose `connect-src` names `https://$STAGING_REF.supabase.co` instead of the production origin. Never commit it to the checkpoint branch. | before staging deployment |
| A7 | Install the Supabase CLI only if C-steps will use it (this plan uses `psql` alone) | optional |

## 3. Phase B — read-only remote checks

These checks are read-only and use staging credentials only. Production is not queried.

| # | Command / action | Target | Expected |
|---|---|---|---|
| B1 | Inspect only staging Vercel target variable names/scopes (never values) | staging Vercel target | requires staging target credentials |
| B2 | `psql "$STAGING_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -f supabase/checks/catalog_fingerprint.sql > staging-fp.txt` | staging | ledger confirms migrations 1–39; schema fingerprint recorded |
| B3 | `psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/checks/hosted_preflight.sql > preflight.txt` | staging | tables, policies and grants recorded for review |
| B4 | Run read-only tracker rehearsal checks in §5 | staging | launch markers and settings verified |
| B5 | Confirm the existing staging Vercel target and staging-only variable names/scopes without exposing values | staging Vercel target only | requires staging target credentials |

## 4. Phase C — staging setup and deployment (staging only)

One bounded operation, in this order. Stop at the first unexpected result.

| # | Command / action | Expected |
|---|---|---|
| C1 | Confirm an existing staging recovery point. If unavailable, stop before database writes; do not delete or replace the project. | recovery point confirmed |
| C2 | Seed only isolated fictional rows if required by checks and after confirming existing fixtures. Never delete existing remote rows. | fictional rows isolated and attributable |
| C3 | **Do not apply migrations.** Staging is reported at 1–39. | no migration executed |
| C4 | Configure the existing authorized staging Vercel target with staging-only database credentials and staging CSP. Do not add variables to Production scope or inspect production values. | staging-only configuration; stop if target credentials are unavailable |
| C5 | Staging Supabase Auth: Site URL and redirect URLs = `PREVIEW_URL` | saved |
| C6 | Stripe **test mode**: a webhook endpoint for `PREVIEW_URL/api/stripe-webhook` | endpoint shows `test` |
| C7 | Deploy the checkpoint revision only to the existing staging Vercel target using `vercel deploy --prebuilt`. Never `--prod`, promote, alias, or use the production-linked project. | staging preview URL; no production alias |
| C8 | Optional exhaustion rehearsal, staging only: `update public.product_settings set ai_monthly_budget_micro_usd = 1 where id;` then restore with `= 25000000` | see L15 |

Vercel cron jobs do not run on preview deployments, so L12 triggers the reminder dispatch manually.

## 5. Expected results from staging checks (read-only)

These commands run only after staging credentials are available. No query can be run from the current environment.

`psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/checks/tracker_rehearsal_after.sql > after.txt`

| Output | Expected | Meaning |
|---|---|---|
| `tracker_120000`, `trial_140000`, `requirement_edits_150000`, `provenance_281000` | all `t` | the launch objects exist (read from the catalog, not a ledger) |
| `stage, closed_reason, rows` | totals equal the pre-migration workflow row totals (0 if none existed) | every existing workflow row converted |
| `stage_legacy_disagreements` | 0 | new `stage` and the kept legacy columns agree |
| `closed_without_reason` | 0 | every closed record has a reason |
| `browser_grants` | 0 | browser roles cannot read tracker, settings or trial tables |
| `free_application_limit` / `free_tailoring_trials` / `free_trial_ai_runs` | 100 / 1 / 3 | tracked applications per Free account; lifetime trials; successful runs in that trial |
| `ai_monthly_budget_micro_usd` | 25000000 | US$25 service-wide per UTC month |
| `versions_without_provenance`, `trial_runs_reserved`, `old_update_signature` | 0, 0, 0 | provenance column populated; no stranded reservations; old 4-argument update replaced |
| `events` vs `legacy_history_rows` | `events` ≥ `legacy_history_rows` | history backfilled |

A fresh `catalog_fingerprint.sql` on staging should confirm the owner-reported 1–39 state. It can
be compared with a local database on the checkpoint revision produced with
`node --import tsx` and `tests/server/pgliteDatabase.ts`; PGlite's catalog differs slightly
from hosted Postgres, for example in extension objects, so compare the application objects).
The local rehearsal of the same checks passed (`test-results/08`).

## 6. Live checks (fictional accounts A and B, staging preview). All **unverified**.

| # | Live check | Expected |
|---|---|---|
| L1 | Signed out, open `PREVIEW_URL/workspace/applications` | "Sign in to track applications."; no account data |
| L2 | Sign in as A with a wrong password, then the right one, from that prompt | error, then back on `/workspace/applications` |
| L3 | Sign-up confirmation and password-recovery links for a new fictional address | links arrive and return to `PREVIEW_URL` |
| L4 | A: quick add, Prepare (free trial), edit the job-specific summary; reload | same version and edit; master unchanged |
| L5 | A: sign out; call `/api/jobs-account` with A's old access token | UI shows no draft; API returns 401 |
| L6 | Sign in as B; open A's version URL | "This workspace item is unavailable."; B's list is empty |
| L7 | Sign out B, sign in A on the version URL | A's draft is back |
| L8 | Discover search with real Techmap data | results ranked; cards show fit/unknown reasons |
| L9 | Tailoring with real OpenAI output on 3+ fictional resumes | traceable suggestions; unsupported ones say "Needs your support" and have no Accept |
| L10 | PDF export in the deployed function | PDF opens; text selectable; content matches the job-specific version |
| L11 | Stripe test-mode checkout, portal cancel, renewal webhook | Pro granted; cancellation keeps access to period end |
| L12 | Renewal reminder: a test subscription ending in ≤3 days; `curl -H "Authorization: Bearer $CRON_SECRET" PREVIEW_URL/api/dispatch-billing-notices` twice | one email states the renewal date; the second call sends nothing |
| L13 | `www.` host on the preview domain (if configured) | 301 to apex |
| L14 | Provenance: A accepts one supported AI suggestion, one with an added fact and one with their own wording; reload; export; open "View exact version"; then edit one accepted field | "Tailoring record for this version (3)" with *AI wording*, *AI wording, supported by a fact you added*, *Your wording*; after the edit that entry reads "Edited by you since"; the kept version still reads "In this version" |
| L15 | AI budget (staging SQL, C8): set the budget to 1; A requests suggestions; check `product_trial_status`; restore 25000000; request again | first request: "AI suggestions are paused for all accounts until … (UTC)…", no provider request in the OpenAI usage log, trial runs unchanged; after restore: suggestions return |

Only after L12 passes may the owner decide whether to add a reminder promise back to the terms.

## 7. Production is out of scope

Production is reported at migrations 1–30. Do not inspect, migrate, configure, deploy, or otherwise
access production for this task. Any future production work requires a separate task and explicit
authorization. The contract step is excluded.

## 8. Prohibited production and migration actions

| Command | Why it is dangerous here | Rule |
|---|---|---|
| Any Vercel command from a production-linked checkout | could access or change production | do not use it for staging |
| Production deployment, promotion, rollback, alias or redeploy command | changes the production service | prohibited in this task |
| Production-scoped Vercel environment change | changes production configuration | prohibited in this task |
| `vercel env pull` / `vercel pull --environment=production` | writes production secret values to disk | prohibited in this task |
| Any production project link or linked Supabase command | could point later commands at production | prohibited in this task |
| `supabase db push` | could reapply migrations or make unintended changes | prohibited in this rehearsal; staging is reported at 1–39 |
| Any production database connection or dump | accesses production metadata/data | prohibited in this task |
| Any production database command | accesses or mutates production | prohibited in this task |
| `node scripts/validate-task63-cloud.mjs` | pinned to production and mutates fixture rows | prohibited in this task |
| Any Stripe action | changes billing state or accesses billing data | prohibited in this task |
| `stripe … --live`, a live `sk_live_` key in any staging variable | live billing | prohibited; no billing use in this task |
| Any paid provider action | could incur provider charges or use non-staging credentials | not authorized in this task |
| `git push` to a branch connected to Vercel Git deployments (if any) | could auto-deploy | not done; nothing has been pushed |
| `node scripts/check-hosted-isolation.mjs` | writes fictional rows to `ntrqseoiwyrvdsobwxaj` | staging mutation; only with staging credentials and after checking existing fixtures |

## 9. Staging deployment rollback

- **Web (staging):** stop using the preview, or deploy the previous release (`dpl_3Qvdo3Dd9XPuYVrBw9Y3AQzN8QVN`'s source) as a second preview against the same staging database. Expected: it loads; saved jobs keep their stage (legacy sync trigger); it cannot show manual applications, events, kept documents, next actions, the trial, requirement edits or provenance.
- **Compatibility of file 39 with code built from `1a883b6` or the uncommitted launch work before it:** a four-argument call to `job_resume_version_update` still resolves (the new argument has a default); a trial run recorded without a reservation is stored as succeeded; extra returned keys are ignored. The four-argument call is covered by `supabase/tests/tailoring_provenance_ai_safeguards.test.sql`. The production deployment and production schema are outside this staging task.
- **AI budget setting:** `update public.product_settings set ai_monthly_budget_micro_usd = 25000000 where id;` (staging only).
- **Database:** no migrations are planned. Do not restore over or discard the existing staging project as part of this task.
- **Contract step:** `supabase/contract/20261110000000_application_tracker_contract.sql` drops legacy columns, the history table, legacy RPCs and the sync trigger. After it, the previous release cannot run and rollback means restoring a backup. It is **excluded** from this rehearsal. Locally, `npm run test:db` replays it after the full suite and passes.

## 10. Migration state

| File | Kind | Rollback |
|---|---|---|
| 1–39 | reported applied on staging; production is reported at 1–30 | no migration action in this staging rehearsal |
| `20261027100000_launch_allowance_status` | replaces `pdf_status` | redefine the previous function from `20261013160000` |
| `20261027120000_application_tracker` | **expand**: new columns (backfilled), events, kept documents, settings, RPCs, legacy sync trigger; legacy columns kept | app rollback works without restore; schema rollback = restore |
| `20261027140000_free_tailoring_trial` | additive tables + replaced functions | restore |
| `20261027150000_requirement_edits` | additive column + replaced functions | restore |
| `20261027160000_saved_match_preview` | replaces `jobs_account_snapshot_v2` | redefine the previous function |
| `20261028100000_tailoring_provenance_ai_safeguards` | additive columns (`provenance`, `ai_monthly_budget_micro_usd`, trial-run `status`), three new functions, replaced budget/trial/version/document functions; drops only the 4-argument `job_resume_version_update` (replaced by a 5-argument form with a default) | restore; the previous release keeps working against it |
| `supabase/contract/…` | **contract**, destructive | restore from backup only |
