# Production and cloud readiness audit — Task #60

Audited September 24–25, 2026. **Audit and plan only; not release approval.** No deployment,
hosted SQL, dashboard changes, access-lock changes, DNS changes, provider calls, backup,
or restore was performed. No secret files or secret values were inspected. Environment
inventory below is derived from source, not a claim that production has those settings.
Keep current production protection and cloud-off state unchanged in this task.

Execution companions: [cloud acceptance](PRODUCTION_CLOUD_ACCEPTANCE.md),
[OWNER ACTION checklist](PRODUCTION_OWNER_ACTIONS.md). Historical hosted evidence remains
in [recovery runbook](RECOVERY_RUNBOOK.md) and HANDOFF; it is not current schema evidence.

## Release decision and findings

**Do not enable production cloud saving on this migration chain.** Close F1 and the
verification gates below first. This audit deliberately leaves fixes for a separate task.

| ID | Finding and evidence | Required disposition before affected release |
| --- | --- | --- |
| F1 — blocker | `src/model.ts` accepts seven templates; `resume_data_is_valid` in `20260919150000_resume_storage_bounds.sql:225` accepts only `modern`, `classic`, `minimal`. No later migration expands it. A local PGlite replay of all 23 migrations confirms `compact`, `bold`, `executive`, `ledger` pass the client validator but fail the database validator. | Add a **new forward migration**, preserving validation/grants/search path, accepting all seven supported IDs. Add database INSERT/UPDATE and configured-cloud browser coverage for all seven, including RTL/Unicode. Do not rewrite the old migration, weaken the CHECK, or enable only a subset of customer templates. Re-audit/order the new migration after `20260924220000`. |
| F2 — rollout gate | Historical records say the baseline was manually applied without CLI history. Later hosted state and settings were not queried here; old migrations also contain current price logic that may differ from their historically applied bodies. | Compare full catalog definitions and applied history to a fresh chain, not timestamps/table existence alone; reconcile only proven equivalent versions. New corrective migrations for drift. |
| F3 — storage/recovery gap | `job_resume_versions` has per-row 8,000,000-byte bounds but no history table, total account count/bytes limit, or durable write-rate throttle. Versions intentionally survive saved-job/master removal; removing/re-saving jobs can accumulate versions beyond the 10,000 saved-job ceiling. Lists aggregate all snapshots without pagination. | Engineering must bound growth and large responses, or owner must explicitly accept a bounded pilot with monitored limits. Do not promise per-edit job-version recovery. Evaluate large-account responses against platform limits before general release. |
| F4 — persistence distinction | `VITE_CLOUD_STORAGE_ENABLED` gates only `useCloudResume`. Jobs API can read an existing cloud master and save job versions regardless; saved jobs/preferences/analyses are also independent. It is a build-time UX gate, not database authorization or a write kill switch for already loaded tabs. | Align disclosures, acceptance and incident containment with each separate path. No claim that cloud-off means no account-side resume data. |
| F5 — recovery/retention gate | Master history is capped at 5,000 checkpoints / 50,000,000 cumulative bytes, 240 writes/60s by default. History is not pruned. Deleting master cascades its checkpoints; counters survive. No self-service history restore/account-delete route found. Unsaved linked edits remain in memory; guest sessionStorage is intentionally not updated with account content. | Owner-approved support/recovery and deletion procedure, storage-cap response, and populated restore drill. Do not promise recovery after closing an unsaved tab. Check retention expectations before broad enablement. |
| F6 — evidence gap | Local tests do not prove Supabase Auth/PostgREST, production secrets, runtime packaging, backup restoration or live provider/catalog readiness. Browser and native concurrency runs were blocked here. | Complete the explicit later test matrix; retain the access lock during acceptance. |
| F7 — stale configuration guidance | `.env.example` includes `VITE_BILLING_UI_ENABLED`, but current source never reads it. README/copilot/historical recovery notes contain older claims (localStorage, unavailable implemented features, earlier prices). | Treat current source and this dated audit as the rollout inventory; do not rely on that unused flag to pause purchases. Historical records remain intact. |

## Complete environment inventory

Categories: **S** required server secret for the named enabled capability; **P** safe
public configuration (may still be server-only); **O** optional switch/configuration;
**D** development/test/operator-only. Never put S values in `VITE_*`, frontend bundles,
logs, screenshots, Git, command arguments, or this report. Required does not mean missing:
credential presence/validity is **owner-action-required**, not inspected in this audit.

