# APWICO redesign blueprint status

Status date: 2026-10-07. This ledger reconciles repository evidence with the live APWICO production validation performed after release and the task-by-task validation review in `VALIDATION_PENDING_RECONCILIATION_2026-10-05.md`.

## Status model

- **COMPLETE** — implementation and all currently automatable verification are complete.
- **VALIDATION PENDING** — implementation is complete; final human, physical-device, production-field or post-release validation remains.
- **PARTIAL** — implementation itself remains incomplete.
- **NOT STARTED** — no blueprint-specific implementation has begun.
- **BLOCKED** — progress genuinely requires an owner decision, permission, credential, external dependency or unresolved technical blocker.

## All-65 ledger

Every task is included exactly once:

- **COMPLETE (55):** 1–36, 38–44, 46–50, 54–57, 62, 64, 65.
- **VALIDATION PENDING (6):** 37, 45, 51–53, 63.
- **PARTIAL (4):** 58–61.
- **NOT STARTED (0):** none.
- **BLOCKED (0):** none.

Tasks 5, 46, 56 and 64 closed after the first live analytics/search/provider review, repeated production release validation, and verification of the current U.S.-only Stripe boundary. Tasks 58–61 are now Partial: operating structures and materials exist, but real advisors, agreements, institutional pilots, samples and research results do not. Task 37 is Validation Pending / External Review: APWICO Job Capture 0.2.3 was submitted to Google on 2026-10-06 with automatic publication selected after approval. The public 0.2.2 listing remains available, but the 0.2.3 narrow-side-panel correction is not complete until Google approves it and the public version is verified.

The first 2026-10-05 reconciliation changed no counts and reconfirmed Tasks 1 and 4 as Complete. The subsequent consolidated real-world session closed Task 19 and found three genuine Task 20–22 issues: a consumed recovery code retained in the URL, a legacy recovery-email sender name, and an overlapping mobile document-identity panel. All three are now resolved in production. A fresh recovery link returned in a new tab with no consumed `code` in the address bar and the provider sender name was changed and reloaded as APWICO. On a physical iPhone, the owner correctly identified the active master and browser-session storage, understood from the isolated sample that job tailoring leaves the master unchanged, and passed a real VoiceOver traversal of the active-document panel and primary editing controls.

## Group summary

| Group | Status | Current truth |
| --- | --- | --- |
| 1. Product strategy and measurement | COMPLETE | The first production review observed content-free funnel traffic and an honest zero durable numerator/denominator after applying the missing additive production measurement migration. No rate was invented. |
| 2. Homepage and navigation UI | COMPLETE | Tasks 6–14 meet current automatable Done When conditions: evidence-led homepage, permanent navigation, curated showcase, complete truthful template discovery and indexable detail/pricing routes. |
| 3. Onboarding and workspace | COMPLETE | Tasks 15–22 are complete after production recovery/provider verification, uncoached physical-phone document/storage comprehension and a real VoiceOver pass closed the three earlier findings. |
| 4. Trust, pricing and monetization | COMPLETE | Tasks 23–30 meet current automatable conditions with verified pricing/cancellation/export terms, factual trust, unpublished-by-default proof architecture and permanent commercial routes. |
| 5. Jobs, Match and application workflow | Validation pending | Tasks 31–36 are complete in production after the application-workflow schema correction. Task 37's APWICO 0.2.3 patch and refreshed listing are submitted; Google review and verification of the published patch remain external validation. |
| 6. Technical SEO, accessibility and performance | Validation pending | Tasks 38–44 and recurring gate Task 46 are complete. Task 45 retains physical low-power/device and metric-level field validation; available Vercel desktop/mobile real-experience scores are recorded without inventing unavailable CWV values. |
| 7. Content and search acquisition | Validation pending | Tasks 47–50 and 54–56 are complete. Task 56's first live review correctly recorded Search Console processing/no-data. Tasks 51–53 still require internal-demand maturity and qualified occupation/region review. |
| 8. Growth, research and global expansion | Mixed | Tasks 57, 62, 64 and 65 are complete for the current U.S.-only release; Task 63 remains validation pending while cloud saving is disabled. Tasks 58–61 have complete operating foundations but remain Partial until real-world participation/outcomes occur. |

## Current G2/G3/G6 task truth

