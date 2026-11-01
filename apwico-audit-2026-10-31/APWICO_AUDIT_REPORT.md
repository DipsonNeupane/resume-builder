# APWICO — Testing, Security Audit and Stale-Content Report

Date: 2026-10-31

I didn't change any application code. The only write was `graphify update .`, and I checked that the test runs left the git working tree as it was.

**Which code I tested.** resumestride.com now redirects (308) to **apwico.com**. The live site was deployed from the `.claude/worktrees/apwico-launch` worktree (branch `feat/apwico-launch-tracker`) in its uncommitted state, so I tested and audited that tree. The main checkout at `/Users/dipson/ResumeStride` is an older ResumeStride copy that isn't live.

---

## Task 1 — End-to-end testing

**Blocker: no signed-in testing on the live site.** I found no designated test account. The Chrome profile is signed in to your real account, so I closed that tab after loading the homepage once. Signed-out live checks used a separate headless browser with fictional data and sent nothing to the sign-in or billing services. Signed-in journeys were covered only by the repo's own local suites, which simulate login and billing.

### Live site, signed out (all verified)

| Journey step | Expected | Actual | Result |
|---|---|---|---|
| Page sweep: 24 routes × desktop 1440 / mobile 390 / 320 | 200 status, no console errors, no sideways scrolling, no automated accessibility (axe) violations | All 200, unknown route gives 404; 0 console errors; 0 overflow; 0 axe violations | PASS |
| Private pages hidden from search, `www` redirect, security headers | Private pages marked noindex; `www` redirects (301) | Correct; strict security headers present | PASS |
| Homepage buttons | Each goes to its page | "Find my jobs", "Organize my applications" and "Or build a resume" all route correctly | PASS |
| Homepage headline at 1024–1440px | Fully visible | "Know what happens next." runs 35–80px into the example card and the full stop is hidden (D1) | **FAIL** |
| Navigation, desktop and mobile | Works | Works; the mobile menu button correctly reports open/closed | PASS |
| Sign-up / sign-in form checks | Rejected before anything is sent | Empty, malformed email and short password all blocked; 0 sign-in requests sent (desktop) | PASS |
| Resume builder | Draft survives a page reload | Survived; shows "Temporary draft — this tab only" | PASS |
| Resume upload | Text PDF is read in the browser; wrong file types rejected | Recovered name and employer; a PNG got "Choose a Word (.docx) or PDF file." | PASS |
| Templates | 27 shown, detail pages open | 27 cards; Scholar detail page OK | PASS |
| Resume-vs-job tool (example posting as a paragraph and as bullets) | All 5 requirements found, job title not treated as one | 5/5 for both; empty submit shows a message | PASS |
| Job start: paste a posting (mobile) | All 5 requirements extracted | 5/5 | PASS |
| Pricing vs Terms | Same facts on both | US$14.99, 7 downloads per rolling 7 days, 100 tracked applications, US-only — consistent | PASS |
| Pro page and pilot code, signed out | Sign-in gate, no checkout | Gate shown; code field hidden until sign-in | PASS |
| Today, Discover, My applications, Preferences, signed out | Clear sign-in prompt | All show one. Minor: signed-out Today reuses the My applications description (D4) | PASS |
| Occupation pages' search metadata | Page title and canonical link present | **9 `/occupations/*` pages have no title, description, canonical or robots tag**, yet they are in the sitemap (D2) | **FAIL** |

### Local suites, in the APWICO worktree

- Simulated sign-in suite (`npm run test:auth`): **42/42 pass**. Client and server type checks pass; the production build itself (without regenerating pages) passes.
- Simulated billing suite (`npm run test:paid`): **98/100.** The 2 failures look for an old consent-checkbox label ("recurring monthly subscription"). The checkbox exists with new wording (`src/features/billing/BillingPanel.tsx:132`), so these are out-of-date tests, not a broken checkout.
- Default browser suite (`npm test`): **106/115.**
  - 1 failure is the real D2 bug (`tests/seo.spec.ts`).
  - The other 8 look for old headings or buttons ("Browse resume templates.", "View Pro options", "Start building"). That looks like tests not updated after the Oct 30 copy refresh, but I haven't confirmed each one individually.
- Server suite (`npm run test:server`): **524/529.** All 5 failures check old copy (commercial wording, pricing text, page metadata).
- SEO check (`npm run test:seo`): fails with "Teal evidence expired on 2026-10-30". The same check makes `npm run build` fail.
- `npm audit`: 3 high in production dependencies (zod via puppeteer-core → chromium-bidi), 5 high overall.