| Variable | Class | Consumer and production rule |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | P, required for auth UI | `src/services/supabase.ts`; exact HTTPS project URL; must match API project and CSP. Blank yields local-only UI. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | P, required for auth UI | Only public/publishable or anon key; never service-role. RLS remains essential. |
| `SUPABASE_URL` | P, optional server override | `server/database.ts`; falls back to VITE URL; absolute HTTPS root, no userinfo. Must identify same project as browser. |
| `SUPABASE_PUBLISHABLE_KEY` | P, optional server override | Falls back to VITE key; verifies bearer tokens with Auth. Same project. Both overrides are supported but absent from `.env.example`. |
| `SUPABASE_SERVICE_ROLE_KEY` | S | All account/billing/export/AI/Jobs server database access. Production-only scope; no client exposure. |
| `APP_ORIGIN` | P, required for mutation APIs/billing | Exact `https://resumestride.com`, no trailing slash/path; not request Host. Separate approved origin for isolated app environments. |
| `STRIPE_SECRET_KEY` | S, billing | Production `sk_live_` with `STRIPE_MODE=live`; test-only key for isolated sandbox. Required also to reconcile existing customers during sales pause. |
| `STRIPE_WEBHOOK_SECRET` | S, billing | Exact destination signing secret; required by shared billing config, including cancellation. |
| `STRIPE_ACCOUNT_ID` | P, required billing config | Account ID is not a credential; validate connected account and charges capability. Keep server configured. |
| `STRIPE_PASS_PRICE_ID` | P, required billing config | Active USD 1999-cent one-time price. Source price is US$19.99; do not infer price from garbled task metadata. |
| `STRIPE_RECURRING_PRICE_ID` | P, required for recurring lifecycle | Distinct active USD 1999-cent `day` / interval_count `30` price. Needed for invoice processing even when new recurring sales pause. |
| `STRIPE_MODE` | P, required billing config | Explicit `live` or `test`; prefix/mode mismatch fails closed. |
| `OPENAI_API_KEY` | S, AI | Server-only funded project key. No model or price env override exists; see AI section. |
| `TECHMAP_API_KEY` | S, provider search | RapidAPI credential, checked length 8–512. No key required for deterministic saved-job reanalysis. |
| `BILLING_ENABLED` | O | Exact `true` enables new one-time sales; does not disable existing-customer webhook/cancellation service. |
| `BILLING_RECURRING_ENABLED` | O | Exact `true` enables optional recurring sales, separately from one-time gate; do not assume one flag pauses both. |
| `AI_ENABLED` | O | Exact `true` enables tailoring; keep off on restore targets. |
| `EXPORTS_ENABLED` | O | Exact `true` enables authenticated PDF/DOCX/status. |
| `EXTENSION_CAPTURE_ENABLED` | O | Only exact `false` disables `capture_save`; unset is enabled. Does not disable ordinary saves, jobs, versions or read access. |
| `VITE_CLOUD_STORAGE_ENABLED` | O, public build config | Exact `true` enables master-resume hook. Default off; rebuilding is necessary for a changed client value. |
| `VITE_PAID_FEATURES_UI_ENABLED` | O, public build config | Shows tailoring tools; server authorization still required. Export UI also appears for confirmed complete resumes independently. |
| `VITE_BILLING_UI_ENABLED` | O, unused | Present in example/test env only; no current source consumer. Not a safety control. |
| `DIAGNOSTICS_LEVEL` | O | `info` default, `warn`, `error`, `off`; retain info for rate denominators. Fixed categories/timings only. |
| `NODE_ENV` | P, platform runtime | Production must be `production`; only non-production billing allows HTTP localhost. |
| `VERCEL_ENV` | P, platform runtime | Middleware selects production SEO behavior; preview should remain non-indexable. Not an access lock. |
| `import.meta.env.DEV` | D, Vite-generated | Local-only extension receiver exceptions; do not set as a production workaround. |
| `PLAYWRIGHT_BROWSERS` | D | Optional comma-separated engines; Chromium default. |
| `ESBUILD_BINARY_PATH` | D, toolchain | Local Apple Silicon workaround; never configure this Mac path in Vercel. |
| `PGBIN` | D | Native local Postgres binaries for socket-only concurrency harness. |
| `HOSTED_ISOLATION_SUPABASE_URL` | D, public operator config | Existing harness is locked to historical recovery project; never repoint/bypass its production guard. |
| `HOSTED_ISOLATION_SUPABASE_ANON_KEY` | D, public operator config | Public recovery-project key only. |
| `HOSTED_ISOLATION_USER_A_TOKEN`, `HOSTED_ISOLATION_USER_B_TOKEN` | D, sensitive test credentials | Ephemeral real user tokens, two distinct synthetic accounts; inject securely, never log. Harness performs fixture writes/deletes, so was not run. |
| `RESUMESTRIDE_BENCHMARK_ALLOW_PAID` | D | Explicit paid benchmark acknowledgment; do not set for local audit. `--count-input` also contacts provider. |
| `VIDEO_ONLY` | D | Marketing draft selector; no application role. |

