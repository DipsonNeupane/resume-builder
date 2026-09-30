# Group 8 pre-launch foundation — 2026-09-30

Scope: isolated `redesign/shared-route-state` only. Production, hosted data, provider configuration, push, merge, release, deployment and the future APWICO migration were untouched.

## Status

| Task | Status | Pre-launch result | Remaining validation or post-launch work |
| --- | --- | --- | --- |
| 57. Match methodology | COMPLETE | Permanent `/features/match-methodology/` content explains extraction, required/preferred/nice-to-have classification, direct/adjacent/unknown/confirmed-incompatible states, clarification effects, limitations, user authority and the deterministic Match versus opt-in AI boundary. Route metadata, canonical, social image, sitemap and source-truth tests include it. | Method wording must be re-reviewed whenever the Match algorithm changes. |
| 58. Advisory group | NOT STARTED — POST-LAUNCH | No advisory participation or validation was invented. | Recruit a diverse, compensated or otherwise clearly scoped group only after real product use can inform the questions. |
| 59. Partnerships | NOT STARTED — POST-LAUNCH | No partnership, endorsement or distribution claim was created. | Establish evidence-led partner criteria and agreements after launch evidence. |
| 60. Organizational distribution | NOT STARTED — POST-LAUNCH | Architecture remains owner-scoped; no employer, school or workforce-program access model was implied. | Define tenant, administrator, consent and aggregate-reporting boundaries before implementation. |
| 61. Original research | NOT STARTED — POST-LAUNCH | No survey, benchmark, sample or outcome result was manufactured. | Publish only after a preregistered method, sufficient sample, limitations and consent/privacy review exist. |
| 62. Outcome collection foundation | COMPLETE | A service-only, owner-scoped `product_outcome_reports` store and voluntary workspace form support prepared, submitted, interview, offer, declined and withdrawn outcomes plus bounded time-saved and 1–5 clarity/confidence feedback. Self-reported provenance, explicit versioned consent, report correction without sample inflation and methodology/sample identifiers are retained. | There are deliberately no statistics yet. Any future public result needs denominator, timeframe, sample size, missingness, self-report caveat and no-causality language. |
| 63. Cloud-saving validation | VALIDATION PENDING | Cloud saving remains default-off and consent-gated. RLS ownership, optimistic revision conflicts, account epochs, interrupted-save backoff, storage limits, explicit local/account labels, JSON backup, guest-draft restoration and self-service deletion of the account master plus retained revisions are implemented and automatically covered. | Apply/inspect migrations only through an approved infrastructure plan; validate two-account hosted isolation, concurrent saves, provider backup retention, real network interruption, restore/delete behavior and physical-device copy. |
| 64. Worldwide paid access | VALIDATION PENDING | Public and in-product policy accurately limits new subscriptions to the United States and USD. Server checkout rejects non-US trusted production country signals. Renewal/cancellation/refund boundaries are explicit; dynamic compatible methods are provider-selected; tax-inclusive pricing and invoices are not promised. | G9/release infrastructure must verify live Stripe account country, catalog, tax/invoice settings, enabled methods, receipts, refund operations and trusted region signal. No worldwide paid claim is permitted. |
| 65. Localization readiness | COMPLETE | Interface locale selection has a versioned explicit preference boundary, English-only allowlist and no IP/account-country or browser-language inference. Resume content independently supports explicit BCP-47-like language codes, editable headings, Unicode, A4/Letter and LTR/RTL. Formatting helpers use the selected interface locale and protected product identifiers are centralized. | Additional language launches are post-launch and require a complete translated journey, terminology review, text-expansion/RTL QA, support/legal content and locale routes before the allowlist expands. |

## Task 57 behavior agreement

The public method is derived from `server/jobs/match.ts` and `src/tools/analysis.ts`, not a marketing interpretation:

- Saved Match deterministically extracts at most 30 bounded requirement statements from job-description wording and heading context. The public browser tool uses its own smaller bounded deterministic extractor.
- Saved requirements are `required`, `preferred` or `nice_to_have`; the public tool uses `required`, `preferred` and other signals. Neither parser claims a complete legal or occupational interpretation.
- `demonstrated` means direct wording support; `partially_demonstrated` is the adjacent/worth-reviewing state; `not_demonstrated` is unknown, not absence.
- `confirmed_incompatible` can arise only from the user's explicit `not_have` clarification on a required item. Optional items are not silently promoted to disqualifiers.
- `demonstrated`, `not_have` and `unsure` clarifications cause saved analysis to be recalculated. “Confirmed by you” remains visibly distinct from resume-derived wording.
- Strong/Good/Stretch are attention summaries, not probabilities, ATS scores, hiring predictions or apply verdicts.
- Current Match classification is deterministic. AI is limited to a separately requested tailoring path, uses owner-bound inputs, must remain grounded and applies nothing without user review.

## Task 62 privacy and measurement contract

Observed and reported evidence remain separate:

