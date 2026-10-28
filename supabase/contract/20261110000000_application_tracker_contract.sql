-- CONTRACT step for 20261027120000_application_tracker.sql. NOT applied by
-- `supabase db push` (this file is outside supabase/migrations). Apply it only after the
-- tracker release has run in production long enough that rolling the app back to the
-- previous release is no longer needed, after a fresh backup, and with owner approval.
-- After this runs, the previous release can no longer read or write applications.
--
-- Why each removal is needed (none is required for the new release to work):
--   decision, application_status   two overlapping stage sources; `stage` + `closed_reason`
--                                  replace them. Keeping them invites code reading stale data.
--   reminder_enabled, reminder_at  replaced by next_action / next_action_due.
--   job_application_history        replaced by job_application_events (backfilled).
--   jobs_workflow_list / _upsert   the only readers/writers of the columns above.
--   legacy sync trigger            exists only to serve the previous release.
-- To move an application's legacy reminder into a next action before contracting, run the
-- optional statement below (it is idempotent and only fills empty next actions).

update public.job_application_workflows
  set next_action = 'Follow up', next_action_due = reminder_at
  where reminder_enabled and next_action = '' and next_action_due is null;

drop trigger job_application_workflows_legacy_sync on public.job_application_workflows;
drop function public.job_application_workflows_legacy_sync();
drop function public.jobs_workflow_list(uuid);
drop function public.jobs_workflow_upsert(uuid,uuid,text,text,text,text,text,boolean,timestamptz,integer);
drop table public.job_application_history;
alter table public.job_application_workflows
  drop column decision, drop column application_status,
  drop column reminder_enabled, drop column reminder_at;
