# LIVE ACCEPTANCE — ResumeStride Job Capture (owner run, pending)

Task #61 prepared this checklist on September 25, 2026. **No row has been executed for
this candidate on real sites.** This file is a later owner test plan, not authorization
to install, deploy, change production services, send credentials or submit to the store.
The controlled installed-extension passes in HANDOFF are separate historical evidence.

## Record before testing

- Owner/tester and UTC date: **PENDING**
- Chrome version/channel, OS and clean disposable profile: **PENDING**
- Candidate version and SHA-256 from `dist/extension-package-report.json`: **PENDING**
- Coordinated deployed app/API/migration revision, approved access and kill-switch state:
  **PENDING — production release/lock changes require separate authorization**
- Fictional-data test account(s), Free/Pro entitlement arrangement: **PENDING**; credentials
  must stay in a secure owner/reviewer channel, never this file, screenshots or logs.
- Dated public Greenhouse / Lever UUID / Workday with metadata / generic job URLs:
  **PENDING**; record only public URLs without private/tracking parameters.
- Evidence location (sanitized screenshots and observations): **PENDING**

Test the ZIP’s extracted production folder, not the developer manifest. With later
installation authorization, load it in the disposable profile, pin it and inspect the
permissions. Do not add broad/job-board grants or use unsafe-extension-debugging flags to
make a failing real toolbar capture appear successful. Use fictional resumes and harmless
public job text. Do not purchase a plan or call a paid job/model provider without separate
authorization; capture and save should not initiate either automatically.

## Test matrix (all pending)

For each row record **PASS / FAIL / BLOCKED**, sanitized evidence, Chrome/version/hash,
and any site-specific limit. Missing public examples are BLOCKED, never presumed passed.

| ID | Later owner action | Required observation | Result |
| --- | --- | --- | --- |
| L01 | Inspect extracted production manifest and Chrome grants | MV3 0.2.0; exact ResumeStride host only; activeTab/scripting/storage/alarms; correct icons/name; no local/all-sites/job-site grant | PENDING |
| L02 | Invoke actual toolbar on public Greenhouse numeric job path | Accurate title/employer/description; no permission workaround; where JSON-LD is absent, anonymous bounded API fallback works under real CORS | PENDING |
| L03 | Repeat both Greenhouse supported domains where real public examples exist | Record each domain separately and any redirect; no blanket inference from one fixture/domain | PENDING |
| L04 | Invoke on stable UUID Lever job pages, including EU if available | Correct scoped job fields, no application form/footer text; capture failure remains manual entry; record each host independently | PENDING |
| L05 | Invoke on public Workday page with one reliable JobPosting | Fields match that job; metadata provenance recorded; no claim of a Workday scraper | PENDING |
| L06 | Invoke on Workday without reliable metadata, ambiguous/malformed metadata, results and query-only job identity | Manual/unsupported state, no guessed job or full-page scraping | PENDING |
| L07 | Invoke on generic single JobPosting object/array/@graph with matching URL | Correct bounded fields; another job’s URL and multiple postings rejected; job language/occupation not artificially restricted | PENDING |
| L08 | Invoke on LinkedIn and Indeed; then chrome:// and Chrome Web Store | No automated job capture; truthful manual-entry guidance; no bypass of restricted-page injection | PENDING |
| L09 | Capture a long posting, Unicode job text and explicit salary/location | Description max 12,000 with truncation warning; original and edited values remain bounded; no fabricated salary/workplace | PENDING |
| L10 | Review Source & connection and edit fields before Send | Source query/fragment removed; source path preserved; reject invalid inputs; no content in app URL/logs; only reviewed data plus bounded original retained | PENDING |
| L11 | Send to official root; try localhost, www/lookalike host, credentials, port, subpath, query and fragment | Only https://resumestride.com/ accepted; receipt shown only after acknowledgment; no job content in URL | PENDING |
| L12 | Navigate chosen job tab within origin, then to another origin and close it | activeTab may persist on same origin; old grant ends on cross-origin navigation/closure; capture never starts on navigation by itself | PENDING |
| L13 | Observe network and storage before invocation, during capture and after Send | No background scraping, remote code or extension analytics; Greenhouse fallback only exact anonymous GETs; no cookies/referrer/redirects; session capture only, no local/sync store | PENDING |
| L14 | Close popup during accepted Send; then simulate a failed delivery and reopen | Worker may finish; failure keeps one edited capture for explicit retry; max three attempts, no endless queue; receipt does not claim account save | PENDING |
| L15 | Leave capture inactive for >30 minutes, reopen; restart browser separately | Expired capture not restored; alarm/read cleanup; restart clears session. Record real elapsed expiry, not just a clock mock | PENDING |
| L16 | Discard on unsupported/blank page, then invoke on a new public job | Old capture gone; discard’s capture-current-tab behavior understood; no automatic resend or old job mislabeled as new | PENDING |
| L17 | Receive as guest, sign in, explicitly Save job and see how I match | Receipt not yet an account save; account save enters normal Saved Jobs/Free Match preview without provider/model call | PENDING |
| L18 | Save duplicate source with tracking variations; reach Free three-job limit | One immutable bookmark/slot; accurate duplicate notice; limit error preserves review for retry; no new persistent resume on Free | PENDING |
| L19 | Switch/sign out before and during save, then use second test account | Review/stale response cannot cross accounts; saved records/versions remain owner-isolated | PENDING |
| L20 | If approved test entitlement exists, open saved Pro job version | Separate persistent version and grounded match details; master unchanged; AI requires its own consent/action, no automatic request | PENDING |
| L21 | Only with separately approved mock/fixture setup or live-service authorization, test Pro Accept/Reject and PDF/Word | Accepted edit belongs only to that version; reject leaves it unchanged; export allowance unchanged; no fabricated AI/production success | PENDING |
| L22 | Keyboard-only popup review, validation, advanced details, Send and discard; zoom | Visible focus, usable labels/status, no inaccessible or clipped controls; screenshots reflect actual UI | PENDING |
| L23 | Inspect local console and sanitized network evidence | No job/resume text, query tokens, account identifiers or secrets in extension diagnostics; only bounded status/timing | PENDING |
| L24 | Open intended public policy/support pages unauthenticated | Accurate extension-specific policy and Limited Use disclosure available; support contact works; reviewer access does not require removing production locks ad hoc | PENDING |

Real websites can change or become unavailable. If an adapter fails, record the exact
public pattern and keep or narrow listing claims; do not broaden permissions, add brittle
scrapers or describe a blocked test as success. Do not treat “manual entry works” as proof
of automatic site compatibility.

## Release sign-off — owner actions still open

- [ ] Re-run full controlled installed suite twice, zero retries, on an authorized host:
  `npm run test:extension -- --retries=0`. These commands load a temporary unpacked
  extension and were deliberately not executed in full by the no-install preparation task.
- [ ] Review each real-site result, package/CSP behavior and privacy evidence; resolve
  failures and rebuild/retest if files change.
- [ ] Approve final icon padding/branding, screenshots and 440×280 promotional asset.
- [ ] Verify developer account, store dashboard/version history, reviewer access, live
  examples and current policy/disclosure categories. Securely supply any reviewer account.
- [ ] Confirm separately authorized coordinated app release and public privacy policy;
  ensure claims match what customers can actually use.
- [ ] Obtain separate authorization for any store upload/submission/publication. The
  candidate, docs and checklist alone do not authorize those actions.

Store copy, permissions and asset requirements: [store-readiness draft](EXTENSION_STORE_READINESS.md).
Controlled tests and historical toolbar methodology: [extension acceptance](EXTENSION_ACCEPTANCE.md).
