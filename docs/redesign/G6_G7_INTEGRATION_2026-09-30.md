# G6/G7 integration evidence — 2026-09-30

Scope: isolated `redesign/shared-route-state` only. Production, hosted data, providers, push, merge, release and deployment were untouched.

## Integrated status

- COMPLETE: 38–44, 47–50, 54, 55.
- VALIDATION PENDING: 45, 46, 51–53, 56.
- PARTIAL: none in G6/G7.
- BLOCKED in this range: none. Repository-wide task 37 remains blocked on a real published extension URL/version.

The complete 65-task ledger is `BLUEPRINT_STATUS.md`. G6 is implementation-ready; its remaining checks are human/device/production-field validation. G7 implementation is ready; internal-demand ranking, qualified local occupation/regional review and post-release search evidence remain validation pending.

## Integration decisions

- The G6 `/features/` namespace and G7 `/resources/`, `/occupations/` and `/compare/` namespaces share one public registry, metadata/schema generator, sitemap, browser guard, link graph and route-quality suite.
- The sitemap keeps G6's explicit source-owned review dates. G7 routes received explicit 2026-09-30 review dates; no build time or filesystem time is used.
- G7 source freshness checks ignore only the centrally generated SEO block. All substantive body markup remains exact-source compared, and the SEO generator is immediately verified separately.
- G7's new routes receive G6's local fonts, cache rules, narrow `WebPage` schema and route-specific social cards. Generation increased the deterministic social-card set from 51 to 57.
- Browser integration found and fixed two cross-branch omissions: the early privacy/index guard did not yet recognize `/occupations/` and `/compare/`, and the capability-card action color missed AA contrast by 0.05 ratio points. Both now pass serial all-route validation.

## Verification

- Unified `npm run test:seo`: PASS, 27/27 generator/content/SEO/link/privacy tests.
- Unified `npm run build`: PASS, client TypeScript and 1,869-module production build. Existing non-failing Vercel directive and large-main-chunk warnings remain visible; budgets below enforce the accepted boundary.
- `npm run performance:budgets`: PASS. Homepage 641.9 KiB raw / 183.9 KiB gzip JS; 196.4 / 34.0 CSS; public matcher 25.1 / 8.4 JS; capability CSS 18.6 / 4.9; critical local font 56.0; route social images 705.0 / 264.8.
- Serial public quality + SEO browser suite after fixes: PASS, 4/4 across every allowlisted route, axe, 320/1440 overflow, canonical/noindex and 404 boundaries.
- Built-preview suite before the final static-asset refresh: 20/21 PASS; its sole failure read the pre-fix `dist/resources.css`. The final Vite rebuild then passed, and the focused built-preview all-route accessibility/overflow rerun passed 1/1.
- Server TypeScript after integration fixes: PASS. It caught and prompted correction of an `Object.entries` key-widening issue in the SEO generator that the client project does not include.
- The first four-worker browser gate run was host-saturated: 12 tests passed, 12 navigation/server requests timed out, and one pre-existing lazy-route focus assertion failed. Serial public-route checks are the authoritative G6/G7 result; the failure is preserved here rather than represented as a product pass.
- Branch Claude reviews and resolutions are recorded in the G6 and G7 batch documents. No Claude output is treated as executable verification.

## Evidence boundaries and next inputs

- No production field-performance, Search Console, search-volume, conversion or occupation-demand number is claimed.
- Task 51 now has an externally evidence-selected, nine-category initial portfolio. Internal product/Search Console demand ranking remains VALIDATION PENDING and is not represented as zero or inferred from private content.
- Tasks 52–53 now have current jurisdiction-scoped initial pages; qualified local review remains VALIDATION PENDING.
- Task 55 now publishes five same-session official-source matrices with enforced expiry and explicit unknowns.
- Task 56 can be exercised with real search/index/conversion data only after an approved release; unavailable values remain `unavailable`, never zero.
