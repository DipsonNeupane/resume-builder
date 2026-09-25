# Production cloud-saving acceptance plan — not executed

Task #60, September 24–25, 2026. This is the exact later acceptance procedure for the
production candidate, under the existing access lock. No production test accounts,
cloud writes, entitlement changes, provider calls or restore were made in this task.
Prerequisites and blockers: [production audit](PRODUCTION_READINESS_AUDIT.md).

## Entry criteria and evidence

**OWNER ACTION REQUIRED** for a later production test window, protected candidate
deployment/configuration, synthetic accounts and any real email/provider spend. Do not
unlock production to perform acceptance. First complete all-template validator repair,
reviewed migrations, backup/rehearsal, packaging, browser tests and the populated restore
drill. A locked candidate build with `VITE_CLOUD_STORAGE_ENABLED=true` is necessary;
the existing public cloud-off build cannot prove this behavior. Preserve the public
deployment until the candidate passes. Use same production origin through an approved
locked release arrangement; alternate candidate origins require their own configured
APP_ORIGIN/Auth/CSP and cannot prove extension production-origin delivery.

Use fictional data and dedicated synthetic users only:

- N: new Free account, no master, empty Jobs state.
- E: existing Free account from before enablement, no master, with an existing browser
  draft. Also exercise an existing account with an already stored master revision ≥2.
- P: existing Pro acceptance account with a legitimate verified entitlement. Do not
  manipulate production entitlements or make a charge merely to manufacture this fixture.
  If none exists, owner must arrange a separate approved entitlement/payment test.
- B: distinct second account with visibly different fictional content. Use both separate
  browser profiles (isolation) and two tabs of the same account (conflict).

Retain a case sheet with candidate artifact/hash, schema manifest, cloud flag, browser,
UTC start/end, synthetic account aliases, expected/observed revision and canonical document
hash, API status/category, pass/fail and redacted evidence location. Keep Auth tokens,
cookies, email links, personal data and raw HAR/request bodies out of reports. An operator
can confirm owner/count/hash via protected read-only queries without publishing identifiers.
Record request counts by endpoint to prove zero provider/AI calls where required.

For every cloud case, observe the visible save state **and** persisted row/revision/hash;
a toast alone is insufficient. Reload in a second fresh authenticated profile to rule out
React memory or sessionStorage as the source. Verify all seven templates, A4/Letter,
English plus Arabic RTL and non-Latin content; occupation/country must not affect saving.

## Ordered acceptance cases

