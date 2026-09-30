# Redesign technical quality gate

Status date: 2026-09-29. This is a local and pull-request gate for the isolated redesign. It does not deploy, call live providers, mutate a hosted database or certify production field performance.

## Commands

- `npm run quality:gate` runs the complete release-blocking local gate.
- `npm run quality:gate:static` runs build, hard public-route artifact budgets, both TypeScript boundaries, SEO generation checks, broken-link and route-policy checks, and server PDF/Word smoke coverage without opening a browser.
- `npm run quality:gate:browser` runs the Chromium UI boundary: every public page at 320px and 1440px, the fictional sandbox, lab performance policy, axe, same-origin console/request failures, keyboard navigation, reduced motion, typed route history, owner-scoped saved-object reload/history/account-switch checks, cloud-master recovery checks, SEO behavior, mocked PDF/Word workflow and generated-PDF text extraction.

The pull-request workflow installs a pinned lockfile and Chromium, then runs the complete gate. A failed step stops the workflow with the named boundary visible in its log. The workflow has read-only repository permission and no production credentials.

## Blueprint coverage

| Task 46 boundary | Gate evidence |
| --- | --- |
| Production build and type checking | `build`, then the independent server TypeScript project |
| Broken links | Static crawl of every generated public HTML reference and same-page anchor |
| Canonical, robots and sitemap | Generated-artifact checks plus request-policy and browser checks |
| Structured data | Exact JSON-LD allowlist; unsupported ratings, offers and job claims are rejected |
| Mobile overflow | Every public page at 320px; workspace/international-content checks also retain 390px, 768px and 1920px coverage |
| Keyboard and automated accessibility | Existing keyboard/dialog/focus workflows plus axe on every public page |
| Reduced motion | CSS and scripted scrolling regression coverage |
| Public-route performance | Built entry/CSS and matcher-script ceilings; deferred feature chunks; lab LCP/CLS/navigation signal; idle WebGL and data-saver/reduced-motion behavior |
| Public-page console errors | Same-origin HTTP, request, page and console errors fail the public-page browser test |
| PDF and Word smoke tests | Request/accounting contracts, real DOCX round trip, mocked browser requests and real local generated-PDF text extraction |

## Honest limits

- Core Web Vitals field monitoring cannot be established by a local or pull-request test. It remains partial until an owner-approved redesign deployment collects real traffic in the configured field-performance service. No synthetic score or production threshold is claimed here.
- Lab budgets and field data are kept separate in `PERFORMANCE_BUDGETS.md`; the only current field truth remains the bounded production snapshot already captured there and in the production-baseline document.
- Chromium automation is not physical-device, screen-reader, Safari or Firefox acceptance. Cross-engine and assistive-technology review remains part of later release acceptance.
- A passing local PDF/DOCX smoke test does not prove the hosted Chromium package or every real-world document. Packaged-runtime and representative-document acceptance remain separate release checks.
- Task 38 remains partial: the gate protects the current public/private route contract, but it does not create capability pages before meaningful static HTML exists.
