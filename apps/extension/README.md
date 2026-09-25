# ResumeStride Job Capture — V1 candidate 0.2.0

Unpublished integration candidate. **No deployment or Chrome Web Store submission.**
The app, API and migration in this change must be released together in a later authorized
release. A package pointing at production does not make this source available there.

Click the extension on a public job page → review/edit the fields → send to ResumeStride
→ sign in there if necessary → **Save job and see how I match** → normal Saved Jobs /
Match Analysis → Pro creates or reopens the persistent job-specific resume → explicit
AI consent → review individual Accept/Reject suggestions → manual edits → PDF/Word.
The extension never receives resume data, sign-in tokens, entitlement or AI credentials.
The older separate local draft remains a manual-edit option; it cannot invoke AI.

## Supported patterns and evidence

| Pattern | Implementation | Acceptance status |
| --- | --- | --- |
| Greenhouse `https://job-boards.greenhouse.io/{board}/jobs/{id}` and `boards.greenhouse.io` | Single JobPosting JSON-LD first; otherwise exact public job + board API, anonymous GET, strict ID/response bounds | Historical live isolated-world capture verified with a test host grant; controlled API fixtures retained. Real toolbar grant test added; human toolbar/live-site acceptance remains required. |
| Lever `jobs.lever.co` / `jobs.eu.lever.co`, UUID job path | JSON-LD first; partial fallback requires headline, employer logo alt, and scoped posting sections | Controlled extraction fixture added. Partial pattern support, no claim covering all live Lever pages. |
| Generic JobPosting JSON-LD (including Workday pages that expose it) | One unambiguous JobPosting object, array, or `@graph`; title, employer, description required; matching URL when present | Controlled fixtures added. No Workday-specific scraper or API adapter; absent/ambiguous metadata falls back to manual entry. |
| Local `/extension-fixture/job-posting.html` | Explicit test selectors | Existing installed-fixture automation retained. |
| LinkedIn, Indeed | Deliberately unsupported, including generic extraction | Manual entry only. No scraping or host grant. |
| Job search results, authenticated/private pages, embedded job iframes, browser internal pages, query-only job identity | Unsupported/unverified | No arbitrary full-page extraction. User may enter public job details manually. |

Later parent acceptance for tasks #47–#53 recorded two complete controlled installed
suite passes (42/42 each), including the real toolbar activeTab grant with intercepted
Greenhouse responses. See `docs/EXTENSION_ACCEPTANCE.md` and HANDOFF for evidence.
That is not real-site acceptance of the production ZIP. Task #61 does not install it;
the later owner checklist is `docs/EXTENSION_LIVE_ACCEPTANCE.md`.

## Capture/privacy boundaries

- Explicit invocation only, top frame, isolated world; no content scripts, navigation
  listeners, browsing history, continuous scraping, analytics, or remote executable code.
- Only job title/company/description/location, reliable workplace/employment type and
  explicit structured salary, source path, capture time, and adapter category. No cookies,
  passwords, auth tokens, payment data or unrelated page content is read.
- Descriptions are inert text, capped at **12,000 characters including a truncation mark**;
  title/company/location 300, source URL 2,000. Original bounded fields and reviewed edits
  are retained. HTML scripts/forms are removed in detached templates; never executed.
- Source links drop query/fragment tracking. Generic extraction rejects meaningful query
  parameters because query-only job identity cannot safely survive this stripping.
  Save requires a stable public HTTPS URL and non-empty title/company/description.
- One pending capture in **`chrome.storage.session`**, not local/sync disk storage, expires
  after 30 minutes of inactivity. An alarm removes expired data; reads check expiry too.
  Successful delivery or explicit discard clears it. Browser restart clears session
  storage. It contains no auth or account identity and is never automatically resent.
- Closing the popup does not cancel the worker's accepted send. Three bounded attempts,
  each with an eight-second acknowledgment window. A worker/browser shutdown may interrupt
  delivery: reopen to retry while the session capture exists. No endless/durable queue.
  Receipt is not an account save: finish the explicit web-app save before closing that tab.
- Before saving, the web review is tab memory only; it clears on account switch/sign-out.
  A guest can sign in and explicitly save. Saving uses verified account ownership, existing
  Free/Pro save limits, server Match Analysis, and existing RLS/RPC boundaries. No search
  or AI call occurs as a side effect of saving a capture. Captured availability is unknown.
- URL identity and existing normalized fingerprints deduplicate against saved jobs,
  including recognized tracking parameters. Duplicate saves keep the existing immutable
  snapshot and analyze that stored snapshot, rather than replacing it with incoming edits.

## Build and install

From repository root:

```
npm run build:extension        # development folder: apps/extension
npm run package:extension      # production folder: dist/extension
npm run check:extension-package # artifact security gate and packaging regressions
npm run test:extension
npx playwright test --config playwright.capture.config.ts # fixture extraction only
```

In a disposable Chrome profile, open `chrome://extensions`, enable Developer mode, Load
unpacked, select the appropriate folder, pin the action, and click it on a job page.
Development delivery allows only root URLs on `https://resumestride.com` or HTTP
localhost/127.0.0.1 ports 5173, 5183, 5185. The production artifact removes all localhost
host permissions **and** disables localhost in its built destination allowlist.
Never load the development package into the store. Packaging now also writes the local
`dist/resumestride-extension.zip` and `dist/extension-package-report.json` with file and
archive hashes. It verifies both the allowlisted folder and extracted ZIP; it never
installs, uploads or submits. Requires local `zip`/`unzip`. Package after the web build,
which clears root `dist/`. Source maps, secrets, tests, docs and stale files are excluded;
the marker scan is a bounded check, not proof against all possible secrets.

For local authenticated API testing follow the jobs/API run instructions in the root
README and HANDOFF. Plain `npm run dev` serves UI only; it is sufficient for mocked
browser tests, not a real authenticated save. Do not call paid providers for acceptance.

## Permission rationale

- `activeTab`: temporary access after invoking the action. No job-board host permission.
- `scripting`: inject the extractor and the destination receipt bridge.
- `storage`: single bounded session capture, only for review/retry across popup closure.
- `alarms`: expire that session capture without requiring another popup invocation.
- Host permissions: production ResumeStride only; local ports only in developer manifest.

No `tabs`, `history`, `cookies`, `webRequest`, `<all_urls>`, clipboard, auth or AI permissions.
The action popup is the only accepted internal sender. The web bridge is same-window,
same-origin, bounded and acknowledged; page messages are **untrusted text**, never proof
of extension identity and never permission to save, create a resume or call AI.

## Disable strategy and store readiness

Set server `EXTENSION_CAPTURE_ENABLED=false` to reject new captured-job saves while
retaining review, existing saved jobs and versions. Existing `save` and tailoring APIs
retain their normal authorization; this switch is an operational capture-entry disable,
not a revocation of users' ordinary save capability. Users can disable/remove the extension
or discard the pending capture in the popup. No remote extension configuration/tracking.

Icons at 16/32/48/128, versioned production manifest and production packaging are included.
See `docs/EXTENSION_STORE_READINESS.md` for accurate draft disclosures and release gates.
