# APWICO V2 pricing and Free experience audit — 2026-10-13

## Implemented release-candidate policy

- New purchase paths are Free and Pro only. Pro is prepared at **US$14.99/month** in code; no live Stripe object or environment variable was changed.
- All 27 templates remain previewable. Seven are included with Free; Pro includes all 27.
- Existing individual-template and US$19.99 Pro subscriptions remain stored, entitled, cancellable, and webhook-reconcilable at their trusted legacy price IDs. They are not migrated or deleted.
- Free keeps the browser-only evidence checker, 3 generated PDF/DOCX downloads per fixed 30-day period, limited Match evidence, and one provider refresh per 24 hours.
- A Free refresh now returns up to 10 defensibly relevant results from one provider page. It never fetches a second page merely to fill the Free ceiling. Pro retains up to 20 results and may fetch the second page.
- Free can save and application-track 10 jobs. Ownership, snapshot bounds, deduplication, transactional enforcement, and the Pro safety ceiling remain unchanged.
- Full Match Analysis, advanced job search without the daily Free cadence, AI-assisted tailoring, and job-specific resume generation remain Pro.
- Paid availability remains United States only.

## Evidence and unit economics

### Job search

The configured provider observed during the production audit was Techmap Basic. The provider's published billing documentation states: 100 requests/month included, 10 postings/request, US$0.06 per additional request, and one request/second on Basic. The repository's prior production benchmark recorded 14 counted requests and 86 remaining, corroborating the 100-request allowance.

The V2 Free change raises results per refresh from 5 to 10 **without raising requests per refresh**: Free uses page 1 only. The durable per-owner once-per-24-hours reservation, short-window abuse throttle, shared cache, request coalescing, relevance threshold, and “fewer rather than irrelevant” behavior remain.

Bounded monthly provider-spend options, exclusive of the provider's base plan:

| Global Free request ceiling | Maximum Basic overage | Trade-off |
|---:|---:|---|
| 100/month | US$0 | Safest, but the shared allowance can exhaust early. |
| 500/month | US$24 | Recommended initial launch ceiling; meaningful validation with bounded exposure. |
| 1,000/month | US$54 | More availability, but premature before conversion evidence. |

**Owner decision still required:** choose the global monthly Free request ceiling. No arbitrary global cap was silently introduced. Until that decision is implemented, the existing per-owner daily limit and provider account limit apply, but total overage is not app-bounded.

### Saved jobs and application tracking

Each accepted snapshot is capped at 150,000 bytes by the server and 160,000 bytes by the database. Ten Free saved jobs therefore expose at most about 1.6 MB of bounded snapshot JSON per Free account before normal row/index/workflow overhead. Current Supabase Pro documentation includes 8 GB database disk with metered overage, but exact production disk occupancy was not available in repository evidence. The ten-job limit is an implementation ceiling, not a storage-cost claim.

### Downloads

Free remains at 3 successful server-generated PDF/DOCX downloads per fixed 30-day signup period. The repository has transactional quota enforcement and export size/abuse bounds, but no verified per-export hosted compute cost or production utilization sample sufficient to justify a higher allowance. Increasing it would be arbitrary.

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
- Paid-browser regression: INCONCLUSIVE in this synchronized worktree. The Vite development server did not finish the first source navigation within a bounded five-minute test timeout; no product assertion ran. Focused server/database billing and entitlement suites pass, but the full release gate is not marked green until this browser run completes in a normal checkout or CI.
- Tailoring economics benchmark: PASS using the proposed US$14.99 denominator; no provider calls were made.
- Independent adversarial review identified three release risks and each was corrected: an already-paid pre-cutover US$19.99 checkout can reconcile from its immutable trusted price; Free and Pro provider-result caches are separated by retrieval depth; and database fixtures now assert the ten-item Free ceiling.
- Live Stripe mutation, deployment, and provider changes: NOT PERFORMED.
