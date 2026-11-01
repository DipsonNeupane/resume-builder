# APWICO launch-readiness follow-up — 2026-10-31

All work was in `/Users/dipson/ResumeStride/.claude/worktrees/apwico-launch`, branch `feat/apwico-launch-tracker`.
**Production was not changed:** nothing was deployed, and Stripe, Supabase and DNS were not touched. Nothing was committed or pushed.

## 1. Live end-to-end testing

**Signed-in live testing is blocked.**

- This session has no test-account credentials. Neither this conversation nor the earlier one contains any.
- Even with credentials, I don't type passwords into a production site (apwico.com).
- So none of these were tested live: signed-in journeys, saved jobs, editing tracked applications, Today/Discover/Preferences with data, pilot-code validation, and Stripe price review.

How to unblock it (pick one):

- **(a)** Sign in to the test account yourself in Chrome, then ask me to continue. I'll drive the signed-in session and stop at Stripe's price review.
- **(b)** Give me a staging/preview host with a test-labelled name plus test credentials.

**Signed-out live results:** unchanged from the earlier report (`APWICO_AUDIT_REPORT.md` in this folder).

- Since then, another session fixed and deployed D1, the hero headline overlap (`dpl_2F6C4mLbGYJCkkkB5JkZvA237fTY`).
- The fixes below are local only and are **not live yet**.

## 2. Launch defects fixed (local source)

| Defect | Fix | Verification |
|---|---|---|
| 9 occupation pages missing title, description, canonical and robots | **Cause:** `render-search-hubs.ts` writes those pages with an empty SEO block. It then throws on the expired Teal date before `generate-seo.ts` can fill the block. The same partial run had also stripped font preload, structured data and page-specific social images from 14 resources, regions and compare pages. **Fix:** restored all 23 pages. New `scripts/seo-block.ts` keeps each page's existing complete SEO block when any of the 5 generators rewrites it. The search-hub generator now checks all review dates *before* writing. | New `tests/server/seo-block.test.ts` (fails when a head is stripped). A failed `npm run build` now leaves the working tree unchanged. `generate-seo --check` PASS |
| Signed-out Today reused the My applications description | Today has its own description | `tests/tracker-signed-out.spec.ts` |
| "Download" button on Today and My applications | Removed from tracker pages. It downloaded the resume draft, which isn't on those pages. Kept on the resume workspace. | Same test; it fails against the old code |
| Tests asserting obsolete copy | Updated 10 assertions after confirming current behavior: template counts, review-before-keep, paid-through access after cancellation, consent checkbox off by default with an "until cancelled" disclosure, the homepage "Explore Pro" button, the templates heading | All pass |

**Copy for you to review:** the Pro consent checkbox now reads "I agree to monthly Pro at US$14.99. I can cancel anytime." The previous label explicitly said "recurring monthly subscription". The panel still states "Pro is US$14.99/month until cancelled", but the checkbox itself no longer says it renews automatically. Have someone who knows the auto-renewal disclosure rules check this wording.

## 3. Security follow-up

**npm audit:** 5 high before, 3 high after.

| Package | Reachable in APWICO? | Action |
|---|---|---|
| vite 7.3.6 (dev-server advisories, including cross-origin script execution through custom middleware) | Dev/preview server only. APWICO uses custom dev middleware, so developer machines are exposed; production is static output. | **Updated to 7.3.7** |
| source-map-js 1.2.1 (event-loop DoS) | Build time only, trusted inputs | **Updated to 1.2.2** |
| zod 3.25.76 via puppeteer-core → chromium-bidi (3 entries) | Not reachable: both PDF renderers launch Chrome over CDP, so chromium-bidi isn't used | Recommend puppeteer-core 25.16.0 (bundles zod 4.6.x) after a hosted PDF smoke test; not applied, to avoid changing the production PDF runtime without that check |

**Pilot code:**

- The code-like literal in the two mocked billing test files was replaced with the fictional `FRIENDTEST`.
- HANDOFF.md no longer contains a code value.
- Nothing was ever committed.
- The live code was not rotated.