No application `DATABASE_URL`, `OPENAI_MODEL`, Techmap endpoint override, SMTP password,
Vercel token or Supabase management token is read by current app code. Dashboard SMTP,
CLI access tokens/database passwords and backup encryption keys are **operator secrets**,
not frontend or app environment variables. Use protected credential tooling later; do
not add invented env entries expecting them to control the app.

## Migration inventory and ordering

All **23** current files in `supabase/migrations`, ascending filename order. Numbers
below are dependencies/order, not assertions that any file is missing in production.
There are no down migrations. Most files are **not replay-idempotent**, even where
individual statements use `IF NOT EXISTS` or `CREATE OR REPLACE`. Business RPC retry
idempotency does not make its creating migration safe to replay.

| # | File (timestamp + suffix, `.sql`) | Change, ordering, idempotency and recovery considerations |
| --- | --- | --- |
| 1 | `20260918120000_resume_storage` | One master/account, checkpoints, five owner policies, revision/checkpoint triggers. Depends on Supabase `auth.users`, `auth.uid()` and roles. Tables/index guarded, policies unguarded: replay fails. Historical manual baseline needs definition comparison. Master deletion cascades history. |
| 2 | `20260919150000_resume_storage_bounds` | Config/counters, JSON validators and enforcing/accounting triggers. Depends on 1. Adds unguarded `resumes_data_shape_valid NOT VALID`; not replay-safe. Existing invalid rows preserved but subsequent writes must pass. Contains F1; do not validate historical constraint or rewrite data blindly. |
| 3 | `20260919160000_resume_history_accounting` | Backfills retained history counts/bytes with `greatest`, preserving lifetime counters after deletes. Depends on 2; repeat-safe reconciliation. **Own BEGIN/COMMIT**, locks resumes SHARE ROW EXCLUSIVE, revisions SHARE, counters SHARE ROW EXCLUSIVE. Plan lock window; do not nest it in an assumed all-files transaction. |
| 4 | `20260919210000_billing_ledger` | Checkouts/payments/entitlements, owner SELECT entitlement policy and service-only grant RPCs, exact 30-day grants. Depends on auth. Unguarded policy makes replay unsafe. Preserve trusted checkout/payment IDs and original windows during recovery. |
| 5 | `20260919211000_checkout_intents` | Manual intents, per-owner 3/hour new intents, 23-hour reuse bound, binding and entitlement lookup. Depends on 4. Unguarded tables/functions. Current file binds 1999; compare hosted body and later 16, do not edit historical rows. |
| 6 | `20260919220000_ai_budget` | Monthly/request ledger, USD25 cap on spent+reserved, owner 20/hour limit, reserve/finish RPCs. Depends on auth. Unguarded creation. Never reset totals or release unknown reservations by age. |
| 7 | `20260919230000_pdf_allowance` | Shared document quota despite `pdf_*` names; request hashes/leases, three Free successful documents per signup-based 30-day cycle. Depends on 4/auth signup date. Unguarded creation. Restore reservations/status/counters together; format binding is in server hash, not a later DB migration. |
| 8 | `20260920010000_checkout_attempt_throttle` | Durable manual checkout 20/hour attempt gate, before provider side effects. Unguarded table/function. Preserve counter on recovery; later server requires it. |
| 9 | `20260920020000_recurring_billing` | Subscription/invoice ledger and service RPCs; verified periods, no local renewal scheduler. Depends on 4. Unguarded tables/indexes despite replaceable functions. Preserve invoices/subscriptions/entitlements as a unit. |
| 10 | `20260920030000_billing_reversals` | Payment status and reversal/dispute ledgers; folds full reversals, reports partial anomalies. Depends on 4 and 9 (recomputation reads invoices). Tables unguarded; not replay-safe. Do not rewind another grant when reversing one. |
| 11 | `20260920040000_recurring_checkout` | Separate recurring checkout/intents/attempts and owner subscription lookup. Depends on 9/auth. Unguarded tables. Historical references and provider idempotency keys must survive. |
| 12 | `20260920050000_owner_checkout_reservation` | Shared owner reservation across manual/recurring checkout. Depends on prior app flow/ledgers. Unguarded table/functions. Release only on provider-confirmed terminal result or proof no provider artifact; never TTL-delete an ambiguous lock. |
| 13 | `20260920060000_recurring_invoice_reversals` | Invoice status/payment-intent mapping plus invoice reversal/dispute ledgers; replaces manual reversal recomputation. Depends on 9/10. Mixed guarded columns + unguarded tables. Old granted invoices can have NULL payment mapping: reconcile from Stripe evidence later, not guessed backfill. |
| 14 | `20260920070000_atomic_invoice_grant` | Atomic wrapper grants invoice AND reversible payment mapping in same transaction. Depends on 9/13. Unguarded function; must precede server using it. Keep both component RPCs; new code uses wrapper. |
| 15 | `20260920080000_resume_validation_search_path` | Pins all five invoker validators to empty search_path. Depends on 2. Repeating ALTER is safe; running before helpers exist fails. Preserve during F1 repair. |
| 16 | `20260923120000_pro_pass_price` | Replaces manual binding function with 1999-cent amount. Depends on 5. Same-definition replay safe but is a real behavior change on older DBs. Coordinate code + Price IDs; retains historical checkout amounts. No invoice/subscription repricing. |
| 17 | `20260924120000_ai_usage_accounting` | Adds model/feature/status/tokens/cost/provider IDs/fingerprint/reconciliation metadata and indexes to 6; backfills unfinished as uncertain, finished as succeeded, model `legacy-unknown`. New begin/start/finish/reconcile RPCs, ten-minute atomic fingerprint dedupe; legacy finish retained. Unguarded columns/index/functions; **do not rerun backfill**, which would overwrite newer statuses. Scan/update/index locks and size must be measured on clone. |
| 18 | `20260924150000_saved_jobs_preferences` | Saved snapshots/dedupe, Free3/Pro10000 ceiling, preferences/opt-in refresh and availability. Depends on entitlement RPC in 5. Unguarded tables/functions; RLS enabled, no browser table grants, service-only RPCs. Comment says RLS “forced”, but DDL only ENABLEs it; inspect effective privileges/definer owners rather than claiming FORCE. Preserve snapshots when expired/Pro expires. |
| 19 | `20260924170000_job_match_analysis` | Adds analysis/version/input hashes/invalidation columns (64KB bound), enlarges snapshot to 40KB; clarifications and versioned snapshot/refresh RPCs. Depends on 18/5. Replaced constraint is guarded on drop only; columns/functions unguarded. Existing jobs have NULL analysis until deterministic refresh. No AI/provider backfill needed. |
| 20 | `20260924190000_job_resume_versions` | Independent owner/saved-job version rows and create/get/update/reset/list/master RPCs. Depends on 1/18/5. Unguarded creation. Optimistic revision; no FK to removed job/master, no history or global owner bounds (F3). Server performs full Resume validation; DB enforces object/bytes, not complete schema. |
| 21 | `20260924200000_tailoring_inputs` | Service-only atomic owner/job/version join, current analysis and entitlement for AI. Depends on 19/20/5. Unguarded function. Must precede `/api/tailor` release; wrong owner/job/version fails closed; bookmark removal makes new tailoring unavailable while version remains editable. |
| 22 | `20260924210000_extension_capture` | Enlarges both snapshots to 160KB; preferences in match context; source identity helper and replaced dedupe/save RPC. Depends on 18/19/20. Unconditional drops and unguarded helper: not replay-safe. Wider rows cannot be rolled back to 40KB constraints without a separate data plan. Does not delete duplicate historic rows. |
| 23 | `20260924220000_jobs_search_throttle` | Durable 40/10-minute per-owner search gate, depends on auth; deploy before new Jobs handler. Unguarded table/function. Uses advisory namespace 402, also used by recurring attempts; same-owner operations can serialize briefly, counters remain separate. No global provider quota cap. |

