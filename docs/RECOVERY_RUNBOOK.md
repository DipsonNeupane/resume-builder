> September 25, Task #60: the entries below are historical evidence. Use the
> [current 23-migration audit and recovery plan](PRODUCTION_READINESS_AUDIT.md) and
> [cloud acceptance plan](PRODUCTION_CLOUD_ACCEPTANCE.md) for the next release.
> This audit performed no backup or restore. The older baseline restore does not
> establish populated recovery of later AI, Jobs, Match, version or capture data.

## September 20 23:10 UTC — awaiting next scheduled recovery snapshot

Read actual recovery-project Supabase Scheduled backups UI. Newest physical snapshot **2026-09-20 11:23:53 UTC**, earlier snapshots03:55:46/03:55:10. Canary created22:39:24UTC, so none shown can contain it. UI states daily backups around midnight of project region; next completion time not guaranteed. No restore clicked and no new project provisioned. This is an external snapshot wait, not an owner failure. Next check for snapshot timestamp AFTER canary creation, then use isolated restore-to-new-project flow (never production Restore) and verify hashes/history.

All current dispatched workers completed. To conserve owner credits, follow-up frequency reduced to6hours while awaiting backup/owner extension/social steps. Paid+Analytics production unchanged. Cloud OFF. Do not repeat completed billing/tests or create another canary.

## September 20 — populated backup specimen prepared, restore pending

Created ONE intentionally retained fictional Auth/resume specimen in isolated recovery project ntrqseoiwyrvdsobwxaj, current revision2 plus history. No production mutation/email/payment. Non-secret identity, timestamp and canonical SHA256 current/history checksums saved in docs/verification/backup-canary.json. This account is test data, NOT a customer. Do not delete or recreate it before checking snapshot availability. Script /tmp/resumestride-seed-backup-canary.mjs refuses duplicate metadata; completed exit0.

Next recovery step: inspect provider backup capability/snapshot time for RECOVERY project; obtain snapshot later than canary createdAt, restore into a separate isolated target, compare hashes/history and authorization, record elapsed recovery time and age. If this recovery project lacks snapshots, establish actual supported backup method rather than claiming this specimen is backed up. No snapshot/restore claimed by this step. Never restore over production. Public cloud remains OFF; paid+Analytics web unchanged. Owner extension toolbar policy blocker and social/Higgsfield setup remain separate.

# Database recovery release gate

## Verified September 20, 2026 UTC

Supabase organization is Pro; spend cap enabled. ResumeStride project ggwwzwqykkncgupdimxp lists physical snapshots dated September 19 08:34:45 UTC and September 18 23:05:12 UTC. These precede the September 19 evening storage-bounds/history migrations. No restore was executed. Snapshot presence is not a successful restore test.

Database snapshots do not include Storage API objects. Resume data currently lives in database JSON; generated PDFs are returned directly, not archived in Storage. Reassess object backup coverage before adding uploads or persistent PDFs.

## Safe restore drill

1. Obtain a snapshot after the latest applied migration and reconcile the hosted migration inventory. Do not mark newer local-only billing/AI/PDF migrations as applied.
2. Use an isolated target with no production traffic, outbound email, payment webhook or AI enabled. Supabase restore-to-new-project can incur extra compute charges: verify price and obtain specific spending approval before provisioning it. Never run the production Restore button as a drill.
3. Record snapshot timestamp, target identity, start/end time and schema migration inventory without credentials or resume contents.
4. Verify restored schema, RLS, grants, functions/triggers and shape constraints against reviewed source. Verify owner isolation using dedicated test identities and fictional documents. Verify latest document plus revision recovery and optimistic conflict handling.
5. Confirm that old/deleted records restored from backup are handled by a documented deletion-reconciliation procedure before serving traffic. Do not resume customer access blindly from an old snapshot.
6. Record measured recovery time and snapshot age/data-loss window. Daily snapshots can lose changes since the last snapshot; do not advertise zero data loss.
7. Leave the target isolated until results are reviewed. Cleanup must follow the applicable approval rules and must never target the production project.

## Release status

Managed backups available. Fresh post-migration snapshot, isolated restore drill, deletion reconciliation and measured recovery remain open. Public accounts/cloud stay disabled until release gates pass.


## September20 04:18 UTC — isolated restore completed; baseline verified

Owner completed credential/create step. Source dashboard lists ResumeStride Recovery Drill COMPLETED Sep20 03:48:43UTC, target ntrqseoiwyrvdsobwxaj. Opened target (not source) SQL editor query9fe8a1b3-21ec-4425-aad0-b66cfab31c7a and ran read-only catalog checks. Five true: resumes present, revisions present, RLS enabled on both,5 owner policies present,2 baseline triggers present. storage_bounds_present false as expected for Sep19 08:34:45 snapshot predating hardening. No customer rows/credentials read, no mutations/deployment. Counts of policies/triggers are presence checks, not full definition equivalence or authenticated isolation proof.

Owner password blocker resolved. Restore time cannot be measured because start time not observed. Need target schema/policy/grant comparison, reapplication of post-snapshot migrations on isolated target, real Auth/PostgREST two-account checks and newer snapshot recovery acceptance. Production untouched; public gates remain off. Old interactive Claude processes only; no new finite worker dispatched.



## September20 05:02 UTC — restored baseline policy/privilege inspection

On isolated recovery project ntrqseoiwyrvdsobwxaj, SQL query9fe8a1b3-21ec-4425-aad0-b66cfab31c7a read actual policy predicates and grants. All5 owner policies use owner_id=auth.uid(), including UPDATE USING and WITH CHECK. Authenticated grants: resumes SELECT/INSERT/UPDATE/DELETE, revisions SELECT only; no anon entries returned. Both trigger functions deny EXECUTE to authenticated and anon; resumes_set_revision invoker, resumes_write_checkpoint definer, both search_path=public,pg_temp, matching baseline source. Counts resumes0/revisions0. No customer content read or data changed.

This is catalog inspection of an empty restored baseline, not proof of document restoration, complete effective-role privilege audit, or real Auth/PostgREST isolation. Need post-snapshot migration replay and fictional authenticated acceptance. Production unchanged and public gates disabled. Existing Claude interactive processes only, no new finite worker dispatched. No owner blocker currently identified.