| Task | Status | Verified boundary |
| --- | --- | --- |
| 12. Permanent primary navigation | COMPLETE | Homepage, tools, resources, templates and pricing use intentional destinations; mobile menu Escape/focus and native new-tab behavior are covered. |
| 13. Curated template showcase | COMPLETE | Six explicitly non-ranked examples span verified structural families and link to permanent details. |
| 14. Template gallery and detail architecture | COMPLETE | All 27 registry-backed templates have indexable URLs, useful filters, verified tier/family/density/facts, A4/Letter and RTL/LTR boundaries, and preview-before-purchase transitions. |
| 15. Journey-specific onboarding | COMPLETE | Import-, build- and direct pasted-job paths preserve context and converge on the shared workspace; requirements reuse the public matcher parser and remain local/content-free in URLs and analytics. |
| 16. No-signup evidence moment | COMPLETE | Public requirement-level review remains behavior-qualified and content-free. |
| 17. Guided fictional sample | COMPLETE | Fictional/real state isolation, master safety, grounded suggestions and reset are automated and independently reviewed. |
| 18. Permanent workspace URLs | COMPLETE | Owner-scoped saved objects restore safely; invalid/missing/unauthorized objects fail closed. |
| 19. Browser navigation | COMPLETE | Live desktop and owner-performed physical mobile Back/Forward passed across the public matcher and master/jobs workspace transitions; reload restoration, checkout-cancel return and object routes retain automated coverage. |
| 20. Sign-in/recovery context | COMPLETE | A fresh real recovery email displayed APWICO, opened the production new-password flow in a new tab, and removed the consumed `code` from the visible URL. The provider SMTP sender name was updated to APWICO and verified after reload; existing continuation, owner-switch and sensitive-URL automation remains green. |
| 21. Document/storage concepts | COMPLETE | After the production responsive correction, the owner identified the master document and browser-session storage without coaching on a physical iPhone, then correctly understood through the isolated fictional sample that a tailored job-specific version leaves the master unchanged. |
| 22. Responsive/accessibility workflow | COMPLETE | Existing keyboard, focus, error/status, zoom, reduced-motion, viewport and axe evidence is supplemented by a physical iPhone layout pass and a real VoiceOver traversal that announced the active master, browser-session storage and primary editing controls in usable order without a trap. |
| 23–30. Trust, pricing and conversion | COMPLETE | All three purchase paths, individual-template terms, paid-through cancellation behavior, concrete export policy, adjacent recurring terms, factual trust, consent-gated proof architecture and permanent commercial pages are implemented and automatically checked. |
| 31. Public matcher positioning | COMPLETE | Permanent browser-local matcher centers evidence without ATS scores, hiring predictions or signup. |
| 32. Requirement-level Match | COMPLETE | Grouped source wording/evidence/status and stale-analysis handling pass server/database and private-route browser checks. |
| 33. Free evidence continuation | COMPLETE | The explicitly reviewed job text—not resume text—is kept in bounded session storage and re-enters the shared review path before account save. |
| 34–36. Decision and application workflow | COMPLETE | Owner-scoped decisions, manual application history, notes/contact and opt-in workspace follow-up dates pass database/unit and private-route browser coverage. |
| 37. Public extension experience | VALIDATION PENDING | APWICO-branded MV3 version 0.2.3 corrects the real Chrome narrow-side-panel defect and passes 43/43 installed-extension checks across 160–360px widths. The exact hashed ZIP and verified Wine + Blush icon, screenshot and promo tile were submitted on 2026-10-06 with automatic publication selected. Completion requires Google approval and verification that the public listing serves 0.2.3; the currently published 0.2.2 does not prove the patch is live. |
| 38–44. Public technical foundations | COMPLETE | Permanent capability/template URLs, narrow visible-content schema, explicit sitemap dates, per-route social cards, local fonts and cache/bundle contracts pass generation, source and route-policy checks. |
| 45. Performance | VALIDATION PENDING | Lab budgets and low-power/data-saver/reduced-motion behavior pass. Vercel reports a 100 real-experience score for the available desktop and mobile samples, but metric-level LCP/INP/CLS and physical low-power validation remain unavailable. |
| 46. Recurring quality | COMPLETE | The integrated quality gate has run repeatedly before and after release, including production smoke/error/provider checks; it remains the recurring release contract. |
| 47–50. Evidence-first content and product intent | COMPLETE | Twelve substantive guides, seven problem-led clusters, working high-intent tools and practical template resources lead into the evidence workflow without thin pages. |
| 51–53. Occupation and regional evidence | VALIDATION PENDING | Nine evidence-shape-diverse occupation pages and a bounded five-source regional matrix are implemented and automatically checked. Production/internal demand ranking and qualified local occupation/region review remain unavailable and are not fabricated. |
| 54. Internal linking | COMPLETE | Cluster membership, related-guide edges, contextual CTAs and research-hub links are source-driven and automatically checked for orphans. |
| 55. Factual comparisons | COMPLETE | Five named comparisons use dated official sources, visible locale/currency or explicit unknowns, balanced strengths/boundaries, symmetric APWICO facts and build/quality-gate expiry enforcement. |
| 56. Search review process | COMPLETE | The repeatable process and first live review are complete. Search Console reports processing/no data, which is recorded as the valid result; future reviews continue on cadence rather than holding implementation open. |
| 57. Match methodology | COMPLETE | Permanent public methodology matches deterministic Match behavior, clarification semantics, limitations, AI boundaries and user decision authority. |
| 58. Advisory group | PARTIAL | Charter, representative recruitment matrix, screener boundaries, review cadence/rubric and outreach draft exist. Real recruitment, compensation, consent and participation require owner action and real people. |
| 59. Partnerships | PARTIAL | Evidence-backed target types/examples, qualification, outreach, tracking and privacy-safe pilot structure exist. No outreach, agreement or partnership is claimed. |
| 60. Organizational distribution | PARTIAL | Bounded institutional pilot, participant privacy, aggregate suppression, readiness packet and success rubric exist. No institution, contract or pilot participant is claimed. |
| 61. Original research | PARTIAL | Preregistration, privacy-safe data requirements, minimum samples, missingness and publication standards exist. Samples, analysis, external review and findings require post-launch evidence. |
| 62. Voluntary outcomes | COMPLETE | Explicit-consent, owner-scoped, content-free self-reports remain distinct from observed conversions and retain provenance/methodology/sample capability without causal claims. |
| 63. Cloud-saving validation | VALIDATION PENDING | Consent, ownership, revision conflicts, account switching, interrupted saves, limits, local/cloud state, backup and self-service master deletion are implemented; hosted/provider recovery and isolation remain. |
| 64. Paid availability | COMPLETE | Current production availability is truthfully U.S.-only/USD; live Stripe account, Checkout, Prices, webhooks, renewal/cancellation/refund/invoice boundaries and the server country gate were validated. International expansion is a separate gated workstream, not a defect in the current release. |
| 65. Localization readiness | COMPLETE | English-only explicit locale architecture, locale formatting helpers, no IP inference, protected identifiers and existing Unicode/RTL/text-expansion foundations are in place; actual translated journeys remain post-launch. |

