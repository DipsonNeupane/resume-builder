# Chrome Web Store readiness — Task #61, unpublished draft

Prepared September 25, 2026 from source and a locally rebuilt artifact. **Preparation
only: no installation, developer-dashboard action, upload, submission, publication or
production change.** All store text below is draft copy, conditional on the owner gates.
Package readiness is not real-site or production acceptance.

## Manifest and artifact audit

| Item | Observed source / packaged result |
| --- | --- |
| Manifest | V3; module service worker; Chrome 120 minimum |
| Title / version | ResumeStride Job Capture / 0.2.0 (unchanged unpublished candidate) |
| Short description | Capture and review a job, then save it in ResumeStride for Match Analysis and your job-specific resume. |
| Icons | Actual PNGs at 16, 32, 48, 128 square pixels; toolbar and extension maps agree |
| Permissions | Only activeTab, scripting, storage, alarms; each used below |
| Permanent host permission | Exactly `https://resumestride.com/*`; no www, subdomain wildcard, job-board, localhost or all-sites grant |
| Destination | Exactly HTTPS `https://resumestride.com/`, root only; credentials, query, fragment, other ports/hosts/paths and developer ports rejected |
| CSP | Explicit `script-src 'self'; object-src 'none';` in both manifests; packaged local scripts only, no eval/remote executable code, no sandbox pages |
| Automatic access | No manifest content scripts, external messaging, web-accessible resources, navigation/history listeners or optional permissions |
| Package | 16 allowlisted runtime files; ZIP manifest at root; no source maps, TS, env files, tests, fixtures, docs, node_modules, git metadata or unused types.js |

The production packager copies an explicit runtime list and rejects symlinks, altered
destination replacements and manifest drift.
Source-map emission is explicitly disabled. The artifact gate checks local import closure,
icon dimensions, permission/CSP boundaries, packaged destination behavior, suspicious
secret/code markers and exact contents. A local ZIP is extracted into a temporary folder,
re-inspected and compared byte-for-byte via per-file hashes. The report sits outside the
package. Pattern scans plus manual source review found no development credentials; scans
are not a guarantee against every possible obfuscated secret. No private env file was read.

Build from repository root (requires local `zip` and `unzip`):

```sh
arch -arm64 npm run package:extension
arch -arm64 npm run check:extension-package
unzip -l dist/resumestride-extension.zip
unzip -t dist/resumestride-extension.zip
```

No-install test selection used for this preparation (the full suite loads an unpacked
extension, so it is reserved for later authorized testing):

```sh
arch -arm64 npm run test:extension -- --project=extension jobCapture.spec.ts bridge.spec.ts greenhouse.spec.ts structured.spec.ts
arch -arm64 npx playwright test --config playwright.capture.config.ts
arch -arm64 npm run test:server
```

The production popup’s destination hint, invalid/rejected URL messages and connection
failure guidance now consistently refer to the official site. The package checker
rejects leftover localhost/local-server guidance; development builds retain their
existing local testing instructions. No capture or delivery behavior changed.

Outputs: `dist/extension/`, `dist/resumestride-extension.zip`, and
`dist/extension-package-report.json` (inventory, sizes, SHA-256 for every file and ZIP).
Run packaging **after** the web build, because Vite clears root `dist/`. These are ignored
build outputs, never an instruction to upload. Rebuilding can change ZIP timestamps/hash;
retain the report for the exact candidate later tested. Never upload `apps/extension`, whose
developer manifest permits local app ports. The guarded localhost extraction branch remains
in the shared extractor; no fixture HTML is shipped and production delivery refuses localhost.

The icons were visually inspected: a white document and gold detail on a green full-canvas
square. Dimensions pass, but the 128px artwork lacks the recommended transparent square-icon
padding. **OWNER ASSET ACTION:** approve/correct store padding and current brand treatment
before upload; rebuild and re-inspect afterward. No new artwork or screenshots were fabricated.

## Single purpose and listing copy — draft

**Title:** ResumeStride Job Capture

**Short description:** Capture and review a job, then save it in ResumeStride for Match Analysis and your job-specific resume.

**Single purpose:** Help people capture, review and send one public job posting they choose
to their ResumeStride saved-job workflow.