- Platform-observed: `product_evidence_reviews` and `application_package_conversions`, using bounded hashes/identifiers, scopes, formats and timestamps.
- Self-reported: `product_outcome_reports`, with closed outcome/provenance/time/rating/consent/methodology fields.
- The voluntary report schema has no resume text, job text, job URL, note, contact or free-text feedback column. The browser cannot read/write it directly; the authenticated server derives the owner from the access token and verifies the saved job belongs to that owner.
- One owner/job/outcome row is corrected in place, preventing repeated edits from inflating the future sample. Account or saved-job deletion cascades the report.
- Collection text says optional, self-reported and non-causal. No outcome statistic, testimonial or effectiveness claim is published.

## Tasks 63–65 audit boundary

### Cloud

Implemented: explicit first-save consent; cloud-off default; per-owner RLS; expected-revision writes; first-create and deleted-row conflict recovery; async account epoch isolation; local guest restoration on sign-out/switch; serial writes; debounce and retry backoff; permanent storage-cap stop/retry; account/local labels; current JSON backup; self-service owner/revision-bound master deletion. Resume deletion cascades retained master revisions; job-specific versions remain intentionally separate.

Not yet established: hosted migration state, provider backup deletion timing, real two-account PostgREST isolation after migration, real concurrent devices, operational cap overrides/recovery and production support acceptance. Therefore Task 63 is implementation-complete but VALIDATION PENDING.

### Paid availability

Repository truth is U.S.-only new subscriptions, USD recurring prices, Stripe Checkout, dynamically compatible configured payment methods, monthly renewal until cancellation, paid-through cancellation, and bounded refund language. The checkout request does not enable or promise automatic tax or invoice creation. The pricing page now exposes these unknowns before checkout. Live provider configuration is intentionally not inferred from source or local environment, so Task 64 is VALIDATION PENDING.

### Localization

English is the only reviewed interface locale. A future locale becomes selectable only by adding it to the explicit allowlist after a complete journey exists; IP, billing country and `navigator.language` are not used as hidden selection inputs. Resume document language/direction remain user-controlled and distinct from interface translation. Existing responsive, 320px overflow, Unicode-font, RTL resume, keyboard and accessibility gates continue to apply. This completes pre-launch localization readiness without claiming a translated product.

## Automated verification

- `node --import tsx --test tests/server/g8-readiness.test.ts tests/server/jobs-account.test.ts`: PASS after the privacy test was narrowed from comments to actual schema fields; 24/24.
- `npm run test:db`: PASS. The initial run correctly failed on PostgreSQL integer-to-smallint RPC resolution and an incorrect pgTAP plan count. The RPC signature was changed to integer inputs with bounded smallint storage and the plan corrected; the final full suite includes 19/19 voluntary-outcome assertions.
- `npm run seo:generate`: PASS; five capability pages and 73 route social images generated.
- `npm run test:seo`: PASS, 30/30 after updating the source-owned capability count from four to five.
- `npm run performance:budgets`: PASS; homepage, public matcher, templates, commercial pages, capability CSS, font and route-social assets remain within their static lab budgets.
- `npm run check:server`: PASS.
- `npx tsc --noEmit && npx vite build`: PASS; 1,871 modules transformed. The first build attempt exposed the missing closed-vocabulary `cloud_delete` diagnostic operation; registering that bounded label and adding a regression assertion resolved it. Vite retained its existing large-main-chunk warning, already governed by the repository performance budget.
- `node --import tsx --test tests/server/g8-readiness.test.ts tests/server/jobs-account.test.ts tests/server/observability.test.ts`: PASS, 36/36.
- `npx playwright test tests/g8-public.spec.ts --project=chromium`: PASS after rerunning the pricing assertion corrected for exact visible copy; methodology and pricing passed static visibility, canonical/indexing, 320px overflow and axe checks.
- `graphify update .`: PASS; 3,213 nodes, 6,843 edges and 212 communities. The tool noted that future optional LLM relabeling could refresh community names; the code graph itself is current.
- `git diff --check`: PASS before commit.

## Independent model review

Claude CLI (Haiku, low effort, read-only scoped file list) reviewed methodology/implementation agreement, outcome privacy/consent/causality/owner isolation, cloud ownership/recovery/deletion, commercial truth, localization readiness, accessibility/indexing and tests. It returned **no actionable findings**. It specifically confirmed the deterministic method/state agreement, service-only content-free self-report boundary, owner/revision cloud deletion, U.S./USD commercial boundary, English-only no-IP locale selection and private/public index policy. The first broad diff review stalled on the constrained local volume and was interrupted without findings; only the completed scoped review is evidence.

## Deviations and decisions

- Tasks 58–61 remain post-launch by explicit owner direction; no placeholder proof or simulated architecture was added.
- Task 63 and 64 use VALIDATION PENDING rather than Partial: implementation and current automatable verification are complete, but hosted/provider validation belongs to the later approved infrastructure migration.
- No owner decision is required for this batch. Enabling cloud saving, changing paid territories/currencies, adding interface languages, applying migrations or publishing outcome claims are future explicit release decisions.
