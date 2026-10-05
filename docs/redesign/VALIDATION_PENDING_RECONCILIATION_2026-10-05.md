# Validation-pending reconciliation — 2026-10-05

Scope: the original 65-task blueprint only. This review reconciles the task-level
Done When boundaries against the repository, release-gate, production, provider,
accessibility, visual, analytics, search, payment and extension evidence available
through 2026-10-05. It changes no product or provider behavior.

## Result

- **COMPLETE (51):** 1–18, 23–36, 38–44, 46–50, 54–57, 62, 64, 65.
- **VALIDATION PENDING (10):** 19–22, 37, 45, 51–53, 63.
- **PARTIAL (4):** 58–61.
- **NOT STARTED (0):** none.
- **BLOCKED (0):** none.

No current Validation Pending item can honestly close from the evidence generated
since the 2026-10-04 ledger. Low/no traffic is retained as valid observed evidence,
but is not substituted for a criterion that requires a real person, physical device,
qualified reviewer, sufficient field sample, hosted cloud exercise or external store
approval. No expensive suite was repeated because the existing dated evidence is
sufficient to establish every implementation boundary below.

Tasks 1 and 4 are confirmed **COMPLETE**. They were already closed in the canonical
2026-10-04 ledger; this reconciliation does not count them as newly closed again.
Task 5 is also confirmed **COMPLETE** after the first live, privacy-safe production
measurement review. Its zero durable numerator and denominator are an honest baseline,
not failed validation.

## Task-by-task reconciliation

| Task | Done When boundary | Evidence now available | Status and remaining evidence |
| --- | --- | --- | --- |
| 1. Primary product position | One primary position, promise and vocabulary are defined and consistently used; unsupported claims are excluded. | `GROUP_1_STRATEGY_AND_MEASUREMENT.md`; live APWICO release; brand/content and post-deployment copy gates. | **COMPLETE.** The evidence-before-effort position and canonical evidence/master/job-version language are live and checked. |
| 4. Complete product funnel | The full journey is named, each meaningful transition is measurable without content leakage, and outcome measurement has an authoritative boundary. | `ANALYTICS_EVENT_SPEC.md`; durable evidence-review/conversion records; production ingestion and zero-row aggregate review in `PRODUCTION_VALIDATION_2026-10-04.md`. | **COMPLETE.** The landing-to-manual-application-status funnel and server-authoritative north-star boundary are implemented and observed in production. |
| 19. Browser navigation | Meaningful workspace transitions restore on reload and Back/Forward; minor state does not pollute history; mobile Back works through critical transitions. | Route/state browser suites and 13-stage release gate pass; owner-scoped reload, checkout-cancel and public-to-auth continuation are automated. | **VALIDATION PENDING.** No recorded pass exists for the consolidated physical iOS/Android Back exercise. |
| 20. Sign-in/recovery continuation | Content-free continuation survives sign-in/recovery, including a genuine new-tab provider link; account changes fail closed and cannot restore another owner's object. | Auth suites, callback allowlists, production provider configuration, owner-switch isolation and local/cloud precedence pass. | **VALIDATION PENDING.** APWICO's real confirmation/recovery link opened in a separate browser context is not recorded as accepted. |
| 21. Document/storage concepts | People can distinguish master versus job-specific documents and local versus account-saved state, including naming and active-state cues. | Visual/UI audit, copy audit, route checks and automated state-label assertions pass. | **VALIDATION PENDING.** No actual-user comprehension result is recorded; visual review cannot substitute for comprehension. |
| 22. Responsive/accessibility workflow | Critical workflows are keyboard, focus, zoom, reduced-motion, narrow-screen and assistive-technology usable without obscured or overflowing controls. | Axe, keyboard/focus, 200%/320px overflow, reduced-motion, rendered mobile/tablet/desktop review and repeated release gates pass. | **VALIDATION PENDING.** A real screen-reader and physical touch-device acceptance result is still absent. |
| 37. Public extension experience | The APWICO extension package/listing accurately describes published behavior and a verified public install URL/version is available. | APWICO Job Capture 0.2.2 package, permissions, privacy, listing, assets and 42/42 suite pass; Chrome Web Store submission completed. | **VALIDATION PENDING / EXTERNAL REVIEW.** Google approval and verification that the public listing serves 0.2.2 remain. |
| 45. Performance | Public entry routes meet the established lab budgets and protections; representative field and low-powered-device behavior is validated without invented metrics. | Lab budgets, deferred loading, data-saver/reduced-motion and responsive gates pass. Vercel reports desktop 100/295 events and mobile 100/17 events. | **VALIDATION PENDING.** Metric-level LCP/INP/CLS and physical low-powered-device evidence remain unavailable; the small sample is not treated as failure. |
| 51. First occupation set | The first portfolio is selected from defensible demand/product evidence, spans relevant work types and geographies, and records why each occupation was chosen. | Nine-category portfolio and dated official external evidence are documented in `G7_EVIDENCE_CLOSURE_2026-09-30.md`; Search Console is verified but still processing/no-data. | **VALIDATION PENDING.** Meaningful internal/Search Console demand evidence has not matured; no ranking is invented. |
| 52. Occupation hubs | Initial hubs provide reviewed, occupation-specific evidence guidance, examples, templates and product entry without invented requirements or credentials. | Nine substantive sourced/indexable hubs pass content, route, expiry, accessibility and responsive checks. | **VALIDATION PENDING.** Qualified occupation/regulator review is not recorded. |
| 53. Regional guidance | Regional differences are jurisdiction-scoped, sourced and reviewed; unsupported regions are not generalized. | Five-source regional matrix, explicit exclusions, no-IP behavior, checked dates and publication gates pass. | **VALIDATION PENDING.** Qualified local/regional human review is not recorded. |
| 63. Cloud-saving validation | Consent, ownership, conflict, switching, deletion, limits, recovery, interruption and local/cloud boundaries are validated in the hosted operating environment before promotion. | Implementation, database/RLS replay, local-retention rehearsal, conflict/interruption simulation, account switching, JSON backup and self-service deletion pass. Production remains cloud-off. | **VALIDATION PENDING.** Hosted two-account isolation, provider backup/recovery and real multi-device/interrupted-save validation remain. |

