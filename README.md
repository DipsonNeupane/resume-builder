# ResumeStride

A local-first resume builder for every career and location. React + TypeScript + Vite.

For the current V1 release decision, verification gaps and remaining owner actions, see
[FINAL_LAUNCH_CHECKLIST.md](FINAL_LAUNCH_CHECKLIST.md). Local implementation is not launch approval.

## Run locally

```
npm install
npm run dev
npm run build
npm test
```

The builder includes all seven templates free for every account, flexible sections, local autosave, authenticated server-generated PDF and Word (.docx) downloads, and best-effort client-side upload of .docx and text-based PDF resumes, with A4/Letter paper sizes and right-to-left content. PDF and DOCX share one server-enforced Free allowance of three successful document downloads per fixed 30-day period from signup; active Pro passes include document downloads. Both export formats use reservation-backed idempotency, and the request hash is bound to the selected format. There is no direct client-side DOCX export or first-party browser Print/Save-as-PDF action. Imported files are parsed locally in the browser and are not sent to ResumeStride's server; Mozilla PDF.js is loaded only after a PDF is selected. PDF structure and formatting recovery is necessarily best-effort, and scanned, image-only, encrypted, or unreadable PDFs are rejected with guidance rather than guessed content.

## Current boundaries

The public site provides the free resume builder, account access, US$19.99 Pro passes lasting exactly 30 days, optional recurring renewal every 30 days, AI suggestions requiring review, and server-generated PDF and Word documents. One-time purchase remains the default; renewal is never preselected. Sign-in and explicit upload consent are required for document downloads. Resume drafts remain in the current browser; cloud saving is disabled and the browser extension is not publicly released. See HANDOFF.md for the exact deployment and verification limits.

The source includes backend routes and database migrations for payments, AI, shared document-download allowances and cloud storage. Their presence in source or a successful local test does not mean they are available to customers. Normal JSON backup download/import has been removed; only internal corrupt-draft recovery may emit raw recovery data to prevent data loss. Support: support@resumestride.com. Production: https://resumestride.com.

The source also includes the authenticated V1 jobs account layer. Free accounts may save
up to three normalized job snapshots; active Pro accounts may save up to a documented
10,000-record abuse/storage safety ceiling. Duplicate provider IDs, canonical job
fingerprints, and source URLs do not consume another slot. Existing records are never
deleted when Pro expires or a provider listing becomes unavailable; only new saves are
blocked, and unavailable records remain visible as “No longer available.” Search
preferences are account-scoped. Auto Refresh is off by default, requires an explicit
opt-in, runs at most daily while the signed-in jobs UI is active, and can be turned off
again. Provider availability observations reuse the normal bounded search response and
do not make an extra Techmap request. The migration and route are not deployed by this
repository change. Saving is only a bookmark/snapshot boundary: it does not implement
resume-to-job history, tailoring history, application tracking, or an apply workflow.

V1 job recommendations now include deterministic, evidence-based Match Analysis. The
public labels are Strong match, Good match, and Stretch—never an ATS percentage or a
hiring prediction. Free accounts receive a concise preview on each of their five visible
recommendations; Pro accounts receive the full Required / Preferred / Nice-to-have
breakdown with demonstrated, partial, not-demonstrated, and explicitly confirmed
incompatibility states. Missing resume evidence remains unknown, not proof that a person
lacks a qualification. Explicit clarifications are account-scoped. Saved analyses are
server-recomputed, bounded, versioned, and stored with resume, job, and context hashes;
resume, job-description, preference, or clarification changes explicitly invalidate stale
analysis. For a saved job, an active Pro user can explicitly start one persistent
job-specific resume. Creation copies the authoritative cloud master when one exists (or
the current validated browser master otherwise), records its source fingerprint/revision,
and never edits the master. Accepted grounded AI suggestions and manual edits save only
to that version with optimistic conflict protection; rejected suggestions do nothing.
Existing versions remain available after Pro expiry or job/master removal, while new AI
tailoring remains entitlement-gated. A changed master produces a non-destructive
keep-or-reset choice rather than an automatic merge. PDF and Word controls export the
document currently being edited and retain the existing shared download allowance.

Extension candidate build/install steps and honest site matrix: [apps/extension/README.md](apps/extension/README.md). Captured jobs can now enter the authenticated saved-job, Match Analysis and persistent resume workflow. Greenhouse, partial Lever and conservative single-JobPosting JSON-LD adapters are implemented; final toolbar/live-site acceptance remains pending. No LinkedIn/Indeed integration, deployment or store release is claimed.


## Launch sequence

1. Validate exported PDFs, long resumes, keyboard access, multilingual fonts, and mobile workflows with real users.
2. Preserve editable headings and document-language support; expand interface localization based on demand.
3. Implement authentication, database ownership checks, recoverable revisions, account deletion, and backup restoration.
4. Best-effort client-side .docx and text-PDF import and authenticated server-generated PDF/DOCX downloads shipped; imported PDF layout recovery is intentionally conservative and requires user review.
5. Add opt-in AI suggestions with clear limits, grounded edits, and accept/reject controls.
6. Maintain the US$19.99 30-day Pro Pass with optional, explicitly enabled recurring payments only after entitlement, webhook, refund, and support flows are verified.
7. Deploy with monitoring, real support contact, privacy/terms, and tested recovery procedures.

