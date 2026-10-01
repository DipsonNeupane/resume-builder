# Final pre-release rehearsal and audit

Date: 2026-10-01. Candidate: isolated `redesign/shared-route-state`. No production deployment, DNS edit, redirect activation, hosted migration, provider mutation, merge or push occurred.

## Executive decision

- **Release audit:** FAIL until the required-before-production gates below are completed. This is an external-readiness result, not authorization to cut over.
- **Repository and non-live rehearsal:** PASS after the stable automated gates and independent review recorded below.
- **Production cutover rehearsal:** FAIL because APWICO is not attached to the production hosting project and provider/live-retention checks cannot be proved without an authorized window.
- **Production release status:** NOT READY until the required-before-production owner/provider gates in this report are completed during an explicitly authorized window.
- **Rollback:** READY for the required temporary-redirect stage. Permanent 301 promotion is separately gated and has a documented five-minute cache plus DNS/intermediary recovery limitation.
- **Current domain fact:** read-only DNS/HTTP checks on 2026-10-01 found `apwico.com` at GoDaddy (`76.223.105.230`, `13.248.243.5`; `www` points to apex; response server `DPS`). Read-only Vercel inspection found the existing project `resumestride` and no `apwico.com` domain attached. This is a required pre-cutover action, not a code failure.

The original uploaded blueprint file is not present on this host. This audit therefore uses the exhaustive 65-task ledger, the owner’s task-by-task acceptance restatements in this work history, every group evidence record, current source/tests and Group 9’s supplied migration brief. It does not invent unavailable Done When wording.

## Complete blueprint status

Count: **47 COMPLETE / 13 VALIDATION PENDING / 0 PARTIAL / 4 NOT STARTED / 1 BLOCKED**.

| Group / tasks | Status | Done-When audit result and evidence |
| --- | --- | --- |
| G1 1–4 | COMPLETE | Position/vocabulary is rolled out; three journeys converge; server-authoritative behavior-qualified review/conversion ledgers are content-free; the complete landing-to-manual-status funnel is bounded and instrumented. `GROUP_1_STRATEGY_AND_MEASUREMENT.md`, `ANALYTICS_EVENT_SPEC.md`, measurement/database tests. |
| G1 5 | VALIDATION PENDING | Dated pre-redesign capability/instrumentation baseline is recorded; unavailable production denominators remain “not instrumented,” never fabricated as zero. Production/post-release comparison remains. |
| G2 6–14 | COMPLETE | Evidence-led homepage, three starts, connected workflow explanation, truthful product proof, permanent navigation, curated showcase and all 27 verified template URLs meet current automated content, route, keyboard, mobile, index and budget conditions. Earlier G2/G3 batch evidence plus current quality gate. |
| G3 15–18 | COMPLETE | Import/build/job starts converge; anonymous evidence and fictional sample are isolated; saved-object URLs restore/fail closed with owner checks. |
| G3 19–22 | VALIDATION PENDING | History/auth/recovery/storage/accessibility implementation and automation are complete. Real provider links, physical mobile Back, comprehension, screen-reader and physical-device checks remain. |
| G4 23–30 | COMPLETE | All purchase paths and recurring/cancellation/export disclosures are adjacent and factual; trust/proof architecture makes no invented claims; permanent pages pass public quality gates. `G4_BATCH_2026-09-30.md`. |
| G5 31–36 | COMPLETE | Public matcher and saved Match center requirement/source/evidence; user decides; master is preserved; manual application/notes/follow-up are owner-scoped and do not imply submission. `G5_BATCH_2026-09-30.md`. |
| G5 37 | BLOCKED | Extension has no verified published store URL/version. It remains excluded from release claims and is not a web-release blocker. |
| G6 38–44 | COMPLETE | Permanent URLs, truthful schema/sitemap dates/social assets, local fonts and cache/bundle delivery are generated and enforced. `G6_COMPLETION_2026-09-30.md`. |
| G6 45–46 | VALIDATION PENDING | Lab performance/reduced-motion/low-power rules and recurring gate are complete; physical low-powered/assistive-tech and production field data remain. |
| G7 47–50, 54–55 | COMPLETE | Problem-led resources/tools/templates, internal links and dated balanced comparisons have substantive utility and checked claim boundaries. |
| G7 51–53, 56 | VALIDATION PENDING | Evidence-diverse occupation set/hubs and bounded official regional guidance are implemented; internal demand, qualified local review and real Search Console performance remain. |
| G8 57, 62, 65 | COMPLETE | Public Match method agrees with behavior; voluntary outcomes separate observed/self-reported evidence without causal claims/content; English-only explicit locale architecture is RTL/text-expansion ready. |
| G8 58–61 | NOT STARTED | Advisory group, partnerships, organizational distribution and original research are legitimate post-launch work and are not release blockers. |
| G8 63–64 | VALIDATION PENDING | Cloud and U.S./USD paid implementation is complete; hosted owner isolation/recovery and live provider/catalog/return validation remain required. |
| G9 repository migration | COMPLETE | APWICO identity/origin/assets/copy plus legacy state/provider identifiers, default-off one-hop redirects and brand checks are implemented. |
| G9 production/provider migration | VALIDATION PENDING | Domain/hosting/Auth/email/Stripe/Search/analytics/local-origin coexistence need owner-authenticated execution and explicit authorization. |

