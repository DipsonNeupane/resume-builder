# APWICO launch — review package (prepared 2026-10-28)

**Status: ready for owner review before a staging rehearsal. Committed locally as one checkpoint
commit (not pushed). Nothing has been deployed, migrated remotely, or changed in any live provider
or billing setting.**

| | |
|---|---|
| Worktree | `/Users/dipson/ResumeStride/.claude/worktrees/apwico-launch` |
| Branch | `feat/apwico-launch-tracker` — one local checkpoint commit over base `1a883b6` (`git log -1`) |
| Brief | `docs/APWICO-CLAUDE-IMPLEMENTATION.txt` |
| Detailed progress log | `docs/apwico-implementation-progress.md` |
| Terms review notes | `docs/policies/LAUNCH_TERMS_REVIEW.md` |
| Staging commands and expected results | [`STAGING.md`](STAGING.md) |
| Complete test output | [`test-results/`](test-results/) (`00-summary.txt` lists every command and exit code) |
| Screenshots | [`screenshots/`](screenshots/) |
| Sample outputs (fictional data) | [`samples/`](samples/) |

Status words: **Verified** = exercised by an automated test that ran and passed here (local only:
PGlite database, Vite dev server, controlled fixtures). **Unverified** = not exercised. **Blocked** =
needs something outside this repository. Nothing below is verified against hosted Supabase,
Stripe, Techmap, OpenAI, Resend or a deployed site.

## 0. Fourth pass (2026-10-28, afternoon): provenance, AI safeguards, checkpoint, staging review

| # | Request | Status | Evidence |
|---|---|---|---|
| 1 | Persist suggestion provenance with saved versions (AI wording, user wording, user-added facts, requirement and resume references); edits, reloads and historical views correct | **Verified locally** | migration `20261028100000`; `src/lib/tailoringProvenance.ts`; `supabase/tests/tailoring_provenance_ai_safeguards.test.sql` (34); `tests/server/tailoring-provenance-ai.test.ts`; journey A (stored, kept, reload, later edit shows "Edited by you since", kept view unchanged); `jobs.spec.ts` (fact and own-wording origins, undo removes its record); screenshots `a12`, `a13` |
| 2 | Configurable US$25 AI cap; concurrency, exhaustion, clear errors, recovery; failures use no trial run or allowance; no substitute output | **Verified locally**; real-PostgreSQL race harness **not run** (no PostgreSQL binaries here) | `product_settings.ai_monthly_budget_micro_usd` (default and maximum 25000000); trial runs reserved before the provider call and released on failure (this closed a real race: three simultaneous trial requests could previously record more than three runs); hourly allowance counts only running or successful requests, with a separate 60-attempt cap; `tests/server/tailoring-provenance-ai.test.ts` (5); `jobs.spec.ts` budget-paused message then recovery; screenshot `t2`; live spending limits unchanged |
| 3 | Local checkpoint commit | **Done, not pushed** | `git log -1` on `feat/apwico-launch-tracker`; other worktrees untouched |
| 4 | `STAGING.md` corrected for the authorized staging rehearsal; migration reapplication removed | **Updated; remote verification blocked** | Owner reports staging migrations 1–39 and production 1–30. The runbook prohibits migration commands and production access. Staging-only `STAGING_DB_URL` is unavailable in this environment, so hosted ledger checks and deployment have not run. |
| 5 | Local packaging checks | **Passed** | `vercel build --standalone` + `prepare-vercel-output.mjs` + `check-packaged-functions.mjs` (`test-results/12`, `13`). Hosted execution still needs the preview |
| 6 | Staging targets identified, not created | **Identified; awaiting confirmation** | `STAGING.md` §1 |

## 1. Third pass requests

| # | Request | Status | Evidence |
|---|---|---|---|
| 1 | Grounded tailoring beyond traceability; no one-click acceptance of unsupported AI claims; correct or support flow; user-authored claims distinguished; tests for fabricated metrics, changed responsibility, negation, irrelevant quotes | **Verified** (heuristic checks; they do not guarantee factual accuracy) | `src/lib/tailoringSupport.ts`; `tests/server/tailoring-support.test.ts` (8), `tests/server/tailoring.test.ts` (+2); `tests/paid/jobs.spec.ts` "unsupported AI wording…"; screenshot `t1-unsupported-review.png` |
| 2a | Timeline "Added as Preparing" | **Fixed, verified** | journey A asserts "Job saved" and "Saved → Preparing" |
| 2b | "Save this job" on saved jobs | **Fixed, verified** | journey A asserts the "Prepare my application" wording |
| 2c | Duplicate download controls on the tailoring page | **Fixed, verified** | `jobs.spec.ts` and journey A assert exactly one download group |
| 3 | Connected PDF journey | **Verified locally** (local Chromium; deployed renderer unverified) | journey D; `samples/apwico-job-specific-sample.pdf`; `screenshots/d-pdf-page-*.png` |
| 4 | Explicit authentication coverage | **Verified against a local Auth stand-in**; hosted Auth **unverified** with exact staging test L1–L7 | journey E; `tests/auth/*`; `STAGING.md` §5 |
| 5 | Every staging setting explained; code, database and copy agree | **Verified** (local) | §3 below; `tests/server/launch-facts.test.ts` (4 tests) |
| 6 | Renewal-reminder claim | Mechanism found and tested locally; **delivery unverified → promise removed from the terms** | §4 below |
| 7 | Durable review package | This folder | — |

