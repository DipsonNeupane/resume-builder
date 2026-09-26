# ResumeStride V1 — final launch checklist

## Current candidate update — September 26, 2026

**Owner-approved locked production launch is complete and healthy.** Production migration
history contains all 25 files, `master` is pushed at `11a62c0`, Vercel deployment
`dpl_6TZxBHapU6woWZ4TtEUn6L6zcZ6E` is Ready, and authenticated production acceptance passed
for landing, Jobs/Match, builder, account/billing status, privacy, terms, and custom 404.
No error-level or 5xx Vercel logs were present during the acceptance window. Password
Protection remained active and externally returned HTTP 401 throughout that review. The
owner explicitly authorized removing that protection after this verified checkpoint; final
public HTTP/SEO/security verification must immediately follow the switch.

Accepted follow-ups that are not falsely claimed as completed: populated physical restore
with measured RPO/RTO, native PostgreSQL concurrency on a host with `initdb`, and final
owner/legal/provider-policy review. The web V1 launch excludes the Chrome extension, which
remains V1.1.

The Patina/copy candidate is checkpointed at `fa9ff43`; the remaining launch-readiness
fixes are local on `ui/final-launch-polish`. The dated Task #64 findings below remain useful
as audit history, with these corrections:

- The seven-template database-validator blocker is fixed by a new forward migration and the
  repository now contains 25 migrations. Full disposable migration replay/pgTAP passes.
- Standalone Vercel packaging passes for middleware, PDF/DOCX and all 11 API functions,
  including `jobs-search` and `jobs-account`; every offline API probe fails closed at 503.
- Default browser acceptance passes 74/74 in Chromium, Firefox and WebKit (148/148 in the
  final combined Chromium/WebKit run). Paid 72/72, auth 40/40, extension 42/42, server/billing,
  database, SEO, app/server TypeScript and production build pass in this candidate's local
  evidence. The extension remains explicitly deferred to V1.1 and does not block web V1.
- Native PostgreSQL concurrency remains blocked because `initdb` is not installed. The
  populated restore, current hosted catalog/config inventory, legal/provider review,
  synthetic protected-production acceptance and owner opening decision remain real gates.
- After explicit owner approval, production migration history now contains all 25 candidate
  migrations through `20260926120000_jobs_refresh_reservations`. Both new functions were
  verified security-definer with an empty pinned search path and execute privileges only for
  Postgres/service-role, not browser roles. The pre-migration scheduled physical backup shown
  is September 26 08:39:28 UTC; snapshot presence is not a populated restore drill.
- Deployment Protection remains required. No merge, push, deployment, migration, DNS,
  provider purchase/call, charge or public-access change is authorized by this checklist.

Task #64 / Task H, September 25, 2026. **HOLD: this candidate is not ready to open to users.**
This local audit does not change or certify the historically deployed website. No external
actions, deployment, hosted migration, provider call, access-lock change or store submission
were performed. Existing unrelated work is preserved. All unchecked items remain pending.

## Tasks A–G reviewed