The exact task membership remains authoritative in `BLUEPRINT_STATUS.md`; detailed Done When evidence is in the dated group records linked there.

## Product-principle audit

| Principle | Result |
| --- | --- |
| Evidence before effort; no ATS/hiring/apply verdict | PASS — requirement/source/evidence remain connected; public and saved workflows keep user authority. |
| No invented experience; grounded tailoring; master safety | PASS — suggestions require review and job-specific versions are separate/owner-scoped. |
| Worldwide/all-occupation design without false availability | PASS — content/format architecture is broad; paid access is explicitly U.S./USD and English is the only interface locale. |
| Transparent commerce/trust/public claims | PASS — verified prices/terms/export boundaries, no testimonial/outcome/guarantee fabrication. |
| Accessibility/performance | PASS for automation; physical assistive-tech/mobile/low-power validation required before cutover. |
| Privacy-safe analytics/outcomes | PASS — closed properties, public-path URL stripping, content-free server ledgers, voluntary provenance/consent. |
| Outcomes over vanity metrics | PASS — committed reviewed job-specific package is authoritative; field statistics are not claimed. |

## Remaining-item release classification

### A — required before production

1. Owner approves the release window, rollback threshold and browser-only state coexistence/retention window.
2. Attach APWICO to the existing Vercel project, validate TLS/candidate with redirects off, then replace the GoDaddy web target using provider-supplied DNS values.
3. Reconcile hosted database/migration catalog; take a current recovery point and complete a populated isolated restore/owner-isolation drill. Apply the new APWICO support-message migration only in the authorized plan.
4. Add APWICO Supabase confirmation/recovery callbacks while retaining legacy callbacks; verify two synthetic accounts and account-switch isolation.
5. Verify APWICO transactional sender/domain/reply handling and provider-generated links.
6. Verify Stripe live catalog/account country, methods, renewal/cancellation/refund/tax/invoice disclosures, APWICO return/webhook URLs and preservation of customers/subscriptions/lookup keys.
7. Complete physical mobile Back/narrow workflow, representative screen-reader/keyboard and low-powered/reduced-motion acceptance. Any severe defect stops release.
8. Freeze the commit/artifact and run the final gate with production-equivalent public configuration but no live mutations.

### B — validation during controlled cutover

- Live APWICO TLS/canonical/robots/sitemap, old/new deep links, one-hop redirects and missing-route behavior.
- Real confirmation/recovery new-tab links, existing auth reauthentication on the new origin and email deliverability.
- Test-mode or explicitly owner-approved synthetic Checkout success/cancel, Portal, receipt and webhook delivery; no unapproved live charge.
- Analytics/Search Console continuity, APWICO sitemap submission and privacy-safe synthetic event observation.
- Production field performance/error/404/redirect monitoring. These checks do not invent field baselines before traffic exists.

### C — legitimate post-launch

- Tasks 58–61; extension publication/Task 37; additional languages; partnerships/distribution/research/outcome claims.
- Meaningful Search Console/demand/conversion/CWV review; occupation/regional qualified review beyond the carefully bounded sourced launch set; comprehension/user research and iteration.

## Dual-domain rehearsal

| Scenario | Rehearsal result |
| --- | --- |
| Target readiness | FAIL as a production prerequisite: APWICO currently serves GoDaddy and is not attached to Vercel. The exact corrective/rollback action is documented. |
| Old path/query → APWICO | PASS in source/tests: default-off; one no-store 307 during reversible cutover, then separately gated bounded-cache 301; path/query preserved and `/index.html` normalized. |
| Loop/chain safety | PASS: APWICO canonical host never self-redirects; `www.apwico.com` and both old hosts map directly to the apex. |
| Canonical/sitemap/robots | PASS in built artifacts; live verification belongs to cutover. Private/query routes remain noindex/no-store. |
| Auth/email callbacks | PASS in application construction; both origins must be provider-allowlisted. A new origin cannot inherit the old browser’s Supabase session, so reauthentication is expected. |
| Checkout/payment returns | PASS in source: URLs derive from the validated single `APP_ORIGIN`; cancellation returns to the relevant workspace. Provider values require cutover validation. |
| Deep/private links | PASS: intentional paths restore owner-scoped objects; IDs are internal opaque UUIDs, no content/token is placed in routes; invalid/unauthorized fails closed. |
| Local state | IMPLEMENTED / VALIDATION PENDING: browsers do not expose ResumeStride local/session storage to APWICO. The candidate now shows an old-origin transition notice with review/download/account actions; coexistence duration and live validation remain required. No URL/analytics bridge is permitted. |

## Data and compatibility rehearsal

