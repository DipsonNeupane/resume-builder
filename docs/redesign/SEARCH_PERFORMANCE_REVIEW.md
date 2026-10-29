# Search-performance review

Status: implementation complete; meaningful data validation requires a released indexable surface and Search Console access.

## Purpose

Review whether search visitors with a real job-fit or tailoring problem reach useful evidence and continue deliberately. Rankings and raw sessions are diagnostics, not the product outcome. The review never stores resume text, job text, job URLs or other user content.

## Cadence and inputs

- Run once before release as a zero-data dry run, weekly for the first four released weeks, then monthly when volume is sufficient.
- Export page/query data from Search Console by date, country/market and device. Keep small or identifying query rows out of shared reports.
- Join only aggregated, content-free product counts: qualified requirement-level evidence reviews and explicit next-step events. Do not join user content or individual histories.
- Separate production from previews and separate release cohorts so redesign effects are not mixed with the old experience.
- Record unavailable access or insufficient data as unavailable—not zero.

The repository template is `docs/redesign/search-performance-review-template.csv`. It contains headers only; no field results are invented.

## Review sequence

1. **Index health:** submitted versus indexed canonical URLs, exclusions, crawl errors and duplicate canonicals.
2. **Problem intent:** group queries around qualification, demonstrated evidence, apply decisions, gaps/clarification and job-specific tailoring.
3. **Page usefulness:** inspect impressions, clicks, CTR and position together; never treat position alone as success.
4. **Product continuation:** compare aggregate evidence-review and next-step rates for landing pages with enough volume.
5. **Quality sample:** manually review the page against current sources, search intent, accessibility and claim boundaries.
6. **Action:** improve, consolidate, redirect, noindex or retire. Do not create another page merely because a query appeared once.

## Decision record

Each change records the page, problem intent, evidence window, observation, hypothesis, action, owner and next review date. Changes to occupation, regional or competitor facts also update their source ledger and review date. A page with stale or unsupported material is suppressed rather than left public for traffic.

## Privacy and governance

- Use bounded aggregate exports; do not copy full unusual queries that might identify a person.
- Never place pasted resume/job content or job URLs in analytics.
- Do not claim causal impact from a before/after ranking change without a controlled basis.
- Search data may prioritize research; it does not authorize fabricated occupation expertise or regional guidance.
- Future localization uses separate locale URLs only after translated interface/content review; Unicode resume support is not represented as localized guidance.

## Dry-run result — 2026-09-30

The template, five problem-intent taxonomy, route inventory and privacy boundary were checked locally. Search Console credentials, indexed redesigned URLs and post-release field outcomes are unavailable by design in this isolated branch. Task 56 is therefore **VALIDATION PENDING**, not Partial or Blocked.
