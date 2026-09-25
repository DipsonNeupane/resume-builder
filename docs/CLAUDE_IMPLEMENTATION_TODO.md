# ResumeStride — implementation TODO for Claude

Prepared 2026-09-18 against commit `44e8a38` in `/Users/dipson/ResumeBuild'r`.

This plan supersedes the older launch ordering, proposed $9 price, and “optional AI” positioning in HANDOFF.md. It includes the owner's subsequent clarification: accounts for Free/Pro, 3 Free downloads resetting every 30 days, early pass purchases queued after current paid time, and recurring payments only when the user deliberately enables them. It is a plan for finishing the existing application, not permission to rebuild it, purchase services, deploy, or start charging customers. No application source was changed during this review. Existing working features must be preserved, with authentication added as now requested.

**Update — 2026-09-19:** docs/VOICE_UPDATES_2026-09-19.md's two required additions are now implemented and verified — see the top entry in HANDOFF.md ("Required-step validation and grounded Pro preview implemented"). Required-step (Personal-details) validation and the small grounded Pro-preview panel (`src/services/proSuggestion.ts`) both exist now; do not re-implement them. The Pro-preview panel is a bounded, local, zero-network illustrative example only — it is not P0-11 (the real Pro AI pipeline below) and does not reduce P0-11's remaining scope. Required-step validation is a UX nudge, not a download-quota/security boundary; it does not resolve D3 or any P0-06/08 accounting work below.

## Supabase auth foundation — 2026-09-18

Owner confirmed Supabase for auth/storage and generated-PDF-only Free accounting. D3 is resolved: browser printing/JSON backups do not consume the 3 downloads per 30-day signup-anchored cycle. D4 provider selection is Supabase; live project configuration and commercial details remain open.

Implemented an incremental P0-04 foundation: @supabase/supabase-js, public-config client with PKCE, account screen with separate signup/sign-in modes, magic-link request, session restore, local signout, safe current-origin callback and failure/retry states. Files: src/services/supabase.ts, src/features/auth/AuthPanel.tsx, src/vite-env.d.ts, .env.example, minimal main.tsx/CSS wiring, docs/SUPABASE_SETUP.md. Configured builds show account navigation; /?account=1 opens it. Unconfigured builds explain unavailability and preserve the local builder. No live project/credentials provisioned, no real email sent or callback/session verified. No cloud upload, mandatory signup gate, protected API or RLS yet; P0-04 is PARTIAL, not completed. Do not advertise account storage/download quotas as ready. Live settings go in ignored .env.local; only URL and publishable key are public browser configuration.

Verification: production build passed; local-builder suite passed 21/21; separate mocked configured-auth suite (npm run test:auth) passed 2/2. Auth mocks verify signup creates users while signin does not, PKCE challenge and allowlisted-shaped callback, and rate-limit failure/retry. They do not verify real delivery/token exchange/logout or production authorization. Existing local drafts survive opening unconfigured account screen. No deploy/commit/push/new Claude job. Next: configure owner Supabase project, test real email callback, implement owned storage/RLS and consented local migration, then enable mandatory signup and trusted generated-PDF quota. See setup guide. Never put service-role keys in VITE_*.

## Follow-up fixes verified — 2026-09-18

The two findings from the scheduled review below are now fixed in src/main.tsx and covered by two new Playwright regressions. Validated JSON restore has a dedicated state replacement path, so a >200,000-character legacy backup imports into a smaller draft and persists without the editor growth limit falsely rejecting it. Import resets the active editor tab and language input. Existing field validation and 8 MB import limit remain in force; unlimited legacy file recovery is not claimed.

When the rescue slot is occupied by another unreadable draft, autosave AND pagehide writes pause while the second raw draft remains in the active storage key. The UI explains that new edits are in memory and must be backed up before refresh. Explicitly discarding the additional recovery requires confirmation and resumes persistence. Downloading a recovery does not silently authorize deleting it. Regression checks cover edit/reload survival of both originals and explicit replacement after confirmation.

Verification run here: npm run build passed; npm test passed 20/20; git diff --check passed. No deployment, commit, payment, AI, auth integration or new Claude job this session. Source changes remain local. Existing weaker PDF/accessibility assertions and provider-specific production checks are not resolved by these tests.

Next: P0-03 metadata and P0-04 authentication foundation. Questions sent to owner: confirm proposed Supabase provider and whether the free allowance counts generated PDFs only (with browser printing/JSON backups outside accounting). Those answers are pending. Do not duplicate completed fixes or interpret earlier historical review findings as still open.

## Scheduled completion review — 2026-09-18

Claude execution session 35769 exited successfully. Its report says build and 18/18 tests passed; these were not independently rerun during this progress check. Changes remain uncommitted. No additional Claude job was started.

Quick source review identified two unresolved correctness issues, so P0-02 is not yet fully accepted:
- Oversized legacy backup import calls the growth-limited `update(data)`. When importing into a smaller draft, that update can reject the data, but import still displays “Backup imported.” A separate validated restore path or explicit update result is needed, with a regression for importing a valid >200,000-character backup.
- A second unreadable draft is retained only in memory when the rescue slot is occupied. Editing autosaves over the active raw copy; refreshing then loses the second recovery draft. Persist both recoveries or block overwriting the active raw copy until explicit resolution, and test edit/save/reload.

The one-time progress automation was paused after this check. Review/fix these issues before accepting the increment; preserve the working language and mobile changes.

## Latest reconciliation — current chat, 2026-09-18

This addendum takes precedence over conflicting “resolved” labels below. The owner returned with the original brief and explicitly asked to avoid repeating work from another chat. The existing plan is retained rather than replaced.

**Verified now:** checkout remains at `44e8a38`; application source has no new uncommitted changes. Existing changes are planning documents. Current source and package inventory still show a React/Vite local builder, no backend/auth/payment/AI integration. Claude's completed rebrand, editable headings/language, recovery work, preview improvements and 14-test suite must be preserved. Prior test results below are historical; this reconciliation did not rerun them or modify application code.

**Claude CLI:** `/Users/dipson/.local/bin/claude`, version `2.1.277`; `claude auth status` reports logged in through Claude.ai. CLI executable/authentication verified only; no model request or implementation job was submitted, so remaining provider usage is not verified.

**Confirmed in the latest message:**
- Free users must sign up/sign in to access **3 free downloads every 30 days from signup**; no credit card or watermark.
- Paid users must sign in; Pro remains the brief's **$19.99 30-Day Pro Pass**.
- Users can buy another pass while active or after expiry. Preserve previously planned stacking (`max(verified payment time, paid-through) + 30 days`) to avoid wasting prepaid time; the latest request does not revoke that prior recorded decision.
- Preserve the worldwide/all-occupation audience and existing design; finish incrementally.

**Reconciliation resolved by the owner in this chat:**
1. Free allowance resets **every 30 days from signup**, not on calendar-month boundaries. D1 is confirmed; use account-creation-anchored UTC windows and show the next reset date.
2. **Recurring payments are optional, chosen by the user.** Default passes remain non-renewing. P0-09B is no longer on hold for product clarification: implement explicit opt-in, visible price/next charge date, and easy turn-off controls, subject to its existing provider and verification dependencies. Never preselect renewal. Turning renewal off preserves purchased access, and manual extensions must not overlap automatic charges.

These answers supersede the previous pending-question notice and the pasted brief's absolute no-recurring wording. D3 (counted export boundary) and D4 (provider/commercial details) remain separate unresolved items.