| Task | Local implementation / preparation inspected | Remaining acceptance |
| --- | --- | --- |
| A — SEO (#54) | Shared request policy, middleware/Vite adapter, private-state guard, generated metadata/robots/sitemap; exact extension source-module exception | Fresh browser regression; deployed middleware/headers/redirects/404/cache/crawler checks; owner search setup. [Details](docs/TECHNICAL_SEO.md) |
| B — security/privacy (#56) | Auth/owner boundaries, service-only Jobs RPCs, durable search throttle, import/export and AI safeguards; corrected overstatements in the privacy checklist | Current dependency advisory scan, hosted isolation and abuse-control decisions. [Security](docs/SECURITY_REVIEW.md), [disclosures](docs/PRIVACY_DISCLOSURE_CHECKLIST.md) |
| C — diagnostics (#57) | All 11 API wrappers, fixed diagnostic schema, sanitized analytics, bounded local browser/extension diagnostics | Configure retention/operators/alerts and AI-budget monitoring; prove alert delivery and hosted payload privacy. Browser-only errors have no central transport. [Details](docs/OBSERVABILITY.md) |
| D — performance (#58) | Lazy feature/import chunks, semantic Suspense fallbacks, corrected price alignment; main JS now 528,362 bytes versus recorded 596,157 baseline (~11% smaller) | Fresh pricing/axe verification; measured mobile, large-document and rerender review remains deferred. Existing >500kB warning is not resolved. |
| E — accessibility/compatibility (#59) | Dialog/menu focus, delayed/cached route-heading focus, strict unique Home assertions, responsive/axe and three-engine coverage | Execute full browser matrix; physical-device, screen-reader, visual and PDF/DOCX review. [Details](docs/ACCESSIBILITY_COMPATIBILITY.md) |
| F — production/cloud (#60) | 23-migration inventory, rollout/recovery plans; fresh disposable SQL probe confirms four-template master-save defect | Forward fix, storage/recovery decisions, catalog reconciliation, packaged Jobs checks, populated restore and hosted acceptance. [Audit](docs/PRODUCTION_READINESS_AUDIT.md) |
| G — extension (#61) | MV3 v0.2.0 production ZIP, exact production destination, package security gate, drafts and supported-site limits | Exact-artifact toolbar/live-site acceptance, privacy notice, assets/reviewer setup and separate store authorization. [Store plan](docs/EXTENSION_STORE_READINESS.md), [acceptance](docs/EXTENSION_LIVE_ACCEPTANCE.md) |

## Fresh local evidence

| Check | September 25 result |
| --- | --- |
| `arch -arm64 npm run test:server` | **PASS 378/378**, no skips; fixture providers |
| `arch -arm64 npm run test:db` | **PASS 553 pgTAP assertions** plus historical accounting; disposable PGlite |
| `arch -arm64 npm run test:seo` | **PASS 12/12**, generated artifacts current |
| Build/client typecheck; `arch -arm64 npm run check:server` | **PASS** with installed ARM esbuild override for build; existing Analytics/chunk warnings |
| Extension build, `package:extension`, `check:extension-package` | **PASS**, 16 runtime files / 39,156 uncompressed bytes; 2 packaging regression cases |
| Targeted pricing/focus; full default/auth/paid Chromium/Firefox/WebKit; extension | **BLOCKED before assertions:** localhost `listen EPERM` on 5183/5174/5181/5185 |
| Direct engine launch probes | Chromium installed but Mach-port permission denied (1100); Firefox 1543 / WebKit 2359 missing |
| `arch -arm64 npm run test:db:concurrency` | **BLOCKED:** local `initdb` missing (`ENOENT`); PGlite is not concurrency evidence |
| All-template probe after all 23 migrations | **CONFIRMED DEFECT:** compact/bold/executive/ledger pass client validation, fail database master validation |
| Dependency advisory scan / hosted function packaging / hosted acceptance | **NOT RUN:** external access or separately prepared isolated output required |
| Whitespace/local document links; Graphify AST refresh | **PASS**; 4,231 nodes / 7,333 edges / 403 communities, no API calls |

The literal requested `arch -arm64 npm test` and build initially failed at the known
ARM/x64 esbuild mismatch. Retry using the existing binary only:
`export ESBUILD_BINARY_PATH="$PWD/node_modules/@esbuild/darwin-arm64/bin/esbuild"`.
This resolves the build issue, not listener/browser restrictions. Browser discovery and
historical passes are not fresh runtime acceptance. Temporary logs: `/tmp/resumestride-task64-*.log`;
retain release evidence in a durable owner-controlled location before those files expire.

## Required steps, in order

- [ ] **Engineering — fix cloud saving before enabling it:** add a NEW forward migration
  accepting all seven template IDs; preserve CHECK/grants/search-path protections. Require
  all-template SQL INSERT/UPDATE and cloud-browser tests, including Unicode/RTL. Do not
  edit old migration history. Update Task F's inventory after the fix.
- [ ] **Engineering + owner — settle storage/recovery scope:** bound retained job-version
  count/bytes/write rate and large list responses, or explicitly approve a monitored bounded
  pilot. Job versions have no edit history and survive bookmark removal. Establish support
  recovery, master-history cap handling and account-deletion/subscription reconciliation.
  Cloud UI-off is neither authorization nor a Jobs/version write kill switch.
- [ ] **Engineering — finish local acceptance on a permitted host:** run targeted pricing,
  dialog and delayed-route focus regressions, then default/auth/paid with
  `PLAYWRIGHT_BROWSERS=chromium,firefox,webkit`, extension/package checks, native PostgreSQL
  concurrency, server/database/SEO/build/typechecks. Install missing engines/tools only in
  that authorized environment. Obtain a current `npm audit --omit=dev` result and triage it;
  decide controls for repeated invalid tokens and aggregate multi-account provider abuse.
  Measure mobile and large-resume behavior; resolve regressions without weakening tests.
- [ ] **Owner + engineering — identify the exact candidate and inventory production:**
  capture revision **plus dirty/untracked source**, lockfile, migration checksums, artifacts
  and config names/scopes. Verify current locks, deployed features, environment presence,
  Auth/SMTP/redirects, DNS/HTTPS and runtime privately; do not request secret values in chat.
  Existing setup may already suffice. Source/docs do not prove current dashboard state.
- [ ] **Owner — confirm commercial/provider and policy readiness:** coordinate both
  **US$19.99 / exactly 30-day** Stripe Prices with compatible code/migration; test legacy
  subscription lifecycle, cancellation, reversals and signed webhook delivery. One-time
  remains default, recurring opt-in. Verify model access/cost/funding, Techmap license/quota
  and worldwide/all-occupation coverage. Finalize published privacy/terms, retention,
  deletion/refund/support procedures and truthful cloud/AI/extension availability claims.
  Any real calls, charges or changes belong to a separately authorized test scope.
- [ ] **Owner + engineering — establish recovery before migrations:** reconcile full hosted
  catalog and migration history, rehearse the reviewed missing/forward list in isolation,
  obtain a fresh encrypted recovery point, and complete a populated restore drill with
  measured recovery time/data-loss window and deletion/billing/AI reconciliation. An older
  empty-baseline restore is insufficient. Follow [Task F](docs/PRODUCTION_READINESS_AUDIT.md).
- [ ] **Engineering + owner — release only a locked candidate for acceptance:** extend
  `scripts/check-packaged-functions.mjs` to cover `jobs-search` and `jobs-account` (currently
  omitted), then verify all 11 packaged APIs, PDF x64/fonts and failure boundaries using
  isolated configuration. Separately authorize exact migrations/config/deployment; preserve
  current protection. Complete and sign [production/cloud acceptance](docs/PRODUCTION_CLOUD_ACCEPTANCE.md),
  including two-account isolation, all-template persistence/conflicts, saved jobs/Match,
  job-version reload, consented tailoring/accounting, auth email/recovery and PDF/DOCX quotas.
- [ ] **Owner — complete operational and human acceptance:** configure and test sanitized
  diagnostics/alerts, AI-budget warning, support ownership and rollback artifact/operator;
  inspect actual analytics/referrer traffic. Sign off mobile/tablet/desktop, keyboard,
  screen reader, 200% zoom, international/RTL and multipage PDF/Word results. Verify
  deployed SEO/headers/caching while keeping access protection in place.
- [ ] **Owner — extension release is a separate gate:** validate this exact production ZIP
  through actual toolbar and live supported-site cases; approve icon padding/brand, genuine
  screenshots, 440×280 promo, public privacy notice, secure reviewer account and version
  history. LinkedIn/Indeed remain unsupported. Keep unpublished until acceptance and
  explicit submission approval; a web-only opening requires explicitly excluding extension
  availability from launch claims.
- [ ] **Owner — final opening decision:** review dated evidence for every applicable gate,
  name monitoring/recovery/support owners, and authorize opening access in a separate action.
  Search Console/Bing verification and sitemap submission follow public-host SEO acceptance;
  social publishing/marketing accounts remain separate owner actions. No checklist item
  grants deployment, publication or spending authorization by itself.