| State | Expected transition | Evidence/result |
| --- | --- | --- |
| Master resume/local draft | Same `resumestride.resume.v1`/rescue keys remain on a given origin. Cross-origin local drafts do not move automatically. | Identifier tests PASS; coexistence/export/account-sync rehearsal required. |
| Account master | Same Supabase project, owner UUID, row and revision; reauthentication on APWICO restores it when cloud is enabled/consented. | Schema/ownership automation PASS; hosted two-account validation required. |
| Saved jobs/Match | Same owner-scoped tables/IDs/hashes; no re-key/rename. | Server/database/navigation automation PASS. |
| Job-specific versions | Same owner/version/job references; master remains separate. | Deep-link, conflict and owner tests PASS. |
| Auth sessions | Origin-bound client storage means old session is not promised to transfer. Provider account identity survives; user signs in again. | Safe/expected limitation documented; real link validation pending. |
| Entitlements/customers/subscriptions | Same DB/Stripe references and legacy metadata/lookup keys; no catalog/customer recreation. | Source/billing tests PASS; live Stripe read/return/webhook validation required. |
| Analytics | Same bounded event vocabulary/server ledgers; pre/post host/date distinguished without IDs/content. | Sanitizer/privacy tests PASS; dashboard label/property continuity pending. |

## Final product QA matrix

The recurring quality gate covers production build/client types; server types; static budgets; SEO/schema/sitemap/link policy; route/continuation/private-state contracts; PDF/DOCX and Word round trip; homepage/templates/onboarding/sample; accessibility/overflow/keyboard/motion; saved object/owner isolation; cloud recovery; generated PDF smoke. Full server/billing, database replay/pgTAP, mocked auth, mocked paid, extension/package and brand/release rehearsals are run separately and recorded below.

| Surface | Automated evidence | Remaining human/provider evidence |
| --- | --- | --- |
| Three starts, matcher, sample, builder/import | Route/public/sample/a11y/browser suites | Physical mobile and representative assistive tech |
| Saved jobs, Match, versions, applications | Server/database/paid owner-isolation suites | Hosted two-account/network interruption |
| Exports | PDF/DOCX unit, browser and generated-PDF smoke | Hosted function/font/file inspection |
| Pricing/trust/billing | Commercial/checkout/webhook/paid suites | Live Stripe catalog/returns/receipt/refund review |
| Account/auth/recovery | Mocked auth and continuation suites | Real APWICO provider email/link/session acceptance |
| Public SEO/mobile/performance | Generated route, schema, canonical, sitemap, axe, overflow and budget gates | Live crawl/index/CWV and physical low-power device |
| Privacy/ownership/branding | Sanitizer, RLS/db, owner-switch, release/brand checks | Provider/dashboard configuration inspection |

## Verification evidence

Stable final evidence on the isolated candidate:

- database replay and pgTAP: **PASS**, including measurement, saved jobs, job-specific versions, owner isolation, entitlements, billing/subscription references and voluntary outcomes;
- optimized production build and client types: **PASS** (1,871 modules); the documented main-chunk advisory remains inside the enforced route budgets;
- static performance budgets and server type check in the recurring gate: **PASS**;
- generated SEO/content/schema/canonical/sitemap/link policy: **30/30 PASS** on stable artifacts;
- typed route/continuation/private-state contracts: **9/9 PASS**;
- release migration/domain compatibility: **9/9 PASS**;
- PDF/DOCX/Word round trip: **22/22 PASS**;
- built public browser matrices: **20/20 PASS** and **33/33 PASS**, covering the three entries, templates, onboarding, sample, public Match, commercial/trust, APWICO brand, accessibility, overflow, reduced motion and performance protections;
- mutation/auth boundary tests, including exact legacy-origin coexistence and foreign-origin rejection: **PASS**;
- extension packaging/security review: **PASS** (16 reviewed files; no installation or submission);
- APWICO migration guard: **PASS**; production dependency audit: **0 vulnerabilities at high severity or above**; whitespace/diff validation: **PASS**.

Two cold-development-server browser invocations and a generated-PDF smoke invocation were stopped after the synchronized workspace stalled/crashed their local harness. They are not recorded as product passes or failures. Equivalent release-build public coverage, the 22 export tests, database replay and prior stable private-owner suites remain the evidence used above. The cutover runbook requires one frozen-candidate rerun in a production-equivalent environment before authorization; a harness failure there is a stop condition.

## Independent adversarial review

The independent reviewer identified four issues. (1) Blanket 301s could rewrite/drop old-tab API POSTs: resolved by excluding infrastructure/API traffic, keeping exact legacy mutation origins in the existing strict origin check, and adding method/API tests. (2) Browser-only transition UX was not implemented: resolved with an old-origin notice and direct review/account actions; live coexistence remains a pre-cutover gate. (3) 301 rollback was overstated: resolved with default-off flags, a no-store 307 stage and separately authorized bounded-cache 301, plus explicit rollback latency. (4) The original blueprint attachment is unavailable: retained as an explicit evidence limitation rather than claiming verbatim Done When review. No other actionable finding was reported.