Your decisions:

- Rotate the code if the uncommitted files or local test reports were shared.
- Consider customer-restricted codes, one per friend.

Other hardening items (CSP `unsafe-inline` styles, the shared throttle, legacy origins, the public fixture page) are unchanged and still open.

## 4. Stale content (proposals; nothing removed)

| Item | Evidence | Proposal |
|---|---|---|
| Competitor pricing claims on all 5 `/compare/*` pages | `src/content/comparisons.ts:15` `pricingReview = '2026-10-30'` (expired). Live pages show plan-structure claims checked 2026-09-30. Blocks `npm run build`. | Either re-check each vendor's pricing source and update the dates, or remove the pricing claims and keep the feature claims (valid to 2026-12-29). I haven't changed or refreshed any claim. |
| Legacy `/api/checkout` and `/api/subscribe`, US$19.99 constants, US$1.99 template renewal line | `server/billing/handlers.ts:33,146`, `server/billing/stripe.ts:10-14` (both fail closed), `server/billing/catalog.ts:7`, `src/features/billing/BillingPanel.tsx` (template subscription renewal line) | Keep until production confirms there are no legacy subscribers |
| `scripts/verify-stripe-test-catalog.ts` | Not referenced anywhere; expects US$19.99 and US$1.99 | Delete (needs approval) |
| `README.md` | Lines 26, 36, 67, 95 (US$1.99/US$19.99, "up to ten", "no application tracking", "only 3 indexable URLs") | Update (needs approval) |
| `.github/copilot-instructions.md` | Line 104: "No server, authentication, payments, or AI", plus JSON backup and print-to-PDF | Rewrite (needs approval) |
| `.env.example:22`, `FINAL_LAUNCH_CHECKLIST.md:109` | US$19.99 / 30-day | Update or mark superseded (needs approval) |

## 5. Build and checks

| Check | Result |
|---|---|
| Client and server TypeScript | PASS |
| Vite production build (to a scratch folder) | PASS |
| Server suite | **534/534** |
| Sign-in suite (simulated) | **42/42** |
| Billing suite (simulated) | **100/100** |
| Default browser suite | **116/117**. `quality.spec.ts` (modern preview) intermittently misses a 5-second builder wait: 1 failure in 21 repeats, and it also failed before these changes |
| Generator `--check` runs | PASS, except `render-search-hubs` |
| `npm run build`, `npm run test:seo` | **FAIL — blocked by** `Teal evidence expired on 2026-10-30` |
| `graphify update .` | 4,032 nodes / 8,444 edges |

**Not deployed.** The normal build is blocked by the expiry guard.

- **Safe way through:** you choose re-verify or remove for the comparison pricing claims. I apply that change, and `npm run build` then passes normally without the override.
- **Alternative:** deploy with the prebuilt override. That ships these fixes but leaves the expired claims live. It's your call.

## Files changed in this session

- New:
  - `scripts/seo-block.ts`
  - `tests/server/seo-block.test.ts`
  - `tests/tracker-signed-out.spec.ts`
- Generators:
  - `scripts/render-search-hubs.ts`
  - `scripts/render-resources.ts`
  - `scripts/render-tools.ts`
  - `scripts/render-templates.ts`
  - `scripts/render-capabilities.ts`
- App:
  - `src/features/applications/ApplicationsWorkspace.tsx`
  - `src/main.tsx`
- Tests:
  - `tests/server/commercial-truth.test.ts`
  - `tests/builder.spec.ts`
  - `tests/accessibility.spec.ts`
  - `tests/shared-discovery.spec.ts`
  - `tests/paid/flows.spec.ts`
  - `tests/billing/offer-catalog.test.ts`
- Generated pages (restored to their committed state): 9 under `public/occupations/*/`, plus `public/occupations/index.html`, `public/compare/index.html`, `public/regions/index.html`, and 13 under `public/resources/`
- Dependencies: `package.json`, `package-lock.json`
- Also: `HANDOFF.md`, `graphify-out/`