### How the support checks work (request 1)

Every suggestion is checked twice by the same code: on the server before it is returned
(`server/ai/tailoring.ts`), and in the review panel, which can also check a fact the person adds.

1. **Traceability** (from the previous pass): the targeted requirement id must be one the server
   issued, and each quote must occur in the field being rewritten.
2. **Support** (new). A suggestion is flagged when any of these is true:
   - it adds a number or amount (digits, or words like "hundreds" or "half"). Invented digits
     still reject the whole provider response;
   - it adds wording about responsibility, seniority, outcomes, credentials or exclusivity, such as
     "managed", "led", "senior", "improving", "certified" or "single-handedly";
   - it drops a negation ("did not", "never", …) from the original;
   - it uses wording taken from the job that the resume field does not contain. A small list of
     neutral synonyms (help/support/assist, customer/client, …) is allowed;
   - its quote is negated in the resume, or shares no meaningful word with the rewrite;
   - no requirement relates to the rewrite, or it targets a requirement the person said they don't
     have.
3. **Review flow**:
   - A flagged suggestion shows **"Needs your support."**, explains each problem in plain words,
     and has **no Accept button**.
   - **Add a fact that supports this**: the person writes a fact, and the checks run again with it.
     Accept appears only if every issue is resolved, and the fact is shown as "written by you, not
     from your resume".
   - **Write your own wording instead**: available once the text differs from the AI wording. The
     person's own wording gets non-blocking hints if it still adds claims.
   - Reject, edit, accept and undo still work, and the master resume never changes.
   - Accepted items are labelled "AI wording", "your wording" or "supported by a fact you added".
     The labels last for the review session; they are not stored with the version.

Limits: these are word-level checks. They can miss a reworded overstatement that uses none of the
listed words, and they can flag a harmless rephrase that borrows a job keyword. Passing them does
not make a statement true. The panel says so: "These checks catch common overstatements. They
cannot confirm that any wording is true."

## 2. Requirement checklist (whole brief)

The full per-phase checklist with evidence is §2 of `docs/apwico-implementation-progress.md`.
Summary:

| Area | Status |
|---|---|
| Phase 1 correctness (7 downloads / rolling 7 days, one requirement extractor, draft status) | Verified locally; www→apex redirect **unverified live** |
| Phase 2 tracker (one record per job, stages + closed reasons, events, next actions, quick add, CSV import/export, isolation) | Verified |
| Phase 3 Today and navigation | Verified |
| Phase 4 evidence and tailoring (requirement review, clarification, traceable + support-checked suggestions, exact-version export in PDF and Word, confirm applied, retrieve kept version, one Free trial) | Verified locally; real OpenAI output **unverified** |
| Phase 5 onboarding and preferences (level and supported priorities rank; unknown is neutral; dealbreakers separate) | Verified |
| Phase 6 Discover cards | Verified |
| Phase 7 Free/Pro and public copy | Implemented and consistency-tested; **terms not legally approved**; Stripe unchanged |
| Phase 8 quality (journeys A–E, axe on main screens) | Verified with fixtures; screen readers, zoom and real devices **unverified** |
| Remove legacy individual-template billing code | Deferred (separate reviewed change) |

## 3. Every limit and setting

"Database" = enforced in SQL; "Code" = enforced in a server handler; "Copy" = stated in public
pages. `tests/server/launch-facts.test.ts` fails if these disagree for the rows marked ✓.