### Defects

- **D1 (low, visual).** At 1024–1440px the third headline line overflows into the example card. Steps: open apwico.com at 1440×900. Screenshot: [`hero-1440.png`](hero-1440.png) (in this folder).
  - Measured text right edge vs card left edge: 1024px: 557 vs 477; 1280px: 697 vs 662; 1366px: 744 vs 706; 1440px: 784 vs 745. OK at ≥1680px.
- **D2 (medium, SEO).** `curl -s https://apwico.com/occupations/electrician/ | grep -c '<title>'` returns 0, for all 9 pages listed in the sitemap.
  - Cause: the uncommitted copies of these pages had their SEO block stripped (empty `<!-- seo:start --><!-- seo:end -->`), probably by a page-regeneration run that failed partway, and that state was deployed.
- **D3 (process).** The deploy went out with failing test suites and skipped the normal build.
- **D4 (minor copy).** Signed-out Today page reuses the My applications description. Also, `/workspace/applications` shows a "Download" button when signed out.

### Not tested

Each needs a US test account, or test-mode Stripe keys for the acceptance script:

- sign-up and sign-in on the live site
- saving to an account, job search, and adding/editing tracked applications
- Pro checkout up to Stripe's price review
- live pilot-code validation
- `npm run test:db`, the Stripe test-mode acceptance script and the database concurrency suite

---

## Task 2 — Security audit

### Confirmed findings

1. **Medium — production can't be traced to a commit.** apwico.com was deployed from 88 uncommitted changes, including new security code (`api/validate-pilot-code.ts`) and 2 untracked migrations already applied to production. The deploy happened with failing tests.
   - Impact: you can't rebuild or roll back to a known version, and the security changes haven't been reviewed or saved in git.
   - Fix: commit and push, then deploy only from CI on a clean commit with tests required to pass.
2. **Medium — the live pilot code is written in plain text** in two uncommitted files, `HANDOFF.md` and `tests/paid/flows.spec.ts`. It isn't in any commit or on `origin`, but one `git add` would publish a 100%-off-forever code. It's also a guessable dictionary word.
   - Fix: replace it with a placeholder. Rotate the code if those files have been shared.
3. **Low — pilot redemptions aren't tied to people.** Anyone signed in from the US with the code can redeem it, so one person could use all 3 redemptions with 3 free accounts. The check endpoint also tells anyone holding the code how many uses are left.
   - Fix: issue one customer-restricted code per friend. That means relaxing the `match.customer` rejection at `server/billing/offer-handlers.ts:16`.
4. **Low — vulnerable dependency.** zod 3.25.76 has a high-severity advisory (GHSA-mrhx-c7xc-m3w5). It only comes in through `puppeteer-core` → `chromium-bidi` and doesn't receive user input.
   - Fix: update puppeteer, or pin a patched zod.

### Hardening suggestions

- Remove `'unsafe-inline'` from the CSP's `style-src` (`vercel.json`).
- Login sessions are kept in the browser's localStorage. The strict `script-src 'self'` limits the risk; consider cookie-based sessions.
- Give pilot-code checks their own rate limit. They currently share the 20-per-hour checkout limit (`billing_throttle_subscription_checkout_attempt`).
- Drop the old resumestride.com origins from `requirePost` (`server/http/security.ts:19`) once the transition window ends.
- Stop publicly serving `/extension-fixture/` (see Task 3).
- Add `CRON_SECRET`, `PAID_TERRITORY_MODE`, `STRIPE_AUTOMATIC_TAX_ENABLED`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to `.env.example` (names only).

### Reviewed and found sound

