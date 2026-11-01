# LIVE ACCEPTANCE — ResumeStride Job Capture

## September 29 universal job save redesign and 0.2.1 candidate

Audited the actual Chrome Web Store-installed 0.2.0 artifact at Chrome extension ID
`hkingihhmkmhnikmcoeeamceoelcbhjn`, then redesigned 0.2.1 around URL-first saving. The prepared
candidate recognizes individual job pages, saves the normalized source URL into the authenticated
user's existing Saved Jobs model, returns **Already saved** for duplicates, and treats safe job
details as optional enrichment. Authentication and account ownership remain in ResumeStride; no
token or account identity is exposed to the extension.

LinkedIn, Indeed, and ZipRecruiter individual detail URLs are now saveable without scraping their
page content. Exact Greenhouse numeric paths, stable UUID Lever and Ashby paths, Workday `/job/`
pages, and company pages with one reliable JobPosting retain bounded enrichment for title, company,
available location, and description. Search/list pages ask for an individual job; ordinary sites
show **No job detected on this page**. A restrained manual URL action requires explicit user
confirmation and still passes public-URL validation. No authentication, CAPTCHA, anti-bot control,
or access restriction was bypassed.

The current-page audit passed 12/12: one current LinkedIn detail URL, one current Indeed detail URL,
one current ZipRecruiter direct job URL, two pages each for Greenhouse, Lever, Ashby, and Workday,
and one ordinary non-job page. Controlled extension acceptance passes 47/47; server/billing
398/398; focused Free/Pro universal-save browser acceptance 4/4; server/client TypeScript,
production build, package gate, and focused security acceptance pass. Account isolation,
signed-out behavior, duplicate handling, and continuation into normal Saved Jobs are covered.

Version 0.2.1 removes the unused `storage` and `alarms` grants. It requests only `activeTab`,
`scripting`, and `https://resumestride.com/*`. The compact popup has no job-detail form and
exposes only job detected, saved, already saved, no job, signed out, and short error states.
Candidate ZIP SHA-256:
`176575d4f9ab5b6afcf972669c45929c55b5e01c7211d366c48b88dc23542f69`.
The package has not been uploaded, submitted, or published; owner approval is still required.

## September 29 publication acceptance

Chrome Web Store item `hkingihhmkmhnikmcoeeamceoelcbhjn`, version 0.2.0, is published publicly at
`https://chromewebstore.google.com/detail/resumestride-job-capture/hkingihhmkmhnikmcoeeamceoelcbhjn`.
The approved dashboard package, listing, assets, permissions, production URLs, data disclosures and
support boundaries matched the locked release. The public store-delivered CRX's 16 reviewed files
match a freshly reproduced production package byte-for-byte, apart from Google's expected store
metadata. A disposable installed-artifact run passed the live Greenhouse toolbar capture and
production ResumeStride handoff with the unchanged job description and correct signed-out save gate.
No production job or account data was saved.

## September 28 submission record

Version 0.2.0 was submitted for Chrome Web Store review at `2026-09-28T15:11:40Z` under item
`hkingihhmkmhnikmcoeeamceoelcbhjn`. The dashboard confirmed **Item submitted** and reports
**Pending review**. Automatic publication after approval was disabled, so publication remains a
separate owner-gated action. Submitted package SHA-256:
`49fe46c6e12e0dde1303f5dc7eda6128b28b591879c6a0ec35e8e2727ae123f7`.

## September 28 final candidate rerun

Loaded the exact unpacked store candidate from `dist/extension` into a disposable Chromium profile
and invoked the real extension action/`activeTab` path on all four current public examples. All four
produced bounded captures with required title, employer, description and source URL:

- Greenhouse/Dialpad — AI Transformation Engineer; Dialpad; Bengaluru, India.
- stable-UUID Lever — API Engineer; Lever; Toronto (structured JobPosting provenance).
- Workday with reliable JobPosting — CI Tech; 7027 Anord Mardix (USA) Inc; Henrico, Virginia.
- generic single JobPosting/Ashby — Senior Software Engineer (AI Products); Mutiny; New York City.