| Limit | Free | Pro | Reset window | Enforced in | Copy | Checked |
|---|---|---|---|---|---|---|
| **Tracked applications** | 100 | 10,000 (safety ceiling) | **none** — a count of records in every stage; deleting one frees a place. At the limit, existing records stay viewable, editable, exportable and removable; only adding waits | `product_settings.free_application_limit` (Database setting **100**), `applications_owner_limit` | terms, pricing, homepage | ✓ |
| **Tailoring trial** | 1 complete trial | not needed (Pro tailors any application) | **none** — lifetime, not transferable, bound to the first application prepared | `product_settings.free_tailoring_trials` (Database setting **1**), `product_tailoring_trials` | terms, pricing, homepage | ✓ |
| **AI runs within the trial** | 3 successful runs | — | **none** — failed runs do not count | `product_settings.free_trial_ai_runs` (Database setting **3**) | terms, pricing | ✓ |
| **AI requests (Pro)** | — | 20 per account (running or successful; failed requests don't count) | rolling 1 hour | `reserve_ai_budget` | terms | ✓ |
| **AI attempts (abuse guard)** | 60 | 60 | rolling 1 hour, every attempt | `reserve_ai_budget` | not stated | — |
| **AI service budget** | shared | shared | calendar month (UTC) — US$25 total, all accounts | `product_settings.ai_monthly_budget_micro_usd` (default and maximum `25000000`; lower it to rehearse exhaustion) read by `reserve_ai_budget` | terms ("service-wide monthly AI limit may pause AI") | — owner decision |
| **Downloads (PDF or Word)** | 7 successful | fair use | rolling 7 days from each counted download; failed downloads don't count | `document_begin`, `pdf_status` | terms, pricing, homepage, features | ✓ |
| **Download attempts (abuse guard)** | 20 | 60 | rolling 1 hour | `document_begin` (`pdf_owner_limits`) | not stated | — |
| **Manual job-search refreshes** | 3 | not limited by plan | rolling 24 hours from the oldest of the three | `jobs_reserve_recommendation_refresh` | terms, pricing | ✓ |
| **Results per search** | 10 | 20 | per search | `FREE_JOB_LIMIT`, `PRO_JOB_LIMIT` | terms, pricing | ✓ |
| **Automatic refresh** | about once a day (optional) | same | 24 hours since the last automatic refresh | `refresh-jobs` cron + `last_auto_refresh_at` | terms, pricing | — |
| **Price** | — | US$14.99/month, US only, renews monthly until cancelled | monthly | Stripe catalog (unchanged) | terms, pricing | ✓ |

The "100 / 1 / 3" in the staging check are the three `product_settings` values:
`free_application_limit = 100`, `free_tailoring_trials = 1` and `free_trial_ai_runs = 3`.

## 4. Renewal reminder (request 6)

| Question | Answer |
|---|---|
| Implementation | `billing_schedule_renewal_notices` queues a `renewal_reminder` due 3 days before `current_period_end` for active Pro subscriptions not set to cancel (deduplicated per period). `billing_claim_due_notices` hands out due notices. `server/billing/notices.ts` sends them through Resend with an idempotency key |
| Delivery mechanism | Vercel cron `15 14 * * *` → `/api/dispatch-billing-notices` (secret: `CRON_SECRET` or `NOTICE_DISPATCH_SECRET`); needs `RESEND_API_KEY`, `BILLING_EMAIL_FROM` and a verified sending domain |
| Fixed this pass | The email said "renews in 3 days" although the daily cron can send it up to a day after it falls due → it now states the renewal date. A reminder is never sent after the renewal it announces (for example after a cron outage) |
| Tested locally | `supabase/tests/renewal_reminder.test.sql` (10), `supabase/tests/subscription_offers.test.sql` (queueing, idempotency, cancellation suppresses), `tests/billing/notices.test.ts` (3) |
| Verified live | **No** |
| Copy | The terms sentence "We aim to send a reminder three days before renewal…" was **removed**. `launch-facts.test.ts` fails if a reminder promise returns to terms, privacy or pricing. Re-adding it is an owner decision after staging check L12 |

## 5. Test results (complete output in `test-results/`)

Run: 2026-10-28 17:07–17:13 UTC (rehearsal re-run 17:40), Node v24.13.1, Playwright 1.63.0, this worktree. Every command's
complete output is in `test-results/NN-*.txt`; `00-summary.txt` lists commands and exit codes.

| Check | Command | Result | Log |
|---|---|---|---|
| Build (SEO generation + client typecheck + Vite build) | `npm run build` | PASS | `01-build.txt` |
| Server typecheck | `npm run check:server` | PASS | `02-server-typecheck.txt` |
| Server and billing unit/integration tests (incl. server journeys) | `npm run test:server` | **522/522 pass** | `03-server-tests.txt` |
| Database tests (all migrations, then the contract step and every test again) | `npm run test:db` | **801 ok, 0 not ok** | `04-database-tests.txt` |
| SEO and generated pages | `npm run test:seo` | 30/30 pass | `05-seo-tests.txt` |
| Performance budgets | `npm run performance:budgets` | PASS | `06-performance-budgets.txt` |
| Brand check | `npm run brand:check` | PASS | `07-brand-check.txt` |
| Local migration rehearsal (fictional legacy rows) | `node scripts/rehearse-tracker-migrations.mjs` | PASS: all six launch files present by catalog markers (false before, true after), 0 disagreements, 0 closed without reason, 0 browser grants, settings 100 / 1 / 3 | `08-migration-rehearsal.txt` |
| Default browser suite | `npx playwright test` | **115/115 pass** | `09-browser-default.txt` |
| Auth browser suite | `npx playwright test --config playwright.auth.config.ts` | **42/42 pass** | `10-browser-auth.txt` |
| Paid browser suite incl. journeys A–E and the unsupported-suggestion test | `npx playwright test --config playwright.paid.config.ts` | **98/98 pass** | `11-browser-paid.txt` |
| Local Vercel packaging (`vercel build --standalone` + `prepare-vercel-output.mjs`) | see command | PASS (offline; nothing deployed) | `12-vercel-standalone-build.txt` |
| Packaged-function load check | `node scripts/check-packaged-functions.mjs .vercel/output` | PASS (offline load; hosted execution unverified) | `13-packaged-functions.txt` |
| Real-PostgreSQL race harness | `npm run test:db:concurrency` | **NOT RUN** — no PostgreSQL server binaries on this machine | — |

No test was skipped or retried in this run.

## 6. Screenshots and samples

All screenshots and samples use fictional people and companies only. Each screenshot was opened and
inspected.

| File | Shows |
|---|---|
| `screenshots/a1…a11` | Journey A: preferences → ranked Discover → saved → Free preview → job-specific resume → requirement correction → clarification → traceable suggestion → Word export → submit prompt → kept version |
| `screenshots/b1…b4` | Journey B at 390px: quick add → CSV import preview → next action → Today |
| `screenshots/c1…c3` | Journey C: reload keeps the draft → session removed → session restored |
| `screenshots/d1, d2, d-pdf-page-1, d-pdf-page-2` | Journey D: PDF exported; both PDF pages rendered from the downloaded file; kept version retrieved |
| `screenshots/e1…e5` | Journey E: signed out → wrong password → returned after sign-in → after logout → second account isolated → draft recovered |
| `screenshots/t1-unsupported-review.png` | Unsupported suggestions: one accepted with a user fact, one replaced by the user's own wording, and the saved tailoring record |
| `screenshots/t2-ai-budget-paused.png` | The monthly AI budget is reached: the message, and no suggestions shown |
| `screenshots/a12-kept-provenance.png` | Kept (exported) version with its tailoring record |
| `screenshots/a13-version-provenance-edited.png` | After a reload and a later manual edit: the record reads "Edited by you since" |
| `samples/apwico-job-specific-sample.pdf` | The PDF downloaded in journey D (two pages) |
| `samples/apwico-job-specific-sample.docx` | The Word file downloaded in journey A (with the accepted suggestion) |

Manual review steps: follow `docs/apwico-implementation-progress.md` §9 (owner demo script) on the
staging preview, then the live checks L1–L15 in `STAGING.md` §6.

## 7. Remaining launch blockers

1. **Owner and counsel approval** of `public/terms.html` and `public/privacy.html`. Counsel should
   also say whether a renewal notice is legally required for this plan.
2. **Staging rehearsal** (`STAGING.md`). Authorized, but blocked in this environment until the staging-only `STAGING_DB_URL` and existing staging Vercel target credentials are available. Migrations 1–39 are reported already applied; no migration should be run.
3. **Live verification**:
   - hosted Supabase Auth (email links, redirect URLs, token refresh);
   - Stripe test-mode checkout, portal and renewal;
   - Techmap results;
   - real OpenAI output and how often suggestions pass the support checks;
   - PDF rendering in the deployed function;
   - renewal-reminder delivery;
   - www→apex redirect;
   - analytics.
4. **AI monthly budget**: US$25 per month service-wide is the current cap (now a setting, never
   above US$25 without a migration). Decide the launch value. The provider-side spend limit is
   separate and was not changed.
5. **Staging-only credentials**: provide `STAGING_DB_URL` and credentials for the already existing
   staging Vercel target. No project creation or production-scoped environment access is part of
   this task (`STAGING.md` §1).
7. **Real-PostgreSQL concurrency harness** (`npm run test:db:concurrency`): needs PostgreSQL 17
   server binaries; not run here.
8. **Accessibility beyond automated checks**: screen readers, 200–400% zoom, real devices.
9. **Known minor items** (not blocking):
   - a PDF entry may split between bullets across a page break (its heading stays with its
     first bullet);
   - signed-out workspace pages have no header sign-in button (the page prompt has one);
   - provenance is the person's own review record submitted by their browser, not a
     tamper-proof audit; it never shows that wording is true;
   - the legacy individual-template billing code is still present;
   - "View exact version" shows the kept resume content in the in-app preview. Its page break can
     differ from the downloaded PDF, because APWICO keeps the content snapshot, not the PDF file
     itself. Re-rendering the snapshot gives the same PDF text (journey D).
10. **Merge**: one local checkpoint commit exists; nothing is pushed. The owner decides how it is
   reviewed and merged.
