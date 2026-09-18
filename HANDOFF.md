# ResumeStride — agent handoff

Last updated: 2026-09-18 (second session, continued). Read this file and README.md before implementation. Update this checklist and verification notes at the end of each work session.

**Renamed from "ResumeBuild'r" to "ResumeStride" this session.** Domain purchased: resumestride.com. Support email: support@resumestride.com (now shown in the app footer and README). The localStorage keys changed from `resumebuildr.resume.v1` to `resumestride.resume.v1` (and the matching `.rescue` key) as part of the rename — this is a clean break with no migration, which is fine because the app has never been deployed publicly, so no real user has a draft under the old key. If that ever changes before launch, revisit this.

## User intent and decisions

Build an easy, simple, reliable alternative to ResumeNow with better service and lower prices. Work in this local repository. The audience is worldwide and includes ALL occupations and experience levels; do not narrow the product to US applicants or a few industries. User wants a scoped launch in one or two days and is open to using other agents, including Claude, if usage limits intervene. Claude has not been connected or used. No production deployment has occurred.

Current beta is free. A $9 non-renewing 30-day pass was proposed, not implemented or validated. Never advertise connected AI, payments, accounts, document import, or direct downloads until those features work. Preserve honest pricing and avoid invented achievements or universal ATS guarantees.

## Current state

- [x] React + TypeScript + Vite app and responsive landing page.
- [x] Editor with personal details, summary, skills, editable custom sections and entries.
- [x] Three templates, accent color, A4/Letter, RTL content direction.
- [x] Local browser autosave and validated JSON backup import/export.
- [x] Browser Print / Save as PDF (not a dedicated PDF download service).
- [x] Built-in Profile and Skills headings are now editable per resume (Profile & skills tab), and the resume's language code (`lang` attribute used by preview/print) is editable in Design & format. Old saved drafts/backups without these fields are migrated with defaults on load (`migrate()` in src/model.ts) so nothing old becomes unreadable.
- [x] Editor text inputs/textareas now carry `maxLength={50000}` and section/entry titles are capped, matching the backup validator; "Add a section" disables at 30 sections and "Add an entry" disables at 100 entries per section, so the UI can no longer produce a resume it cannot re-import.
- [x] Fixed a real data-loss bug: an unreadable saved draft (future-format, corrupted, or hand-edited localStorage) used to be silently discarded, and the very next autosave would overwrite it with a fresh blank draft with no way to get the original back. It is now copied to a separate `resumestride.resume.v1.rescue` localStorage key before being replaced, and a persistent notice offers a "Download it" button (raw JSON) plus an explicit "Discard" action. Verified by test.
- [x] Fixed a real 320px-width bug: the landing page's decorative hero art used an intentional 110%-width bleed with no overflow containment, causing horizontal page scroll on narrow phones (previously only 390px was tested, which happened to pass). Added `overflow-x:hidden` on `html,body`. Verified by test.
- [x] Ten Playwright checks (up from four); production build and typecheck pass. See "Verification already performed" below for exactly what's covered and what still isn't.
- [ ] Accounts, cloud storage, AI, payments, DOCX export, PDF/Word import, production deployment.

Source files are currently untracked/uncommitted. Do not assume the work is backed up on GitHub. Preserve existing files; do not reset or overwrite them. Check git status before changes. The existing .github/copilot-instructions.md contains some original aspirational stack notes: actual implementation has no backend, Tailwind, test:watch, or server script.

## Code map

- src/main.tsx: landing page, editor, application state, local persistence, import/export actions, unreadable-draft rescue UI.
- src/model.ts: Resume/Section/Entry types, blank and fictional example data, backup validator (`isResume`), a small forward-compat migration (`migrate`) that fills defaults for fields added after a user's first save, storage key, and the separate rescue-copy storage key (`rescueKey`).
- src/components/ResumePreview.tsx: shared template rendering.
- src/styles.css: responsive UI and print styles.
- tests/builder.spec.ts / playwright.config.ts: browser checks.
- README.md: setup and product boundaries.

Commands: npm install; npm run dev; npm run build; npm test. Dev URL normally http://127.0.0.1:5173. Restart if no server is running. Tests require Playwright Chromium. This session had a read-only shell sandbox; writing files, installing packages, or running browser processes may require environment approval. Do not work around those restrictions.

## Next tasks, in priority order

### P0 — harden and prepare a free public beta

