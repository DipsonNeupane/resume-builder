# Validation-pending reconciliation — 2026-10-05

Scope: the original 65-task blueprint only. This review reconciles the task-level
Done When boundaries against the repository, release-gate, production, provider,
accessibility, visual, analytics, search, payment and extension evidence available
through 2026-10-05. It changes no product or provider behavior.

## Result

- **COMPLETE (52):** 1–19, 23–36, 38–44, 46–50, 54–57, 62, 64, 65.
- **VALIDATION PENDING (9):** 20–22, 37, 45, 51–53, 63.
- **PARTIAL (4):** 58–61.
- **NOT STARTED (0):** none.
- **BLOCKED (0):** none.

Task 19 closed after the subsequent consolidated session recorded a physical mobile
Back/Forward pass in addition to the existing live desktop and automated evidence.
The remaining Validation Pending tasks cannot honestly close from current evidence.
Low/no traffic is retained as valid observed evidence, but is not substituted for a
criterion that requires a real person, physical device, qualified reviewer, sufficient
field sample, hosted cloud exercise or external store approval.

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
| 19. Browser navigation | Meaningful workspace transitions restore on reload and Back/Forward; minor state does not pollute history; mobile Back works through critical transitions. | Route/state suites, live desktop Back/Forward/reload and owner-performed physical mobile Back/Forward all pass across the public matcher and master/jobs workspace. | **COMPLETE.** The remaining Done When evidence is now recorded. |
| 20. Sign-in/recovery continuation | Content-free continuation survives sign-in/recovery, including a genuine new-tab provider link; account changes fail closed and cannot restore another owner's object. | Real production recovery delivery and new-tab APWICO session return succeeded; owner-switch and continuation automation remains green. | **VALIDATION PENDING.** Production retained the consumed code in the URL and the provider sender name remained legacy; local cleanup is not deployed. |
| 21. Document/storage concepts | People can distinguish master versus job-specific documents and local versus account-saved state, including naming and active-state cues. | An uncoached owner answered from a physical phone that they could not determine the active document because its identity/storage copy overlapped. | **VALIDATION PENDING.** The local responsive fix passes, but production comprehension failed and must be repeated after deployment. |
| 22. Responsive/accessibility workflow | Critical workflows are keyboard, focus, zoom, reduced-motion, narrow-screen and assistive-technology usable without obscured or overflowing controls. | Existing automation and live recovery error/focus semantics pass; physical phone review exposed the active-document overlap. | **VALIDATION PENDING.** Local viewport/axe checks pass after the fix; production physical and real screen-reader validation remain. |
| 37. Public extension experience | The APWICO extension package/listing accurately describes published behavior and a verified public install URL/version is available. | The public listing reached APWICO 0.2.2. A real Chrome side-panel defect was then corrected in 0.2.3; its permissions/privacy remain unchanged, its 160–360px layout and 43/43 suite pass, and its refreshed Wine + Blush listing assets and exact package were submitted on 2026-10-06. | **VALIDATION PENDING / EXTERNAL REVIEW.** Google approval and verification that the public listing serves corrected version 0.2.3 remain. |
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
- `TASKS_19_22_REAL_WORLD_VALIDATION_2026-10-05.md`
- `PRODUCTION_VALIDATION_2026-10-04.md`
- `G6_G7_INTEGRATION_2026-09-30.md`
- `G7_EVIDENCE_CLOSURE_2026-09-30.md`
- `G8_PRELAUNCH_2026-09-30.md`
- `G8_POST_LAUNCH_OPERATING_FOUNDATIONS_2026-10-04.md`
- `SEARCH_PERFORMANCE_REVIEW.md`
- `EXTENSION_STORE_READINESS.md`

## Next actionable validation

Deploy and production-verify the two bounded Task 20–22 code corrections, correct the
provider sender display name, then repeat the document/storage comprehension questions
and one real screen-reader critical path. No broader UI or feature work is required.
