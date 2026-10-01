# G6 completion evidence — 2026-09-30

This record covers only the isolated `redesign/g6-completion` branch. It does not describe a production release, deployment, push or merge, and it does not fabricate production field performance.

## Task status

| Task | Status | Implementation and automated evidence |
| --- | --- | --- |
| 38. Permanent public capability URLs | **COMPLETE** | `/features/` and four meaningful detail URLs cover master resume building, requirement-level Match, job-specific resumes and concrete PDF/Word export behavior. Each page is static, canonical, indexable, internally linked, responsive and bounded to repository-verified behavior. |
| 39. Indexable template pages | **COMPLETE** | The registry remains the source for the gallery and all 27 permanent template URLs. Route parity, canonical metadata, discoverable links, access facts and preview-before-purchase boundaries are generator-tested. |
| 40. Accurate structured data | **COMPLETE** | Every public page receives source-generated `WebPage` JSON-LD; the homepage also receives `WebSite`. Tests reject unsupported `JobPosting`, `Review`, `AggregateRating`, `Offer` and `SearchAction` nodes and commercial/outcome properties. No schema is inferred from private state. |
| 41. Truthful sitemap dates | **COMPLETE** | Every allowlisted URL has an explicit authored/reviewed `lastModified` value in the public-page registry. The sitemap copies those dates. Build time, filesystem mtime and current time are never used. Tests reject omissions, future dates and registry drift. |
| 42. Unique social-image architecture | **COMPLETE** | Every public route owns a deterministic 1200×630 PNG path. Generation is content-free and reproducible; freshness, file existence, dimensions and per-route hash uniqueness are enforced. Metadata uses the page title as alt text. |
| 43. Font delivery | **COMPLETE** | Primary UI fonts are self-hosted WOFF2 with system fallbacks and `font-display: swap`; the one critical sans asset is preloaded. Remote Google font imports and CSP hosts were removed. Font size and remote-request absence are budgeted/tested. |
| 44. Static caching and bundle delivery | **COMPLETE** | Hashed `/assets/` use one-year immutable caching. Fonts/social cards use bounded revalidation. Mutable public HTML, scripts, CSS, robots and sitemap revalidate. Query/private workspace state remains `private, no-store`. Existing feature chunk boundaries remain budget-enforced. |
| 45. LCP and low-powered-device protections | **VALIDATION PENDING** | Implementation and automation cover lab LCP/CLS/interaction ceilings, bounded initial JS/CSS, font preload/swap, idle-only WebGL, data-saver, two-core fallback and reduced motion. Physical low-powered devices and post-release field CWV still require validation. |
| 46. Recurring technical quality gate | **VALIDATION PENDING** | The complete local gate now runs for pull requests, manual dispatch and a weekly repository-fixture drift schedule with read-only permissions. It covers generation, crawl/index boundaries, structured data, social/font/cache budgets, public accessibility/overflow, private ownership and document smoke tests. Physical-device/assistive-technology and production-field validation remain. |

## Architecture

- `middleware.ts` is the self-contained public-route and response-policy registry. Its page records own canonical title, description, explicit review date and social asset. Public page data contains no account or user content.
- `src/content/capabilities.ts` owns factual capability copy. `scripts/render-capabilities.ts` generates the static hub/details and has a freshness check.
- `scripts/generate-seo.ts` applies one metadata contract to all public HTML and creates the sitemap from the allowlist. Its structured data uses only `WebSite` and `WebPage` facts visible on the page.
- `scripts/generate-social-images.ts` creates deterministic route-specific images without resume, job, account or analytics content.
- `/fonts.css` exposes the minimum brand faces from locally stored WOFF2 assets. Resume-document fonts remain independent.
- Cache policy is asserted both in the self-contained middleware and deployment configuration. URLs with query state and every private workspace URL remain no-store/noindex.
- G7 can extend the same registry with `/resources/`, `/occupations/`, `/regions/` and `/compare/` entries without changing the `/features/` contract.

## Verification evidence

- `npm run test:seo`: **PASS**, 22/22 server/generator tests.
- Client TypeScript within `npm run build`: **PASS** before the final review-only fixes. The same run reached Vite after 8m17s, but Vite read `middleware.ts` during an atomic patch replacement and reported the temporary partial file. The final complete file then passed the runtime compilation/execution tests in `test:seo`. Per the repository's known Documents-volume ceiling, a third full build was not started; integration must run the normal gate once after combining G6/G7.
- `npm run performance:budgets`: **NOT RUN against a final `dist/`** because the interrupted Vite run had cleared it. Source-level font/social ceilings are committed in the budget script and must run in the integration gate after its build.
- Public browser quality/accessibility/overflow and built-preview performance: **NOT RERUN** in this branch after the final review fixes; the gate now includes the 1024px public-page viewport and low-core coverage and must run at integration.
- Server/G6 TypeScript: the self-contained middleware and every generator executed through `tsx` in the 22/22 SEO suite. The independent full server project was not rerun because this batch did not change server code.
- `git diff --check`: **PASS**.
- `graphify update .`: **PASS**, AST-only refresh to 3,063 nodes / 6,600 edges / 215 communities.

Lab budgets and automated browser observations are not production field data. The only previously captured production snapshot remains the baseline in `PRODUCTION_BASELINE_2026-09-29.md`; this batch does not reinterpret it.

## Independent Claude review

Claude reviewed the complete diff silently and did not edit files. It found one critical, three high, three medium and five low items. The actionable findings were resolved as follows:

- Added `/features/` to both the early browser guard and public-anchor policy, with static guard cases proving the capability pages retain index/canonical/schema state.
- Replaced misleading borrowed font family names with truthful `APWICO Sans`, `APWICO Serif` and `APWICO Mono` aliases, declared only supported weights, removed the redundant absolute CSS import, and updated the font-vendoring source so regeneration preserves `swap`.
- Made social-image bytes depend on the route's title, description and explicit review date; corrected the brand-stroke direction; and replaced title-like alt text with an accurate description of the abstract image.
- Recorded the repository-wide 2026-09-30 review date while retaining authored/reviewed dates at each route call site. This removes the mismatch with the visible September 27/28 policy dates and the September 30 commercial review.
- Removed duplicate font preload, stylesheet and guard tags from the capability shell; the central SEO generator remains their single owner.
- Added the 1024px public-route overflow pass and restored the legacy shared social-card path as a mutable compatibility asset.
- The duplicate cache declarations remain deliberately defense-in-depth and are compared by tests. The generator check deliberately ignores the centrally owned SEO block only because `test:seo` immediately checks the central output.

Claude separately confirmed that the capability claims match repository behavior, schema types are appropriately narrow, private/query routes remain no-store/noindex, CSP font sources are local, and the two-core low-power path is real. Its inability to run commands in the silent Claude environment is not treated as verification; only executing-agent results above are counted.
