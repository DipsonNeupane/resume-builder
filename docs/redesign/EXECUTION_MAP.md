# APWICO redesign execution map

This is a dependency map, not a calendar. Production stays live and unchanged while all work is developed and verified on redesign branches.

## Dependency spine

`G1 strategy + measurement` → shared information architecture/data language → `G2 homepage` + `G3 workspace` → `G4 commerce` + `G5 Jobs/Match` → integrated validation → `G8 outcome-backed expansion`

`G6 technical quality` runs beside Groups 2–5. `G6 URL/metadata decisions` and `G7 content architecture` must converge before bulk content production.

## Group map

| Group | Sequential dependencies | Safe parallel workstreams | Bulkable work |
| --- | --- | --- | --- |
| 1. Strategy & measurement (1–5) | Position and vocabulary (1) → journeys (2) → north-star semantics (3) → funnel/event contract (4) → baseline (5) | Claims audit, production capability audit, analytics/privacy audit, and baseline capture | Approved vocabulary/claims registry; event dictionary and QA matrix |
| 2. Homepage & navigation (6–14) | G1 language and journey starts before final hero/CTA/navigation; route decisions before final links | Hero/proof/demo (6, 10, 11), entry actions (7–9), navigation (12), template discovery (13–14) | Template metadata, access labels, preview fixtures, responsive/a11y cases |
| 3. Onboarding & workspace (15–22) | Shared master/job/version/storage model before onboarding; route strategy before browser-history work | Journey onboarding/sample (15–17), routing/history/auth recovery (18–20), document/storage language (21), accessibility verification (22) | Route-state tests, failure-state tests, viewport/keyboard/RTL matrices |
| 4. Trust, pricing & conversion (23–30) | Verified entitlements and billing behavior before copy; cancellation/export policies need owner/legal sign-off | Pricing comparison (23–27), factual trust (28, 30), customer-proof program design (29) | Disclosure components, support answers, claim-to-evidence registry |
| 5. Jobs, Match & extension (31–37) | G1 evidence vocabulary → Match row model (32) → persistence/decision/version flow (33–34) → tracking/organization (35–36); public extension page follows published behavior (37) | Public matcher (31), Match core (32–34), application organization (35–36), extension truth audit (37) | Requirement-row fixtures, evidence states, source/capture cases, status tests |
| 6. Technical SEO, accessibility & performance (38–46) | Public route map before canonicals/sitemap/schema; asset strategy before final performance budgets | Routes/templates/schema/sitemap (38–41), social/font/assets/WebGL (42–45), release gate (46) | Template pages/schema, social-card variants, link/canonical checks, viewport/a11y tests |
| 7. Content SEO & search architecture (47–56) | G1 vocabulary + G6 route system before large production; demand evidence before occupation hubs | Evidence cluster/tools/pages (47–50), occupation research/hubs (51–52), regional guidance (53), links/comparisons/review loop (54–56) | Internal-link manifests, page metadata, reviewed example components; never thin generated pages |
| 8. Growth, validation & global expansion (57–65) | Earlier product evidence before claims, research, testimonials, cloud promotion, global paid access, or localization | Methodology (57), advisory/partnership/tool programs (58–60), research/outcomes (61–62), cloud/commerce/localization readiness (63–65) | Consent templates, methodology tables, outcome surveys, locale QA after demand is proven |

## Recommended execution batches

1. **Current: Group 1 foundation.** Finish approved language, event semantics, privacy tests, and the pre-redesign baseline. Do not redesign UI yet.
2. **Shared architecture batch.** Define routes, master/job/version/storage state, journey switching, and public/private indexing boundaries for Groups 2, 3, and 6.
3. **Parallel experience batch.** Run Homepage (6–13) and Onboarding/Workspace (15–21) in separate scoped branches against the shared architecture. Keep task 14 coordinated with G6/G7 template routes.
4. **Parallel trust/product batch.** Run Commerce (23–30) and Jobs/Match (31–36); keep claims and analytics tied to verified behavior. Treat extension task 37 as a published-version truth audit.
5. **Continuous quality batch.** Apply tasks 38–46 to every integrated surface rather than postponing accessibility/performance/SEO.
6. **Acquisition batch.** Build tasks 47–56 after routes and product language stabilize; bulk only reviewed metadata, links, and reusable structures.
7. **Evidence-led expansion batch.** Start tasks 57–65 only when earlier product usage and consented outcomes provide evidence.

## Integration rules

- One scoped concern per logical commit; generated files travel with their source change.
- Rebase or merge scoped branches only against `redesign/integration`, never the dirty production-adjacent checkout.
- Tests must match risk: analytics privacy tests for event changes, browser/a11y tests for UI, server/ownership tests for persistence, and billing gates for commerce.
- Every public claim must point to a production-candidate capability and qualification.
- Do not mark a blueprint item complete from documentation alone when its done condition requires production behavior or measured data.
