# APWICO V2 pricing and Free experience audit — 2026-10-13

## Implemented release-candidate policy

- New purchase paths are Free and Pro only. Pro is prepared at **US$14.99/month** in code; no live Stripe object or environment variable was changed.
- All 27 templates remain previewable. Seven are included with Free; Pro includes all 27.
- Existing individual-template and US$19.99 Pro subscriptions remain stored, entitled, cancellable, and webhook-reconcilable at their trusted legacy price IDs. They are not migrated or deleted.
- Free keeps the browser-only evidence checker, 7 generated PDF/DOCX downloads per rolling 7 days, limited Match evidence, three manual provider refreshes per rolling 24 hours, and an optional genuine automatic provider refresh about every 24 hours.
- A Free refresh now returns up to 10 defensibly relevant results from one provider page. It never fetches a second page merely to fill the Free ceiling. Pro retains up to 20 results and may fetch the second page.
- Free can save and application-track 10 jobs. Ownership, snapshot bounds, deduplication, transactional enforcement, and the Pro safety ceiling remain unchanged.
- Full Match Analysis, advanced job search without the daily Free cadence, AI-assisted tailoring, and job-specific resume generation remain Pro.
- Paid availability remains United States only.

## Evidence and unit economics

### Job search

The configured provider observed during the production audit was Techmap Basic. The provider's published billing documentation states: 100 requests/month included, 10 postings/request, US$0.06 per additional request, and one request/second on Basic. The repository's prior production benchmark recorded 14 counted requests and 86 remaining, corroborating the 100-request allowance.

The V2 Free change raises results per refresh from 5 to 10 **without raising requests per refresh**: Free uses page 1 only. A durable per-owner rolling allowance permits three manual refreshes per 24 hours. Short-window abuse throttles, shared-cache/coalescing behavior for manual searches, the relevance threshold, and “fewer rather than irrelevant” behavior remain.

Bounded monthly provider-spend options, exclusive of the provider's base plan:

| Global Free request ceiling | Maximum Basic overage | Trade-off |
|---:|---:|---|
| 100/month | US$0 | Safest, but the shared allowance can exhaust early. |
| 500/month | US$24 | Recommended initial launch ceiling; meaningful validation with bounded exposure. |
| 1,000/month | US$54 | More availability, but premature before conversion evidence. |

The owner selected the 500-request ceiling. The server now reserves every actual provider request atomically before dispatch, including automatic refresh and Pro page-two requests, so application-driven usage cannot exceed that ceiling.

### Saved jobs and application tracking

Each accepted snapshot is capped at 150,000 bytes by the server and 160,000 bytes by the database. Ten Free saved jobs therefore expose at most about 1.6 MB of bounded snapshot JSON per Free account before normal row/index/workflow overhead. Current Supabase Pro documentation includes 8 GB database disk with metered overage, but exact production disk occupancy was not available in repository evidence. The ten-job limit is an implementation ceiling, not a storage-cost claim.

### Downloads

Free includes 7 successful server-generated PDF/DOCX downloads per rolling 7 days under the owner-approved override. Transactional reservation, idempotency, render-size, and hourly abuse limits remain in force.

## Owner allowance override and cost ceiling

- Manual refresh: 3 per owner in a true rolling 24-hour window; up to 10 relevant results, never padded with irrelevant roles.
- Automatic refresh: opt-in, server-scheduled hourly and due about every 24 hours. It makes a direct fresh provider request and stores a bounded owner-scoped result; it does not reuse the shared query cache or require an open browser. Enabling it stores only the bounded non-contact evidence shape used for ranking (headline, summary, skills and experience/qualification wording), never contact fields; disabling it clears that evidence from preferences. A cloud master remains an authoritative fallback.
- Global provider ceiling: 500 actual provider HTTP requests per UTC calendar month, atomically reserved in the database across manual, automatic, and optional Pro second-page requests. A cross-account 1.1-second reservation interval also enforces the verified Basic-plan concurrency/rate boundary. When exhausted, fresh searches return an explicit capacity message and automatic refresh records a capacity-waiting state; existing results and saved jobs remain available.
- Verified Techmap Basic pricing evidence in the repository records 100 included requests and US$0.06 per request after that. At the hard ceiling, maximum metered overage is therefore (500 - 100) × $0.06 = **US$24/month**, before any provider plan base charge or taxes. There is no uncontrolled provider-request overage in application code.
- Capacity implication: one continuously active automatic-refresh user consumes about 30–31 requests/month; 10 such users consume about 300–310, before manual refreshes. The global cap controls total spend, so individual refresh availability can end before month-end as active use grows. This is stated honestly in the exhausted-cap UI.

### AI

AI-assisted tailoring remains Pro-only. Existing measured token/cost reservations and the US$25 global monthly budget remain unchanged.

## Stripe preparation and release sequence

The live dashboard audit found an active US$19.99/month Pro product, 20 active US$1.99/month individual-template products, and historical pass products. The provisioning script now creates or reuses only an additive US$14.99 recurring Pro price and prints its new `STRIPE_PRO_MONTHLY_PRICE_ID`; it does not archive or overwrite anything. A controlled release must:

1. run the script in test mode and validate checkout/webhook/account flows;
2. create the additive live US$14.99 price only after owner authorization;
3. deploy code/database migration and set the new Pro price ID together;
4. retain legacy Stripe products/prices and template price mapping for existing renewals;
5. verify one new Pro checkout and legacy renewal reconciliation;
6. roll back the app/environment pointer without deleting either price if verification fails.

Sources checked 2026-10-13: Techmap API errors and billing documentation (`https://api.techmap.io/errors-and-billing`); Supabase billing documentation (`https://supabase.com/docs/guides/platform/billing-on-supabase`).

## Verification evidence

- Database regression suite: PASS. This includes the ten-item Free saved-job ceiling, transactional rejection of item eleven, Pro behavior above the Free ceiling, expiry behavior, ownership/RLS, and legacy template-subscription entitlements.
- Client typecheck and production build: PASS. Static pricing/template pages were regenerated and all 27 template previews remain present.
- Performance budgets and SEO/content/route-policy checks: PASS.
- Public browser regression: PASS after focused reruns (pricing, trust, template preview/purchase separation, mobile keyboard navigation, accessibility, responsive overflow, and public-page quality).
- Paid-browser regression: PASS — 82/82 tests, including the corrected Free allowances, billing/paywall behavior, ownership boundaries, responsive states, and existing-subscription compatibility.
- Tailoring economics benchmark: PASS using the proposed US$14.99 denominator; no provider calls were made.
- Independent adversarial review identified three release risks and each was corrected: an already-paid pre-cutover US$19.99 checkout can reconcile from its immutable trusted price; Free and Pro provider-result caches are separated by retrieval depth; and database fixtures now assert the ten-item Free ceiling.
- Live Stripe mutation, deployment, and provider changes: NOT PERFORMED.