**Execution checklist (reuse ticket details below):**
- [x] Locate/reuse prior implementation TODO; compare actual code and Git state; verify CLI executable/authentication.
- [x] P0-02: fixed invalid language persistence, aggregate backup bounds (with legacy-backup recovery preserved), missing mobile backup/import access, and occupied rescue-slot handling. See the "P0-02 implemented" entry at the top of HANDOFF.md for exact files, behavior and 4 new regression tests (18/18 passing, build clean). Item 5 in section 1 (weak test assertions) was not part of the four named items and was not addressed.
- [ ] P0-03: finish only missing metadata/brand surfaces; do not repeat the rename.
- [ ] P0-04/05: add signup/sign-in for both tiers, trusted identity and owned storage; preserve/import the existing local draft with consent.
- [ ] P0-06/08: app-generated PDF and server-enforced Free quota, visible remaining count/reset date, idempotent retries and no debit on failure. Resolve D3 before final accounting UI: a browser print dialog cannot reliably report a completed download, and ordinary browser printing cannot be reliably prevented.
- [ ] P0-07/09: implement server-priced one-time Pro purchase, webhook verification, expiry, active-pass extension and expired repurchase; preserve content and do not reset Free quota simply on sign-in or purchase.
- [ ] P0-09B: optional recurring payments with explicit user consent, default off, cancellation and manual-extension reconciliation; preserve prepaid time and prevent overlapping charges.
- [ ] P0-10/11: master-preserving applications, job analysis/tailoring/cover letters and bounded server-only AI.
- [ ] P0-12–15: update honest two-tier copy only as features work; test ownership, quota races, expiry and duplicate payments; finish policies/support and deployment checks.

Suggested immediate Claude task: read this addendum and the existing tickets, recheck Git/source for intervening work, then implement **only P0-02 remaining correctness fixes** with regressions and a handoff update. Do not redo completed work or start deployment/billing. Subsequent auth and one-time-pass work can proceed in separate increments; reset and optional-recurring decisions are now confirmed; unresolved export/provider/commercial decisions must not be silently invented.

## 1. Verified starting point

The application is a working **local resume-builder beta**, not an almost-complete paid application service. The core editor is substantially implemented; accounts, server storage, metered downloads, payments, AI, and application versions are new work. Do not label those integrations as simple configuration tasks.

Reviewed AGENTS.md, HANDOFF.md, README.md, .github/copilot-instructions.md, every source file, entry HTML, package/configuration files, and the full browser test suite. The working tree was clean before this planning session. Historical handoff statements that files are uncommitted are stale relative to this checkout. No production deployment, DNS, mailbox delivery, payment account, or remote repository state was verified.

Verification in this review:

- `tsc --noEmit`: passed.
- Vite production build with `write: false`: passed, without replacing dist.
- `npm test`: all 14 Chromium Playwright tests passed, including automated accessibility scans, persistence, backup import/export, mobile widths, and PDF text checks.
- Inspected the generated mobile preview screenshot. Tests create ignored test artifacts.
- No physical-device, manual screen-reader, real payment, backend, AI, or cross-browser validation occurred. Those systems either need additional testing or do not exist.

### Requirement-to-code inventory

| Area | Actual state | Action |
| --- | --- | --- |
| Brand/header/title/package | ResumeStride is already used in `src/main.tsx`, `index.html`, `package.json`, README, AGENTS, and agent instructions. | **Complete in those surfaces.** Preserve. Footer uses lowercase `resumestride`; normalize display casing. |
| Old product name | No old brand found in current runtime source/HTML. Historical references remain in HANDOFF and the local directory name. | Retain historical provenance. Do not rename folders/storage again merely for appearance. |
| Domain/support | `support@resumestride.com` exists in footer/README; domain recorded in documentation. | Verify actual mailbox and DNS; text in a file is not proof they work. |
| Metadata/SEO/social | Title, description and theme color exist. No canonical URL, Open Graph/Twitter metadata, favicon/social image, robots/sitemap or legal routes. | Finish these around the existing brand; avoid broad redesign. |
| Design | Soft green/cream, existing typography, friendly progression language. | **Preserve.** “Build your resume. Find your stride.” can be used once in primary messaging. |
| Core editor | Personal details, summary, skills, flexible sections/entries, three templates, color, A4/Letter, direction/language. | **Complete baseline.** Do not rebuild or restrict standard templates. |
| Storage/recovery | One localStorage draft; JSON backup import/export; rescue copy of unreadable draft; debounce/pagehide save. | **Complete local baseline with edge cases below.** Cloud ownership, history and sync are absent. |
| Import | Validated ResumeStride JSON backup only. | **Complete for JSON.** PDF/DOCX import is not implemented and is not a new P0 requirement. |
| PDF/export | `src/main.tsx:30` calls `window.print()`. Shared renderer + print CSS support browser Save as PDF. No dedicated download API or export history. | Preserve printing; add reliable application PDF generation/accounting. No watermark today—keep it that way. |
| Pricing | `src/main.tsx:46` advertises one free beta option and unlimited PDF printing. | Replace only when the two-option product is functional. Default $19.99 / 30-day pass, no auto-renewal; separate explicit opt-in renewal for the same Pro tier. |
| Authentication/emails | None. No auth pages or email templates to rename. | Add signup/sign-in for the Free/Pro workspace with branded emails; preserve preexisting local drafts through migration. |
| Backend/database/environment | None. No API routes, schema, service SDK, runtime secrets, or database brand references. | Add the minimum backend for ownership, entitlement, export and AI. Do not invent a legacy migration. |
| Stripe/subscriptions | None. | Implement one-time Checkout; there is no existing subscription system to convert. |
| Free-download tracking | None. Browser print is unlimited. | 3 application downloads/account per 30-day cycle; define delivery semantics and enforce on server. |
| AI/token costs | None. Sparkles icon accompanies text saying AI is planned. | No existing free AI to preserve. Add the specified Pro workflows with safeguards. |
| JD/ATS/keywords/tailoring/cover letters | None. No hidden existing implementation. | New P0 capability for the paid launch. Ground suggestions in user facts and avoid ATS guarantees. |
| Versioning/dashboard/purchases | One in-memory/local master document, no dashboard or applications. | Add Master Resume → Application → Tailored Resume + Cover Letter without replacing the editor. |
| Paywall/expiration | None. | Server checks plus transparent UI; retain all content after expiry. |
| Privacy/terms/analytics/errors | No legal pages, analytics or monitoring. Google Fonts is externally fetched. Local storage errors have UI handling. | Add accurate disclosures and content-free operations telemetry. No resume/session-replay tracking. |
| Tests | 14 Chromium tests; tsc includes only `src`. | Preserve these; add unit/API/payment/AI tests and test/server typechecking. Strengthen weak assertions. |

### Existing correctness issues to address in targeted fixes

1. `src/main.tsx:53` permits an empty/invalid language code and autosaves it; `src/model.ts:isResume` then rejects that draft on reload. Keep a draft input value separate from the last valid persisted language, show an error, and never turn a normal edit into an unreadable saved resume.
2. The editor permits up to 30 sections × 100 entries × large strings, but JSON import rejects files above 2,000,000 bytes. A valid exported backup can therefore be too large to re-import. Align aggregate schema/editor/import bounds without silently truncating work; preserve a recovery/export path for oversized legacy data.
3. At <=560px, `src/styles.css` hides the header Backup button, the sidebar tip containing another backup action, and sidebar back-links including Import. Core recovery actions disappear on phones. Add an accessible mobile document-actions menu.
4. `initial()` only has one rescue slot and overwrites it when another unreadable active draft is found. Preserve an existing rescue until explicit discard, and make any additional recovery conflict visible. Do not claim indefinite revision history from this one slot.
5. Overflow tests can pass because `html,body { overflow-x:hidden }` conceals clipping. The keyboard test only checks that an active element has a tag name. Arabic PDF coverage only checks nonempty text, not correct extraction. Keep those tests but add targeted assertions rather than advertising comprehensive verification.

## 2. Product contract and unresolved decisions

### Fixed requirements

- Only **Free** and **ResumeStride Pro — 30-Day Pro Pass**.
- Free: signed-in account required; create/edit a useful professional resume; existing standard templates; **3 free resume downloads every 30 days**; no watermark/card requirement; access to the user's own content. No existing AI functionality is being removed.
- Pro: **$19.99 for 30 days**, signed-in account required. Default purchase is one-time with no automatic renewal. A separate deliberate opt-in may enable recurring payments for this same tier; never preselect or silently migrate users. Unlimited resume downloads during active access; job-description analysis, ATS/keyword guidance, tailoring, rewritten bullets, matching cover letters and saved job-specific versions.
- No Basic/Plus/Ultimate tiers, annual plan, fake discounts, constant popups, subscription trial, or paywall merely to read/edit owned content.
- Never silently replace the master. AI outputs are drafts that require user review; no invented qualifications, employment, metrics or skills.
- Keep worldwide/all-occupation support, custom headings, Unicode, RTL, international contact formats, A4/Letter. English interface is the current implemented scope; do not promise full localization.
- Existing applications/resumes/cover letters survive expiry. Premium actions require an active pass; no renewal charge without explicit recurring consent, deletion, or content hostage-taking. An early manual pass purchase adds its 30 days after current prepaid access ends; after expiry it starts at successful payment.
- “ATS optimization” means explainable checks and job alignment, not certification, universal compatibility, a hiring probability, or a guaranteed interview.