No later migration exists in this audited tree. A new F1 repair or any subsequent file
must be added to this inventory and rehearsed before approving a final pending list.

## Ordered execution plan — future owner-authorized session only

1. Freeze a reviewable release artifact: source revision plus dirty-tree patch/archive,
   lockfile, migration SHA256 manifest, app/extension artifacts and config-name inventory.
   This worktree contains extensive earlier uncommitted work; a commit ID alone cannot
   identify the candidate. Do not sweep unrelated changes into a release unnoticed.
2. Close F1 in a separate implementation task and resolve F3/F5 policy/engineering gates.
   Rerun local matrix below; rehearse fresh-install AND upgrade-from-populated-baseline,
   including legacy invalid rows, uncertain AI requests, old prices, granted invoices
   with missing mapping, stored captures and deleted-bookmark versions.
3. **OWNER ACTION REQUIRED:** read-only dashboard/catalog inventory of exact production
   project/deployment, locks, Auth/SMTP/redirects, env **names/scopes/presence only**, backup
   capability/retention, Node/runtime and Stripe catalog/webhook. Never pull secret-valued
   env files into the repository. Verify DNS/HTTPS/canonical routing without changing DNS.
4. Compare hosted `supabase_migrations.schema_migrations` versions (if present) with all
   files and full catalog: `pg_get_functiondef`, `pg_get_triggerdef`, constraints and
   validation states, indexes, FKs, policies, RLS/FORCE flags, routine/table/schema grants,
   function owners/search paths and default privileges. Existing `hosted_preflight.sql`
   focuses on master tables and fails on an empty baseline; it is insufficient alone.
   Build expected definitions in an isolated fresh database, never reset production.