| Case | Exact actions | Required result / failure condition |
| --- | --- | --- |
| C00 — cloud-off control | On the existing cloud-off build, sign in and edit master; inspect network and guest storage. | No `resumes` PostgREST read/write or cloud-consent prompt from master hook. Label remains truthful. Jobs/version persistence is separate, not expected to be disabled by this flag. |
| C01 — new blank account | In fresh profile create N, confirm email, sign in, open blank builder; then type fictional name/headline/contact and section content. | No automatic master INSERT on signup/blank editor. Content triggers “Save your local resume to your ResumeStride account?” only after the initial cloud check succeeds. |
| C02 — consent decline | With N content present choose “Not now”, edit and reload within the same session. | No master INSERT before explicit acceptance. Draft remains session-local. Decline is not advertised as permanent account preference; verify actual prompt behavior on a new session. |
| C03 — first save | Accept “Save to my account”; double-click while delaying response. Type another edit while INSERT is in flight. | One master/account, initial revision1; no overlapping duplicate create. Newer edit eventually saves with higher revision. “Saved to your account” only once latest content is stored. Original guest `resumestride.resume.v1` is not overwritten by linked edits. |
| C04 — save/reload/templates | After success edit summary/sections; wait for saved; reload, close/reopen in fresh signed-in profile. Repeat template select/save/reload for modern/classic/minimal/compact/bold/executive/ledger, both paper sizes and RTL/non-Latin samples. | Exact content/template/language/direction returns, revision increments and checkpoint content agrees. **Currently blocked by F1 for four templates** until forward repair. Never silently switch template to pass. |
| C05 — existing accounts | Sign E into candidate with pre-enable guest draft and no cloud row, then repeat with pre-existing cloud master and a different local guest draft. | No row: explicit consent path. Existing row: loads that owned master, no replacement INSERT; local guest remains unchanged and returns at sign-out. Existing account status/paid state preserved. |
| C06 — delayed/failed load | Delay master GET, type in editor, then release it with existing row; separately fail GET/network and retry by reload. | Late existing row creates explicit conflict, never discards typed work. Failed check is not treated as absence: no consent/create/overwrite offer based on a failed GET. Unreadable revision/data produces truthful error with guest unchanged. |
| C07 — simultaneous first save | Two tabs N with no row (use another synthetic account if N already saved), hold both initial absence reads, then accept different drafts. | Exactly one INSERT wins. Unique conflict fetches winner; losing draft preserved for explicit resolution, never last-write-wins create. Database has one master and consistent checkpoint history. |
| C08 — master concurrent conflict | Two tabs E read revision R. Tab1 saves marker A and gets R+1. Tab2 edits marker B against R. | Tab2 stale PATCH matches zero rows; shows “Account resume needs attention” plus “Use the other version” / “Keep my edits”; neither tab silently overwrites the other. A stale PostgREST update may be HTTP200 with zero rows, not necessarily HTTP409. |
| C09 — both conflict resolutions | First choose “Use the other version” in Tab2; repeat conflict and choose “Keep my edits”. While latter is pending type another edit; also repeat with Tab1 winning again before Tab2 resolves. | First choice loads saved A without writing. Second writes against the retrieved current revision and creates new checkpoint; newer local edit later saves. Another intervening write causes another conflict. Double-click cannot send overlapping resolution writes. |
| C10 — job-specific creation | With P and a saved fictional job with description, choose persistent job-specific resume. Repeat click/tab request. | Exactly one `(owner,saved_job)` version. When cloud master exists, server uses stored master even if caller supplies different browser content. No cloud master: uses validated browser master. Record copied master id/revision/fingerprint and initial version revision. Master untouched. |
| C11 — version save/reload/conflict | Edit active version and wait for saved; navigate away/back and fresh-profile reopen. Open same version in two tabs and repeat R/R+1 conflict with “Use saved version” / “Keep my edits”. | Version content/revision persists; master unchanged; explicit conflict choices and no automatic overwrite. Active version editing pauses master autosave. Newer unsaved version edits are never falsely marked saved. |
| C12 — master change/reset | Modify/save master, return to version; choose “Keep this version”, then repeat and explicitly confirm “Update from master”. | Changed fingerprint warns without merging. Keep preserves existing version. Reset uses authoritative current master with expected version revision, changing only version. Reset conflict cannot overwrite newer version. No historical version restore is promised. |
| C13 — accepted/rejected AI edits | **Separately approve any paid provider call.** P consents from saved version; inspect request keys, bounded provider evidence, rationale. Reject one suggestion and accept another; save/reload. | Browser sends owner-bound version/job IDs, not arbitrary raw resume/job text. No contact fields sent as dedicated fields; absent description/mismatched or B IDs fail before provider. Reject writes nothing; Accept persists only version; master unchanged. Accounting settles known usage, no duplicate spend for same fingerprint within 10min. Fixture-based negative/timeout tests precede any production call; never force paid failures for testing. |
| C14 — current export target | From saved version export PDF and DOCX with explicit consent, within a separately approved synthetic quota test; return to master and export. | Each document contains the selected document's marker. Shared Free allowance/Pro checks unchanged; denied/retried exports do not double consume. No archived output is implied. |
| C15 — saved jobs/Match reload | Free saves 3 fictional snapshots, retries duplicates, tries a fourth. P saves >3. Set preferences; leave Auto Refresh off, reload; explicitly toggle on/off. Save analysis, reload P and Free. Edit evidence/preferences/clarification then manually refresh stale saved analysis. | Deduped saves consume one slot; fourth Free blocked without deletion. Preferences isolated/persisted; auto refresh explicit/daily/reversible. Pro full requirement/evidence restored, Free depth omitted in API payload as well as UI. Stale hashes/reasons surfaced; manual refresh and clarifications make **zero Techmap/OpenAI calls**. Inferred old posting remains available; only provider-confirmed expiry/unavailability changes label. |
| C16 — expiry/removal retention | On isolated fixture environment exercise Pro expiry, removed bookmark, removed master; repeat read-only retained-version checks against any legitimately expired production fixture. | Existing jobs/versions remain readable/manual-editable/exportable subject to document quota; new version/AI Pro actions blocked. Removed bookmark version remains listed; new tailoring fails without owner-owned saved job. Master removal does not delete version. Destructive setup/removal in production requires separate owner authorization. |
| C17 — account switch during work | Delay A master load/save and version load/save, switch to B then release responses. Repeat while Jobs/Match/capture request is pending. | No A content/results/toast applied under B or written into B/guest state; B sees B's rows. Already dispatched A write may finish under A only. Requests never change owner based on browser-supplied ID. |
| C18 — sign out/in | After successful saves sign out, inspect guest draft; sign A back in then B. Repeat sign-out while load is delayed. | Guest draft restored, linked content never copied into guest key; delayed results ignored. Fresh sign-in retrieves correct account version/master and saved jobs. Use “Saved” before normal sign-out; unsaved linked edits are not promised durable across sign-out/tab close. |
| C19 — outage/retry/cap | In controlled browser fail/delay its save request; keep editing, then reconnect. In isolated DB fixture trigger real history cap/rate cap; test explicit retry after operator storage review. | Dirty edits preserved while tab open; exponential retry ≤30s backoff for transient failures, no 350ms request storm. Permanent history cap stops retries and warns to keep tab open/contact support. No “Saved” until success; no automatic history deletion/counter reset. Do not raise caps or fill production history for testing. |
| C20 — recovery | In isolated fixture delete current master then resolve stale tab; separately recover a master checkpoint and a backed-up job version following runbook. Perform populated physical restore drill before production enablement. | Deleted-row conflict offers “Save my edits as new”; no endless stale PATCH. Checkpoint recovery writes reviewed new revision, not counter rollback. Job version recovery is from a backup/current copy, not nonexistent version history. Record hashes, ownership, measured RPO/RTO and deletion reconciliation. |
| C21 — authorization/origin | As B/anon/expired session attempt A master/history reads/writes, Jobs/version IDs and service RPCs. Send missing/foreign/null Origin to app mutations, invalid webhook signature, direct browser access to Jobs tables. | No cross-owner rows or mutations; privileged RPC execution denied to browser roles. App mutation origin rejected; valid origin alone grants no ownership. Do not weaken RLS/CORS/access lock to pass. |
| C22 — extension boundary | Install production package by approved manual Chrome path; capture supported synthetic/public job, review/edit, deliver to exact production origin, sign in and explicitly save. Retry same capture/URL. | Production-only host permission, delivery acknowledgment, no automatic privileged save, deduplication and account isolation. Follows normal Match/version flow; privacy/store release still separate. No capture quota/provider request needed for deterministic path. |

C07, destructive C16, real cap C19 and C20 belong first on an isolated production-equivalent
database; their production equivalents use disposable synthetic rows only under the approved
test window. Do not delete customer data, modify real entitlements, exhaust live provider
quotas, or alter access locks to create test conditions. Record a case as blocked when its
safe fixture/authorization is unavailable; never convert an isolated pass to a production pass.

## Exit and failure handling

All applicable production cases must have independent persisted-state evidence. Required
isolated destructive cases and populated restore must also pass. Re-run failed cases after
fixes, plus the affected regression suites. Any cross-account leak, silent overwrite,
unsupported-template rejection, accounting drift or false saved state blocks enablement.
If blocked, preserve open unsaved tabs/test evidence and candidate isolation; follow the
forward-repair/application rollback procedure in the audit. Do not clean up fixtures until
owner review and separate deletion approval. Explicitly record tests not run and why.

Final owner sign-off requires migration/candidate hashes, completed acceptance sheet,
populated restore evidence, measured recovery objectives, storage-limit/support decisions,
monitoring owner and rollback artifact. Only then may a later authorized release enable
master cloud saving. This document is a plan, not that sign-off.