## Partial and post-launch boundary

Tasks 58–61 remain **PARTIAL**, not blocked: their operating foundations exist, but
the blueprint work itself requires real advisors, partner agreements, an institutional
pilot and a preregistered adequately sampled research result. Those are legitimate
post-launch programs and are not release blockers. There is no current **BLOCKED** task;
Task 37 is external validation rather than an implementation block because submission
is complete and Google review is in progress.

## Evidence index

- `GROUP_1_STRATEGY_AND_MEASUREMENT.md`
- `ANALYTICS_EVENT_SPEC.md`
- `FINAL_PRE_RELEASE_REHEARSAL_2026-10-01.md`
- `PRE_RELEASE_BLOCKER_CLEARANCE_2026-10-01.md`
- `FINAL_VISUAL_UI_AUDIT_2026-10-01.md`
- `PRODUCTION_VALIDATION_2026-10-04.md`
- `G6_G7_INTEGRATION_2026-09-30.md`
- `G7_EVIDENCE_CLOSURE_2026-09-30.md`
- `G8_PRELAUNCH_2026-09-30.md`
- `G8_POST_LAUNCH_OPERATING_FOUNDATIONS_2026-10-04.md`
- `SEARCH_PERFORMANCE_REVIEW.md`
- `EXTENSION_STORE_READINESS.md`

## Next actionable validation

Run the single consolidated human acceptance session already defined in
`PRE_RELEASE_BLOCKER_CLEARANCE_2026-10-01.md`: physical mobile Back/touch behavior,
one real screen reader, document/storage comprehension and one real APWICO
confirmation/recovery-link return. That session can provide the missing evidence for
Tasks 19–22 without reopening product work.
