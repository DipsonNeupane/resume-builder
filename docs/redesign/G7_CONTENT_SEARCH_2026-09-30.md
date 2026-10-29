# Group 7 content and search batch — 2026-09-30

Scope: isolated `redesign/g7-content-search` worktree only. No production, provider, hosted data, push, merge, release or deployment action occurred.

## Task ledger

| Task | Status | Repository evidence and honest boundary |
| --- | --- | --- |
| 47. Evidence-first resource cluster | COMPLETE | Twelve substantive guides, three working browser-only tools and the resource hub follow requirement → evidence → user decision → separate tailored version. |
| 48. Seven intentional content clusters | COMPLETE | `contentClusters` defines seven non-overlapping problem-led clusters; the generator and automated check reject missing/orphaned guides. |
| 49. High-intent product landing pages | COMPLETE | The existing permanent working tools cover requirement extraction, resume/job evidence and bullet review. G7 links into the shared G6 `/features/*` capability architecture rather than creating competing routes. |
| 50. Useful template resources | COMPLETE | Template choice, A4/Letter and local-expectation guides provide practical decisions; the template gallery links them beside the verified registry and preview-first path. |
| 51. First occupation-set research | VALIDATION PENDING | Nine roles span nine evidence categories using current official external evidence. Private product/Search Console demand ranking remains unavailable and awaits validation. |
| 52. Occupation hub architecture/content | VALIDATION PENDING | Nine substantive pages now carry dated jurisdiction sources, evidence examples, safe template links and direct product entry. Qualified local/occupation review remains. |
| 53. Regional/international guidance | VALIDATION PENDING | The guide and maintained `/regions/` matrix cover five official services with explicit unknowns and omitted-region boundaries. Local human review remains. |
| 54. Internal linking system | COMPLETE | Cluster membership, three related-guide edges per article, contextual tool CTAs, template-resource links and occupation/comparison paths are source-driven and link-checked. |
| 55. Factual comparison architecture | COMPLETE | Five named pages use official, dated evidence, balanced strengths/limits, symmetric APWICO boundaries and enforced 30/90-day expiry. |
| 56. Search-performance review | VALIDATION PENDING | The repeatable privacy-safe review process, five-problem intent taxonomy, CSV schema and zero-data dry run are complete. Search Console/index/field results require a future released surface. |

## Audience and page hierarchy

The resource architecture explicitly answers:

1. Am I qualified for this job?
2. Does my experience actually demonstrate what they want?
3. Is this job worth applying to?
4. What am I missing or need to clarify?
5. How should I tailor my resume for this specific job?

The index keeps these questions visible while preserving seven editorial clusters: role fit; requirement evidence; application decisions; truthful tailoring; master resumes/career transitions; writing/keywords; and templates/formats/regional context. Every page leads to a working evidence tool, template inspection, master-resume builder or current trust/pricing boundary—not a generic lead form.

## Research and source ledger

Checked 2026-09-30. Facts remain jurisdiction-scoped and links point to primary/official sources.

| Use | Source | Boundary |
| --- | --- | --- |
| Worldwide occupation taxonomy | https://isco.ilo.org/ | ISCO groups work by tasks/duties for international comparison; it is not a resume rule or demand ranking. |
| US occupation content | https://www.onetcenter.org/db_releases.html | O*NET 31.0 was the current listed production release; US-specific detail does not establish global requirements. |
| US outlook cross-check | https://www.bls.gov/ooh/ | BLS evidence is US-only; no wage/outlook number is published in APWICO’s current pages. |
| England CV starting point | https://nationalcareers.service.gov.uk/careers-advice/cv-sections | Advice is scoped to that public service and can change; employer instructions still control. |
| European Union CV starting point | https://europass.europa.eu/en/create-europass-cv | Europass is one official EU option, not a universal European employer requirement. |
| Canada resume starting point | https://www.jobbank.gc.ca/findajob/resources/write-good-resume | Canadian guidance is not generalized to other countries. |
| Australia application starting point | https://www.workforceaustralia.gov.au/individuals/coaching/job-applications/job-application-tips | Australian guidance is not generalized to other countries. |
| New Zealand CV starting point | https://www.careers.govt.nz/how-to-get-a-job/cvs-and-cover-letters/ | The public guidance is linked with its own current page context. |
| Comparison pricing evidence | https://www.tealhq.com/pricing | US/English/USD source; next pricing review 2026-10-30; used with symmetric APWICO boundaries. |
| Comparison feature evidence | https://help.tealhq.com/en/collections/9568976-resume-builder | English help source; next feature review 2026-12-29. |