- [x] Audit print output with populated and multi-page resumes in all templates and both paper sizes. Check PDF text extraction, page breaks, clipping, long URLs, and non-Latin/RTL fonts. **Automated**: new test builds a 5-entry resume with Nepali text and a long URL and checks, for all 3 templates × 2 paper sizes, that the print DOM contains the Nepali text and the URL and that `.resume-paper` has no horizontal clipping (`scrollWidth<=clientWidth`). This is still Chromium print-emulation + DOM assertions, not third-party PDF text-layer extraction (e.g. pdfminer) or a human check of real multi-page pagination/orphans/widows in an actual PDF viewer — recommend that manual pass before public launch, especially for very long resumes (10+ entries) and RTL (Arabic/Hebrew) content specifically, which wasn't in this session's test (only Nepali LTR non-Latin script was covered; the existing test 1 covers RTL layout direction but with Latin/Devanagari text, not an RTL script itself).
- [x] Make built-in Profile and Skills headings editable/localizable and expose document language. Added `profileHeading`/`skillsHeading` fields (editable in Profile & skills tab, default "Profile" / "Skills & languages") and made `language` editable in Design & format (already wired to the `lang` attribute on the resume article for preview/print/screen readers). Old data without these fields is migrated with defaults via `migrate()` in src/model.ts, applied on both initial load and backup import, so it doesn't break existing/exported backups. The rest of the interface chrome (buttons, labels, landing page) is still English-only by design per current scope.
- [ ] Improve preview-to-print fidelity. Not addressed this session beyond the fixes above — still a continuous/responsive preview, not exact paginated WYSIWYG output. This is a bigger effort (needs real CSS pagination or a print-preview iframe) and was deprioritized in favor of fixing the two correctness/data-loss bugs found below. Preview copy already discloses "Your layout may continue onto additional pages when printed."
- [x] Exercise storage denial, malformed saved drafts, immediate refresh after typing, and backup round trips. Added 4 tests. **Found and fixed a real data-loss bug**: an unreadable saved draft used to be discarded with no way back once the app autosaved a blank draft over it — now preserved under a separate rescue key with a download/discard UI (see "Current state" above). Storage-denial (localStorage throwing on every call) no longer crashes the app; it shows "Browser storage is unavailable" and in-progress typing survives in memory even though it can't persist. Immediate-refresh-after-typing was tested and already worked correctly (the `pagehide` listener saves synchronously before navigation) — no bug found there. Backup export → wipe → import round trip verified, including the new heading/language fields.
- [x] Align editor limits with backup validation (30 sections / 100 entries per section / 50,000 characters per string / 2 MB import). Added `maxLength={50000}` to all resume text inputs/textareas and `maxLength={200}` to the new heading fields (matching a new smaller cap added to the validator itself), and disabled "Add a section" at 30 sections / "Add an entry" at 100 entries with an explanatory `title` tooltip. Not covered by an automated test (clicking to the 30/100 boundary would be slow); verified by code review only — worth a spot-check in the browser.
- [x] Test keyboard access, labels, focus, contrast, mobile navigation, confirmation dialogs, and 320px screen width. **Found and fixed a real bug**: at 320px the landing page overflowed horizontally (decorative hero-art bleed had no overflow containment) — added `overflow-x:hidden` on `html,body`; verified by a new test that also checks the mobile nav toggle and its labeled controls. This is a narrow pass, not a full WCAG audit — color contrast ratios, full tab-order verification, and a screen-reader pass (VoiceOver/NVDA) were not done.
- [~] Review privacy copy, font network requests, real support contact, privacy/terms, and error reporting before publication. Do not log resume content in analytics. Copy audit: existing landing/README/in-app copy does not claim AI, accounts, payments, or cloud sync are connected, and matches actual behavior. Google Fonts remains the only external UI resource (documented in README); resume content is never transmitted (everything is local). **Support contact resolved**: support@resumestride.com now appears in the app footer (`mailto:` link) and README. **Still open**: there is no privacy policy or terms-of-service page/copy anywhere in the app yet — do not invent one; draft it with the user (or point to a template) before wider promotion. No error-reporting/monitoring service is wired up.
- [~] Choose deployment provider/domain with the user; deploy a scoped free beta and smoke-test the public URL. **Decided**: Vercel, domain resumestride.com (purchased by the user). The user ran `npx vercel login` and this machine now has an authenticated Vercel CLI session (`npx vercel whoami` → `dipsonneupane`). **Not done**: the actual deploy (`npx vercel --prod` from the project root) was attempted from this agent session and blocked by the local Claude Code permission classifier ("Production Deploy" denied, both `--prod` and a plain preview deploy). The user needs to either run `npx vercel --prod` themselves from `/Users/dipson/ResumeBuild'r`, or grant a Bash permission rule for Vercel deploys so a future agent session can run it. After the first deploy, wiring resumestride.com will need one or two DNS records added at the domain registrar (Vercel's dashboard/CLI shows the exact records once the project exists) — only the user can do that part.
- [x] Create a reviewed git checkpoint. First commit made this session (see git log). Remote configured: `origin` → https://github.com/DipsonNeupane/resume-builder.git (private, user-created). No credential helper/token is available in this environment, so the first push must be done by the user (`git push -u origin master`, ideally after `git config --global credential.helper osxkeychain` so the credential is cached for future agent-driven pushes). **Status as of this update: local commit exists; push to GitHub not yet confirmed — check `git log origin/master` or ask the user before assuming it landed.** Note the repo name the user created is `resume-builder`, not `resumestride` — consider renaming the GitHub repo to match the new product name (their call, low priority).

Acceptance: users can build, save/recover, and export readable resumes without data loss; no broken or misleading paid/AI actions; published boundaries are accurate.

### P1 — useful document import/export

- [ ] Add direct PDF export and DOCX export using structured resume data. Validate formatting and readable text independently of the browser preview.
- [ ] Add PDF/DOCX import with file size/type checks, explicit parsing errors, editable review before replacing a draft, and a fallback for scanned PDFs.
- [ ] Preserve the original user data when changing templates or importing documents.

### P2 — optional AI assistance

- [ ] Choose provider and configure server-side secrets; never expose API keys in the client.
- [ ] Add opt-in bullet/profile rewriting and job-description tailoring with accept/reject, undo, and clear usage limits.
- [ ] Ground suggestions in user-provided facts; ask about missing evidence instead of inventing metrics, jobs, qualifications, or skills.
- [ ] Add timeouts, rate limits, cost tracking without resume-content logging, and an editing fallback if AI fails.

### P3 — accounts and a paid service

- [ ] Choose backend, database, and auth; migrate local drafts only with clear user consent.
- [ ] Implement per-user authorization, revisions, recovery, export/deletion, and test cross-account isolation.
- [ ] Validate willingness to pay and AI/support costs before finalizing the proposed non-renewing pass.
- [ ] Implement checkout, verified idempotent webhooks, entitlements, expiration, refunds, receipts, and failed-payment handling. Do not rely on client-side payment state.
- [ ] Keep free editing/content access after pass expiration; establish a support response process.

## Verification already performed

Last implementation session: npm run build passed; npx playwright test passed 4/4. Tests covered edit/autosave/reload with Nepali text, custom section display, Letter/RTL settings, print DOM visibility/PDF generation, invalid backup rejection preserving the draft, mobile editor/preview overflow, and home screenshot capture. Landing-page and mobile screenshot were visually inspected. No production, billing, AI, cloud, PDF text extraction, cross-browser, or comprehensive accessibility validation has occurred.

This session (2026-09-18, second session): `npx tsc --noEmit` clean, `npm run build` passed, `npx playwright test` passed 10/10 (up from 4). The 6 new tests, all in tests/builder.spec.ts:
- "typing then reloading immediately does not lose the edit..." — confirms the pagehide-based save survives an immediate reload.
- "an unreadable saved draft is preserved for recovery, not silently overwritten" — plants an invalid draft in localStorage, confirms the rescue banner appears, confirms a fresh edit does NOT destroy the rescued copy, confirms the download and discard actions work.
- "a completely denied storage does not crash the app or destroy in-progress edits" — stubs `window.localStorage` to throw on every call, confirms the app still loads and lets you type.
- "backup export/import round trip preserves headings and language" — fills fields including the new profileHeading/skillsHeading/language, downloads a backup, wipes the draft, imports it back, confirms everything round-trips.
- "print output holds up for a long, multi-language, multi-entry resume across templates and paper sizes" — 5 entries, Nepali name, a long URL, all 3 templates × both paper sizes; checks print DOM contains the Nepali text and URL and that `.resume-paper` has no horizontal clipping.
- "320px width stays usable and key icon-only controls are labeled for screen readers" — this one **failed on first run** (real bug, now fixed — see P0 list) and now passes.

Still not covered by automation, and worth doing before public launch: real PDF text-layer extraction/inspection (vs. DOM assertions under print emulation), RTL-script (Arabic/Hebrew) content specifically, the exact 30-section/100-entry UI boundary, color-contrast ratios, a real screen-reader pass, and cross-browser testing (everything here is Chromium-only via Playwright's default project).

Generated files under ignored test-results/ included home.png, mobile-preview.png, and resume-letter.pdf; reruns may replace them. Re-run appropriate checks after changes and record exact results here.

## Research context

Research checked September 18, 2026; re-verify before publishing comparisons:
- ResumeNow pricing: https://www.resume-now.com/pricing — $1.45/$1.85 introductory 14 days, then $23.85 every four weeks; annual $70.20.
- Traffic: https://www.similarweb.com/website/resume-now.com/ — public estimates indicate millions of visits; count period was ambiguous in extracted view, not verified first-party analytics.
- Reviews: https://www.trustpilot.com/review/resume-now.com — strong overall rating, with individual complaints about billing and formatting. Do not generalize complaints to all users.
- https://flowcv.com/pricing already offers a free resume PDF; low price alone is not sufficient differentiation.

## Suggested next-agent prompt

Read HANDOFF.md, README.md, and .github/copilot-instructions.md. Continue ResumeBuild’r in this repository, preserving current changes. Remaining unchecked P0 work is: preview-to-print pagination fidelity (biggest remaining P0 item), a deeper manual print/PDF and RTL-script audit, a real accessibility pass (contrast, screen reader, full tab order), and the two items that need the user directly — real support contact/privacy/terms copy, and choosing a deployment provider/domain plus a remote git backup destination. Keep global/all-occupation scope. Inspect actual code before relying on handoff assumptions; update HANDOFF.md with changes, tests, and remaining work. Do not imply that unimplemented services are available.
