# ResumeStride Job Capture — 0.2.1 update candidate

Version 0.2.0 is published. Version 0.2.1 is a prepared universal-job-save update and has
**not** been uploaded, submitted, or published in the Chrome Web Store.

On a plausible individual job page, click the extension and choose **Save to ResumeStride**.
The authenticated ResumeStride web app saves the normalized source URL into the same account-owned
Saved Jobs model used by jobs found inside ResumeStride. Reliable page data is attached when
available; otherwise the URL is saved with **Details pending**. Duplicate URLs return **Already
saved**. Match, evidence, job-specific versions, tailoring, and export remain web-app features.

The extension never receives ResumeStride tokens, resume data, account identity, entitlement,
payment data, or AI credentials.

## Detection and enrichment matrix

| Source | Safe job detection | Optional enrichment |
| --- | --- | --- |
| LinkedIn | Stable `/jobs/view/...-{numeric id}` detail paths | URL only; no restricted-content scraping |
| Indeed | `/viewjob` detail paths with a stable `jk`/`vjk` identity | URL only; no restricted-content scraping |
| ZipRecruiter | Direct `/c/{company}/Job/{title}/...`, `/jobs/...`, or stable `lvk` detail identity | URL only; no restricted-content scraping |
| Greenhouse | Numeric Greenhouse job-detail paths | Serialized job data, scoped semantic content, then exact anonymous public job endpoint |
| Lever | Stable UUID posting paths | One reliable JobPosting object or scoped posting content |
| Ashby | Stable UUID posting paths | One reliable JobPosting object |
| Workday | `*.myworkdayjobs.com` detail paths containing `/job/` | One reliable JobPosting object when present |
| Company-hosted pages | One unambiguous JobPosting whose URL matches the page | Structured title, company, location, and description |

Search/list pages ask the user to open an individual job. Ordinary pages report **No job detected
on this page**. A restrained **Save job URL manually** action appears only for an explicit user
confirmation; it still requires a valid public HTTPS URL. Chrome-internal pages and private,
internal, credential-bearing, IP-literal, or nonstandard-port URLs cannot be saved.

Current-page compatibility was checked on two public detail pages each for Greenhouse, Lever,
Ashby, and Workday, plus current LinkedIn, Indeed, and ZipRecruiter detail URLs. No authentication,
CAPTCHA, anti-bot mechanism, or access restriction was bypassed. Controlled tests exercise
JobPosting pages, listings, ordinary non-job pages, duplicates, signed-out behavior, Free and Pro
accounts, and account ownership isolation.

## Privacy and security boundaries

- Explicit toolbar invocation only, top frame, isolated world. There are no persistent job-board
  host grants, content scripts, navigation listeners, background searches, or extension analytics.
- Source URLs are HTTPS, public-host validated, fragment-free, and reduced to stable job-identity
  parameters. Tracking parameters are removed. The server repeats the URL validation and owns all
  account, quota, and duplicate decisions.
- LinkedIn, Indeed, and ZipRecruiter use safe URL-pattern recognition only. The extension does not
  extract their restricted page content.
- Enriched descriptions are inert bounded text. Remote scripts are never downloaded or executed.
- Saving opens an inactive official ResumeStride tab and uses a bounded message bridge. The page
  performs authenticated saving with its existing session; secrets never enter extension space.
- URL-only saves do not invent job facts or Match results. They remain **Details pending** until
  ResumeStride or the user can safely confirm details, and tailoring stays unavailable without a
  description.
- Existing Saved Jobs ownership, row security, Free/Pro limits, and deduplication apply unchanged.

## Build, verify, and install

From the repository root:

```
npm run build:extension
npm run test:extension
npm run package:extension
npm run check:extension-package
```

Packaging writes `dist/extension/`, `dist/resumestride-extension.zip`, and
`dist/extension-package-report.json`, verifies the allowlisted folder and extracted ZIP, and never
installs, uploads, submits, or publishes. Load `dist/extension/` in a disposable Chrome profile for
acceptance. Never upload the developer folder.

## Permission rationale

- `activeTab`: temporary access to the page selected by the user's toolbar click.
- `scripting`: run the packaged detector in that tab and the save bridge in the official app tab.
- `https://resumestride.com/*`: reach only the official web app for the user-requested save.

There is no `tabs`, `storage`, `alarms`, `history`, `cookies`, `webRequest`, `<all_urls>`, clipboard,
authentication, or AI permission. The extension has no durable capture queue or local job store.

## Release boundary

The 0.2.1 ZIP is a candidate only. Store upload, submission, and publication require explicit owner
approval. See `docs/chrome-web-store/RELEASE_PACKET.md` for the exact candidate inventory and
reviewer instructions.