**Full description (copy only after production and live acceptance):**

Bring a public job posting into ResumeStride without repeatedly copying its details.
Open a supported job page, click ResumeStride Job Capture, review and edit the captured
fields, then choose “Send reviewed details to ResumeStride.” Sign in to ResumeStride and
choose “Save job and see how I match” to finish saving it to your account.

Capture is available for Greenhouse job pages, selected Lever pages with stable UUID job
URLs, and pages containing one reliable, unambiguous JSON-LD JobPosting. Workday capture
works only where that reliable JobPosting metadata is present. LinkedIn and Indeed are
intentionally unsupported. Layouts and metadata vary; when capture is unavailable, enter
the public job details manually. Always check the source, employer and description before
saving. Long descriptions may be truncated and are marked for review.

The extension reads the chosen job page only when you invoke it. It captures job details
and the source URL with query and fragment removed. It keeps one temporary session capture
for review or retry and sends it to https://resumestride.com only after you choose Send.
It does not collect your browsing history across sites, read passwords or resume drafts,
apply to jobs, or run background job searches. Greenhouse capture may use its anonymous
public job endpoints. Job text and edits can contain personal information; remove anything
you do not want to send.

A ResumeStride account is required to save jobs. Free accounts can save up to three jobs
and receive the Free Match Analysis preview. Pro provides deeper analysis and the existing
job-specific resume and reviewed AI tailoring workflow in the web app; it is a separate
paid entitlement. Document downloads follow the app’s allowance. Capture does not guarantee
job availability, employer accuracy, a hiring outcome or an ATS score. ResumeStride serves
people across occupations and countries; this extension’s interface is currently English.

Support: support@resumestride.com. Website: https://resumestride.com.

## Supported-site wording and limits

| Site/pattern | Permitted wording / source evidence |
| --- | --- |
| Greenhouse | Public `job-boards.greenhouse.io/{board}/jobs/{numeric-id}` and `boards.greenhouse.io` job pages; JSON-LD first, otherwise bounded exact job + board API GETs |
| Lever | Selected stable UUID job pages on `jobs.lever.co` / `jobs.eu.lever.co`; metadata or scoped posting sections and employer logo alt required; no blanket Lever support |
| Workday | Only pages with reliable, single unambiguous JobPosting JSON-LD; no Workday-specific scraper/API fallback |
| Generic | One JobPosting in object/array/@graph metadata with title, employer and description; URL must match when present; malformed, ambiguous, oversized or query-identified metadata fails closed |
| LinkedIn / Indeed | Intentionally blocked before generic extraction; manual entry only |
| Other cases | No promise for login-only/private pages, search results, embedded job frames, browser internal pages or every custom employer domain |

Source: `apps/extension/src/inject/extract-job.ts`; controlled extraction cases in
`tests/extension/greenhouse.spec.ts` and `structured.spec.ts`. Metadata cannot prove a page
is public: the owner must test public examples, and users should not invoke capture on
private postings. Manual entry is not advertised as an integration with unsupported sites.

## Privacy disclosures — as-built draft, owner review required

**Data handled:** job title, employer, description, optional job location/workplace,
employment type and structured salary, source origin/path, capture time and adapter label;
bounded original fields/source and reviewed edits. Title/company/location are capped at
300 characters, description at 12,000 including truncation marker, source URL at 2,000.
Description and URL paths may still contain personal information. Query/fragment stripping
is not complete anonymization. The active tab URL is inspected locally to derive the path.

**Storage:** one `chrome.storage.session` capture, no local/sync disk store; 30-minute
inactivity expiry checked on reads and by alarm, so physical cleanup may await browser
scheduling. Editing/sending renews expiry. Successful receipt or discard removes it;
browser restart clears session storage. Discard also attempts a fresh capture of the
current tab: it can immediately create a replacement. The worker retries an accepted send
at most three times (eight-second receipt windows); it is not a durable auto-send queue.
A content-free result/duration record goes only to the worker console, not an analytics server.

