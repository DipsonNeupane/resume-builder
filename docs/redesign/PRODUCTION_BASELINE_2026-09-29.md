# Production baseline before redesign

Captured read-only on 2026-09-29 in America/Chicago. No production, analytics, account, billing, database, extension, domain, or deployment setting was changed.

> Historical boundary: this snapshot describes production before the redesign. The isolated redesign branch now adds content-free, owner-scoped evidence-review and application-package conversion records, but those undeployed changes do not alter the figures or “not instrumented” labels below.

## Source and deployment control

- Production commit/deployment: `16e03e3` / `dpl_9FFi7Wzw99Tm5BFisx7abZbSuJhH`.
- Production branch: GitHub `master`, auto-connected to Vercel production.
- Baseline product remains live. Redesign starts from the same commit in an isolated worktree.
- Current source checkout contains later local-only work; it is not treated as production behavior.

## Live traffic snapshot

Vercel Web Analytics, Production, last seven days (`Sep 22, 7pm – Sep 29, 7:59pm` as displayed):

| Measure | Baseline |
| --- | ---: |
| Visitors | 41 |
| Page views | 76 |
| Bounce rate | 63% |
| Homepage visitors | 39 |
| `/resources` visitors | 5 |
| `/tools/resume-job-match` visitors | 2 |
| Google referrer visitors | 10 |
| Desktop share | 54% |
| Mobile share | 46% |
| United States share | 98% |
| India share | 2% |

The sample includes owner/test/launch activity and is not a statistically reliable worldwide demand estimate.

## Live custom-event snapshot

The dashboard exposed these top events as visitor count / total count:

| Event | Visitors | Total |
| --- | ---: | ---: |
| `landing_page_view` | 22 | 45 |
| `content_page_view` | 6 | 11 |
| `builder_started` | 4 | 18 |
| `jobs_viewed` | 4 | 7 |
| `saved_jobs_viewed` | 4 | 6 |

Lower-ranked events were not visible in the captured default dashboard view. Absence from this table is not recorded as zero.

## Live performance snapshot

- Desktop Vercel Real Experience Score: **71 — Needs Improvement**, based on the displayed 83 events.
- Mobile: **No events collected** for the selected production seven-day view.
- Individual FCP/LCP/INP/CLS/FID/TTFB values were not available in the current plan view.

## Production capability baseline

Verified from the production commit and deployment record:

- Worldwide/all-occupation flexible resume builder; seven Free and twenty Premium templates.
- Best-effort browser-local DOCX and text-PDF import with explicit review.
- Local/session master drafts; production cloud master saving remains disabled.
- Authenticated server-generated PDF and editable Word export with shared allowance.
- US-only new paid subscriptions: individual Premium template and Pro; recurring terms/cancellation behavior are implemented.
- Authenticated job search/save, evidence-based Match, explicit clarifications, Pro job-specific versions, and reviewable grounded AI suggestions.
- Published extension 0.2.0 is the production public version. Submitted 0.2.1 remains pending review and must not be described as published.
- Public resources and browser-local free tools exist; private app states remain query-driven/noindex.

## Baseline coverage against Blueprint task 5

| Required measure | Baseline state |
| --- | --- |
| Homepage primary/secondary CTA rate | Not measurable: no distinct CTA/journey events |
| Builder start | Available (`builder_started`) |
| First-field completion | Partial (`resume_created`), manual-only and no clean denominator |
| Import start/success/failure | Not instrumented |
| Time to usable master | Not instrumented |
| Template preview/selection | Selection exists; preview is not instrumented |
| Confirmation/export success | Present, but repeat confirmation/document scope need correction |
| Job search start/success/empty/error | Success + empty bucket present; start/error missing |
| Job saved/duplicate | Save success present; duplicate result missing |
| Match opened/requirement rows reviewed | Visibility present; requirement review missing |
| Clarification start/completion | Not instrumented |
| Job-specific version started | Not instrumented |
| AI accepted/rejected/manual rewrite | Accepted/rejected present; manual rewrite missing |
| Upgrade viewed/checkout started | Present |
| Return use during active search | Not defined or instrumented |

## Privacy and quality baseline

- Central analytics uses closed event/property lists, production-origin checks, sanitized paths, no query/hash, and coarse properties.
- Server diagnostics use fixed schemas and content-free categories.
- Tests cover hostile/private URLs and reject secret-looking values.
- Production static resource/tool analytics used separate storage parsing at baseline; the redesign branch now applies explicit attribution/event key allowlists as defense in depth.
- Test inventory covers browser, auth, paid, server/billing, database/concurrency, extension, SEO, tools, accessibility, and exports.
- No GitHub Actions workflow or enforced branch/status protection currently makes those gates automatic.

## Interpretation rule

This report freezes what can be observed before redesign. “Not instrumented” is not zero. Future comparisons must retain the same environment, date range, visitor/event basis, and contamination notes, and must separate redesigned preview traffic from production traffic.
