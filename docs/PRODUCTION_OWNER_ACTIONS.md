# OWNER ACTION — later production/cloud rollout

Task #60 audit completed locally September 25, 2026. **Nothing deployed, migrated,
unlocked, backed up or restored by this task.** Full [audit](PRODUCTION_READINESS_AUDIT.md)
and [acceptance plan](PRODUCTION_CLOUD_ACCEPTANCE.md) contain the execution details.

- [x] The cloud validator forward fix is implemented and recorded in the hosted catalog;
  all seven templates pass the disposable database replay and pgTAP coverage. The final Jobs
  refresh-reservation migration is also recorded, with service-role-only function ACLs and
  pinned empty search paths verified after application.
- [ ] Resolve version-storage growth, retention, support recovery and account-deletion
  handling before broad cloud enablement.
- [ ] Authorize a separate dashboard/read-only inventory session: exact deployment/project,
  migration history/catalog drift, environment names/scopes, Auth redirects/SMTP, current
  locks, runtime, DNS/HTTPS and provider/catalog state. Supply access through secure account
  tooling only; do not send secret values in chat. Existing credentials may already suffice.
- [ ] Confirm both US$19.99 Stripe Price IDs, old-subscription lifecycle compatibility,
  signed webhook events/cancellation, OpenAI model/cost/funding and Techmap plan/quota.
  Any real provider call, charge or subscription change needs its own approved test scope.
- [ ] Approve recovery objectives, encrypted backup location/retention, migration window
  and quoted isolated restore compute cost. Require a fresh pre-migration recovery point
  and a populated restore drill with measured recovery time/data-loss window.
- [ ] Native Postgres concurrency still needs a host with `initdb`. Local Chromium,
  Firefox and WebKit acceptance is current; all 11 packaged APIs, including both Jobs
  routes, pass the standalone output verifier. Retain physical-device/screen-reader review
  as human acceptance rather than representing it as automated evidence.
- [ ] Review the exact pending migration list/checksums and catalog comparison; separately
  authorize history repair/forward migrations and locked candidate deployment. Keep current
  production access protection in place. DNS changes only if independently necessary and
  explicitly authorized; none are required merely to finish this audit.
- [ ] Arrange synthetic new/existing/Pro/B acceptance identities; run and sign the cloud
  acceptance sheet. Authorize only the named synthetic writes, email and recovery actions;
  no customer data or production entitlement shortcuts.
- [ ] Only after all gates pass, authorize a separate cloud-enabled release and monitoring
  window. Name the recovery operator, support contact and rollback artifact. Extension
  toolbar/store acceptance, submission and any destructive cleanup remain separate actions.

No dashboard access, credential provisioning, DNS change, migration, restore, deletion,
access-lock change or production activation is implied by checking off this local audit.