### Decisions that must not be silently invented

The owner's latest answers resolve D1/D2 and add user-controlled recurring billing. These answers supersede the initial response rejecting the bundled lifetime/extension suggestion and the original absolute “no recurring billing” wording. Recurring is a payment preference, not a third product tier.

| ID | Owner decision | What can proceed meanwhile |
| --- | --- | --- |
| D1 — resolved | 3 Free downloads reset every **30 days**, with signup/sign-in required. | Use fixed 30 × 24-hour UTC windows anchored to account creation; no calendar-month reset, login reset or rolling per-download replenishment. Unused allowance does not accumulate; show the exact next reset date. These anchor/no-carry details are implementation conventions to make the stated reset rule precise. |
| D2 — resolved | Pro may buy during active access or after expiry. Early purchase starts after current paid-through time; expired purchase starts on success. Users may explicitly enable recurring billing themselves. | `manual_start = max(verified_paid_at, paid_through)`; end = start + 30 days. Queue multiple successful purchases serially. Default auto-renew is off; see P0-09B for explicit consent and avoiding overlap with prepaid time. |
| D3 — resolved | Owner confirmed the export boundary: recommended count is **application-generated resume PDF downloads**, while JSON backup/data export and ordinary browser printing remain available. | Preserve print and backup. Never count opening/closing a print dialog as a completed download. If the owner wants a different boundary, resolve it before quota UI/enforcement. |
| D4 | Confirm the operational provider accounts and commercial launch details: auth/database hosting, AI provider/retention, USD price presentation/tax treatment, refund/partial-refund/dispute policy, business identity and support contact. | Build adapters/test-mode flows and draft factual copy; do not invent legal commitments, a retention promise, or real account configuration. |

D1/D2 are ready to implement. D3 is a recommended interpretation needing owner confirmation before final quota UX; D4 contains operational/commercial details not supplied by the user. Neither should block independent local fixes, contracts or mock-backed development.

### Expiration and content access matrix

| Action | Free / expired | Active Pro |
| --- | --- | --- |
| Read/edit master with standard templates | Yes | Yes |
| Read, manually edit and back up previously created applications/letters | Yes; preserve core content access | Yes |
| Application-generated resume PDF | Remaining allowance under D1; never delete a prior delivered artifact solely on expiry | Unlimited, subject only to operational abuse controls |
| Print / JSON backup / account data export | Preserve; outside quota under proposed D3 | Preserve |
| New job-specific versions, AI tailoring/rewriting, cover-letter generation, full JD/ATS analysis | Pro action; show contextual upgrade | Enabled |
| Payment/pass history and receipt access | Yes | Yes |
| Existing cover letter reading/copying | Yes | Yes |
| Enable/manage recurring Pro billing | Explicit purchase/setup with clear charge date and consent | Optional opt-in; cancel future renewal without losing prepaid access |

Suggested acquisition flow: public landing/templates lead to signup/sign-in, then the Free builder. A signed-in Free user can paste a JD and see the purpose of Pro, preserving the text through checkout. A small deterministic keyword preview can be considered under P1; do not add an unrestricted free AI endpoint or promise free AI analysis now. Full Pro analysis is part of the paid toolkit. This respects the distinction “Free = build; Pro = apply.”

## 3. Minimal implementation architecture

Keep React + TypeScript + Vite, `Resume`, `ResumePreview`, all three templates, and existing CSS. Extract components/functions from `src/main.tsx` only when needed by a ticket. No Next.js/Tailwind rewrite, template replacement, microservice fleet, vector database, browser agent, job scraper, or homegrown recurring-charge scheduler. Use provider-managed billing only for explicit recurring consent.

Recommended additive stack (no such accounts were verified): existing Vercel deployment direction, same-origin Node TypeScript `/api` functions, Supabase Auth + PostgreSQL/private storage, Stripe hosted one-time Checkout, and a single server-only AI provider adapter. Supabase minimizes new auth/session/database code; RLS should backstop explicit API ownership checks. Server secrets and service-role credentials must never enter Vite. Supabase documents the browser/server distinction for RLS and service keys in [its RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).

Use email magic-link authentication as the proposed simplest initial flow, with separate clear signup/sign-in screens, verified return URLs and branded templates. The Free and Pro workspace require an account; landing pages and template previews remain public. Preserve preexisting guest local drafts and offer consented import after sign-in, rather than deleting work when the new gate is introduced. Configure real email delivery and expiry/recovery rather than treating provider demo email as production-ready. OAuth/password login is not required by this brief.

Keep resume documents as validated JSON matching the existing model. Add row metadata for ownership/versioning instead of replacing the document shape. Centralize portable schema/migrations for both browser and server. Use optimistic concurrency with revision numbers and retain immutable checkpoints for import/AI/master-replacement actions; a stale tab must get a conflict rather than silently overwrite another edit.

Proposed files below are new unless noted. For API routing, use a small number of grouped `/api` handlers with domain services in `server/`, rather than one function for every action. Verify the chosen Vercel plan's runtime/body/bundle constraints before committing the PDF renderer to production; [Vercel publishes those limits](https://vercel.com/docs/functions/limitations). A bounded runtime spike in P0-06 should prove the existing renderer can be reused.

### Proposed data model

| Table / store | Minimum data and constraints |
| --- | --- |
| Auth identity / `profiles` | Provider user ID; minimal preferences. Do not store card details or duplicate resume PII unnecessarily. |
| `resumes` | ID, owner ID, kind (`master`/`application`), application ID if relevant, validated existing Resume JSON, schema version, monotonically increasing revision, timestamps. |
| `resume_revisions` | Immutable JSON checkpoints, parent resume/revision, owner, reason (`import`, `manual_checkpoint`, `accepted_ai`, `replace_master`). Retention is documented; no indefinite snapshots per keystroke. |
| `applications` | ID, owner, master resume/revision reference, job title/company supplied by user or explicitly extracted, raw JD, tailored resume ID, cover-letter text/revision and timestamps. Unknown title/company remains blank, never invented. |
| `purchases` | Owner, unique Checkout Session and PaymentIntent IDs, server-controlled product/amount/currency, verified paid time, payment/refund/dispute status, pass start/end and policy version. |
| `payment_events` | Unique provider event ID, processing status and minimal normalized metadata. Durable idempotency/reconciliation; do not keep raw payment payloads indefinitely. |
| `billing_preferences` | Owner, default-off auto-renew preference, consent text/version/time, provider subscription/schedule ID (at most one renewable agreement per owner), confirmed next charge, cancellation status. A local flag alone is not proof recurring setup succeeded. |
| `entitlement_grants` | Purchase-bound 30-day grants, start/end, revocation reason/time if applicable. No client writes. `pro_expires_at` may be a derived cache, never the sole financial ledger. D2 determines multiple-grant composition. |
| `download_requests` | Owner, immutable resume revision, format, idempotency key, content hash, status, quota reservation ID if free, artifact reference and delivery/retry timestamps. Unique owner/key with hash-conflict rejection. |
| `download_allowances` / ledger | Account + 30-day window index anchored to account creation + consumed/reserved counts/events, transactionally enforced. Pro exports never consume Free quota. Cycles continue while Pro is active; expiry returns to the remaining allowance in the current cycle, not a newly reset allowance. |
| `ai_runs` | Owner/application/revision, operation, idempotency hash, prompt/model versions, status, usage/cost totals; structured candidate output retained only while review is needed. No provider prompt/body in logs. |
| Private export artifacts | Owner-bound PDF objects with deletion/expiry policy. Signed delivery links short-lived; metadata cannot be used to access another account. Backups/public assets never contain private resumes. |

