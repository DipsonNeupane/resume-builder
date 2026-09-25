> Historical planning document. Current implementation, supported-site matrix and privacy boundaries are in [the extension README](../apps/extension/README.md) and [acceptance checklist](EXTENSION_ACCEPTANCE.md). Do not use older fixture-only or tailoring statements as current release claims.

# ResumeStride Pro browser extension — proposed plan

Saved 2026-09-18. Owner requests planning only for a paid extension to tailor resumes while viewing jobs across websites. Preserve worldwide/all-occupation scope. Build after core account/billing/AI security gates; do not delay the working web beta or promise extension availability now.

## Product and differentiation

Chrome desktop first (Manifest V3), then validate Edge packaging; Firefox/Safari/mobile require separate investigation. Install can be free, but tailoring requires active ResumeStride Pro checked by the backend. Share the existing $19.99 30-day pass and optional-renewal semantics; no second subscription proposed. Expiry disables new paid generation, never deletes resumes or purchased-time history. AI usage must fit the shared $25/month initial global budget with fair-use limits shown before purchase; do not promise unlimited AI.

Similar products exist: Teal offers an extension to capture jobs and a resume-tailoring workflow; Jobscan describes one-click comparison against the job currently viewed. Do not market this as the first. Differentiate through clear one-time pricing, honest grounded edits, minimal permissions, an easy review workflow, multilingual content and support for any occupation. Validate willingness to pay with real testers rather than assume uniqueness.

## MVP workflow

1. User opens a job listing and clicks ResumeStride.
2. On supported/permitted sites, capture visible job title, employer, location and description only. Show editable captured text and source before transmission. Generic selected-text/manual-paste fallback when extraction is unsupported or ambiguous.
3. User connects their ResumeStride account through a reviewed extension auth flow, selects a base resume, and explicitly chooses Tailor.
4. Backend verifies identity, ownership, active Pro, remaining usage and spending reservation. Never trust a client paid flag.
5. Show suggested bullet/profile changes, supported keywords and questions for missing evidence. Do not invent qualifications, dates, metrics, employers, licenses or languages.
6. User accepts/rejects each change; save a separate job-specific version with provenance, preserving the base resume. Open the existing web editor for full layout preview and generated PDF export.

V1 excludes auto-apply, application form submission, recruiter messaging, background crawling and bulk job harvesting. No automatic page reading merely because a tab is open.

## LinkedIn and website compatibility

LinkedIn explicitly prohibits extensions that scrape, modify or automate its website. A manual click/activeTab permission alone does not establish permission under its rules. Do not claim direct LinkedIn integration or ship a LinkedIn DOM extractor without a permitted approach/permission review. Initial LinkedIn workflow: user manually copies the job details and pastes them into the extension side panel, with no injected scripts or site automation. Users can still tailor for jobs found there. Use approved APIs/partnerships if available later; never bypass site restrictions.

For other job boards/company career pages, maintain a support matrix: permitted extraction method, tested page types/locales, last verification date, fallback behavior. Test representative boards and career pages before listing support. Preserve original job language; ask before translating resume content.

## Architecture and privacy

- Separate apps/extension package sharing resume schemas and typed API contracts, not web-page session tokens or duplicate billing logic.
- Manifest V3 service worker plus isolated extension side panel/popup. Minimal permissions: activeTab/scripting only where capture is offered; storage only for necessary settings/session state. Avoid all-sites persistent access, cookies, history, broad tabs permission, clipboardRead and background monitoring. Keep API host permissions narrow.
- Auth: short-lived extension session through explicit account linking, reviewed PKCE/state and exact extension redirect allowlist. No service-role/Stripe/AI keys in extension bundle, page scripts, URLs or logs. Never expose session credentials to content scripts or page DOM; clear sensitive extension state on logout and test cross-account switching.
- Content scripts only collect approved page text and return structured data. Validate sender tab/origin and message schemas; reject arbitrary cross-extension/external messages. Do not give web pages a privileged API proxy.
- Treat every job description as untrusted data, including prompt-injection instructions. AI can propose structured edits only; no tools that follow links or reveal other resumes, system instructions or credentials. Validate response schema and enforce sizes/timeouts.
- Do not send cookies, inboxes, candidate profiles, other tabs or browsing history. Clean URLs of query strings/fragments; collect source URL only if needed and visibly consented. Prefer no persistent local resume cache; no sensitive chrome.storage.sync data.
- Use the same server authorization, per-account rates and global reserved-cost budget as web AI; failures never erase original content or silently consume retries. Idempotency prevents repeated clicks/dropped connections causing duplicate generation/charges.
- Bundle executable code; no remotely downloaded/evaluated scripts. Update extension privacy/data-use disclosures and website policy to match actual collection and processors.

## Ordered work packages and acceptance

E0 — prerequisites: finish hosted two-account isolation, save reliability, bounded storage/history, Pro entitlements, signed/idempotent webhooks, server AI validation and budget enforcement. Account deletion/export must include extension/job-version data.
E1 — UX prototype: paste job details → review → choose resume → show grounded diff → save new version. Use synthetic fixtures, no paid API calls initially. Test expired Pro and budget-unavailable states.
E2 — extension shell/auth: minimal Manifest V3, popup/side-panel, secure linking/logout. Test forged messages, token leakage, revoked sessions, service-worker restarts and account switching.
E3 — capture adapters: user-initiated capture for reviewed supported sites with explicit preview; paste fallback for LinkedIn/unsupported pages. Test SPA navigation, multiple postings, iframes, incomplete descriptions, long content and non-English/RTL pages.
E4 — end-to-end: two users cannot read/edit each other's base or tailored versions; original survives accept/reject/retry/offline; no fabricated claims in evaluation fixtures; paid checks enforced server-side; AI cap cannot be bypassed via concurrent extension + web requests; no page content stored in logs.
E5 — private pilot, then store submission: permission review, dependency/secret checks, privacy page, accurate screenshots, reviewer test account and support contact. Publication date depends on store review; do not promise same-day approval. Rollback/kill-switch disables generation safely without removing user access to existing documents.

Suggested success measures: capture success on explicitly supported pages, time to reviewed resume, user acceptance/rejection of suggestions, per-generation cost, error/recovery rate and zero observed cross-account access in tests. No content-bearing analytics or unsupported ATS/interview promises.

## Owner tasks later (not needed tonight)

Chrome Web Store publisher account, any required registration payment/terms completed by owner, approved public brand/contact/privacy details, and a small group of consented pilot testers. Existing funded AI account and Stripe verification are shared with the web launch. Decide whether a registered business identity is needed for publisher disclosures while honoring the owner's request not to publish their personal name.

## Primary sources reviewed

- Teal workflow: https://help.tealhq.com/en/articles/14435726-how-to-tailor-your-resume-for-a-specific-job
- Jobscan extension capabilities: https://www.jobscan.co/blog/january-2024-updates/
- Chrome activeTab permissions: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- Chrome Web Store policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- LinkedIn prohibited extensions: https://www.linkedin.com/help/linkedin/answer/a1341387

Recheck current APIs, store policies, pricing and supported-site rules when implementation begins.