No restriction by occupation or country. Sections can describe employment, education, projects, volunteering, certifications, research, or other experience. A one-to-two-day target is appropriate for a scoped beta; production billing and global localization require separate verification.

## Continuing with another agent

Read [HANDOFF.md](HANDOFF.md) for the prioritized checklist, current verification, known limitations, and a ready-to-use continuation prompt. [AGENTS.md](AGENTS.md) points coding agents to this handoff automatically.

## Supabase setup

For the next production/cloud release, use the [dated readiness audit](docs/PRODUCTION_READINESS_AUDIT.md), [cloud acceptance plan](docs/PRODUCTION_CLOUD_ACCEPTANCE.md), and [OWNER ACTION checklist](docs/PRODUCTION_OWNER_ACTIONS.md). The audit found a master-save database validator mismatch for four templates; cloud enablement requires a forward fix and the documented hosted/recovery gates. These documents do not authorize deployment or report a completed restore drill.

See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). The local builder works without account configuration. Run `npm run test:auth` for the separate mocked configured-auth checks; no real email is sent.

Cloud resume storage is decoupled from sign-in behind a default-off flag — `VITE_CLOUD_STORAGE_ENABLED` — documented in [docs/FREE_SIGNUP_RELEASE.md](docs/FREE_SIGNUP_RELEASE.md). It is not set in the current public deployment.

## Browser extension (unpublished V1 candidate)

`apps/extension` captures bounded public job details only after explicit invocation. Users review/edit before sending, then explicitly save in the web app to use the same account-owned Saved Jobs → Match Analysis → Pro job-specific resume → tailoring/Accept/Reject → PDF/DOCX flow. Authentication, entitlements, AI and export remain server responsibilities. Original capture/edits are retained; URL/fingerprint deduplication and existing save limits apply. One session-only retry capture expires after 30 minutes of inactivity; no browsing history or background scraping.

Run `npm run test:extension` (loads temporary unpacked test profiles), `npm run package:extension`, and `npm run check:extension-package`. Packaging only creates the verified production folder `dist/extension`, local `dist/resumestride-extension.zip` and SHA-256 inventory report; run it after the web build. Apply `20260924210000_extension_capture.sql` only with the later authorized app release; no migration was applied to a hosted database here. `EXTENSION_CAPTURE_ENABLED=false` disables the capture-save entry point without removing existing work. See [extension README](apps/extension/README.md), [controlled acceptance](docs/EXTENSION_ACCEPTANCE.md), [store-readiness draft](docs/EXTENSION_STORE_READINESS.md), and the pending owner [LIVE ACCEPTANCE checklist](docs/EXTENSION_LIVE_ACCEPTANCE.md). Developer account/dashboard work, real-site production-package testing, public privacy policy, icon review and screenshots/promo assets remain owner actions. No installation, deployment or publication is part of task #61.

### Prebuilt Vercel PDF runtime
After `vercel build --standalone`, run `node scripts/prepare-vercel-output.mjs <output-directory>` and `node scripts/check-packaged-functions.mjs <output-directory>` before deploying `--prebuilt`. The bundled Chromium is x64; an ARM local build otherwise selects an incompatible Lambda architecture. `architecture` in `vercel.json` was accepted by local build but rejected by the deployment API, so the supported Build Output function configuration is pinned explicitly. Do not skip the preparation step or claim a local PDF render proves hosted rendering.

## Technical SEO

Only the homepage, Privacy and Terms are public indexable URLs. Private application
states, queries, APIs and previews are noindex. See [the SEO audit and owner-only
search setup checklist](docs/TECHNICAL_SEO.md). Run `npm run test:seo` for local
artifact and request-policy checks; `npm run seo:generate` refreshes generated heads,
robots and sitemap (also part of the production build). No search setup or release
action is implied by these local files.

## Diagnostics

API responses include a generated `X-Request-ID`; failures also include a stable
`X-Error-Category`. `DIAGNOSTICS_LEVEL=info|warn|error|off` controls content-free
structured server logs. See [observability and alert setup](docs/OBSERVABILITY.md)
for coverage, privacy boundaries, local browser diagnostics, and owner actions.

## Local browser and accessibility checks

Default, mocked-auth and mocked-paid suites support an explicit engine matrix:
`PLAYWRIGHT_BROWSERS=chromium,firefox,webkit npm test` (and the same prefix with
`npm run test:auth` / `npm run test:paid`). Ordinary runs remain Chromium-only;
missing engines fail rather than silently skipping coverage. See the
[local compatibility report](docs/ACCESSIBILITY_COMPATIBILITY.md) for prepared
keyboard/axe/responsive coverage, environment blockers and rerun commands.