The production homepage was checked signed out. The fresh controlled application suite passed 72/72
with one worker, including signed-out, Free and Pro Match, duplicate saves, stale/unavailable jobs,
account switching, failed capture save retention, extension capture → Saved Job → Match → separate
job-specific resume, and accept/reject/manual tailoring review. Extension tests remain 42/42 and
focused server/capture/security tests 18/18. This gives fresh real-site extraction plus controlled
end-to-end account-state evidence; it does not claim a live paid Pro entitlement or purchase.

The final ZIP is reproducible: two consecutive production package builds both produced SHA-256
`49fe46c6e12e0dde1303f5dc7eda6128b28b591879c6a0ec35e8e2727ae123f7`. That ZIP replaced the earlier
metadata-equivalent draft upload for item `hkingihhmkmhnikmcoeeamceoelcbhjn`.

## September 27 execution status

The final production candidate is version **0.2.0**, SHA-256
`49fe46c6e12e0dde1303f5dc7eda6128b28b591879c6a0ec35e8e2727ae123f7`.
Two complete installed-extension runs passed **42/42 with zero retries**. The controlled
suite covers the real toolbar/activeTab path, manifest grants, extraction contracts,
strict worker/popup/bridge messaging, expiry, delivery failures, destination rejection,
and a Greenhouse fallback exercised through a controlled public-endpoint interception.
Focused server/capture/security tests passed 18/18; server TypeScript, web production
build, package inspection, ZIP integrity, and `git diff --check` passed.

The owner approved installation, and the exact unpacked candidate was installed and enabled on
September 27 as extension ID `dbpfaphnieebgkoenbdgcjajncgjnhfp`; it was no longer present in the
visible Chrome profile on September 28. Actual toolbar invocations passed on public
Greenhouse/Dialpad, stable UUID Lever, Workday/Flex JSON-LD, and
generic JSON-LD/Ashby pages. LinkedIn and Indeed both produced the intentional unsupported/manual
entry state. A Greenhouse capture completed the production handoff with correct reviewed fields;
the signed-in Free account then enforced its existing three-job limit and preserved the review.

This is real public-site and production Free-account evidence; Pro, account switching, duplicate,
stale and failure paths remain controlled-suite evidence. Chrome Web Store publisher verification
and `support@resumestride.com` contact verification are approved. Draft item
`hkingihhmkmhnikmcoeeamceoelcbhjn` contains the exact candidate ZIP, listing, assets,
owner-approved Limited Use certifications, reviewer instructions, and conservative data
disclosures; its Submit for review control is enabled, but it has not been submitted or published.
The extension/Limited Use privacy disclosure was pushed in production commit `3cbd2f4`. Production
deployment `dpl_Dn9FqZB5wBFmcH842bZkoUqp4wRj` is Ready and aliased to `resumestride.com`; the live
policy returns 200 and exposes the extension section and Limited Use language. Release acceptance is
**PASS**; submission and publication remain separate owner-gated actions.

Current public candidates to verify immediately after installation (availability and
metadata can change):

- Greenhouse: `https://job-boards.greenhouse.io/dialpad/jobs/8700100002`
- Lever UUID: `https://jobs.eu.lever.co/lever/065f4538-7347-4207-909f-4ea68f63b4af`
- Workday candidate: `https://flextronics.wd1.myworkdayjobs.com/en-US/Careers/job/USA-VA-Henrico/Business-Excellence-Technician_WD223983-1`

The four URLs above (plus the Ashby URL below) were successfully exercised by the installed
candidate on September 27, 2026. Website content remains changeable.

- Generic JSON-LD: `https://jobs.ashbyhq.com/Mutiny/abe9348f-b758-4456-a8e7-31bd4710dce4`

