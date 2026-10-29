-- Read-only staging check AFTER applying the six launch migrations (expand step only).
-- Expected markers: all true.
-- Counts only. Every *_disagreements / *_without_* / browser_grants value must be 0.
begin read only;
-- Ledger-independent markers (production has no migration ledger): structural objects from
-- 20261027120000, 140000, 150000 and 20261028100000. Files 100000 and 160000 only replace
-- functions; compare those through supabase/checks/catalog_fingerprint.sql.
select (to_regclass('public.job_application_events') is not null) as tracker_120000,
  (to_regclass('public.product_tailoring_trials') is not null) as trial_140000,
  exists(select 1 from information_schema.columns where table_schema = 'public' and column_name = 'requirement_edits') as requirement_edits_150000,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_resume_versions' and column_name = 'provenance') as provenance_281000;
select stage, closed_reason, count(*) as rows from public.job_application_workflows group by 1, 2 order by 1, 2;
-- A legacy "pass" (decision) with status not_applied is the old way of saying archived.
select count(*) as stage_legacy_disagreements from public.job_application_workflows
where not (stage = 'closed' and closed_reason = 'archived' and decision = 'pass')
  and application_status <> case stage when 'saved' then 'not_applied'
    when 'closed' then case when closed_reason = 'withdrawn' then 'withdrawn' else 'closed' end else stage end;
select count(*) as closed_without_reason from public.job_application_workflows where stage = 'closed' and closed_reason is null;
select count(*) as browser_grants from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
  and table_name in ('job_application_workflows','job_application_events','job_application_documents',
    'product_settings','product_tailoring_trials','product_tailoring_trial_runs');
-- Expected: free_application_limit = 100 (tracked applications per Free account, all stages, no reset),
-- free_tailoring_trials = 1 (complete tailoring trials per Free account, lifetime, no reset),
-- free_trial_ai_runs = 3 (successful AI suggestion runs within that one trial; failed runs do not count).
select free_application_limit, free_tailoring_trials, free_trial_ai_runs from public.product_settings;
select (select count(*) from public.job_application_events) as events, (select count(*) from public.job_application_history) as legacy_history_rows;
-- Expected: ai_monthly_budget_micro_usd = 25000000 (US$25 service-wide per UTC calendar month; a
-- lowered staging value must be restored to this before any production step).
select ai_monthly_budget_micro_usd from public.product_settings;
-- Expected: versions_without_provenance = 0 (every version has a provenance array, [] by default),
-- trial_runs_reserved = 0 (no reservations left behind) and the old four-argument update is gone (0).
select (select count(*) from public.job_resume_versions where jsonb_typeof(provenance) <> 'array') as versions_without_provenance,
  (select count(*) from public.product_tailoring_trial_runs where status = 'reserved') as trial_runs_reserved,
  (select count(*) from pg_proc where proname = 'job_resume_version_update' and pronargs = 4) as old_update_signature;
commit;
