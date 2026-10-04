# First APWICO production measurement review — 2026-10-04

Review window: prior seven days where the provider supplied it. This is the first
post-launch review and a zero/low-data result is retained rather than interpreted.

## Production state

- Vercel deployment: Ready; production alias resolves to the current APWICO
  deployment. No server error logs were returned for the prior 24 hours.
- Web Analytics: 72 visitors, 214 page views, 72% bounce rate.
- Top content-free events: `landing_page_view` 62 visitors / 108 total;
  `public_landing_viewed` 28 / 50; `content_page_view` 13 / 85;
  `builder_started` 8 / 22; `jobs_viewed` 8 / 15.
- Device mix: 60% desktop / 40% mobile. These counts are descriptive only and do
  not establish completion, quality, or causality.
- Vercel Speed Insights: desktop Real Experience Score 100 from 295 events;
  mobile score 100 from 17 events. The current plan does not expose LCP/INP/CLS
  values, so no field metric values are invented.
- Search Console performance: property verified, data still processing, no query
  or page data yet.
- Search Console Core Web Vitals: not enough 90-day usage data for mobile or
  desktop.

## Durable outcome measurement

The production schema was missing the four forward migrations shipped with the
release candidate. On 2026-10-04 the already-tested additive migrations were
applied in order without modifying existing rows:

1. content-free evidence review/application-package measurement;
2. manual application workflow;
3. consented voluntary outcomes;
4. APWICO support identity in the stored limit function.

The four exact repository versions were then recorded in
`supabase_migrations.schema_migrations` after their objects and functions were
verified. This prevents a later migration runner from mistaking the manually
applied production changes for unapplied work.

Post-migration verification: required tables and RPCs exist; evidence reviews,
application-package conversions, outcome reports, and application workflows each
contain 0 rows. The empty result is the honest production baseline. No resume
text, job text, URL, notes, contact data, or raw account identifiers were read or
reported.

North-star rate is therefore **not calculated**: numerator and qualifying-review
denominator are both zero. Funnel events prove ingestion but not conversion.
Re-run the same review after at least 100 eligible owners or 30 conversions, and
retain the existing minimum-sample/methodology rules.

## Gate result

- North-star storage and qualification semantics: PASS after schema correction.
- Closed-vocabulary, content-free funnel ingestion: PASS.
- Privacy boundary: PASS; dashboard and database review used aggregates only.
- Outcome collection foundation: PASS; zero consented reports.
- Search/indexing process: PASS; provider correctly reports processing/no data.
- Error monitoring: PASS for the inspected 24-hour window; absence of logs is not
  a guarantee of zero client-side errors.
- Field performance: VALIDATION PENDING because metric-level CWV and physical
  low-powered-device evidence remain unavailable.
