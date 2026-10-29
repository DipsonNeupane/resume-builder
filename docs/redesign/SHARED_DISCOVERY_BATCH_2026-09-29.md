# Shared discovery consolidation batch

Scope: isolated `redesign/shared-route-state` work only. Production, hosted data, deployment, push and merge were untouched.

## Implemented architecture

- Permanent public destinations now exist for `/templates/`, `/templates/{verified-id}/` and `/pricing/`. The static generator reads the single template registry, produces meaningful pre-JavaScript HTML, and feeds the existing canonical/sitemap/public-route policy. The middleware intentionally keeps its deployment-safe allowlist self-contained; a registry parity test prevents route drift.
- The gallery has six non-ranked curated examples plus all 27 live designs. Tier, family and density filters use verified metadata only. Detail pages expose verified structure, section order, typography, characteristics and access tier. Layout cues are explicitly illustrative. A4/Letter and LTR/RTL are stated as builder support; DOCX visual parity is explicitly not promised.
- Preview and purchase are separate. Template CTAs enter `/start/build?template={id}` and select only a preview design; they never grant entitlement or begin checkout. Pricing repeats the verified US$0 / US$1.99 monthly individual Premium / US$19.99 monthly Pro boundaries and rejects outcome claims.
- Direct job-first onboarding reuses `extractJobRequirements` from the browser-only matcher. Pasted title/company/description are kept in a versioned, expiring, session-only object, never in URLs or analytics. Guest state may be claimed by the first signed-in owner; an owner-bound object is deleted rather than exposed after an account switch. Import completion or an explicit builder action returns to job review and the shared workspace.
- Authentication email/recovery returns use a bounded enum (`import`, `build`, `job`, `resume`, `jobs`, `saved`, `pro`). Object UUIDs, resume/job content, source URLs, tokens and arbitrary paths are never copied into `return_to`. Same-tab continuation remains owner-scoped and single-use. Checkout cancellation returns to `/workspace/pro?checkout=cancelled`.
- New public routes inherit the existing static metadata/canonical/index policy, public quality sweep, responsive overflow/axe checks and lab budgets. Private workspace/start routes remain noindex/no-store.

## Automated evidence

Coverage includes generator freshness, registry parity, canonical/sitemap/internal-link policy, private-route headers, gallery filters, preview/purchase separation, narrow-screen overflow, axe, job extraction/source rows/focus/reload/mobile Back, URL leakage, owner isolation, bounded auth returns, workspace navigation and production build/type/performance checks.

- Client production build and TypeScript: PASS.
- Server TypeScript: PASS.
- Static SEO/generator/route suite: 19/19 PASS.
- Shared-discovery server suite: 3/3 PASS; combined with the 19 SEO/route tests, the targeted server batch is 22/22.
- Shared-discovery browser suite: 4/4 PASS.
- Workspace navigation browser suite: 5/5 PASS.
- Public route quality sweep: PASS across every registered route at 320px and 1440px, including axe, primary heading, asset silence and horizontal overflow.
- Fictional sample and homepage lab-performance suites: 5/5 PASS.
- Artifact budgets: PASS — homepage JS 635.5 KiB raw / 182.1 KiB gzip; homepage CSS 194.5 / 33.7; public matcher JS 23.8 / 8.0; template JS 0.6 / 0.4; template CSS 4.5 / 1.4.
- `git diff --check` and Graphify refresh: PASS.

These are local lab/build results, not production field measurements.

## Human/field validation still pending

- real confirmation and password-recovery links opened in a genuinely separate browser context through the configured email provider;
- physical iOS/Android Back behavior and screen-reader runs;
- post-release field LCP/INP/CLS and real production funnel denominators.

These are **VALIDATION PENDING**, not incomplete implementation or blockers. No owner decision is required before beginning bounded parallel G4/G5 architecture work.

## Claude review

Claude independently reviewed the requested surfaces with instructions to work silently and return findings to the executing agent. Actionable findings and resolutions:

1. Job-first input could exceed the bounded store or preserve forbidden controls. The UI and store now share the 12,000-character bound, sanitize controls and reject invalid captures.
2. A template query could be consumed before an existing/local/cloud resume restored. Selection is now applied once after restore and the query is removed after consumption.
3. Checkout cancellation used an imprecise return and lacked acknowledgement. Existing Pro and template flows now return to their owning surface, show a one-time acknowledgement and have regression coverage.
4. Import completion could skip mandatory resume review. It now returns to the builder review with the pending job context intact.
5. Owner-bound job-first state could appear before session resolution. Only guest state can render while unresolved; owner-bound state fails closed, route content is keyed to the resolved owner and writes wait for session resolution.
6. Static navigation lacked consistent current-page semantics. Generated template/pricing navigation now matches the permanent public navigation and applies `aria-current` deliberately.
7. Pricing omitted the verified free-download and paid-territory boundaries. Both are now explicit without inventing availability.
8. Job-first validation/results needed stronger announcement and focus behavior. Errors are alerts; extracted results are a named focus target.
9. Quality documentation could imply field performance coverage. It now distinguishes static/lab budgets from unavailable field data; task 4 remains PARTIAL because later funnel instrumentation is not invented here.
10. Password reset completion lacked durable visible confirmation after navigation. The shared app message now acknowledges the completed reset.

Claude found no unbounded auth return, private-route indexing, resume/job content in URLs, or sample/real-state contamination after the fixes. All affected checks were rerun successfully.