Task #61 prepared the checklist below on September 25, 2026. Rows marked LIVE below were
executed with the installed candidate; controlled installed-extension passes remain separate.

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
| L01 | Inspect extracted production manifest and Chrome grants | MV3 0.2.0; exact ResumeStride host only; activeTab/scripting/storage/alarms; correct icons/name; no local/all-sites/job-site grant | PASS — installed candidate |
| L02 | Invoke actual toolbar on public Greenhouse numeric job path | Accurate title/employer/description; no permission workaround; where JSON-LD is absent, anonymous bounded API fallback works under real CORS | PASS — LIVE Dialpad 8700100002 |
| L03 | Repeat both Greenhouse supported domains where real public examples exist | Record each domain separately and any redirect; no blanket inference from one fixture/domain | PENDING |
| L04 | Invoke on stable UUID Lever job pages, including EU if available | Correct scoped job fields, no application form/footer text; capture failure remains manual entry; record each host independently | PASS — LIVE EU Lever UUID |
| L05 | Invoke on public Workday page with one reliable JobPosting | Fields match that job; metadata provenance recorded; no claim of a Workday scraper | PASS — LIVE Flex metadata-only |
| L06 | Invoke on Workday without reliable metadata, ambiguous/malformed metadata, results and query-only job identity | Manual/unsupported state, no guessed job or full-page scraping | PENDING |
| L07 | Invoke on generic single JobPosting object/array/@graph with matching URL | Correct bounded fields; another job’s URL and multiple postings rejected; job language/occupation not artificially restricted | PASS — LIVE Ashby/Mutiny single JSON-LD |
| L08 | Invoke on LinkedIn and Indeed; then chrome:// and Chrome Web Store | No automated job capture; truthful manual-entry guidance; no bypass of restricted-page injection | PASS — LIVE LinkedIn/Indeed; controlled Chrome-internal state |
| L09 | Capture a long posting, Unicode job text and explicit salary/location | Description max 12,000 with truncation warning; original and edited values remain bounded; no fabricated salary/workplace | PENDING |
| L10 | Review Source & connection and edit fields before Send | Source query/fragment removed; source path preserved; reject invalid inputs; no content in app URL/logs; only reviewed data plus bounded original retained | PENDING |
| L11 | Send to official root; try localhost, www/lookalike host, credentials, port, subpath, query and fragment | Only https://resumestride.com/ accepted; receipt shown only after acknowledgment; no job content in URL | PENDING |
| L12 | Navigate chosen job tab within origin, then to another origin and close it | activeTab may persist on same origin; old grant ends on cross-origin navigation/closure; capture never starts on navigation by itself | PENDING |
| L13 | Observe network and storage before invocation, during capture and after Send | No background scraping, remote code or extension analytics; Greenhouse fallback only exact anonymous GETs; no cookies/referrer/redirects; session capture only, no local/sync store | PENDING |
| L14 | Close popup during accepted Send; then simulate a failed delivery and reopen | Worker may finish; failure keeps one edited capture for explicit retry; max three attempts, no endless queue; receipt does not claim account save | PENDING |
| L15 | Leave capture inactive for >30 minutes, reopen; restart browser separately | Expired capture not restored; alarm/read cleanup; restart clears session. Record real elapsed expiry, not just a clock mock | PENDING |
| L16 | Discard on unsupported/blank page, then invoke on a new public job | Old capture gone; discard’s capture-current-tab behavior understood; no automatic resend or old job mislabeled as new | PENDING |
| L17 | Receive as guest, sign in, explicitly Save job and see how I match | Receipt not yet an account save; account save enters normal Saved Jobs/Free Match preview without provider/model call | PARTIAL — LIVE signed-in handoff; guest/save pending |
| L18 | Save duplicate source with tracking variations; reach Free three-job limit | One immutable bookmark/slot; accurate duplicate notice; limit error preserves review for retry; no new persistent resume on Free | PARTIAL — LIVE Free three-job limit; duplicate pending |
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