**Transfers:** Greenhouse fallback makes anonymous HTTPS GETs to exact public board/job
endpoints with omitted credentials, no referrer and no redirects; the endpoint still sees
normal connection metadata such as IP address. Other adapters parse the active page locally.
Send passes the bounded capture to the exact ResumeStride page through an isolated-world,
same-window/origin, acknowledged message. No capture is embedded in the destination URL.
The app holds it in tab memory before explicit authenticated save; account switch/sign-out
clears review. Account saves and retained job-specific versions use the existing app/server
and Supabase ownership boundaries. Removing a bookmark does not remove its separate resume
version. The extension does not receive auth tokens, resume evidence, payment credentials
or model keys; optional AI and export processing require separate web-app actions/consent.
Website hosting, account storage, logs and optional AI are covered by the app policy.

**Retention/deletion:** pending capture can be cleared in the popup or by restarting Chrome;
saved account data follows the app’s removal and verified support-request process and any
necessary backup/legal retention. Do not promise immediate deletion from backups or that
uninstalling the extension deletes previously saved account records.

**Dashboard categories (draft mapping):** disclose website content and user-entered job
content. Conservatively disclose the current job URL under web history/browsing activity
as applicable to the dashboard’s current definition; this is a user-chosen source link,
not continuous history collection. Review incidental identifying information in job text
and edits, and any categories required for the linked account service. Do not mark “no data
collected,” or claim no URLs are handled, no third-party processing, or all processing local.
The old draft’s categorical instruction to omit browsing history was incorrect: Chrome’s
[data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
includes interacted-with URLs and locally handled data. This mapping is our conservative
interpretation; the owner must verify the current dashboard and actual service practices.

**Limited Use wording for owner approval:** “ResumeStride uses captured job content and
its source URL to provide the job-capture and ResumeStride features you request. We do
not sell this data or use it for targeted advertising or creditworthiness decisions.
Our use and transfer of information received through the extension will comply with the
Chrome Web Store User Data Policy, including its Limited Use requirements.” The owner must
confirm operational practices, permitted transfers and human-access limits before certifying.

**Policy URL OWNER ACTION:** intended URL `https://resumestride.com/privacy.html`.
The repository policy currently lacks a complete extension-specific section; this draft
is not a published privacy notice. Approve extension data/retention/transfer/rights text,
then publish it only in a separately authorized release. Verify unauthenticated accessibility
and support contact before filling the dashboard. [Chrome privacy fields guidance](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
requires consistent purpose, permissions, remote-code and data-use declarations. Remote code
answer for this artifact: **No**; Greenhouse JSON is data, never executable instructions.

## Permission justifications — draft dashboard text

| Permission | Justification |
| --- | --- |
| activeTab | Temporarily read the page the user chooses by invoking the extension action, to extract that one job’s details. No permanent job-board or all-sites permission. |
| scripting | Inject the packaged extractor into the chosen tab’s top frame, and the packaged receipt bridge into the ResumeStride tab opened after Send. |
| storage | Keep one bounded review/retry capture and its chosen source URL in session memory across popup closure; no ongoing browsing history, resume data or credentials. |
| alarms | Expire the session capture after 30 minutes of inactivity even if the popup stays closed; read-time checks also reject expired data. |
| https://resumestride.com/* | Deliver the user-reviewed capture to a newly opened official app tab and wait for acknowledgment. That destination tab has no source-tab activeTab grant. Runtime restricts delivery to the exact HTTPS root URL. |

No `tabs` permission is needed merely to open/query tabs under these existing grants.
The popup is the only accepted worker sender; schema and destination validation happen
before opening a destination. The page acknowledgment proves receipt, not account identity
or authorization to save, tailor or export.

[Chrome activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
confirms the temporary grant follows explicit invocation and survives same-origin navigation,
but ends on cross-origin navigation or tab closure. Closing the popup alone does not revoke
it. Injection defaults to isolated world/top frame. Permanent access to the destination
origin is a separate grant. CSP in the package tightens Chrome’s default object source to
none; its [documented extension-page scope](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
does not prove job-page API/CORS behavior. Greenhouse live fallback still needs acceptance.

## Reviewer testing instructions — draft, not sent

1. **Owner prerequisite:** confirm the coordinated capture API/migration/app version is
   available and the production access lock permits review. Supply a temporary reviewer
   account via the store’s private test-instructions field if needed, never in this repo,
   listing or screenshots. No credentials, purchases or keys are provided here.
2. Use a normal supported Chrome profile with only the submitted candidate enabled. Owner
   must supply dated public Greenhouse and Lever UUID URLs, and an unambiguous JobPosting
   example verified just before review. Do not invent durable live URLs in the listing.
3. Open the public example and click the actual toolbar action. Review title, company,
   description and Source & connection; edit a harmless field and Send. No additional
   all-sites/job-board host grant should be necessary. Opening popup.html as a tab does
   not establish activeTab acceptance.
4. Check the new `https://resumestride.com/` tab, sign in if needed, and explicitly choose
   Save job and see how I match. Receipt alone does not save. Repeat the same source and
   check the existing bookmark/duplicate message; verify the Free three-job boundary.
5. Verify manual entry on unsupported/ambiguous examples, including LinkedIn and Indeed.
   Pro is not needed to evaluate capture/review/send or Free save; only test the separately
   advertised Pro app flow if the owner supplies an appropriate test entitlement. Do not
   require a real payment or unapproved live model/provider call to review this extension.
6. Reopen a pending capture after closing the popup; test failure/retry, restart and
   expiry. The discard control re-captures the current tab, so use an unsupported/blank
   page to verify empty state. Send failure must not claim an account save succeeded.

Real URLs, reviewer account, access-lock arrangements and production evidence are **OWNER
ACTION — missing**, not evidence of a store-ready service. See the detailed
[LIVE ACCEPTANCE checklist](EXTENSION_LIVE_ACCEPTANCE.md) for later testing.

## Screenshot and asset checklist — OWNER ACTION

- [ ] Capture 1–5 genuine screenshots, preferably 1280×800 (640×400 also accepted), square
  corners and full bleed. Required minimum is one. Review readable text at reduced size.
- [ ] Provide the required 440×280 small promotional image; optional marquee is 1400×560.
- [ ] Approve the existing 128×128 PNG and correct its square artwork/padding; verify all
  toolbar sizes on light/dark backgrounds. Do not imply Google/job-board endorsement.
- [ ] Shot 1: actual toolbar capture/review of a public accepted Greenhouse job.
- [ ] Shot 2: reviewed fields, cleaned source URL and explicit Send action.
- [ ] Shot 3: app receipt then explicit account save / Match preview (label it as web app).
- [ ] Optional shots: truthful unsupported/manual state; separately labeled Pro app flow
  only if released/accepted. No all-sites, auto-apply, ATS-score or free-AI claims.
- [ ] Use fictional user/account/resume data; remove emails, tokens, private URLs, unrelated
  tabs, profile avatars and production diagnostics. Retain accurate UI and site limits.
- [ ] Record candidate ZIP hash, Chrome version, date and permission state for each capture.

These sizes/required assets were checked against [Chrome’s image guidance](https://developer.chrome.com/docs/webstore/images).
No final screenshots/promo assets were produced by this no-install task.

## Owner gates and verification status

- [ ] **Developer account/dashboard:** owner registration/verification, contact, security
  requirements, publishing rights, category/language/distribution selections and existing
  item/version status. Nothing was opened or changed in the dashboard. Version remains
  0.2.0 because this is an unpublished candidate; check store history before any later upload.
- [ ] **Production:** coordinated app/API/migration release and accessible privacy policy
  via a separately authorized process; no lock removal or deployment here.
- [ ] **Assets/disclosures:** final privacy certification, icon padding/brand review,
  authentic screenshots, mandatory promo image, reviewer account and dated live URLs.
- [ ] **LIVE ACCEPTANCE:** complete every applicable row in the linked checklist; historical
  fixture passes are not real-site acceptance of this ZIP/CSP.
- [ ] **Submission/publishing:** separately authorized owner action after all gates. This
  document does not authorize uploading even as a store draft.

Task #61 command outcomes and artifact fingerprint are recorded at the top of HANDOFF.md.
Previous parent verification of tasks #47–#53 recorded two controlled installed-extension
42/42 passes, including a real toolbar grant on intercepted Greenhouse fixtures. Preserve
that history; do not present it as this session’s installation or live-site verification.
