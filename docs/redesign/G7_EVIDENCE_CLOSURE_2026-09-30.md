# G7 evidence-dependent closure — 2026-09-30

Scope: isolated `redesign/shared-route-state` worktree. No production, hosted data, push, merge, release or deployment action occurred. Group 8 did not begin.

## Task status

| Task | Status | Evidence and remaining validation |
| --- | --- | --- |
| 51. First occupation set | VALIDATION PENDING | A nine-role portfolio spans technical, healthcare, operations, education, service, skilled trades, research, creative and leadership work. Selection uses dated official external evidence. Production Search Console, internal search, builder-title and saved-job category demand data remain unavailable; private-demand ranking is validation pending, not treated as zero. |
| 52. Occupation hubs | VALIDATION PENDING | Nine permanent pages include structure, flexible sections, skills in context, fictional strong/weak bullets, common requirement patterns, direct/adjacent/not-demonstrated examples, registry-backed templates, jurisdiction notes and direct Match entry. Automated source/route review is complete; qualified occupation/regulator review remains appropriate. |
| 53. Regional guidance | VALIDATION PENDING | `/regions/` records sourced guidance from Canada, England, New Zealand, Australia and Europass, plus A4/Letter, contact/date, direction, credential and privacy boundaries. It explicitly excludes unsupported regional coverage. Local human review remains pending; no IP inference or global rule is implemented. |
| 55. Factual comparisons | COMPLETE | Five named pages cover Teal, Huntr, Jobscan, Resume.io and Enhancv with official sources, checked/review dates, source locale/currency where established, vendor strengths, unknowns, ResumeStride boundaries and no winner claim. Generation/checks fail after a source review deadline. Jobscan pricing remains explicitly not established. |

## Occupation selection rationale

Internal occupation demand is unavailable because the production Search Console property is inaccessible/not configured for this repository and privacy-safe analytics intentionally do not retain raw job titles, search text, job URLs or user content. The portfolio is therefore editorially selected from external evidence and evidence-shape diversity; it is **not** labelled “top ResumeStride occupations.”

| Category | Initial occupation | Selection evidence |
| --- | --- | --- |
| Technical | Software developer | Current US O*NET plus Canada Job Bank and England National Careers Service cross-checks; external US BLS opening signal. |
| Healthcare | Registered nurse | Current US O*NET and Jobs and Skills Australia evidence with an explicit registration boundary; external US BLS opening signal. |
| Operations | Project management specialist | Current US planning/resource/stakeholder model and England business-project-manager cross-check. |
| Education | Primary school teacher | US elementary-teacher and England primary-school sources expose terminology and credential differences. |
| Service | Customer service representative | US and England sources cover channels, records, complaints and escalation. |
| Skilled trades | Electrician | US and England sources make licensing, supervision, safety and code jurisdiction unavoidable. |
| Research | Social science research assistant | Current US O*NET and Canada Job Bank sources cover data, method, quality and reporting evidence. |
| Creative | Graphic designer | US and England sources connect portfolio output with briefs, production and contribution boundaries. |
| Leadership | General and operations manager | US O*NET and an explicitly legacy/transition-labelled Australian profile expose title/scope variation. |

External demand reference (US-only, not a global ranking): https://www.bls.gov/opub/ted/2026/projected-job-openings-in-occupations-typically-requiring-a-bachelors-degree-2024-34.htm (checked 2026-09-30). Worldwide taxonomy boundary: https://isco.ilo.org/en/ (checked 2026-09-30).

## Source and publication architecture

Public pages show direct sources and checked dates. Typed records live in `src/content/occupations.ts`, `src/content/regionalGuidance.ts` and `src/content/comparisons.ts`. Comparison pricing evidence has a 30-day review deadline; feature, occupation and regional evidence use recorded next-review dates. The generator and `search:check` fail after a deadline, preventing stale evidence from entering a later build unnoticed; already deployed static pages still require the recurring gate and normal release process to replace them. No competitor claim relies on an affiliate/review source, private behavior or inferred outcome.

Regional sources checked 2026-09-30:

- Canada Job Bank: https://www.jobbank.gc.ca/findajob/resources/write-good-resume
- National Careers Service (England): https://nationalcareers.service.gov.uk/careers-advice/cv-sections
- New Zealand Careers: https://knowyourskills.careers.govt.nz/job-hunting/cvs-and-cover-letters/how-to-write-a-cv/
- Workforce Australia: https://www.workforceaustralia.gov.au/individuals/coaching/job-applications/job-application-tips
- Europass: https://europass.europa.eu/en/create-europass-cv and linked profile/privacy guidance

Comparison sources and per-source review dates are rendered on each named comparison and stored in `src/content/comparisons.ts`. Prices are omitted when locale/currency could not be stably established. ResumeStride’s own pricing, trust and Match pages are dated and linked under the same standard.

- `scripts/render-search-hubs.ts` generates three hubs, nine occupation pages and five comparison pages.
- `middleware.ts` is the public allowlist; detail routes receive canonical metadata, sitemap membership, unique social assets and query-state noindex/private-cache behavior.
- `scripts/check-search-content.ts` rejects missing output, category collapse, undated/expired sources and incomplete publication records.
- The older regional-method guide links to `/regions/`; it teaches source order while the matrix owns maintained claims.

## Claude adversarial review

The independent reviewer identified expiry enforcement, asymmetric comparisons, locale loss, occupation review labelling, US framing, duplicate regional ownership, missing coverage boundaries and detail-page footer/breadcrumb issues. Resolved:

- generation fails after recorded review deadlines;
- comparison sources show locale/currency and ResumeStride’s own dated limitations;
- occupation pages show editorial reviewer, review dates, jurisdiction-labelled headings and O*NET 31.0/profile dates;
- additional England/Canada/Australia sources reduce single-country dependence where a direct official analogue exists;
- unsupported demand wording was removed from public occupation copy;
- the regional guide and matrix now have distinct roles and omitted regions are explicit;
- detail pages restore brand, Privacy and Terms links, current breadcrumb state and comparison-specific orientation;
- Jobscan pricing is explicitly unknown and the hub does not promise a pricing record for it.

No owner decision is required. Internal production-demand ranking, local occupational/regional expert review and post-release query evidence remain validation activities rather than implementation blockers.

## Verification record

Source generation, expiry/content contracts and focused content/SEO server checks: PASS (30/30 after the freshness regression was added). Production build/type-check: PASS (1,869 modules; existing non-failing Vercel directive and large-chunk warnings). Static performance budgets: PASS. Targeted G7 browser accessibility, console and 320/1440 overflow matrix: PASS (17 routes). The broader all-public-route run reached a local preview-server connection refusal after many routes; this host failure is not represented as a product pass. `git diff --check`: PASS before the final generated refresh.