- **Sign-in checks:** the server asks Supabase to verify each token rather than just decoding it, and rejects anonymous users (`server/http/security.ts`).
- **Cross-site requests:** blocked by an exact origin allowlist, a JSON-only rule and bearer tokens with no cookies.
- **Database access rules:** every table has row-level security; all 107 privileged (SECURITY DEFINER) database functions have their default permissions revoked; there's no write path into entitlements or revisions.
- **Stripe:** the webhook verifies Stripe's signature on a size-limited (256 KB) body. Price, account and live/test mode are validated. The pilot discount is rechecked at checkout and again on the $0 invoice (`server/billing/offer-handlers.ts`).
- **Sales restrictions:** the US-only gate blocks when the country is unknown (`server/billing/catalog.ts:90`). The retired legacy sale routes fail closed.
- **Server-side fetching:** no user-supplied URL is ever fetched by the server, and job links must be https on both server and client (`server/jobs/url.ts:17`, `src/lib/applications.ts:89`).
- **PDF rendering:** both renderers run with JavaScript off and all non-`data:` requests blocked (`server/export/render.ts:56`, `template-library/export/premium-pdf.ts:63`).
- **Uploads and CSV:** uploads are parsed only in the browser, and CSV export escapes spreadsheet formulas (`src/lib/applicationCsv.ts`).
- **Scheduled jobs and extension:** cron secrets are compared in constant time with a 24-character minimum. Messages from the extension are only accepted from the same window and origin (`src/services/extensionImport.ts`).

### Limitations

- I ran no tests against production APIs and didn't inspect the hosted database.
- Logging was checked only at its single output point, not at every call site.
- Graphify queries pointed me to the security, webhook and billing modules; the rest of the review was static reading of the code.

---

## Task 3 — Stale content (proposals only, nothing changed)

`graphify update .` rebuilt the graph at **4,023 nodes / 8,385 edges** (284 communities) and saved a backup of the previous graph.

**The live site's public pages are clean:** across all 73 sitemap pages there's no $1.99, $19.99, ResumeStride branding or old download allowance. The stale items are in the repo, plus a few live issues.

| # | Item | Evidence | Proposed action |
|---|---|---|---|
| 1 | Competitor pricing claims on all 5 `/compare/*` pages | Review date passed (`src/content/comparisons.ts:14` = 2026-10-30); live; makes `npm run build` fail | You re-verify the prices and update the date, or remove the pricing claims |
| 2 | 9 occupation pages missing SEO tags | D2 | Regenerate the pages after #1 |
| 3 | `/extension-fixture/job-posting.html` is public | Returns 200 live; used by `tests/extension` and `middleware.ts:156` | Keep it for local tests, exclude it from production |
| 4 | Retired $19.99 sale routes `/api/checkout` and `/api/subscribe` | `server/billing/handlers.ts:33,146` and `server/billing/constants.ts:1` (1999); nothing in the app calls them; they fail closed | Remove only after you confirm no old pass/recurring customers remain. Keep the webhook handling. |
| 5 | Individual template subscription "Renews at US$1.99/month" | `src/features/billing/BillingPanel.tsx:138`, `server/billing/catalog.ts:7` (199) | Only appears for accounts with an old template subscription. Retire once production has none. Your acceptance-test Mandate subscription ended Oct 28. |
| 6 | `scripts/verify-stripe-test-catalog.ts` | Referenced nowhere; expects $19.99 plus 20 × $1.99 | **Delete** — genuinely unused |
| 7 | `.env.example` | Old pass/recurring variables, $19.99 comments, "one-time pass stays the default purchase"; `VITE_BILLING_UI_ENABLED` unused; 5 variable names missing | Update. Keep `STRIPE_TEMPLATE_PRICE_MAP`, which is still used. |
| 8 | `README.md` | :67 lists $1.99/$19.99; says application tracking isn't implemented; "up to ten" applications (now 100); says only 3 pages are indexable (sitemap has 73); old extension zip name | Update |
| 9 | `.github/copilot-instructions.md` | Claims no server, sign-in, payments or AI, plus JSON backup and print-to-PDF — all false | Rewrite those sections |
| 10 | `FINAL_LAUNCH_CHECKLIST.md:109` | US$19.99 / 30-day passes | Mark as superseded |
| 11 | Pilot code in `HANDOFF.md` and `tests/paid/flows.spec.ts` | Security finding 2 | Replace with a placeholder |
| 12 | 16 out-of-date tests | Listed in Task 1 | Update to current copy (this is code) |
| 13 | `docs/` (54 files + 31 under `docs/redesign`), `docs/launch-review.zip`, old main checkout | Internal history; HANDOFF says leave the zip untouched | No action |

### Decision needed

Which items do you approve? Suggested:

- **Now:** #6, #7, #8, #9, #10, #11
- **Needs your input first:** #1 (re-verify competitor prices), #4 and #5 (confirm no legacy subscribers remain)
- **Code changes, only if you ask:** #3, #12

After approval I'll make just the approved changes, run the relevant checks, and run `graphify update .` again.