Auth/owner/RLS policies apply to all owned rows and artifact reads. Entitlement, purchase and quota writes are server-only. SQL migrations must test direct client privilege escalation as well as API access. Do not trust a user-submitted `owner_id`, price, download count, `is_pro`, or expiry.

### API surface and shared contracts

- Session/auth callbacks and `/api/me`: verified identity, server-derived capability set, remaining downloads, expiry/server time and purchase summary; no privileged secrets.
- `/api/resumes`: ownership-checked read/save/import/checkpoint with expected revision; return `409` on a stale write and a recoverable UI.
- `/api/applications`: create/read/update applications and their derived documents, including explicit “replace master” action with confirmation/checkpoint.
- `/api/exports`: reserve/render/finalize/retrieve the immutable requested version. Distinguish pending, ready, failed, and quota-exhausted; retries reuse the original logical request.
- `/api/billing`: create server-priced Checkout, read owned purchase status/history. Return redirects only to allowlisted application URLs.
- `/api/stripe-webhook`: raw-body signature verification, durable event deduplication and transactional grants.
- `/api/ai`: bounded analyze/tailor/cover-letter operations, ownership and active-entitlement validation before spend, structured candidates and explicit accept/reject.
- `/api/account`: account export/deletion and status, with recent authentication for destructive actions.

Portable contracts should include `Capabilities`, `EntitlementState`, `DownloadPolicy`, `ExportRequest`, `Application`, `SuggestionSet`, typed public errors and schema versions. Shared code cannot import secrets, provider SDKs, or server runtime modules. Validate requests/responses at runtime, not with TypeScript casts alone.

### Payment and expiry invariants

