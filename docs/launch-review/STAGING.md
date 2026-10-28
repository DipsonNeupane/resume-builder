# Staging rehearsal — targets, phases, exact commands and expected results

**Status: prepared, not executed.** Nothing in Phases B–D has been run by this package except
the read-only Vercel listings recorded in §1. Phase C needs the owner to confirm the exact
staging targets in §1 first. "No existing users" does not authorize deleting remote data,
objects or resources.

Reviewed against the repository on 2026-10-28. This review changed three earlier assumptions:

1. **Production has no Supabase migration ledger.** The last recorded read-only inspection
   (`docs/PRODUCTION_CATALOG_RECONCILIATION_2026-09-25.md`) found
   `supabase_migrations.schema_migrations` absent and only migrations 1–15 applied, through the
   SQL editor, with two recorded drifts (#2 stricter constraint, #5 old 999-cent price). The
   earlier plan used `supabase db push` and expected exactly five pending files. Both are wrong.
   Unless production changed after 2026-09-25 (check B3), **24 migrations are pending (16–39)**,
   not five or six. Running `supabase db push` against production would try to apply all 39.
2. **The CSP in `vercel.json` hard-codes the production Supabase origin**
   (`connect-src 'self' https://ggwwzwqykkncgupdimxp.supabase.co`). A preview build pointed at
   a staging database would have its browser calls blocked unless the staging build uses a
   staging-only CSP (C4).
3. **The Vercel project has no Preview environment variables.** All 29 are Production-scoped
   (B1). A plain `vercel deploy` preview would run with no database, AI, export or billing
   configuration. Staging configuration must be added before any live check (C4).

## 1. Targets (identified, not yet confirmed)

| Role | Identifier | Status / evidence |
|---|---|---|
| **Production database — never a staging target** | Supabase project `ggwwzwqykkncgupdimxp` | Named in `vercel.json` CSP, `docs/EXTERNAL_SETUP_STATUS.md`, `scripts/validate-task63-cloud.mjs` |
| Staging database, **candidate A** (existing) | Supabase project `ntrqseoiwyrvdsobwxaj` — "ResumeStride Recovery Drill" restore target | Non-production restore made 2026-09-20 03:48 UTC; migrations 1–15 applied by SQL editor; holds one retained fictional canary (`docs/verification/backup-canary.json`). Current state unverified since 2026-09 (B2). |
| Staging database, **candidate B** (new) | none yet — would be a new project, e.g. `apwico-staging` | Requires creating a resource (and possibly a paid compute add-on). Not created. |
| Production web project | Vercel `dipsons-projects/resumestride`, `prj_W7PZMjcFj5LnmPtZ2x9QGwIkP6tC`, team `team_5diMdtyzJJlmwjNvMzL2BMN1` | Read-only `vercel env ls`: 29 variables, **all Production-scoped**, 0 Preview |
| Current production deployment (rollback reference) | `dpl_3Qvdo3Dd9XPuYVrBw9Y3AQzN8QVN`, created 2026-10-14 02:03 UTC | Read-only `vercel ls` / `vercel inspect` |
| Staging web, **option 1** (recommended) | new Vercel project, e.g. `apwico-staging` | Not created. Removes any chance of a staging command touching `resumestride` |
| Staging web, **option 2** | Preview environment of `resumestride` | Needs Preview-scoped variables added to the production project's settings |
| Billing | Stripe sandbox account `acct_1QqPbG7sBbdVbWSQ`, **test-mode keys only** | Per `docs/EXTERNAL_SETUP_STATUS.md`; not checked this session |
| Other Vercel projects (not inspected) | `project-kdi8e`, `project-7fs0r`, `spendpulse-mvp` | Unrelated or unidentified. Not used. |

Local machine: Vercel CLI 59.23.2 (signed in); `psql` 18 at `/usr/local/opt/libpq/bin/psql` (not
on `PATH`); Stripe CLI at `/usr/local/bin/stripe`; **Supabase CLI not installed**; **no
PostgreSQL server binaries** (needed by `npm run test:db:concurrency`). The main checkout
`/Users/dipson/ResumeStride` contains `.vercel/project.json` linked to the **production**
project; this worktree is not linked.

Placeholders, never committed: `STAGING_REF`, `STAGING_DB_URL` (direct connection, staging only),
`PROD_DB_URL` (read-only role preferred), `PREVIEW_URL`.

## 2. Phase A — local preparation (no network)

| # | Step | Status |
|---|---|---|
| A1 | Checkpoint commit on `feat/apwico-launch-tracker` (parent `1a883b6`); `git rev-parse HEAD` is the rehearsed revision | done by this package; not pushed |
| A2 | Full local suite, logs in `test-results/00–11` | run 2026-10-28 (see `00-summary.txt`) |
| A3 | `vercel build --standalone` → `prepare-vercel-output.mjs` → `check-packaged-functions.mjs` | **passed** 2026-10-28 (`test-results/12`, `13`); offline load check, not hosted execution |
| A4 | `node scripts/rehearse-tracker-migrations.mjs` (all 39 migrations on PGlite with fictional pre-launch rows) | passed (`test-results/08`) |
| A5 | `PGBIN=<postgresql-17>/bin npm run test:db:concurrency` — real-PostgreSQL races, including the new AI-budget and trial races | **not run**: no PostgreSQL server binaries on this machine. Needs a local PostgreSQL 17 install. Expected: every line `PASS`. |
| A6 | Prepare the staging-only CSP: a throwaway copy of `vercel.json` whose `connect-src` names `https://$STAGING_REF.supabase.co` instead of the production origin. Never commit it to the checkpoint branch. | to do after targets are confirmed |
| A7 | Install the Supabase CLI only if C-steps will use it (this plan uses `psql` alone) | optional |

## 3. Phase B — read-only remote checks

None of these change anything. B3 reads **production** metadata, schema only.

| # | Command / action | Target | Expected |
|---|---|---|---|
| B1 | `vercel env ls` (names/scopes only; done 2026-10-28) | Vercel `resumestride` | 29 Production-scoped names, 0 Preview |
| B2 | `psql "$STAGING_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -f supabase/checks/catalog_fingerprint.sql > staging-fp.txt` | staging | the file is produced; `migration_ledger` line recorded |
| B3 | Same command with `PROD_DB_URL` (or paste the file into the production SQL editor, read-only) → `prod-fp.txt` | **production, read-only** | `migration_ledger|absent`; catalog matches migrations 1–15 with the two recorded drifts |
| B4 | `diff prod-fp.txt staging-fp.txt` | local | no difference. Otherwise, bring staging to production's exact state first (candidate A), or build it from files 1–15 plus the two drifts (candidate B) |
| B5 | `psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/checks/hosted_preflight.sql > preflight.txt` | staging | lists tables, policies, grants; recorded for comparison |
| B6 | Stripe dashboard (test mode): confirm the sandbox account and test price IDs exist | Stripe test | IDs recorded, names only |

## 4. Phase C — staging mutations (only after §1 targets are confirmed)

One bounded operation, in this order. Stop at the first unexpected result.

| # | Command / action | Expected |
|---|---|---|
| C1 | Back up staging: dashboard backup, or `pg_dump "$STAGING_DB_URL" -Fc -f staging-before.dump` (outside the repository) | dump file non-empty |
| C2 | Seed fictional pre-launch rows in staging (two fictional Auth users created by sign-up; one saved job each when the schema allows). Only fictional data. | rows exist |
| C3 | Apply files 16–33 **in filename order, one transaction per file** (none of the 24 pending files opens its own transaction): `for f in $(ls supabase/migrations/*.sql \| sed -n '16,33p'); do psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$f" \|\| break; done` | no `ERROR`; the last file applied is `20261013160000_v2_allowance_override.sql`. On an error the loop stops with that file rolled back. |
| C3b | `psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/checks/tracker_rehearsal_before.sql > before.txt` | all four markers `f`; workflow and history counts recorded |
| C3c | Apply the six launch files the same way: `sed -n '34,39p'` in the loop above | no `ERROR`; the last file is `20261028100000_tailoring_provenance_ai_safeguards.sql` |
| C3d | This plan does **not** create a migration ledger on either database. Whether production gets one is a separate owner decision (`docs/PRODUCTION_READINESS_AUDIT.md`, step 5). | — |
| C4 | Web: option 1 (new Vercel project) or option 2 (Preview variables on `resumestride`). Set, scoped to staging/preview only: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (all **staging**), `APP_ORIGIN=$PREVIEW_URL`, `EXPORTS_ENABLED`, `AI_ENABLED`, `OPENAI_API_KEY` (a key with its own provider spend limit), `TECHMAP_API_KEY`, `VITE_PAID_FEATURES_UI_ENABLED`, `VITE_BILLING_UI_ENABLED`, `BILLING_ENABLED`, `RECURRING_BILLING_ENABLED`, `BILLING_RECURRING_ENABLED`, `SUBSCRIPTION_OFFERS_ENABLED`, `STRIPE_MODE=test`, `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET` (test endpoint), `STRIPE_ACCOUNT_ID`, test price IDs, `RESEND_API_KEY`, `BILLING_EMAIL_FROM`, `CRON_SECRET`. Use the staging CSP from A6. | variables listed for the staging scope only; Production list unchanged |
| C5 | Staging Supabase Auth: Site URL and redirect URLs = `PREVIEW_URL` | saved |
| C6 | Stripe **test mode**: a webhook endpoint for `PREVIEW_URL/api/stripe-webhook` | endpoint shows `test` |
| C7 | Deploy the checkpoint revision as a preview: `vercel deploy --prebuilt` from a staging-linked directory (after `vercel build --standalone` + `prepare-vercel-output.mjs`). **Never `--prod`.** | a `…vercel.app` URL; not aliased to any production domain |
| C8 | Optional exhaustion rehearsal, staging only: `update public.product_settings set ai_monthly_budget_micro_usd = 1 where id;` then restore with `= 25000000` | see L15 |

Vercel cron jobs do not run on preview deployments, so L12 triggers the reminder dispatch manually.

## 5. Expected results after C3 (read-only)

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

A fresh `catalog_fingerprint.sql` on staging must equal the same file run on a local database
with all 39 migrations (the local result for the checkpoint revision can be produced with
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

## 7. Phase D — production actions (not part of this rehearsal)

Listed so that none is run by mistake. Each needs its own explicit approval after the rehearsal.

1. Fresh production backup (PITR point or `pg_dump` with a read role).
2. Re-run B3 and B4 on production immediately before the change; stop on any difference.
3. Apply the same 24 files with the same C3 loop against `PROD_DB_URL`, in an agreed window.
4. Production Vercel variables (names in C4, production values), then `vercel deploy --prebuilt --prod` of the rehearsed revision.
5. The contract step, much later and separately (§9).

## 8. Commands that can link to or mutate production

| Command | Why it is dangerous here | Rule |
|---|---|---|
| Any `vercel …` run from `/Users/dipson/ResumeStride` | that checkout is linked to the production project `resumestride` | run staging Vercel commands only from a directory linked to the staging project |
| `vercel deploy --prod`, `vercel promote`, `vercel rollback`, `vercel alias set`, `vercel redeploy` on `resumestride` | changes what `resumestride.com` / `apwico.com` serve | Phase D only |
| `vercel env add/rm` on `resumestride` | changes the production project's configuration | option 2 adds **Preview**-scoped variables only, after approval |
| `vercel env pull` / `vercel pull --environment=production` on `resumestride` | writes production secret values to disk | never in the repository |
| `supabase link --project-ref ggwwzwqykkncgupdimxp`, then any `--linked` command | links the CLI to production | this plan avoids `--linked`; use explicit `STAGING_DB_URL` |
| `supabase db push` (any target without a verified ledger) | production has no ledger: it would try to apply all 39 files | never on production; not used for staging either |
| `supabase db dump --linked` or `pg_dump "$PROD_DB_URL"` | copies production data to the operator's machine | backups only, stored outside the repository |
| `psql "$PROD_DB_URL" …` with any DDL/DML file, including `supabase/contract/*` | mutates production | Phase D only; the contract file is destructive |
| `node scripts/validate-task63-cloud.mjs` | pinned to the production origin; creates and deletes fixture rows there | not part of this rehearsal |
| `npx tsx scripts/provision-stripe-catalog.ts --live` | creates live Stripe products and prices | excluded; the rehearsal is test mode only |
| `stripe … --live`, a live `sk_live_` key in any staging variable | live billing | test keys only; `STRIPE_MODE=test` |
| `npx tsx scripts/benchmark-tailoring-costs.ts` in a provider mode | spends money on whichever OpenAI key is set | use a staging key with its own provider limit |
| `git push` to a branch connected to Vercel Git deployments (if any) | could auto-deploy | not done; nothing has been pushed |
| `node scripts/check-hosted-isolation.mjs` | writes fictional rows to `ntrqseoiwyrvdsobwxaj` (candidate A) | staging mutation; only after A is confirmed |

## 9. Rollback

- **Web (staging):** stop using the preview, or deploy the previous release (`dpl_3Qvdo3Dd9XPuYVrBw9Y3AQzN8QVN`'s source) as a second preview against the same staging database. Expected: it loads; saved jobs keep their stage (legacy sync trigger); it cannot show manual applications, events, kept documents, next actions, the trial, requirement edits or provenance.
- **Compatibility of file 39 with code built from `1a883b6` or the uncommitted launch work before it:** a four-argument call to `job_resume_version_update` still resolves (the new argument has a default); a trial run recorded without a reservation is stored as succeeded; extra returned keys are ignored. The four-argument call is covered by `supabase/tests/tailoring_provenance_ai_safeguards.test.sql`. The current production deployment predates migrations 16–33 entirely; whether it runs against the migrated schema is exactly what the §9 app-rollback preview checks.
- **AI budget setting:** `update public.product_settings set ai_monthly_budget_micro_usd = 25000000 where id;` (staging only).
- **Database:** the migrations are expand-only; there are no down migrations. Schema rollback = restore C1's backup (`pg_restore --clean -d "$STAGING_DB_URL" staging-before.dump`), or discard candidate B's project entirely.
- **Contract step:** `supabase/contract/20261110000000_application_tracker_contract.sql` drops legacy columns, the history table, legacy RPCs and the sync trigger. After it, the previous release cannot run and rollback means restoring a backup. It is **excluded** from this rehearsal and from Phase D's first window. Locally, `npm run test:db` replays it after the full suite and passes.

## 10. Migration notes

| File | Kind | Rollback |
|---|---|---|
| 16–33 (`20260923120000` … `20261013160000`) | pending on production since 2026-09-25 per the last inspection; additive plus function replacements | restore backup |
| `20261027100000_launch_allowance_status` | replaces `pdf_status` | redefine the previous function from `20261013160000` |
| `20261027120000_application_tracker` | **expand**: new columns (backfilled), events, kept documents, settings, RPCs, legacy sync trigger; legacy columns kept | app rollback works without restore; schema rollback = restore |
| `20261027140000_free_tailoring_trial` | additive tables + replaced functions | restore |
| `20261027150000_requirement_edits` | additive column + replaced functions | restore |
| `20261027160000_saved_match_preview` | replaces `jobs_account_snapshot_v2` | redefine the previous function |
| `20261028100000_tailoring_provenance_ai_safeguards` | additive columns (`provenance`, `ai_monthly_budget_micro_usd`, trial-run `status`), three new functions, replaced budget/trial/version/document functions; drops only the 4-argument `job_resume_version_update` (replaced by a 5-argument form with a default) | restore; the previous release keeps working against it |
| `supabase/contract/…` | **contract**, destructive | restore from backup only |
