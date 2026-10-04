# Chrome Web Store readiness — APWICO Job Capture 0.2.2

Updated 2026-10-04. This is an unpublished release candidate. Nothing in this
document authorizes upload, submission, publication, or a claim that the
extension is available.

## Candidate and single purpose

**Title:** APWICO Job Capture

**Short description:** Capture and review a job, then save it in APWICO for Match Analysis and your job-specific resume.
**Single purpose:** Let a person capture, review, and send one public job posting
they choose into the APWICO saved-job workflow.

The production MV3 manifest has no content scripts, remote code, broad host
access, job-board host permission, tabs/history/cookies/webRequest permission,
or analytics. It uses:

- `activeTab`: temporary access to the page chosen by a toolbar click;
- `scripting`: inject the packaged extractor and APWICO receipt bridge;
- `storage`: retain one bounded capture in session-only extension storage;
- `alarms`: expire that capture after 30 minutes of inactivity;
- `https://apwico.com/*`: deliver to the production app;
- `https://resumestride.com/*`: additive legacy destination during the staged
  domain migration only. Runtime accepts the exact HTTPS root, not arbitrary
  paths, ports, queries, fragments, or subdomains.

## Store listing copy

### Full description

Bring a public job posting into APWICO without repeatedly copying its details.
Open a supported job page, click APWICO Job Capture, review and edit the captured
fields, then choose **Send reviewed details to APWICO**. In APWICO, sign in if
needed and explicitly save the job before Match Analysis begins.

Capture supports public Greenhouse job pages, selected stable-URL Lever pages,
and pages containing one reliable, unambiguous JobPosting record. Workday works
only when that metadata is present. LinkedIn and Indeed are intentionally not
captured. Page structures change; if capture is unavailable, enter the public
job details manually. Long descriptions may be truncated and are marked for
review.

The extension reads a page only after you invoke it. It handles the chosen job's
title, employer, description, optional location/workplace/employment type and
structured salary, plus a source URL with query and fragment removed. It keeps
one temporary capture for review or retry and sends it only after you choose
Send. It does not read resume drafts, passwords, cookies, payment data, or
browsing history in the background, apply to jobs, or run job searches.

An APWICO account is required to save a captured job. Capture itself does not
guarantee job availability, employer accuracy, a hiring result, or an ATS score.
Support: support@apwico.com. Privacy: https://apwico.com/privacy.html.

## Privacy dashboard answers

- **Website content:** Yes — user-selected public job content and edits.
- **Web history / URLs:** disclose the current source URL conservatively because
  the extension handles it, even though it does not collect browsing history in
  the background.
- **Authentication, financial, resume, health, location tracking:** not handled
  by the extension. Incidental personal information can occur inside job text.
- **Remote code:** No. Packaged local JavaScript only; fetched Greenhouse JSON is
  treated as data.
- **Advertising, sale, creditworthiness:** No.
- **Limited Use:** `APWICO uses captured job content and its source URL only to
  provide, maintain, secure, and improve the disclosed job-capture purpose. We
  do not sell this data, use it for personalized advertising, or use it to
  determine creditworthiness. Our use and transfer comply with the Chrome Web
  Store User Data Policy, including its Limited Use requirements.`

The public privacy notice includes the extension's invocation, fields, session
retention, Greenhouse request, transfer, account-save, human-access, deletion,
and Limited Use boundaries. Dashboard declarations must match the wording and
the version submitted.

## Supported behavior and limits

| Pattern | Truthful claim |
| --- | --- |
| Greenhouse | Public numeric job pages on both documented Greenhouse hosts; JSON-LD first, then bounded anonymous exact-job API fallback. |
| Lever | Selected public UUID job pages; fail closed when required scoped fields are missing. |
| Workday | Only one reliable, unambiguous JobPosting record; no Workday-specific scraper. |
| Generic | One matching JobPosting record with title, employer, and description. |
| LinkedIn / Indeed | Unsupported; manual entry only. |
| Private/results/iframes/internal pages | Unsupported; no arbitrary page scrape. |

One capture is stored in `chrome.storage.session` for 30 minutes of inactivity.
Successful receipt, explicit discard, expiry, or browser restart clears it.
Delivery retries are bounded. Receipt is not an account save. The extension
never receives APWICO auth tokens, resume content, payment data, or AI keys.

## Assets and artifact

- Source and packaged icons: APWICO mark at 16/32/48/128; the 128 asset keeps
  16px transparent padding around 96px artwork.
- Required small promotional tile: `apps/extension/store-assets/small-promo-440x280.png`.
- Store screenshot: `apps/extension/store-assets/capture-review-1280x800.png`,
  generated from the real installed candidate on the repository's fictional
  public-job fixture. It contains no account, resume, or production user data.
- Release archive: `dist/apwico-extension.zip`; exact inventory and SHA-256 are
  written to `dist/extension-package-report.json` after packaging.

The package allowlist excludes source maps, source, tests, documentation,
environment files, credentials, and unrelated build output. The package gate
re-extracts the ZIP, compares all bytes, verifies CSP/permissions/destinations,
and scans for common secret and remote-code markers.

## Publication gates

Repository preparation is complete when the extension, package, controlled
installed tests, privacy notice, and assets pass. The remaining publication
actions are intentionally owner/external:

1. Chrome Web Store developer enrollment/payment, 2FA, and policy acceptance.
2. Confirm dashboard privacy answers and Limited Use certification.
3. Upload the exact hashed ZIP, add the listing assets/copy, and supply reviewer
   access only through the private dashboard field if requested.
4. Complete dated real-site acceptance from `EXTENSION_LIVE_ACCEPTANCE.md` and
   narrow claims if a public site no longer behaves as the controlled evidence.
5. Explicitly authorize submission/publication. Do not advertise availability
   until the public listing exists.

No new permissions, production configuration, or public claims are justified as
a workaround for a store-review or real-site failure.
