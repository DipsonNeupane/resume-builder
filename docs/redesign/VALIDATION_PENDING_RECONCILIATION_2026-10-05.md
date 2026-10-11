# Validation-pending reconciliation — 2026-10-05

Scope: the original 65-task blueprint only. This review reconciles the task-level
Done When boundaries against the repository, release-gate, production, provider,
accessibility, visual, analytics, search, payment and extension evidence available
through the 2026-10-07 Task 20–22 closure. The reconciliation itself changes no product behavior; its closure addendum records the approved sender-name correction and real production/human evidence.

## Result

- **COMPLETE (55):** 1–36, 38–44, 46–50, 54–57, 62, 64, 65.
- **VALIDATION PENDING (6):** 37, 45, 51–53, 63.
- **PARTIAL (4):** 58–61.
- **NOT STARTED (0):** none.
- **BLOCKED (0):** none.

Tasks 19–22 closed after the subsequent consolidated sessions recorded physical mobile
navigation, real recovery/provider return, document/storage comprehension and VoiceOver
evidence in addition to the existing live desktop and automated evidence. The remaining
Validation Pending tasks cannot honestly close from current evidence.
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
| 20. Sign-in/recovery continuation | Content-free continuation survives sign-in/recovery, including a genuine new-tab provider link; account changes fail closed and cannot restore another owner's object. | The bounded cleanup is live. A fresh real recovery email displayed APWICO, opened the production new-password flow in a new tab and left no consumed `code` in the visible URL. Supabase SMTP reloaded with sender name APWICO; owner-switch and continuation automation remains green. | **COMPLETE.** Provider identity, real new-tab return and URL cleanup are now verified. |
| 21. Document/storage concepts | People can distinguish master versus job-specific documents and local versus account-saved state, including naming and active-state cues. | On a physical iPhone after deployment, the owner identified the active master and browser-session storage without coaching. The isolated sample then demonstrated—and the owner understood—that tailoring creates a separate fictional version while its master remains unchanged. | **COMPLETE.** The corrected production state passes normal-person comprehension. |
| 22. Responsive/accessibility workflow | Critical workflows are keyboard, focus, zoom, reduced-motion, narrow-screen and assistive-technology usable without obscured or overflowing controls. | Existing keyboard, focus, error/status, zoom, reduced-motion, viewport and axe evidence remains valid. Physical iPhone layout passed, and real VoiceOver announced the active master, browser-session storage and primary editing controls in usable order without trapping. | **COMPLETE.** Physical and assistive-technology evidence now supplements the automated gates. |
| 37. Public extension experience | The APWICO extension package/listing accurately describes published behavior and a verified public install URL/version is available. | Google publicly serves 0.2.3. The reproduced toolbar-popup collapse is fixed and real-Chrome verified in packaged 0.2.4 with unchanged permissions/privacy, supported capture and a readable unsupported state. The Store's verified individual-trader address and phone disclosure was traced to Google Payments. | **VALIDATION PENDING.** 0.2.4 is not submitted or published, and truthful non-residential trader contacts still require owner establishment and reverification. |
| 45. Performance | Public entry routes meet the established lab budgets and protections; representative field and low-powered-device behavior is validated without invented metrics. | Lab budgets, deferred loading, data-saver/reduced-motion and responsive gates pass. Vercel reports desktop 100/295 events and mobile 100/17 events. | **VALIDATION PENDING.** Metric-level LCP/INP/CLS and physical low-powered-device evidence remain unavailable; the small sample is not treated as failure. |
| 51. First occupation set | The first portfolio is selected from defensible demand/product evidence, spans relevant work types and geographies, and records why each occupation was chosen. | Nine-category portfolio and dated official external evidence are documented in `G7_EVIDENCE_CLOSURE_2026-09-30.md`; Search Console is verified but still processing/no-data. | **VALIDATION PENDING.** Meaningful internal/Search Console demand evidence has not matured; no ranking is invented. |
| 52. Occupation hubs | Initial hubs provide reviewed, occupation-specific evidence guidance, examples, templates and product entry without invented requirements or credentials. | Nine substantive sourced/indexable hubs pass content, route, expiry, accessibility and responsive checks. | **VALIDATION PENDING.** Qualified occupation/regulator review is not recorded. |
| 53. Regional guidance | Regional differences are jurisdiction-scoped, sourced and reviewed; unsupported regions are not generalized. | Five-source regional matrix, explicit exclusions, no-IP behavior, checked dates and publication gates pass. | **VALIDATION PENDING.** Qualified local/regional human review is not recorded. |
| 63. Cloud-saving validation | Consent, ownership, conflict, switching, deletion, limits, recovery, interruption and local/cloud boundaries are validated in the hosted operating environment before promotion. | Production Supabase direct checks pass 14/14 and a three-context real-browser exercise passes 8/8 for save, fresh-session recovery, two-account isolation, conflict choices, switching, browser-draft separation, interrupted-save retry and deletion. RLS policies are present and effective. Daily physical backups, seven-snapshot retention, a post-canary populated source and the restore-to-new-project route are verified. Production remains cloud-off. See `TASK_63_HOSTED_CLOUD_VALIDATION_2026-10-07.md`. | **VALIDATION PENDING.** Supabase requires a new isolated project and quotes US$9.68/month additional compute; financial authorization is required before the populated restore, hash/ownership comparison and measured recovery drill can run. |

## Partial and post-launch boundary

Tasks 58–61 remain **PARTIAL**, not blocked: their operating foundations exist, but
the blueprint work itself requires real advisors, partner agreements, an institutional
pilot and a preregistered adequately sampled research result. Those are legitimate
post-launch programs and are not release blockers. There is no current **BLOCKED** task;
Task 37 is no longer awaiting external review. It remains validation pending because
the verified 0.2.4 correction is not submitted/published and the public trader-contact
privacy issue requires truthful owner-controlled replacement contact details.

## Evidence index

- `GROUP_1_STRATEGY_AND_MEASUREMENT.md`
- `ANALYTICS_EVENT_SPEC.md`
- `FINAL_PRE_RELEASE_REHEARSAL_2026-10-01.md`
- `PRE_RELEASE_BLOCKER_CLEARANCE_2026-10-01.md`
- `FINAL_VISUAL_UI_AUDIT_2026-10-01.md`
- `TASKS_19_22_REAL_WORLD_VALIDATION_2026-10-05.md`
- `TASK_63_HOSTED_CLOUD_VALIDATION_2026-10-07.md`
- `PRODUCTION_VALIDATION_2026-10-04.md`
- `G6_G7_INTEGRATION_2026-09-30.md`
- `G7_EVIDENCE_CLOSURE_2026-09-30.md`
- `G8_PRELAUNCH_2026-09-30.md`
- `G8_POST_LAUNCH_OPERATING_FOUNDATIONS_2026-10-04.md`
- `SEARCH_PERFORMANCE_REVIEW.md`
- `EXTENSION_STORE_READINESS.md`

## Next actionable validation

Task 37 is the next directly actionable item: establish truthful non-residential trader
contacts, update/reverify them, submit 0.2.4 when authorized, and repeat the installed
public-version check after Google approval.
