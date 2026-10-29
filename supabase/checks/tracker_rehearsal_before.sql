-- Read-only staging check BEFORE applying the six launch migrations (20261027100000..20261028100000),
-- i.e. after files 16–33. Expected markers: all false.
-- Counts only: no resume contents, job text, notes, contact details or user identifiers.
begin read only;
-- Ledger-independent markers (production has no migration ledger): structural objects from
-- 20261027120000, 140000, 150000 and 20261028100000. Files 100000 and 160000 only replace
-- functions; compare those through supabase/checks/catalog_fingerprint.sql.
select (to_regclass('public.job_application_events') is not null) as tracker_120000,
  (to_regclass('public.product_tailoring_trials') is not null) as trial_140000,
  exists(select 1 from information_schema.columns where table_schema = 'public' and column_name = 'requirement_edits') as requirement_edits_150000,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_resume_versions' and column_name = 'provenance') as provenance_281000;
select application_status, decision, count(*) as rows
from public.job_application_workflows group by 1, 2 order by 1, 2;
select count(*) as history_rows from public.job_application_history;
commit;