`src/content/comparisons.ts` and `src/content/comparisonEvidence.ts` are the source and flattened research ledger. Pricing evidence expires after 30 days; feature evidence after 90 days. Teal, Huntr, Jobscan, Resume.io and Enhancv have named pages; Jobscan pricing remains explicitly not established.

## Architecture

- `src/content/guides.ts`: editorial source, seven clusters and twelve guides.
- `scripts/render-resources.ts`: statically renders the cluster hub/articles and related links.
- `src/content/searchHubs.ts` + `scripts/render-search-hubs.ts`: substantive hubs plus nine occupation and five comparison detail routes.
- `src/content/comparisonEvidence.ts`: typed primary-source research records with locale/currency/freshness fields.
- `scripts/check-search-content.ts`: rejects cluster orphans, thin source records, missing output and accidental named comparison URLs.
- `docs/redesign/SEARCH_PERFORMANCE_REVIEW.md`: recurring privacy-safe search review and dry-run boundary.
- Canonical/noindex/sitemap/link/accessibility coverage continues through the shared SEO policy and public route-quality suite.

The structure does not pre-empt Group 8: Match methodology can later receive its own sourced page; outcome collection stays separate from content analytics; cloud-saving claims remain feature-gated; paid availability stays jurisdiction-specific; and locale URLs are withheld until interface/content translation is actually reviewed.

## Verification evidence

- SEO generation freshness + content contract + server SEO: PASS (24/24).
- Production build/client TypeScript: PASS (1,869 modules; existing non-failing large-chunk warning retained).
- Public route accessibility/responsive/console/link checks: PASS across the complete allowlist at 320px and 1440px, including axe (1/1 browser suite).
- Static performance budgets: PASS (initial JavaScript 639.6 KiB raw / 183.2 KiB gzip; initial CSS 196.2 / 34.0; public matcher 25.1 / 8.4; template assets 0.6 / 0.4 JS and 5.6 / 1.7 CSS).
- `git diff --check`: PASS before final documentation-only edits. `graphify update .` was attempted and time-boxed after two minutes without output while the sibling G6 worktree was updating the shared repository graph; no graph completion is claimed for this branch.

## Claude independent review

Two repository-browsing review attempts exhausted their configured turn limits without a verdict. A final bounded review received the complete tracked diff on standard input and returned eight finding groups. Resolutions:

- Added an exact one-cluster-per-guide count assertion and metadata/source parity tests; the five audience problems remain explicit in code and tests. The application-decision guide’s content directly covers skip/pursue/time-allocation decisions despite its tailoring-oriented search title.
- Replaced the generic short-answer heading on the four new formats/transition/regional pages with page-specific headings.
- Confirmed all five regional URLs from official sources on 2026-09-30 and retained the visible checked date. Verified A4/Letter, RTL/LTR, Unicode and server-export statements against the template registry, builder/export source and existing contract tests.
- Reduced the A4 guide’s regional overlap to a short handoff; removed the mobile rule that hid cluster-card explanations.
- Added middleware metadata parity checks and reciprocal links from existing guides into the new career-transition guide.
- Confirmed content analytics accepts only bounded token values and never reads page/user content; the new destinations meet that contract.
- Confirmed `search:check` and the focused server suite enforce cluster integrity, route presence, source boundaries, comparison suppression, private query handling and zero-data review truth.
- Kept the recommendation to give the gallery guidance block a unique style class as non-blocking presentation cleanup: the reused class is semantic-neutral, has correct heading structure and passes narrow/wide axe and overflow checks.

No actionable privacy, crawl/index, unsupported-claim or accessibility finding remains from that batch. The later evidence-closure review and resolutions are recorded in `G7_EVIDENCE_CLOSURE_2026-09-30.md`; internal demand and qualified local review remain Validation Pending rather than being fabricated.