5. Classify each migration: absent, equivalent-and-recorded, equivalent-but-unrecorded,
   partial, drifted. Only proven equivalent/unrecorded versions may be marked applied
   with the Supabase migration-repair workflow after owner authorization. Repair changes
   history, **not schema**. Partial/drifted versions require reviewed forward repair;
   never mark them applied merely to unblock `db push`. Dashboard SQL bypasses CLI
   history, as explained in [Supabase migration guidance](https://supabase.com/docs/guides/deployment/database-migrations).
6. Complete pre-migration backup below and a populated isolated rehearsal. Record approved
   migration window, on-call owner, acceptable recovery point/time, write coordination
   and webhook replay window. No access locks are to be loosened. Any temporary write
   containment/config change is owner-action-required; a UI flag alone cannot stop direct
   master PostgREST clients. Preserve existing customer cancellation and reconciliation.
7. Apply **only** the reconciled missing list in order 1–23, then approved later fixes.
   Use one tested migration runner and one operator. Inspect `supabase db push --dry-run`
   only after the target/history are verified; use the pinned CLI version's documented
   syntax. No seed data/reset/include-all shortcut. Set finite lock/statement timeouts
   established by rehearsal; on lock timeout stop, do not kill sessions or retry blindly.
8. Each DDL file must commit atomically with its revokes/grants; do not execute statements
   separately and leave a new PUBLIC-executable function exposed between steps. Most files
   need runner transactions. File 3 already opens/closes its own transaction: verify the
   runner's treatment during rehearsal, or execute that file standalone with stop-on-error
   and record history only after confirmed commit. Do not wrap the entire chain in one
   assumed transaction; file 3's COMMIT would break that assumption. If the selected CLI
   cannot provide those guarantees, prepare/review an explicit per-file transactional
   execution wrapper and history reconciliation before touching production.
9. After every file, record committed version/checksum and read-only postconditions. On
   uncertain client disconnect, inspect catalog/history first. Resume only after proving
   whether the transaction committed. After 17 verify backfill/AI totals; after 18–23
   verify service RPC access and browser denials. Full checks below precede app rollout.
10. Only in a later separately authorized release: deploy compatible APIs/client with
    cloud still off, coordinated 1999-cent catalog settings and packaging checks. Preserve
    the access lock. Run locked-production acceptance with synthetic accounts, then enable
    cloud in a reviewed build only after F1, acceptance and populated restore drill pass.
    There is no per-user cloud rollout flag in source: a locked candidate is needed for
    gated acceptance, not a claim of a per-account production cohort switch.

## Pre-migration backup and verification procedure

**OWNER ACTION REQUIRED; not executed here.**

1. Identify the source project, region, PostgreSQL version and exact pre-migration schema
   manifest; check completed managed snapshot/PITR availability and timestamp in dashboard.
   Establish a recovery point immediately before the window via the supported backup
   mechanism. If the newest daily snapshot is older than the accepted loss window, wait,
   arrange a supported fresh backup/PITR, or stop. A subscription tier is not backup proof.
2. Record recovery point, retention/expiry, restore-target availability and quoted compute
   cost. Keep production traffic isolated from the restore target. Approve spending before
   provisioning. A backup download/checksum alone is not a restoration test.
3. If also taking a logical backup, use a protected workstation and owner-controlled
   encrypted destination outside Git/tmp build output. Disable shell tracing/history for
   credential injection; no credentials in argv or reports. Use a matching PostgreSQL
   client and a tested consistent-snapshot procedure, or quiesce writers for the entire
   roles/schema/data/history capture. Separately issued dumps while writes continue are
   not a single recovery point.
4. Include roles, schema, application **data**, Auth identities needed for owner FKs,
   sequences, all grants/RLS/triggers/functions, and migration history. Include master
   revisions/counters/config, every `billing_*`, both `ai_budget_*`, both `pdf_*`,
   saved jobs/preferences/clarifications/versions/search attempts. Inventory all public
   tables rather than a historical two-table allowlist. Save protected Auth/SMTP/redirect,
   webhook, DNS and deployment settings separately; keys remain in the secret manager.
5. Check dump exit status, byte sizes/checksums, expected schemas/table coverage, and encrypted
   artifact readability; store only manifest/timestamps/counts in audit evidence. Logical
   restore requires separate migration-history handling and attention to managed schemas,
   encryption keys and roles; follow the [Supabase backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
   for the selected tool version, and prove coverage by restoring into isolation.
6. Database backups exclude Storage API object bytes and custom-role passwords. The current
   resume payloads are database JSON; generated documents are responses, not an object
   archive. Inventory buckets anyway; arrange object backup if any are in use. See
   [Supabase backup limitations](https://supabase.com/docs/guides/platform/backups).
7. Preserve post-backup changes needed for reconciliation: deletions, provider event IDs,
   outstanding checkouts, payments/invoices/refunds/disputes and AI reservations. Use
   protected evidence, not resume payloads or bearer tokens in logs. Record the backup
   evidence location and recovery decision-maker before proceeding.

Post-migration read-only verification must include:

- Migration set and normalized catalog match; no unexpected extra browser grants, PUBLIC
  execution of privileged RPCs, unpinned definer resolution, missing triggers or invalid
  indexes. Browser owner policies belong on master/revisions/entitlement reads; Jobs
  tables are server-only. Service role bypasses RLS, so API token/owner checks remain vital.
- Counts/invariants versus baseline: one master per owner; unique checkpoint revision;
  counters at least retained checkpoint count/bytes (greater is valid after deletion);
  `resume_data_is_valid(data) IS NOT TRUE` count, not `NOT ...` which misses SQL NULL.
  Do not log documents or change historical rows. Constraint validation is a separate
  authorized action after invalid-row handling; NOT VALID still rejects bad new writes.
- AI monthly `spent + reserved <= 25000000`, nonnegative totals, original totals unchanged
  by migration 17, legacy row labels, known usage intact and unresolved reservations
  retained. Compare outstanding reservations with `finished_at IS NULL`, not only status
  `reserved`; completed/uncertain outcomes can still hold a reservation.
- Trusted payment/session uniqueness; granted invoice/payment mapping coverage; entitlement
  recomputation against surviving original windows; unchanged historical price amounts.
  No test purchase or direct entitlement edit in production as an audit shortcut.
- Jobs ownership/unique keys, 160KB snapshots, 64KB analysis bound, nullable legacy analysis,
  correct function grants, owner version uniqueness and revision floor. Count preserved
  versions whose bookmark/master is absent; those are supported retained work, not orphans
  to delete. Confirm Free depth omission through actual API responses.
- Authenticated synthetic-account UI/API matrix in the companion plan; anonymous, forged,
  expired and account-B tokens must never expose account-A data. No production pgTAP test
  execution: those files create/delete fixtures and are for isolated databases.

## Rollback, recovery and later real restore drill

**No destructive rollback is supplied or authorized.** If a file fails before atomic
commit, let the transaction roll back and inspect before retrying. If partial execution
occurred, stop and produce a targeted forward repair from observed catalog state.
Do not drop new tables or replay whole files over live data.

For an application regression, prefer restoring the known-compatible application artifact
and corresponding settings while retaining additive schema/data. Validate compatibility
first: migration 16 changes new checkout binding; 22 permits larger captured rows; new
versions/analysis cannot safely be assumed readable by an older client. Gate affected
new work through authorized configuration/deployment, preserving support/cancellation/
webhooks. Never reset billing locks, AI reservations or entitlements simply to clear an
error. Cloud UI-off neither revokes table access nor stops open tabs.

For corrupt or lost data, preserve incident evidence and current DB before recovery;
restore into a separate isolated project, compare there, then propose a reviewed selective
repair or cutover. Master checkpoint repair must preserve current content and use an
expected revision/new checkpoint; never decrement the optimistic counter. Deletion of a
master also deletes its checkpoint rows, requiring backup recovery. Job-specific versions
have no previous-edit ledger: only current-row copies/backups can recover overwritten
content. Unsaved in-memory browser edits are outside database backup coverage.

The **later populated restore drill**, not performed by this task:

1. Use isolated synthetic accounts A/B/Pro and an isolated release candidate with all
   outbound billing/AI/provider/email integrations disabled or sandboxed. Record target
   identity and isolation; never route production traffic or production webhook delivery
   there. Existing `backup-canary.json` is historical evidence; do not recreate/delete its
   specimen or assume a later snapshot contains it without checking.
2. Populate synthetic master revisions, Unicode/RTL/all-template documents after F1 repair,
   saved provider/capture snapshots, preferences/clarifications, current+stale analyses,
   job versions (including retained removed-bookmark versions), and fixture-only billing,
   export and AI known/unknown usage ledgers. Record canonical JSON SHA256, revision,
   count and accounting expectations in a protected manifest, no personal content.
3. Obtain a completed backup **after** fixture timestamps. Record backup age and drill
   start. Authorize cost; restore to a new isolated project using the supported provider
   flow. Inspect completion, then independently validate data and catalog, not just the
   dashboard success message. Replay only migrations absent from the restored recovery
   point, using the same ordering/history procedure and F1 forward fix.
4. Reconfigure only the isolated app with target-specific public config/credentials,
   CSP and Auth redirects. Managed secrets, email and webhooks require separate handling;
   do not copy live outbound behavior. Test restored Auth identities with safe sessions,
   two-account RLS/API denial, save/reload/conflict and latest/history hashes. The existing
   hosted isolation harness covers master fixtures and is hard-locked to its old recovery
   project; new target coverage needs a separately reviewed harness, not bypassing guards.
5. Simulate a post-backup account deletion and demonstrate deletion reconciliation before
   any hypothetical customer cutover. Reconcile payment/invoice/reversal events that
   happened after the recovery point from authoritative provider records with original
   IDs; no new charges. Preserve AI uncertain holds until external charge evidence supports
   service-only reconciliation. Restoring a database cannot undo Stripe/OpenAI side effects.
6. Record end-to-end measured recovery time, snapshot age/data-loss window, match/mismatch
   counts, failures and operator steps. Require all fixtures, ownership and ledger checks
   pass, plus owner acceptance of measured recovery objectives. Leave isolated until review;
   cleanup/deletion or real production cutover is a separate owner-approved action.

## Auth, billing, AI, Jobs, extension and runtime audit

Auth uses Supabase PKCE, persisted sessions and refresh; mutation APIs call `/auth/v1/user`
to verify tokens and reject anonymous users. Production redirects must allow the exact
origin with `/?account=1` and `/?account=1&reset=1`; test signup confirmation, reset,
expired link, sign-in/out, refresh and callback cleanup with real synthetic accounts later.
SMTP sender/DNS/email limits and Site URL are dashboard settings, not proven by source.
No self-service account deletion implementation was found; support must coordinate Auth
deletion/FKs, retained accounting and active subscriptions rather than claiming automatic
subscription cancellation on database deletion.

Origin checks require POST, JSON and exact `Origin === new URL(APP_ORIGIN).origin` on
browser mutations. No permissive CORS headers/preflight handler is configured. Missing,
foreign or `null` origin fails; wildcard origins are not a fix for preview failures.
GET status endpoints authenticate; Stripe webhook instead checks signature over bounded
raw body, event mode and account, then re-fetches trusted provider objects. Verify actual
edge headers and origin rejection later. Supabase's direct browser master path relies on
RLS, not the app's Origin check. CSP currently hardcodes one Supabase project in
`connect-src`; new isolated projects require a reviewed candidate-specific CSP.

Billing source enforces **US$19.99 / exactly 30 days**, one-time default, recurring opt-in.
Historical notes say new live prices were staged and old Vercel IDs retained until matching
release. This audit did not verify either dashboard. Coordinate migration 16, app and both
IDs; never switch catalog settings ahead of compatible code. Existing subscriptions at old
prices need explicit lifecycle compatibility testing: invoice handling checks the configured
recurring price/current amount. Do not silently reprice subscribers or assume changing an
env value migrates them. Preserve webhook cancellation/reversal handling during sales pause.
Destination `/api/stripe-webhook` must subscribe to source's checkout completed/async success/
expired, invoice paid/payment_failed/marked_uncollectible/voided, subscription updated/deleted,
and charge refunded/dispute created/closed events. Validate exact event list against
`server/billing/handlers.ts` when configuring. Partial refunds remain operator anomalies.

AI source pins `gpt-4.1-mini-2025-04-14`, 3,000 output tokens, 40,000 serialized input bytes,
and cost arithmetic of $0.40 input / $1.60 output per million tokens (`server/ai/cost.ts`).
These are **code assumptions**, not freshly verified provider pricing/availability. Later
owner/provider verification must confirm model access, current costs, project billing limits
and funding before activation; provider budget notifications alone are not the SQL hard cap.
Tailoring requires consent, active Pro and owner-bound saved job/version, strips dedicated
contact fields, sends bounded grounded Match context, uses `store:false`, and has no tools.
Free text can still contain identifiers; do not claim perfect anonymization. Unknown usage/
timeouts retain reserved funds; known invalid output can still cost money. No automatic
age-based release; reconciliation requires evidence. See [AI accounting](AI_USAGE_ACCOUNTING.md).

Jobs search uses the fixed Techmap RapidAPI v2 host/path in `server/jobs/config.ts`; only
derived bounded search criteria go to Techmap, not the resume. Key/license/plan/quota and
global country/occupation coverage require later owner/provider checks. Process cache is
2 minutes/200 entries with in-process coalescing, not a cross-instance quota control. The
durable owner throttle does not cap aggregate spend across accounts. Auto Refresh is opt-in,
daily while UI active, not a cron job. Saved snapshot availability is separate; inferred age
or absence from one bounded search page must not mean “No longer available.” Match Analysis
is deterministic, no AI call, no ATS/hiring prediction. Pro saved analysis reconstructs full
evidence; Free omits depth. Explicit refresh/clarifications use saved snapshots without
provider search. Version/hash invalidation must be verified on reload, not just initial UI.

Extension production is exact `https://resumestride.com/*`; package uses
`manifest.production.json`, removes development ports and delivers via reviewed same-window
messages (not authenticated privilege). Preview URLs/www are not production receiver origins.
Development manifest is not the store artifact. Package/import tests do not prove Chrome
toolbar lifecycle or live-site adapters; final Greenhouse/partial Lever/conservative JSON-LD
acceptance and store privacy/assets remain owner/manual actions. No submission is authorized.

Vercel builds Vite `dist`; 11 `api/*.ts` handlers must be packaged separately from static
assets. `npm run dev` is frontend-only; a later full-stack local check needs `vercel dev`
with isolated configuration, not a replacement Vite process. `package.json` does not pin
`engines.node`, and region/memory/Fluid/runtime choice
is not fully captured in `vercel.json`: record dashboard values and test that actual Node
version (local observed Node24.13.1). See [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js)
for supported runtime configuration; do not assume a local Vite build validates functions.
PDF/tailor explicitly have 60-second maxima; other handlers inherit platform defaults.
Review combined Auth/database/provider latency and response size (especially full Jobs lists).

PDF packaging includes CSS, multilingual fonts and x64 Chromium. After a future isolated
`vercel build --standalone`, run `prepare-vercel-output.mjs` then
`check-packaged-functions.mjs` on that output; the first sets the PDF function x86_64.
The current packaged check covers nine older routes and **omits jobs-search/jobs-account**:
extend isolated packaging acceptance for both before release, proving unauthenticated and
unconfigured failures without provider calls. Do not serve the extension artifact as an
accidental website release asset. No Vercel build/pull/deploy was invoked here.

## Local verification in this audit

- `arch -arm64 npm run test:server`: **378/378 passed**, injected provider fixtures.
- `arch -arm64 npm run test:db`: **553 pgTAP ok assertions**, historical counter checks
  passed; all 23 migrations applied to disposable PGlite, not hosted Supabase.
- Literal requested build and `npm test` hit the existing ARM/x64 esbuild mismatch.
  With `ESBUILD_BINARY_PATH="$PWD/node_modules/@esbuild/darwin-arm64/bin/esbuild"`, production
  build/client typecheck and `arch -arm64 npm run check:server` passed. Existing ~528KB entry
  chunk and Analytics directive warnings remain.
- Default, auth and paid browser suites with that override stopped before tests at local
  `listen EPERM` on ports 5183/5174/5181. **No fresh browser/axe/production acceptance pass.**
- Native `test:db:concurrency` blocked: local `initdb` missing (ENOENT). PGlite success is
  not concurrent-connection proof. Rerun with local PostgreSQL and `PGBIN` in a permitted session.
- Separate local all-template SQL probe reproduced F1 after the full migration chain.
  It is an audit diagnostic, not a passing regression test or a code fix.
- `arch -arm64 npm run package:extension`: passed extension TypeScript compilation and
  local production packaging. Manifest inspected: only `https://resumestride.com/*` host
  permission. This does not establish installed-toolbar acceptance or store publication.
- Graphify AST refresh completed without API calls (4,208 nodes / 7,271 edges / 421
  communities); semantic/community labeling was not run. Final whitespace and local
  document inventory/link verification are recorded in HANDOFF.

Later release matrix: server + db + native concurrency + build/client/server typechecks,
default/auth/paid browsers and extension suite/package; available Chromium/Firefox/WebKit
and axe as in [compatibility plan](ACCESSIBILITY_COMPATIBILITY.md). Then function packaging,
isolated hosted role tests, populated restore drill and locked-production cloud acceptance.
Do not run hosted isolation/benchmark/provider modes as a local-safe test shortcut.