Detailed evidence, architecture, commands and review findings are recorded in `TASKS_19_22_REAL_WORLD_VALIDATION_2026-10-05.md`, `VALIDATION_PENDING_RECONCILIATION_2026-10-05.md`, `G8_PRELAUNCH_2026-09-30.md`, `G6_COMPLETION_2026-09-30.md`, `G7_CONTENT_SEARCH_2026-09-30.md`, `G7_EVIDENCE_CLOSURE_2026-09-30.md`, `G6_G7_INTEGRATION_2026-09-30.md`, `SEARCH_PERFORMANCE_REVIEW.md` and the earlier batch records.

## Group 9 — APWICO rebrand and migration (outside the original 65 tasks)

| Scope | Status | Current truth |
| --- | --- | --- |
| Repository/product brand migration | COMPLETE | APWICO product identity, public origin/support address, SEO assets, legal/product copy and compatibility guards are implemented and automatically checked on the isolated redesign branch. |
| Production/provider migration | COMPLETE | APWICO DNS/hosting, Auth callbacks, transactional email, Stripe, analytics, Search Console and production smoke validation are complete. ResumeStride remains live and redirects remain intentionally disabled; extension publication is separately tracked by Task 37. |

The original 65-task universe remains exhaustive; its statuses above are the current
reconciliation. Group 9 inventory, state protections, cutover order, rollback and owner
checklist are in `G9_APWICO_BRAND_MIGRATION_2026-09-30.md`.
