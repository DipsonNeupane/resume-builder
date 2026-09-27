# Growth measurement foundation

Baseline date: **2026-09-27**. This is an operational measurement guide, not a claim that a tiny launch sample predicts future performance.

## Stack and owner views

- **Traffic and acquisition:** Vercel Web Analytics → ResumeStride → Analytics. Use Visitors, Page Views, Pages, Referrers and UTM Parameters.
- **Product funnel:** the same Vercel Analytics dashboard → Events. Compare the canonical event sequence below; filter by `surface`, `user_state`, `plan`, `template` or `export_type` where available.
- **Performance:** Vercel → ResumeStride → Speed Insights. The source now mounts Vercel's official Vite/React collector; data begins only after a production deployment and real visits.
- **Organic search:** Google Search Console → the ResumeStride property → Performance and Indexing; Bing Webmaster Tools → ResumeStride → Search Performance and Site Explorer.

No additional analytics provider, custom admin dashboard, session replay, ad pixel or fingerprinting is used.

## Canonical funnel

`VISITOR → BUILDER START → RESUME COMPLETE → JOBS → MATCH → TAILOR → PRICING → CHECKOUT → PRO`

The matching event sequence is `landing_page_view → builder_started → resume_completed → jobs_viewed → match_opened/match_completed → tailoring_started → pricing_viewed → checkout_started → pro_activated`. Alternative paths remain visible because events are independent; a later acquisition surface can enter at Match or another product surface without being forced through Builder.

Supporting events are `resume_created`, `template_selected`, `jobs_search_performed`, `job_saved`, `saved_jobs_viewed`, `suggestion_reviewed`, `suggestion_accepted`, `suggestion_rejected`, `job_specific_resume_completed`, `export_started`, `export_completed`, and `upgrade_prompt_viewed`.

Public acquisition surfaces add two content-only paths: `content_page_view → content_cta_clicked` for the Resources library, and `tool_viewed → tool_started → tool_completed → tool_cta_clicked` for the three free tools. Tool events accept only the closed tool identifier, `success`/`failure` outcome, CTA destination and existing first-touch attribution. Pasted resume, job-description and bullet content never becomes an event property.

## Privacy boundary

Analytics describes what happened, never what a person wrote. The runtime accepts only a closed event and property vocabulary. Allowed properties are coarse: anonymous/authenticated, Free/Pro/Unknown, broad product surface, template identifier, PDF/DOCX, success/failure/blocked, whether a result set was empty, safe campaign tokens and referrer hostname.

Never add resume or job text, names, contact details, raw job searches, source URLs, account IDs, Stripe IDs, request IDs, hashes, tokens, prompts/responses or extension payload content. Analytics is best-effort inside a failure boundary and cannot grant entitlement, consume quota or block a product action.

The public tools run deterministic analysis entirely in the browser. They create no anonymous API or AI request, have no server-side content log and persist no submitted content. `sessionStorage` on those pages is used only for the same bounded first-touch attribution tokens described below—not for tool inputs or results.

## UTM convention

Supported keys: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`. Use short lowercase tokens separated by `-`, for example `?utm_source=google&utm_medium=organic&utm_campaign=launch`. Do not place names, email addresses, search text, job titles or other user content in UTM values.

Only bounded letters/numbers plus `.`, `_`, `~` and `-` are accepted. First-touch UTM values and the referring hostname are retained in `sessionStorage` for the current browser session only. UTM parameters never enter the canonical URL; safe UTM-only landing pages point to the clean page canonical. Mixed, unknown or sensitive query parameters remain noindex and lose canonical/schema metadata.

## Search setup status

- **Google Search Console:** the signed-in account currently lists only `spendpulse.us`; no `resumestride.com` property was present on 2026-09-27. Add a Domain property and verify with the exact DNS TXT value after owner approval, or use a URL-prefix property and a deployed verification artifact. Submit `https://resumestride.com/sitemap.xml` only after verification.
- **Bing Webmaster Tools:** no authenticated ResumeStride dashboard was available on 2026-09-27. After Search Console verification, sign in and prefer the supported Search Console import; otherwise use Bing's exact verification record. Then submit the same sitemap.

Never request indexing for account, builder, Jobs, Match, tailoring, billing, callback, query/private, preview, API or extension-fixture URLs.

## Baseline

Vercel Web Analytics, Production, last 7 days as viewed on 2026-09-27: **28 visitors, 51 page views, 75% bounce rate**. The only page shown was `/`; `google.com` showed 4 visitors as a referrer. The owner's earlier observation was approximately **26 visits and 39 page views** shortly after launch. These values include launch/owner/test traffic and are not statistically meaningful.

At baseline, no custom funnel events existed and Speed Insights reported no data because its collector was not installed. Search Console had no ResumeStride property, so there was no trustworthy Google query/impression/click or indexing baseline. Bing status was likewise unconfigured/unverified.
