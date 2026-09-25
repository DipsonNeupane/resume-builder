# Production catalog reconciliation — 2026-09-25

Scope: read-only inspection of Supabase production project `ggwwzwqykkncgupdimxp`. No migration, history repair, DDL, DML, configuration change, deployment, or secret access was performed. Evidence was limited to catalog metadata and non-identifying aggregate/boolean probes.

## Result

- `supabase_migrations.schema_migrations` is absent. Production therefore has no Supabase CLI migration-history ledger to reconcile against.
- The public catalog contains the 23 tables, 40 functions, 6 RLS policies, 4 application triggers, 27 foreign keys, and zero public sequences expected after migrations 1–15. Table column/type/default fingerprints, index fingerprints, trigger fingerprints, policy expressions, and named constraint inventories match the repository baseline except where noted below.
- All 23 application tables have RLS enabled; none uses forced RLS. No unexpected `anon` or `authenticated` table access was found. The five immutable resume-validation helpers are executable by `anon`/`authenticated`; server-only RPCs remain restricted to `service_role`. Security-definer functions have pinned `search_path`; validator functions use an empty `search_path`; resume trigger functions retain `public, pg_temp` as declared.

## Migrations 1–15

| # | Migration | Classification | Evidence |
|---|---|---|---|
| 1 | `20260918120000_resume_storage.sql` | EQUIVALENT | Resume/revision tables, columns, indexes, triggers, owner policies, grants and FK structure are present. |
| 2 | `20260919150000_resume_storage_bounds.sql` | DRIFTED | Objects and behavior are present, but `resumes_data_shape_valid` is validated in production; the migration declares it `NOT VALID`. This is stricter, not weaker. |
| 3 | `20260919160000_resume_history_accounting.sql` | UNKNOWN | Data-only backfill leaves no catalog object. Production currently has no retained revision rows, so its execution cannot be proved from current state (and presently has no material data effect). |
| 4 | `20260919210000_billing_ledger.sql` | EQUIVALENT | Ledger tables/RPCs, indexes, constraints, RLS and access boundaries are present. |
| 5 | `20260919211000_checkout_intents.sql` | DRIFTED | Production `billing_bind_intent()` records 999 cents; the current repository copy records 1999 cents. The dedicated later price migration is absent, confirming production retains the original price behavior. |
| 6 | `20260919220000_ai_budget.sql` | EQUIVALENT | Original budget tables and reserve/finish RPCs are present with expected security. |
| 7 | `20260919230000_pdf_allowance.sql` | EQUIVALENT | PDF request/owner-limit tables and RPCs are present with expected access restrictions. |
| 8 | `20260920010000_checkout_attempt_throttle.sql` | EQUIVALENT | Checkout-attempt table and throttle RPC are present. |
| 9 | `20260920020000_recurring_billing.sql` | EQUIVALENT | Subscription/invoice structures and RPCs are present. |
| 10 | `20260920030000_billing_reversals.sql` | EQUIVALENT | Reversal/dispute structures and RPCs are present. |
| 11 | `20260920040000_recurring_checkout.sql` | EQUIVALENT | Recurring checkout structures and RPCs are present. |
| 12 | `20260920050000_owner_checkout_reservation.sql` | EQUIVALENT | Owner-lock structure and reservation/bind/release RPCs are present. |
| 13 | `20260920060000_recurring_invoice_reversals.sql` | EQUIVALENT | Subscription invoice reversal structures and RPCs are present. |
| 14 | `20260920070000_atomic_invoice_grant.sql` | EQUIVALENT | Atomic mapped-invoice grant RPC is present with expected security. |
| 15 | `20260920080000_resume_validation_search_path.sql` | EQUIVALENT | All five resume validator functions have `search_path = ''`. |

## Confirmed pending migrations

All eight later migrations are absent:

- `20260923120000_pro_pass_price.sql`: production checkout binding still uses 999 cents, not 1999.
- `20260924120000_ai_usage_accounting.sql`: new accounting columns/RPCs are absent.
- `20260924150000_saved_jobs_preferences.sql`: `saved_jobs`, `job_preferences`, and RPCs are absent.
- `20260924170000_job_match_analysis.sql`: match-analysis table/columns/RPCs are absent.
- `20260924190000_job_resume_versions.sql`: version table/RPCs are absent.
- `20260924200000_tailoring_inputs.sql`: tailoring-input RPC is absent.
- `20260924210000_extension_capture.sql`: extension-capture source-identity RPC and dependent changes are absent.
- `20260924220000_jobs_search_throttle.sql`: throttle table/RPC is absent.

## Seven-template validator

Production `resume_data_is_valid(jsonb)` explicitly permits only `modern`, `classic`, and `minimal`. It contains no `compact`, `bold`, `executive`, or `ledger` values. Because `resumes_data_shape_valid` is both present and validated, a cloud resume using any of those four current templates is rejected on insert/update. The function is secure in execution properties (`IMMUTABLE`, invoker-security, empty `search_path`) but functionally stale relative to the seven-template application.

## Safe reconciliation plan

1. Take the owner-controlled pre-migration backup next, while the catalog is unchanged.
2. Do not replay migrations 1–15 and do not use automatic history repair yet.
3. Restore the historical migration-5 source to its original 999-cent definition (from trusted history), leaving migration 16 as the sole forward 1999-cent change; review this change before any repair.
4. Document the accepted migration-2 validation-state drift; do not weaken or recreate the validated constraint.
5. Treat migration 3 as an owner-reviewed no-op-equivalent only while the no-revision evidence remains true; recheck immediately before reconciliation.
6. After backup, record/repair history for the accepted 1–15 baseline in a controlled window, then verify catalog fingerprints again.
7. Apply migrations 16–23 in order only after history reconciliation and their preflight checks. Create the separate seven-template validator migration afterward; do not fold it into historical files.

It is safe to proceed to the **pre-migration backup step**. It is **not yet safe to apply pending migrations** until the historical migration-5 source discrepancy and history-repair plan are resolved.