- Default Stripe Checkout uses `mode: "payment"`, a server-allowlisted **non-recurring** Price (1999 USD cents under proposed USD presentation), quantity one. Only the distinct explicitly consented recurring flow may create a Subscription/schedule with the same price per 30 days. No opt-out checkbox or background conversion. One-time and recurring modes are distinct in the [Checkout API](https://docs.stripe.com/api/checkout/sessions/create).
- Only a verified successful payment grants access. Redirect/query-string/localStorage state is not payment proof. Validate environment, product, amount, currency and account association. Tax handling must match D4, so validate subtotal and configured tax separately rather than assume total always equals 1999.
- A first/expired manual purchase grants 30 × 24 hours from verified payment-success time, using UTC/server time. An early purchase starts after the existing paid-through boundary, under a per-account transaction lock. Current time strictly below grant expiry is active; equality means expired. No cron is needed to enforce expiry: every premium API checks server time.
- Optional recurring billing renews every **30 days**, not calendar month. First recurring charge is due only after prepaid time ends, or immediately if there is no paid access and the user explicitly chose recurring purchase. Paid invoices grant the corresponding service interval exactly once; pending/failed invoices do not grant a fresh interval. Cancellation turns off future billing and preserves already-paid access. Use provider test clocks and verify proration behavior—moving a billing anchor can otherwise cause an immediate invoice, as described in [Stripe billing-cycle documentation](https://docs.stripe.com/billing/subscriptions/billing-cycle).
- If a manually purchased pass extends prepaid time while renewal is enabled, defer the next recurring charge by the same paid duration; never double-bill overlapping service. Serialize billing mutations and reconcile provider state durably; see P0-09B for checkout/renewal races. Display “Renews on DATE for $19.99” only after confirmed setup; otherwise display the non-renewing expiry. No automatic switch back to recurring after a user cancels it.
- Record pending/delayed payments without grants until paid. Deduplicate by event ID **and** purchase/payment identity; different events for the same payment must not extend access twice. Handle delayed, duplicated and out-of-order events, refunds and disputes without overwriting unrelated valid grants. Raw-body signature and duplicate/order handling follow [Stripe webhook guidance](https://docs.stripe.com/webhooks).
- An AI/export request authorized before expiry may complete for the same immutable inputs after expiry; retries of that same request remain retrievable. New premium work after expiry is rejected. This avoids charging/rendering and then withholding its result.
- A success screen can show “Payment received; confirming access” while the webhook/reconciliation finishes. Never mark success solely from the redirect, and never tell a paid user to purchase again because an event is late.

### Download invariants and unavoidable browser boundary

The browser cannot reliably prove a save to disk. `afterprint` can fire when preview is closed, so it cannot account for successful downloads; see [MDN's event semantics](https://developer.mozilla.org/en-US/docs/Web/API/Window/afterprint_event). User-visible content can also be printed/copied outside app controls. Do not implement DRM-like interception or hide content to pretend otherwise.

Proposed D3 semantics: one free unit is one successful **app-generated PDF export request**, with repeat delivery/retry of that immutable artifact free of additional charge. Explain “downloads” accordingly; do not debit failed renders or count JSON/data backups. A canceled print dialog consumes zero. Any renewed generation after a user edits the document is a new request; allowance is 3 per fixed 30-day account cycle. Record the reservation's cycle so a render crossing reset is finalized against its original window.

Reserve quota atomically before rendering, finalize once the downloadable artifact is ready, release on failure, and expire/reconcile abandoned reservations. The request is tied to owner + immutable revision + format. Concurrent fourth Free requests cannot slip through. Repeated delivery of the same request does not reserve again, even after Pro expires. No schema/UI should claim actual physical disk saves were observed. Existing files always remain the user's.

## 4. P0 — required before the finalized paid launch

Work sequentially in the order below unless an explicit dependency is unresolved. Each ticket should be a small reviewable change; large tickets list internal slices that Claude should complete and verify separately. Stop at policy/provider decisions affecting dependent work, while continuing independent tasks. Mark complete only with evidence.

### P0-01 — align the handoff and freeze the product contract

- **Change / why:** Record finalized price/features and D1–D4 outcomes; remove contradictory active instructions about $9, optional AI, and “only deployment remains.” Preserve historical verification notes.
- **Files:** this plan, HANDOFF.md, README.md, .github/copilot-instructions.md; new `shared/product-policy.ts` only once decisions are resolved.
- **DB/API:** none yet. Define versioned policy enums/interfaces, not guessed implementations.
- **Frontend/billing:** no new live marketing promises or purchase button yet. Proposed constants: 3 downloads, 30 days, 1999 USD cents (currency/tax presentation pending D4).
- **Edges:** don't regress to lifetime/calendar-month quotas or shorten prepaid time; don't apply the original absolute ban on recurring to the newly authorized explicit opt-in. Free beta remains honest during development.
- **Acceptance:** one authoritative capability matrix includes the latest D1/D2 answers; Claude knows which remaining D3/D4 decisions need owner input.
- **Dependencies:** none. Content/documentation corrections can start immediately.

### P0-02 — fix existing recovery and mobile-access defects

- **Change / why:** Fix the five targeted issues listed in section 1 before cloud/AI increases data-loss impact. Do not redesign the editor.
- **Files:** `src/main.tsx`, `src/model.ts`, `src/styles.css`, `tests/builder.spec.ts`; new focused model tests.
- **DB/API/billing:** none. Keep current valid version-1 backups readable and local work accessible.
- **Frontend:** valid persisted language separate from temporary input; explicit size feedback; mobile document-actions access; non-destructive rescue handling.
- **Edges:** invalid language then reload; oversized but otherwise valid backup; denied/quota-full storage; already-occupied rescue slot; multiple tabs; mobile storage warning when backup is needed.
- **Acceptance:** no ordinary editor action creates an unreadable persisted draft; permitted exports round-trip; mobile backup/import remains reachable by keyboard/touch; existing 14 tests still pass with new regression cases.
- **Dependencies:** none; independent of D1/D2.

### P0-03 — finish the rebrand and static metadata without changing design

- **Change / why:** Complete user-facing casing and missing share/search assets; do not redo the already-complete rename.
- **Files:** `index.html`, footer in `src/main.tsx`, new `public/favicon.svg`, `public/og-resumestride.png` or equivalent asset, `public/robots.txt`, `public/sitemap.xml`; tests/copy checks. Reuse the existing FileText/wordmark direction.
- **DB/API:** none. Preserve `resumestride.resume.v1` and rescue keys; old keys are historical and should not be deleted without user-controlled migration if discovered.
- **Frontend:** canonical production domain, branded Open Graph/title/description, one natural primary tagline. Use existing green/cream visual language. Private authenticated pages must not be indexed.
- **Billing:** future Checkout, receipts and auth emails must use ResumeStride; they do not exist yet and are handled in their owning tickets.
- **Edges:** preview deployments must not become canonical indexed duplicates; account/editor URLs must not expose document text in metadata.
- **Acceptance:** no old brand in shipped UI/new transactional messages; historical docs remain intelligible; title/social metadata correct; support address consistent but not described as verified until tested.
- **Dependencies:** none; final pricing copy waits for P0-12.

### P0-04 — add backend/auth foundation and secure configuration

- **Change / why:** Introduce the minimum trusted server boundary and requested signup/sign-in for Free and Pro. Preserve existing local drafts during the transition.
- **Files:** new grouped `api/auth.ts`, `api/me.ts`, `server/config.ts`, `server/auth.ts`, `server/errors.ts`, `server/http.ts`, `src/services/api.ts`, `src/components/AccountMenu.tsx`, `src/components/AuthPanel.tsx`, `.env.example`, `tsconfig.server.json`; update package scripts, root tsconfig and test setup.
- **DB:** Supabase Auth + minimal profiles migration under `supabase/migrations/`; RLS on public owned data. Provider choice is D4; this is a proposed additive stack, not an existing integration.
- **API:** verified sessions, allowlisted auth redirects, CSRF/origin checks for cookie-authenticated writes, secure cookies where used; rate-limit auth attempts; no service-role key in client imports/env. Do not invent a custom password/session system.
- **Frontend:** visible signup and sign-in entry points for Free/Pro; public landing/template previews; meaningful failure/retry; return to pending edit/JD after login; sign-out clears account-scoped caches. No silent upload or deletion of the guest draft. Require verified identity before downloads/purchases.
- **Billing:** none live; identity exists before checkout.
- **Edges:** expired link/session, wrong-account browser cache, storage denied, refresh during login, attacker-supplied return URL.
- **Acceptance:** both Free/Pro require signup/sign-in for their workspace; existing local drafts survive and can be imported; login/logout/recovery works in staging; protected endpoints reject absent/forged sessions; client bundle scan finds no injected sentinel secrets. New server/shared/tests are typechecked.
- **Dependencies:** P0-01 technical configuration and D4 provider setup; can use local/test configuration before production provisioning.

### P0-05 — owned resume storage, revisions and consented local migration

- **Change / why:** Add durable personal resumes without replacing current model/renderer or overwriting guest work.
- **Files:** `src/model.ts` (portable validation export), new `shared/resume-schema.ts`, `server/resumes.ts`, `api/resumes.ts`, `src/services/resumes.ts`, `src/hooks/useResumePersistence.ts`, `src/components/Dashboard.tsx`; minimal wiring in `src/main.tsx`; SQL migrations and auth-isolation tests.
- **DB:** `resumes`, `resume_revisions` with owner indexes/RLS and revision constraints. Anonymous local storage remains separate; user namespaces prevent cross-account local leaks.
- **API:** server validation, immutable checkpoint before import/replace, optimistic save, ownership on every read/write/delete. No client-selectable owner.
- **Frontend:** ask before copying local draft into account; show local versus cloud save state accurately, conflict resolution preserving both copies, dashboard open/rename. Do not mark “Saved” before acknowledgement.
- **Billing:** read/edit access is Free, regardless of Pro expiry.
- **Edges:** existing cloud master plus guest draft, offline edits, two tabs, failed save/reload, account switch, old JSON versions, deletion races.
- **Acceptance:** account B cannot read/write A by guessing IDs or direct database calls; no silent last-write-wins; guest recovery remains available; all templates/paper/language fields round-trip unchanged.
- **Dependencies:** P0-02, P0-04.

### P0-06 — reliable PDF generation using the existing templates

- **Change / why:** Add real app-generated PDF output while retaining browser print. Reuse `ResumePreview` and print styles; don't replace templates with an unrelated PDF design system.
- **Files:** `src/components/ResumePreview.tsx` only for portability if needed; new `server/export/render.ts`, `server/export/document.tsx`, `server/export/fonts.ts`, `src/features/export/ExportControls.tsx`; factor only shared resume/print styles out of `src/styles.css` as necessary; private storage adapter; renderer fixtures/tests.
- **DB/API:** immutable source-revision request and owner-bound artifact path; no public resume render URL. First spike uses fixtures and proves a pinned Chromium-based renderer fits the chosen runtime; otherwise isolate that renderer on a compatible private worker without moving the frontend or adding a public HTML-render API.
- **Frontend:** download progress/retry, A4/Letter, selectable text, no watermark. Browser printing remains a clearly separate action.
- **Billing:** this ticket does not independently enable quota/payment. D3 determines delivery policy in P0-08.
- **Edges:** long URLs, long entries/pages, RTL/Unicode, missing font glyphs, timeouts, disconnected client, arbitrary HTML/URLs. Escape text; block renderer outbound requests and bundle approved fonts locally.
- **Acceptance:** all 3 templates × both sizes visually reviewed and text-extracted; first/last content survives; no script/SSRF capability; failed rendering returns a safe error and no quota debit. Document package size, memory, duration and rendering cost.
- **Dependencies:** P0-05; runtime feasibility spike can start after P0-04.

### P0-07 — implement entitlement and purchase policy as tested server logic

- **Change / why:** One source of truth for Free/Pro capabilities, expiry, payment grants, refunds and repurchase. Keep entitlement independent of UI.
- **Files:** new `server/entitlements.ts`, `shared/capabilities.ts`, `server/billing/policy.ts`, `tests/entitlements.test.ts`; SQL purchase/grant migrations.
- **DB/API:** purchases, grants, minimal purchase history. Server time and authoritative ledger; cached expiry cannot be user-editable.
- **Frontend:** `/api/me` exposes capabilities, local-display expiry with timezone, remaining Free allowance and reset date, and separately confirmed renewal state/date. Never imply a one-time pass auto-renews.
- **Billing:** 30-day first/expired purchase; D2 active purchase behavior and D4 reversal policy must be encoded with examples before implementation.
- **Edges:** exact expiry instant, DST/leap dates, forged client clock, simultaneous purchases, refunded old pass plus a separate valid pass, partial refund, dispute resolution.
- **Acceptance:** tests cover first purchase, early purchase extending paid-through, expired repurchase, fixed 30-day Free windows, cancellation preserving paid access, and paid recurring invoice grant; expired users retain content access; every privileged path uses the same entitlement service. A subscription object requires explicit P0-09B consent.
- **Dependencies:** P0-04 and relevant D4 decisions; D1/D2 are resolved. Reversal policy awaits D4, not quota or manual stacking logic.

### P0-08 — quota-safe PDF delivery and honest Free limits

- **Change / why:** Implement 3 Free exports under the owner-approved D1/D3 rules; prevent concurrency errors and double charging a retry.
- **Files:** new `server/export/quota.ts`, `server/export/requests.ts`, `api/exports.ts`; extend `ExportControls`, `api/me`; SQL allowances/request ledger migrations and tests.
- **DB/API:** atomic reservation, finalize/release, idempotency and immutable revision binding; private artifact delivery with fresh ownership checks. Abandoned reservation reconciliation is bounded and tested.
- **Frontend:** show remaining allowance before a counted request, explain failed exports do not consume it, offer retry of the same artifact, preserve editing/backups after exhaustion. No aggressive modal loop.
- **Billing:** Pro downloads bypass Free quota consumption. Account-anchored 30-day cycles continue during Pro; expiry uses the remaining allowance in the current cycle without an extra reset. Unused allowance does not accumulate.
- **Edges:** concurrent last-slot requests, double-click, client timeout after successful render, failed PDF, retry after expiry, changed document with reused key, account deletion, allowance-period boundary.
- **Acceptance:** automated concurrency test cannot exceed approved Free allowance; failed requests release it; duplicate/retried delivery consumes once; Pro exports are unlimited in product accounting. Browser print/JSON backups are not falsely counted.
- **Dependencies:** P0-06, P0-07 and D3 export semantics; D1 is resolved.

### P0-09 — Stripe one-time Checkout, webhook reconciliation and purchase history

- **Change / why:** Charge the correct default one-time price and grant access safely. This checkout must never opt a user into the separate recurring flow.
- **Files:** new `server/billing/stripe.ts`, `server/billing/fulfillment.ts`, `api/billing.ts`, `api/stripe-webhook.ts`, `src/features/billing/CheckoutReturn.tsx`, `src/features/billing/PurchaseHistory.tsx`; email/receipt brand configuration; webhook integration tests.
- **DB/API:** transactional event deduplication and grants; unique purchase/session/payment identities; server-selected product/price/quantity/owner; event reconciliation job/command only for recovery, never renewal.
- **Frontend:** hosted Checkout, cancellation returns to intact work, success/pending/error state, receipt and expiry history. Active-pass purchase UI follows D2 exactly.
- **Billing:** one non-recurring Price, `mode: payment`, no automatic renewal or save-card-for-off-session renewal; validate paid events and supported payment methods. Refund/dispute handling follows approved D4 policy and preserves user content.
- **Edges:** duplicate/out-of-order events, delayed success/failure, wrong price/currency/account/test mode, payment succeeded but browser closed, database outage before durable event processing, return URL spoofing, duplicate purchase attempts.
- **Acceptance:** Stripe test-mode integration proves first purchase, allowed repurchase, expired repurchase, cancellation, webhook replay, delayed payment, failed payment and reversal; webhook never grants twice. Billing history remains readable after expiry. No checkout in production until the complete paid toolkit passes P0-15.
- **Dependencies:** P0-07 and D4; D2 is resolved. P0-08 supplies integrated download behavior.

### P0-09B — explicit optional recurring payments for the same Pro tier

- **Change / why:** Implement the owner's latest request without turning the default pass into a subscription trap. This is a payment preference for Pro, not a third tier or a new price.
- **Files:** extend `server/billing/stripe.ts`, `fulfillment.ts`, `policy.ts`, billing/webhook handlers; new `src/features/billing/RenewalSettings.tsx`, provider reconciliation helper and recurring test-clock tests. Add billing-preferences/consent migration.
- **DB/API:** one active renewable agreement/account; explicit consent text/version/time, provider IDs and confirmed next charge. Authenticated enable/disable endpoints with idempotency and account ownership. Use provider-managed subscription/schedule at a 30-day interval, not custom scheduled card charges. A pending setup flag cannot grant access or authorize spending.
- **Frontend:** auto-renew off by default. Account billing offers “Enable automatic renewal: $19.99 every 30 days” with charge date and explicit confirmation. Immediate versus deferred first charge is visible before consent. Provide simple “Turn off automatic renewal,” confirmation, and resulting paid-through date; one-time buyers never see misleading “cancel subscription” language.
- **Billing:** preserve all prepaid time; start automatic charges only at paid-through (or charge now only for an explicitly selected immediate recurring purchase when expired). No proration invoice for time already paid. Verify the supported Stripe anchor/schedule flow in test mode before release; future starts and schedules are supported in [Stripe's schedule documentation](https://docs.stripe.com/billing/subscriptions/subscription-schedules). Do not brand internally deferred prepaid time as a free trial.
- **Manual purchase coexistence:** an early manual pass adds 30 days to paid-through and moves the next automatic charge accordingly. Use a durable account billing operation that reconciles provider changes, not a best-effort UI flag. Before opening a manual checkout, synchronize/pause the upcoming renewal charge with provider confirmation; while pending, don't create a second paid checkout. On abandoned/expired checkout restore only the still-consented schedule. If a renewal invoice is already processing, let that resolve before offering another checkout. The screen explains the temporary pending state rather than charging twice. Webhook ordering cannot create overlapping charged intervals; any unavoidable race is detected for correction/refund and surfaced to support.
- **Failure/cancel rules:** failed renewal grants no new access beyond paid-through; show a payment-failed/retry notice. Repeated payment collection must follow disclosed provider retry policy. Disabling renewal stops future unprocessed charges and does not delete/cut short paid access. If a charge was already processing, show its real state and support/refund path rather than falsely guaranteeing cancellation reversed it. Re-enabling requires new explicit consent.
- **Acceptance:** test default pass never creates recurring billing; consented renewal runs every 30 days (not month); enable mid-pass charges no extra immediately; queued manual pass shifts renewal; exact-boundary races, duplicate invoices, delayed events, failed collection, cancel/re-enable and account deletion do not produce overlapping charges or lost paid time. Receipt/history clearly distinguishes manual purchase from automatic renewal.
- **Dependencies:** P0-07/09 and approved D4 payment/refund details. Required for the final requested feature set; keep opt-in feature disabled until verified, rather than falsely advertising it. Independent application/AI tickets may proceed meanwhile.

### P0-10 — application workspace and master-preserving versions

- **Change / why:** Establish Master Resume → Application → Tailored Resume + Cover Letter as the product's premium workspace.
- **Files:** new `server/applications.ts`, `api/applications.ts`, `src/features/applications/ApplicationList.tsx`, `ApplicationWorkspace.tsx`, `JobDescriptionForm.tsx`; reuse editor/preview through the smallest needed extraction from `src/main.tsx`.
- **DB:** applications link to immutable master revision and derived resume/letter documents; do not embed every application in one oversized master blob. Unknown company/title stays blank.
- **API:** owner checks plus Pro for creating job-specific versions. Read/manual edits/export-data of already-created content remain available after expiry. Explicit master replacement requires expected revision and checkpoint.
- **Frontend:** paste JD (no URL scraping), title/company optional, application switcher, original/derived labels, preserved JD through upgrade. No unsolicited ATS “score” at paste time.
- **Billing:** contextual upgrade for premium creation/actions, no lock on viewing prior work.
- **Edges:** master changes while application is being generated, deleted master, duplicate application names, stale tabs, expiry mid-work, empty/oversized JD, wrong-account route.
- **Acceptance:** creating/editing/tailoring an application never changes master automatically; multiple applications remain independent; explicit master replacement is reversible; expiry preserves all content and only gates premium actions.
- **Dependencies:** P0-05, P0-07. Can use fixtures before real AI.

### P0-11 — Pro AI pipeline, transparent ATS checks, tailoring and cover letters

- **Change / why:** Deliver the paid application toolkit using the existing resume data rather than invented facts. Split into three reviewable slices: (a) contracts/mock analysis + deterministic checks, (b) tailoring/diff/acceptance, (c) cover letters + one provider adapter.
- **Files:** new `server/ai/provider.ts`, `prompts.ts`, `schemas.ts`, `usage.ts`, `operations.ts`, `server/analysis/keywords.ts`, `server/analysis/ats.ts`, `api/ai.ts`, `shared/suggestions.ts`, `src/features/applications/AnalysisPanel.tsx`, `SuggestionReview.tsx`, `CoverLetterEditor.tsx`; fixture and integration tests.
- **DB/API:** AI runs bound to account, application, base revision and operation; validated structured output; idempotency; active entitlement before spend; rate limits and usage reservation across instances. Store accepted revisions separately from original and pending suggestions.
- **Frontend:** useful detected keywords, evidence already present, gaps/questions, specific formatting/parseability warnings; side-by-side edits, accept/reject/undo, editable letter. Never claim a missing skill is possessed. Warn on unsupported language analysis and preserve original text rather than translate silently.
- **Billing:** all named paid AI actions included in the pass. No separate credits/top-ups/new tier. No Free AI existed to preserve. Basic Free assistance can be a later explicit decision.
- **Grounding:** each proposed edit cites source field IDs/text; distinguish rewriting supported experience from asking about missing experience. No invented numeric achievements, certifications, employers, dates or skills. JD text is untrusted data, never an instruction to override rules. No provider tool use, web browsing or automatic applications. Reject unexpected action/status/HTML fields; do not render output as executable HTML.
- **ATS:** implement measurable text-readability, section/contact/format checks and explainable keyword presence first. An absent keyword is an opportunity to confirm relevant experience, not an instruction to stuff the resume. Do not erase international/custom headings just to satisfy an English heuristic. Unsupported checks report “not evaluated.”
- **Cost safeguards (initial operational settings, validate before launch):** at most 2 simultaneous generations/account, 10 generation starts/10 minutes/account; bounded JD (20,000 characters) and explicit resume-context budget; max output tokens/provider timeout; per-account and global daily spend circuit breakers; at most one bounded transient retry. These are tunable abuse controls, not advertised unlimited AI or extra paid tiers. Evaluate realistic repeated applications so normal Pro use does not hit limits. When input exceeds context budget, ask the user to select relevant sections; never silently omit their experience.
- **Caching:** only reuse results for the same owner/application/base revision/prompt/model/operation and input hash; no cross-user resume cache. Rate-limit idempotent retries without generating again. Log token/cost/status totals, never resume/JD/prompt/letter content.
- **Edges:** model fabrication, prompt injection in JD, stale revision acceptance, expired pass during generation, malformed output, service outage, double-click, input too long, missing job title, mobile refresh. Preserve edits and provide a retry/manual-edit path.
- **Acceptance:** mock-first automated suite rejects unsupported claims and malformed output; master hash unchanged until explicit replace; accept/reject/undo works; letter agrees with accepted facts; same request billed/generated once; a repeat-application corpus demonstrates quality, latency and operating cost. Record provider retention/configuration before sending real user content. Every advertised Pro AI capability is functional before charging.
- **Dependencies:** P0-10, P0-07, selected D4 AI provider/retention for live calls. No live credentials needed for earlier slices.

### P0-12 — two-option pricing and consistent contextual upgrades

- **Change / why:** Replace beta-only copy with the finalized model once connected features actually work.
- **Files:** `src/main.tsx` pricing/hero/footer/editor copy, new `src/features/billing/Pricing.tsx`, `UpgradePanel.tsx`, shared capability hooks; `index.html`, README and transactional email templates as needed.
- **DB/API:** read capability/allowance/expiry from server; no frontend entitlement writes.
- **Frontend:** exactly Free ($0, 3 downloads every 30 days, account required) and Pro ($19.99/30 days with confirmed currency/tax wording). Default pass: “One payment. 30 days. No automatic renewal unless you choose it.” Opt-in settings explicitly say “$19.99 every 30 days until you turn renewal off.” Avoid a global “No subscriptions” claim now that optional recurring exists. No `/month`, fake savings or trial conversion. Preserve quality Free templates and contextual upgrades.
- **Billing:** CTA creates the tested one-time Checkout, not a placeholder button. Clearly show actual amount/term and purchase status. Do not use competitor price claims without separate current evidence.
- **Edges:** allowance exhausted, network error getting entitlement, expired Pro, pending purchase, login interruption, narrow screens. Unknown entitlement never becomes a UI claim of paid access or forces another charge.
- **Acceptance:** copy and capabilities match Free/Pro/expired/pending/renewing/canceled-renewal states; replace “No sign-up” with “Free account. No card required.” Landing “Build my resume” opens signup/sign-in before the account workspace. Local/cloud/AI privacy messaging reflects actual mode. Core user content stays readable/editable while signed in.
- **Dependencies:** P0-08–11 including 09B, remaining D3/D4 decisions. Draft components may be feature-flagged earlier.

### P0-13 — privacy, account controls, support and content-safe telemetry

- **Change / why:** The app is moving from local-only to storing/transmitting personal resumes. Old local-only assurances must change before those integrations go live.
- **Files:** new `src/pages/Privacy.tsx`, `Terms.tsx`, `src/features/account/AccountData.tsx`, `api/account.ts`, `server/account.ts`, `server/telemetry.ts`, legal/static routing and footer links; `src/styles.css` font import; `docs/OPERATIONS.md`.
- **DB/API:** account data export and deletion, authenticated/cross-account-safe; delete resume/JD/letter/generated files and provider artifacts where supported; financial retention exceptions and backup expiry must be documented according to the owner's approved policy. No indefinite soft-delete-only promise masquerading as deletion.
- **Frontend:** clear local/cloud/AI disclosure and explicit AI action consent, real support contact, terms before purchase, readable deletion/export flow on mobile. Do not invent business address, refund policy, or claim trademark clearance.
- **Billing:** retain receipt access as required by approved policy; refunds/support route tested. One-time passes need no cancellation; opted-in recurring users have clear turn-off controls. Account deletion must cancel any future recurring agreement before deleting the records needed to identify it; retry/reconcile failures without falsely claiming completion.
- **Security/operations:** CSP/security headers, secret scan, no request-body or session-replay capture, server error redaction, dependencies/lockfiles reviewed. Self-host permitted font assets or accurately disclose the external font request; preserve current typography. AI resume content not used for analytics or training unless the user separately authorizes and policy supports it.
- **Events:** minimal `resume_created`, `export_ready/failed`, `checkout_started`, `purchase_confirmed`, `analysis_completed`, `suggestions_accepted` with pseudonymous IDs/status/duration/cost only. No names/emails/JD text, prompts or field keystrokes. Client events never grant quota/entitlement. Product analytics may remain off at launch; operational error and spend visibility must work.
- **Edges:** deletion while exports/AI run, shared browser logout, error reporter captures request data, signed artifact link after deletion, backups retained temporarily. Recheck ownership/deletion before committing delayed results.
- **Acceptance:** test data absent from logs/traces; account isolation/deletion verified; factual policies reviewed by owner; support mailbox sends/receives; no public private artifact URLs; generated artifacts expire as documented.
- **Dependencies:** P0-04 onward; factual legal copy can be drafted while integrations are built. D4 governs published commitments.

### P0-14 — expand verification to the real launch risks

- **Change / why:** Current 14 tests establish the local baseline, not paid readiness. Extend them rather than discard them.
- **Files:** `tests/builder.spec.ts`, new `tests/auth.spec.ts`, `applications.spec.ts`, `billing.spec.ts`, `exports.spec.ts`, `tests/server/*`, `tests/ai/*`, `playwright.config.ts`, unit-test config, compiler configs, `.github/workflows/ci.yml`.
- **DB/API:** isolated test database and migrations; owner/RLS escalation tests; payment event fixtures and test-mode integration; concurrent quota/grant tests; clock-controlled expiry tests.
- **Frontend:** mobile 320/390 widths without hidden/clipped controls; Chrome/Firefox/WebKit core flow; keyboard focus/error summaries; actual VoiceOver/NVDA spot-check; font/RTL/PDF visual and extracted-text checks. Touch-device export/login return needs physical-device validation.
- **Billing:** first/early-repurchase/expired-repurchase/expiry/refund scenarios; test no charge after a default one-time pass. Explicitly consented recurring must charge only on its confirmed 30-day schedule, respect queued passes and stop after cancellation. Saved content and previous deliveries survive expiry.
- **Edges:** providers unavailable, service worker/cache if later added, invalid/old/large backups, slow network, offline editor, request replay, wrong account, session expiry mid-operation.
- **Acceptance:** CI runs typecheck for source/shared/server/tests, unit/API/E2E, production build and secret-boundary checks; report exact pass/fail plus manual gaps. Live AI tests are opt-in, consented fixtures only and budget-bounded. Do not claim browser tests cover all accessibility or every ATS.
- **Dependencies:** add tests with each ticket; final matrix completes after P0-12/13.

### P0-15 — deployment and launch gate

- **Change / why:** Separate a safe existing free beta from the full paid launch; do not sell promised features that are still absent.
- **Files/config:** `vercel.json` if needed, environment setup, `docs/OPERATIONS.md`, CI/deployment runbook, README/HANDOFF; DNS and email-provider configuration outside repo.
- **DB/API:** test migrations/rollback/backup restore, production RLS, session/callback origin allowlists, rate limits, private storage, secrets, webhook routing, health checks, spending alerts. No preview environment can spend production credentials accidentally.
- **Frontend:** production canonical resumestride.com/redirect behavior, auth recovery, fresh browser smoke test, security/no-index rules and missing-route handling.
- **Billing:** test mode first; owner verifies commercial policy/account/tax settings; paid feature flag stays off until P0 acceptance is evidenced. Verify one-time live flow only with explicit authorization and agreed transaction/refund handling.
- **Edges:** deployment fails after schema migration, webhook arrives during rollback, provider quota exhausted, domain/email mismatch, older cached client version.
- **Acceptance:** signed-off checklist of D1–D4, P0 tests, functional advertised Pro toolkit, real support, recovery rehearsal and cost budget; post-deploy smoke test proves create → free export → purchase → application → tailor/letter → export → expiry behavior. Use test clocks for expiry, not actual renewal charges.
- **Dependencies:** all P0. Deploy only when separately authorized. Brand/trademark clearance remains a separate owner activity before significant marketing spend, not a code-rewrite blocker.

## 5. P1 — important launch improvements

These improve usability and conversion but must not displace missing advertised Pro functionality from P0.

### P1-01 — useful Free job-fit preview without free AI abuse

- **Change/why:** Allow a pasted JD to show a small deterministic keyword-presence preview and explain Pro's application toolkit, so upgrade is tied to a real job rather than frustration.
- **Files:** `JobDescriptionForm`, `AnalysisPanel`, shared keyword matcher, pricing copy.
- **DB/API:** no AI spend for the signed-in Free preview; keep pasted text in memory/local draft with accurate disclosure; account-scoped cloud save after consent.
- **Billing/UI:** full analysis/tailoring/letter/version creation stays Pro; no fake locked analysis output. No hiring/ATS score.
- **Edges/acceptance:** empty/unsupported-language JD reports limits honestly; present/missing words have source snippets; no unsupported skill added; login/upgrade does not lose JD.
- **Dependencies:** P0-10–12. Owner can omit this without changing the two-tier contract.

### P1-02 — application organization and recovery polish

- **Change/why:** Add search/sort/rename, visible source revision, manual checkpoints and restore affordances to make repeat applications practical. Do not add a full recruiting CRM.
- **Files:** application list/workspace, dashboard, server application/revision services.
- **DB/API:** indexed owner/title/timestamps; paginate; restore creates a new revision rather than erasing history.
- **Billing/UI:** Pro creates new application versions; expired users still find/read/edit existing documents. No paid storage deletion.
- **Edges/acceptance:** similarly named jobs, deleted source resume, failed restore and large lists stay safe; no cross-owner search results; two applications never overwrite each other.
- **Dependencies:** P0-05/10; base multiple-application storage is already P0.

### P1-03 — PDF/browser and accessibility hardening from launch feedback

- **Change/why:** Improve real page-break preview fidelity, print legibility, long-document navigation and assistive-technology workflows while preserving design.
- **Files:** `ResumePreview`, print CSS, editor components, PDF/browser fixtures.
- **DB/API/billing:** none unless a renderer bug requires a targeted change; Free and Pro receive the same formatting quality.
- **Edges/acceptance:** Hebrew and Arabic reading order, screen reader focus after section removal, extreme URLs and 10+ pages; report visual versus text-layer limitations separately. Content never silently disappears to fit one page.
- **Dependencies:** P0-06/14 and real-user feedback.

### P1-04 — cost and reliability tuning using actual usage

- **Change/why:** Tune AI quotas/token budgets/cache hits and renderer concurrency against ordinary repeat-application sessions. Do not raise price/add credit packs without a new product decision.
- **Files:** AI usage/operations, export renderer/quota, operational dashboard/runbook.
- **DB/API:** aggregate anonymized usage; bounded retry queues only if measurements justify them; provider/model version changes require fixture reevaluation.
- **Billing/UI:** useful retry timing/service status; refund/support escalation for extended service failures per policy. No secret arbitrary blocks framed as unlimited service.
- **Edges/acceptance:** burst traffic/abuse cannot exceed configured budget; a representative normal Pro job hunt remains usable; resume/JD text stays out of analytics.
- **Dependencies:** P0-11/13/15.

## 6. P2 — post-launch enhancements, not implied requirements

### P2-01 — DOCX export and existing PDF/DOCX import

- **Change/why:** Optional convenience already mentioned in old notes; not required to deliver the new Free/Pro contract. Do not advertise until implemented.
- **Files:** new export/import adapters and review UI, reused schema/preview, validation tests.
- **DB/API:** bounded authenticated parsing, safe file detection/decompression, scanned-PDF fallback, user review before overwrite; no public upload bucket.
- **Billing:** decide how any new export format fits the existing 3-download policy before enabling it. Do not invent a new tier.
- **Edges/acceptance:** malicious/corrupt files and scanned text produce clear errors; imported facts reviewed; original document/master preserved; real DOCX rendering verified.
- **Dependencies:** P0 stability; explicit enhancement authorization.

### P2-02 — interface localization and optional additional templates

- **Change/why:** Extend worldwide usability from demand while retaining current Unicode/RTL/custom-heading support.
- **Files:** translation resources, existing components/styles, template renderer and fixtures.
- **DB/API:** store language preference; migrations preserve old documents. No hardcoded English interpretation of arbitrary user sections.
- **Billing:** do not degrade standard Free templates or add artificial template tiers.
- **Edges/acceptance:** RTL navigation and long translations, fonts and PDF text verified; each new template passes existing output checks.
- **Dependencies:** existing flows stable; real user need confirmed.

### P2-03 — optional basic Free AI assistance

- **Change/why:** The brief only requires preserving basic Free AI if it already exists; none exists now. Consider a small fact-grounded profile/bullet suggestion later if economics support it.
- **Files:** existing AI contracts/usage service and editor suggestion UI.
- **DB/API:** explicit free allowance and abuse controls need an owner decision; no unrestricted anonymous endpoint.
- **Billing/UI:** keep two tiers, no surprise charges; advanced application toolkit stays Pro.
- **Edges/acceptance:** grounded suggestions, cost-bounded free use, clear limits, no fabricated experience or automatic changes.
- **Dependencies:** P0 cost evidence and separate owner decision. This is not permission to expand launch scope.

## 7. How Claude should execute this plan

1. Work in `/Users/dipson/ResumeBuild'r`, not the Pet Food Passport checkout. Read AGENTS.md, this plan, HANDOFF.md and actual source; newer owner answers supersede unresolved choices here.
2. Check `git status` before each ticket. Preserve current work and the local beta. Do not reset, rewrite, commit unrelated changes, provision accounts, or deploy as a side effect of implementation.
3. Start with P0-01/02/03. D1/D2 are resolved in this plan: accounts, 3 downloads per 30 days, queued early Pro purchases and explicit optional recurring. Confirm only remaining D3/D4 decisions before dependent production behavior; never treat no response as approval.
4. Build mock/test services before using real payment/AI credentials. Add exact-path files listed per ticket, but consolidate trivial helpers if it improves clarity without changing behavior. Do not spread one business rule across frontend and backend.
5. For each ticket report: requirement completed, files changed, DB migrations/API changes, tests actually run, known limitations and any unresolved owner decision. Update HANDOFF.md with current truth and link this plan. Mark existing complete features as preserved, not newly implemented.
6. Do not hand off “ready to launch” based solely on build success. Require the paid capability/expiry/refund/ownership/export/AI test matrix, actual support configuration, and owner-reviewed policies.

Suggested first Claude prompt:

> Read AGENTS.md and docs/CLAUDE_IMPLEMENTATION_TODO.md in `/Users/dipson/ResumeBuild'r`. Preserve the existing ResumeStride app and design. Final rules: signup/sign-in for Free and Pro; 3 Free downloads reset every 30 days; Pro is $19.99/30 days; early purchases start after current paid-through; automatic renewal is off unless explicitly enabled by the user. Start with P0-01 documentation alignment and P0-02 targeted recovery/mobile fixes. Do not implement payments/AI or deploy in this first increment. Add focused regressions, run typecheck/build and relevant tests, update HANDOFF.md, and report changed files and remaining limitations before proceeding.

## Planned after core launch: Pro browser extension
See [EXTENSION_PLAN.md](EXTENSION_PLAN.md). Owner requested planning on 2026-09-18; no extension implementation authorized for tonight. Resume tomorrow. Prioritize core security/billing/AI gates first.
