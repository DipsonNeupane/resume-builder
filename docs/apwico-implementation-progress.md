# APWICO launch implementation progress

Brief: `docs/APWICO-CLAUDE-IMPLEMENTATION.txt` (copy of the owner brief dated 2026-10-27).
This file is the resume point for any later session. Last updated 2026-10-28 (third pass:
stronger grounding, interface fixes, PDF and authentication journeys, limits, renewal reminder,
review package). **The review package for the owner is `docs/launch-review/README.md`.**

Status words used below:
- **Verified** — implemented and exercised by an automated test that ran and passed in this
  worktree (local only: PGlite database, Vite dev server, controlled fixtures).
- **Implemented, unverified** — code exists but no test exercises the claim.
- **Blocked** — cannot be done without something outside this repository.
- **Deferred** — deliberately not done; reason given.
- **Config only** — a value set in code/SQL; it has **never been applied or observed live**.
  Nothing on this branch has been verified against hosted Supabase, Stripe, Techmap,
  OpenAI or a deployed site.

## 1. Branch, worktree and base (verified 2026-10-27)

| Item | Value |
|---|---|
| Worktree path | `/Users/dipson/ResumeStride/.claude/worktrees/apwico-launch` |
| Branch | `feat/apwico-launch-tracker` (no commits of its own; all work is uncommitted) |
| Base commit | `1a883b6fe289e01e173467b454a90a6613059cda` (`feat/apwico-v2-pricing`, 2026-10-13 "fix production auto-refresh module resolution"); `HEAD` = base |
| Changes vs base | 153 status entries (114 tracked files modified or deleted, 39 new paths; `git status --short`) as of 2026-10-28 |
| Main checkout | `/Users/dipson/ResumeStride` on `feature/premium-template-library` @ `16e03e3` — **untouched**: still the same 51 status entries it had when the first session started |
| Other worktree | `~/Documents/Codex/.../work/apwico-v2-pricing` @ `1a883b6` — **untouched**, `git status` clean |
| Remote state | Nothing committed, pushed, deployed or migrated. No Supabase, Stripe, Vercel, Techmap or OpenAI setting changed |

Key new paths: `supabase/migrations/20261027{100000,120000,140000,150000,160000}_*.sql`,
`supabase/contract/20261110000000_application_tracker_contract.sql`,
`supabase/checks/tracker_rehearsal_{before,after}.sql`, `scripts/rehearse-tracker-migrations.mjs`,
`src/lib/{applications,applicationCsv,postingRequirements,jobPreferences}.ts`,
`src/features/applications/*`, `src/features/jobs/{DiscoverDeck,RequirementReview}.tsx`,
`src/features/onboarding/PreferencesSetup.tsx`, `server/jobs/applications.ts`,
`tests/server/{launch-journeys,job-preferences,pgliteDatabase,...}.ts`, `tests/paid/journeys.spec.ts`,
`docs/policies/LAUNCH_TERMS_REVIEW.md`.

## 2. Requirement checklist (brief phases 0–8 + owner follow-up)

### Phase 1 — correctness and trust
| Requirement | Status | Evidence |
|---|---|---|
| Downloads: 7 successful per rolling 7 days, failed never count, accurate reset time | Verified (local) | `launch_allowance_status.test.sql`, `pdf_allowance.test.sql`, `launch-facts.test.ts`; export UI shows next return time |
| One requirement extractor; paragraph and bullet postings give the same requirements | Verified | `posting-requirements.test.ts` |
| `www.apwico.com` → apex 301; private routes noindex | Verified in middleware tests; **not observed live** (needs deploy + DNS) | `seo.test.ts`, `seo.spec.ts` |
| Draft status never calls a tab-only draft "saved" | Verified | navigation/builder suites |

### Phase 2 — tracker backbone
| Requirement | Status | Evidence |
|---|---|---|
| One application record per saved job; manual / pasted-URL / import / Discover / extension origins | Verified | `application_tracker.test.sql` (40), `launch-journeys.test.ts` B, `journeys.spec.ts` B |
| Single stage + separate closed reason ("no response" ≠ rejected); undo/reopen; events with origin | Verified | same + `applications.spec.ts` |
| Next actions with due dates | Verified | journeys B (server + browser) |
| Quick add needs only company, role, stage | Verified | journeys B, `applications.spec.ts` |
| Pasted URL validated, never fetched | Verified | `applications.test.ts` |
| CSV import (mapping, preview, invalid rows, explicit duplicate keep) and formula-safe export | Verified | `application-csv.test.ts`, journeys B, `applications.spec.ts` |
| Owner isolation | Verified | DB tests (browser denial, cross-owner reads), journey B cross-account check |
| Stable list order for same-timestamp rows (CSV imports) | Verified — **fixed this session** (`order by saved_at desc, id desc`) | flaky ordering found by the contract replay |

### Phase 3 — Today and navigation
| Requirement | Status | Evidence |
|---|---|---|
| Today shows due/overdue as suggestions, counts equal records | Verified | journeys B (counts compared with database rows), `applications.spec.ts` |
| Workspace nav; retained old URLs redirect | Verified | `navigation.spec.ts`, `seo.spec.ts` |
| No email/push reminders (stated) | Verified (copy) | Today page |

### Phase 4 — evidence and tailoring per job
| Requirement | Status | Evidence |
|---|---|---|
| Correct / remove / add extracted requirements per application | Verified | journeys A (server + browser) |
| Clarify evidence ("I can demonstrate this" → "Confirmed by you") | Verified | journeys A (stored analysis checked) |
| **Traceable tailoring**: original wording, proposed wording, supporting resume fact(s), targeted requirement(s) | Verified — **new this session** | `tailoring.test.ts` (4 new), journeys A |
| Ungrounded suggestions not presented as grounded | Verified | `tailoring.test.ts`, `jobs.spec.ts` |
| **Support checks beyond traceability** (third pass): added numbers incl. number words, added responsibility/seniority/outcome/credential wording, dropped negation, negated or irrelevant quotes, job wording absent from the resume, declined requirement | Verified (heuristic; does **not** guarantee factual accuracy) | `tailoring-support.test.ts` (8), `tailoring.test.ts` (+2) |
| No one-click acceptance of unsupported AI wording; user can add a supporting fact (re-checked) or write their own wording; accepted items labelled "AI wording" / "your wording" / "supported by a fact you added" | Verified | `jobs.spec.ts` "unsupported AI wording…" (axe clean). Labels live in the review session only; not stored with the version |
| Accept / edit / reject / undo; master unchanged | Verified | `jobs.spec.ts`, journeys A (master compared after accept) |
| Export exact version, kept with the application; downloading never marks applied | Verified | journeys A (Word) and **D (PDF, third pass)** through the real export handlers |
| **PDF journey**: generation, content, page breaks, text extraction, job-specific version, retrieval of the kept version | Verified locally with Playwright's Chromium (production uses `@sparticuz/chromium`; **not verified deployed**) | journey D: 2-page PDF parsed with `pdf-parse`, pages rendered to PNG and inspected, kept snapshot re-rendered to identical text |
| Explicit "confirm applied"; retrieve the submitted version | Verified — **viewer added this session** ("View exact version", read-only) | journeys A; later edits don't change it (server journey) |
| One Free tailoring trial: bound to one application, 3 successful runs, failed runs free | Verified | `free_tailoring_trial.test.sql`, journeys A (runsRemaining 2 after one run; second application refused) |
| Trial includes the full evidence view for its application | Verified — **was broken, fixed this session** (DB withheld it; UI keyed off `isPro`) | `free_tailoring_trial.test.sql` (+2), journeys A ("View … with Pro" absent) |

How traceability works: the server issues requirement ids (Match requirement ids when a current
analysis exists, otherwise `posting-N` from the shared extractor) and sends them to the model.
The model must return `targetRequirementIds` and `supportingQuotes` copied from the field being
rewritten. `server/ai/tailoring.ts#resolveReferences` keeps only issued ids and quotes that occur in
that field (whitespace/case-folded), drops the rest, and sets `grounded` only when at least one of
each survives. The client re-checks quotes against the original wording. Suggestions may only
rephrase the field they rewrite, so supporting facts are quotes from that field (with its section,
role and organization as the location). Not checked: whether the rewrite semantically addresses the
targeted requirement — that is the model's claim, shown as a link the user reviews.

### Phase 5 — onboarding and preferences
| Requirement | Status | Evidence |
|---|---|---|
| Two homepage paths (Find my jobs / Organize my applications), no resume or quiz needed | Verified | journeys B starts from the home link; `homepage.spec.ts` |
| Short, skippable preferences; editable later | Verified | `discover.spec.ts`, journeys A |
| **Experience level influences ranking** | Verified — **new this session** | `job-preferences.test.ts`, `jobs-handler.test.ts`, journeys A |
| **Supported priorities influence ranking**; unsupported ones removed | Verified — **new**: kept flexibility (remote/hybrid), stability (full-time vs contract), pay shown; **removed** progression, learning, impact (postings don't state them; parser rejects them) | same |
| Reasons explained; unknown data treated as unknown | Verified | cards show "Fits your stated preferences", "Ranked lower for your preferences", "Not stated in the posting: … seniority" |
| Hard constraints separate from soft preferences | Verified | dealbreakers/filters hide (and are counted); level/priorities only reorder within an evidence label and never hide |

Ranking rule (`src/lib/jobPreferences.ts`, used by server and cards): level from the title
(lead/principal/head of/director/chief/VP → lead; senior/sr/staff → senior; junior/entry-level/
intern/graduate/trainee/apprentice → entry) or an explicit "N+ years … experience" (≤1 entry, 2–4 mid,
5+ senior). Same level +12, each level of gap −8, unstated 0. Flexibility +6 remote/hybrid, −4
on-site; stability +6 full-time, −4 contract/temporary; pay +6 when salary stated. Unknown = 0.
"Manager" alone is not treated as a lead title. Sorting stays evidence label first.

### Phase 6 — Discover cards
| Requirement | Status | Evidence |
|---|---|---|
| List and one-at-a-time views, same actions, undo, session-only passes, optional swipe | Verified | `discover.spec.ts` |
| Duplicate saves never duplicate applications | Verified | journeys A (`alreadySaved`) |

### Phase 7 — Free/Pro and public copy
| Requirement | Status | Evidence |
|---|---|---|
| Free 100 applications, editable over the cap | Verified (local) / **Config only** live | DB tests incl. new over-limit edit test |
| Pro US$14.99/month, US-only | **Config only** (unchanged on this branch; no Stripe change) | `launch-facts.test.ts` |
| Terms and public copy describe Free limits, trial, downloads, Pro limits, renewal, cancellation, data access; no retired products | Implemented — **prepared for owner review, not legally approved** | `docs/policies/LAUNCH_TERMS_REVIEW.md`, `launch-facts.test.ts` |
| Homepage plan copy | Verified — **fixed this session** (said "up to 10 applications") | `builder.spec.ts` pricing test |
| Pricing page currency/renewal/refund/limits block | Verified — **restored this session** (had silently disappeared) | `g8-public.spec.ts`, `launch-facts.test.ts` |
| Remove legacy individual-template billing code | Deferred — touches webhook/reconciliation; separate reviewed change | — |

### Phase 8 — quality, observability, handoff
| Requirement | Status | Evidence |
|---|---|---|
| Connected journeys A–E | Verified with fixtures (see §5) | `launch-journeys.test.ts`, `journeys.spec.ts` |
| **Suggestion provenance** saved with versions (AI wording / your wording / AI wording with your fact; requirement and resume references), copied into kept documents, cleared by a reset; read against the live or kept resume so later edits show as edited | Verified locally | migration `20261028100000`; `tailoring_provenance_ai_safeguards.test.sql`; `tailoring-provenance-ai.test.ts`; journey A; `jobs.spec.ts` |
| **AI safeguards**: configurable monthly budget (≤ US$25); trial runs reserved before and released after a failed provider call; failures use no hourly allowance (60-attempt guard instead); a cleanly failed request can be retried at once, an uncertain one waits 10 minutes; clear messages; no substitute output | Verified locally (PGlite interleaving); real-PostgreSQL race harness extended but **not run** (no server binaries) | same files; `scripts/test-database-concurrency.mjs` |
| Local packaging: `vercel build --standalone` + packaged-function check | Verified locally (offline load); hosted execution unverified | `docs/launch-review/test-results/12`, `13` |
| **Authentication**: genuinely signed out, sign-in return, draft recovery, account switching, logout with token revocation | Verified against a stateful **local** Auth stand-in (journey E) and the existing auth suite; **hosted Supabase Auth unverified** — exact staging test L1–L7 in `docs/launch-review/STAGING.md` | journey E, `tests/auth/*` |
| Content-free analytics | Implemented, unverified live (production origin only) | `analytics.ts` closed enums |
| Accessibility | axe clean on tracker, deck, preferences, application detail, Today; reflow at 320/390/768. **Not verified**: screen readers, 200–400% zoom, real devices. WCAG 2.2 AA not claimed | browser suites |
| Hosted migration rehearsal | **Blocked** on owner approval and staging access (plan in §6) | — |
| Real-provider verification (Techmap, OpenAI, Stripe, Supabase Auth) | **Blocked** — needs credentials/environments not used here | — |

## 3. Defects found and fixed this session (beyond the requested features)

1. `server/jobs/match.ts#parseRequirementEdits` rejected the database default `{}` → every
   reanalysis or clarification on an application with no requirement edits returned 503.
2. Match page crashed (white screen) for the trial application: `{}` edits reached
   `RequirementReview`. Fixed in `parseApplicationRecord` (normalize) and the component.
3. Trial application never showed its full evidence: `jobs_account_snapshot_v2` withheld it for
   Free (new migration `20261027160000_saved_match_preview.sql`), and the panel keyed depth off
   `isPro` instead of what the server sent.
4. Free saved jobs showed a dead-end "Return to saved jobs to refresh" → now a working
   "Show what my resume shows" button.
5. "Prepare my application" on a manually added application (no link) opened "This workspace
   item is unavailable" — the client rejected `sourceUrl: null` manual snapshots.
6. Homepage Free plan said "track up to 10 applications".
7. Pricing page had lost its currency/renewal/refund block.
8. Home "Build my master resume" showed "Start your master resume" even when a draft existed.
9. Applications list order was nondeterministic for same-timestamp rows (CSV imports).
10. "1 applications shown" pluralization; duplicate "Remote" fit lines on Discover cards.

Third pass fixes: (11) timeline "Added as Preparing" for a job saved from Discover → now "Job saved"
then "Saved → Preparing"; (12) Match footer "Save this job…" on saved jobs → "Choose “Prepare my
application”…"; (13) duplicate download controls on the job-specific page → one set; the tailoring
panel's "Review and download this version" goes to the page's confirmed controls (accepting a
change requires re-confirming the preview, which the second set used to bypass); (14) renewal
reminder email said "renews in 3 days" although the daily cron can send it up to a day later →
states the renewal date, and is never sent after the renewal; (15) simultaneous Free trial
requests could each pass the "runs remaining" check and together record more than three runs →
runs are now reserved before the provider call; (16) failed AI requests counted toward the hourly
allowance, and a cleanly failed request blocked an identical retry for 10 minutes → only running
or successful requests count, a 60-attempt guard bounds failures, and only uncertain outcomes wait.

Known minor items left: on the PDF, an entry may split between its bullets across a page break
(its heading stays with its first bullet); signed-out workspace pages have no header sign-in
button (the page prompt has one).

## 4. Test results (final code, 2026-10-28, this worktree)

Run: 2026-10-28 17:07–17:13 UTC (rehearsal re-run 17:40), Node v24.13.1, Playwright 1.63.0, this worktree. Every command's
complete output is in `docs/launch-review/test-results/NN-*.txt`; `00-summary.txt` lists commands and exit codes.

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

Observed once and not reproduced: `security.spec.ts:37` (malformed PDF message) timed out under a
2-worker run of four files; it passed in every later run, including the full suite.

### The 53 default-suite failures (item 5)

Baseline conditions: the first session ran the failing files on a detached checkout of the same
base commit in the scratchpad with the same Playwright config (port 5183, empty Supabase env
overrides), Node v24.13.1, Playwright 1.63.0, no `.env.local` in either tree. The baseline run
covered the failing spec files only, not the whole suite. Classification:

| Failures | Class | Action |
|---|---|---|
| 31 `builder.spec.ts`, `security.spec.ts` ×6, `quality.spec.ts` ×7 (viewport variants), `section-validation.spec.ts` ×3 | **Stale tests**: the intentional "Start your master resume" step (commit 63138a7) sits after "Build my master resume" | Shared helper `tests/builderStart.ts` follows the intended flow |
| `security.spec.ts:4` and every builder test that reloaded with a draft | **Product defect**: home showed the blank-start screen even with an existing draft | Fixed (`main.tsx` onBuild opens the editor when a draft exists) |
| `builder.spec.ts` pricing (expected 4 items / "up to 10") | **Product defect** (wrong cap) + stale count | Copy fixed from `launchFacts`; test updated |
| `builder.spec.ts` showcase ("7 layouts" heading, "Ledger" card) | Stale (homepage redesign 0ab6f1c) | Test updated to the current curated gallery |
| `builder.spec.ts` mobile Upload | Stale: sidebar tools deliberately hidden on phones (63138a7) | Test now checks "Import instead" on the start screen |
| `g8-public.spec.ts:4` | Stale: approved heading change (f91baea) | Updated |
| `g8-public.spec.ts:25` | **Product defect**: pricing lost currency/tax/refund block | Fixed (generator) |
| `seo.spec.ts:4` | Stale: resources heading changed (63138a7) | Updated |

No new regressions remain.

## 5. Journeys — what is real and what is a fixture

Both the server journeys (`tests/server/launch-journeys.test.ts`) and the browser journeys
(`tests/paid/journeys.spec.ts`) run the **real** handlers (`jobs-account`, `jobs-search`, `tailor`,
`export-docx`) and **real** SQL functions on a fresh local PGlite database with every migration.
In the browser journeys, Playwright routes the app's `/api/*` calls to those handlers in-process.
**Fixtures** replace only: Supabase Auth (fictional sessions; stateful in journey E), the Techmap
response (three fictional postings) and the OpenAI response (one suggestion naming an issued
requirement id and quoting the source field). `/api/export-status` is answered from the real
`pdf_status` function by a small test route. Not covered: hosted Supabase Auth/PostgREST,
network behavior, real provider data and real model output. Journey D renders PDFs with the local
Playwright Chromium instead of the packaged serverless Chromium.

- **A**: preferences (level, priorities, dealbreaker) → server-ranked discovery → save → Free
  preview → Prepare (trial) → correct requirements (remove, add) → clarify → traceable suggestion
  → accept (master unchanged) → Word export kept with application → confirm applied → view exact
  submitted version. Free boundary: second application refused. Pro boundary: two applications
  prepared, trial untouched (server).
- **B**: home "Organize my applications" → quick add (no resume) → CSV import with duplicate
  review and invalid row → stage change → next action due yesterday → Today shows it; counts equal
  database rows; axe clean and no horizontal scroll at 390px; cross-account isolation (server).
- **C**: manual application → Prepare (trial) → edit job-specific resume → reload keeps route,
  version and edit (master unchanged) → stored session removed: no account content shown →
  session back: same version and edit. (Third pass: the harness seeds the session only once per
  tab, so the removed session now stays removed.)
- **D** (third pass): long fictional resume → manual application → Prepare (trial) → job-specific
  summary → confirm → **PDF** through the real `exportPdf` handler and `renderPdf` (local Playwright
  Chromium) → file starts `%PDF-`, 2 pages, text extracted with `pdf-parse`: name, job-specific
  summary on page 1, master summary absent, last section on the last page, every role title on the
  same page as its dates; pages rendered to PNG and inspected → kept document row is `pdf`,
  `job_version`, the exact version id → re-rendering the kept snapshot gives identical text → a
  later edit does not change it → confirm applied → "View exact version" shows the exported text.
- **E** (third pass): stateful Auth stand-in (password grant issues tokens, logout revokes them,
  the server handlers reject revoked tokens) → genuinely signed out (no stored session, `/auth/v1/user`
  401, no successful account API call) → wrong password then sign-in from the protected page →
  returned to `/workspace/applications` → draft → UI logout → no draft visible, old token rejected
  by the server → second account sees an empty list and "This workspace item is unavailable." on
  the first account's version link → switch back → draft recovered.

What remains unverified: hosted Supabase Auth (email links, redirect URLs, refresh), real Techmap
data, real OpenAI output, deployed PDF rendering. Exact staging checks: `docs/launch-review/STAGING.md` §6.

Screenshots (inspected) and sample outputs: `docs/launch-review/screenshots/`,
`docs/launch-review/samples/`. Regenerate with
`npx playwright test -c playwright.paid.config.ts tests/paid/journeys.spec.ts` → `test-results/journeys/`.

## 6. Migration and rollback design (item 7)

### Migrations on this branch (apply in filename order after existing ones)

| File | Kind | Changes | Depends on |
|---|---|---|---|
| `20261027100000_launch_allowance_status` | Replace function | `pdf_status.resets_at` = when the oldest counted download leaves the window (null if none) | `document_begin` ledger (20261013160000) |
| `20261027120000_application_tracker` | **Expand** (additive + backfill) | `product_settings` (1 row); `applications_owner_limit`; `saved_jobs.source_url` nullable for provider `manual` (check constraint rewritten); `jobs_source_identity` replaced; workflows gain `stage, closed_reason, prior_stage, applied_on, next_action, next_action_due, origin, created_at` (backfilled from legacy columns, then constrained); **legacy sync trigger**; `job_application_events` (backfilled from history); immutable `job_application_documents`; `applications_*` RPCs; `jobs_account_snapshot`, `jobs_save`, `job_resume_version_create` replaced | 20260930100000 workflow tables, saved_jobs, billing entitlements |
| `20261027140000_free_tailoring_trial` | Additive + replace | `product_settings.free_trial_ai_runs`; `product_tailoring_trials`, `product_tailoring_trial_runs`; trial RPCs; trial-aware version create / tailoring inputs / snapshot | 120000 |
| `20261027150000_requirement_edits` | Additive + replace | `job_application_workflows.requirement_edits jsonb default '{}'`; `applications_set_requirement_edits`; `jobs_saved_match_inputs`, `applications_row` replaced | 120000, 140000 |
| `20261027160000_saved_match_preview` | Replace function | `jobs_account_snapshot_v2` also returns stored analysis for the Free trial's bound application | 140000 |
| `supabase/contract/20261110000000_application_tracker_contract` | **Contract — not in `migrations/`, not applied by `supabase db push`** | optional reminder→next-action copy; drops legacy trigger, `jobs_workflow_list`, `jobs_workflow_upsert`, `job_application_history`, columns `decision, application_status, reminder_enabled, reminder_at` | the new release running in production |

### Why each dropped item is dropped, and why it is now two-step

The first session's tracker migration converted and then **dropped** the legacy columns in one
step, which made an app rollback impossible without a database restore. It is now
expand/contract:

| Dropped (contract step only) | Why drop it eventually | Needed by the new release? |
|---|---|---|
| `decision`, `application_status` | Two overlapping stage sources; `stage` + `closed_reason` replace them; stale duplicates invite wrong reads | No |
| `reminder_enabled`, `reminder_at` | Replaced by `next_action`, `next_action_due` | No |
| `job_application_history` | Replaced by `job_application_events` (backfilled) | No |
| `jobs_workflow_list`, `jobs_workflow_upsert` | Only readers/writers of the columns above | No |
| `job_application_workflows_legacy_sync` trigger | Exists only to serve the previous release | No |

During the window between expand and contract, a trigger keeps both shapes consistent: a stage
written by the new release rewrites the legacy pair; a legacy write by the previous release
(`jobs_workflow_upsert`) rewrites `stage`/`closed_reason`/`prior_stage`. Tested by
`application_tracker_legacy_sync.test.sql` (10). Not mirrored: legacy reminders written after the
expand step; history rows written by the previous release are not copied into events.
`scripts/test-database.mjs` applies the contract file after all tests and re-runs every test (except
legacy-sync), proving the new release works without the legacy shape.

### Rollback limitations

- **App rollback after expand**: supported without a restore. The previous release reads and writes
  through the kept legacy columns/RPCs. Limits: it cannot display manual (no-URL) records properly,
  ignores events/documents/next actions/trial/requirement edits, and the replaced
  `job_resume_version_create` now requires an open application and moves Saved → Preparing.
  `jobs_source_identity` was replaced (better dedupe); the previous release will use the new one.
- **Schema rollback of expand**: no down-migrations exist. Dropping the new objects by hand is
  possible but would discard tracker data; a pre-migration backup is the safe route.
- **After contract**: the previous release can no longer run. Rollback = restore from backup
  (losing writes since) or forward-fix.
- "No existing users" does not authorize deleting remote data or objects; the contract step needs
  explicit approval.

### Fresh-database results (local)

`npm run test:db` replays all migrations on empty PGlite, runs all pgTAP files, applies the contract
step and re-runs them: PASS. `node scripts/rehearse-tracker-migrations.mjs` seeds fictional rows in the
previous shape just before the launch migrations, runs `supabase/checks/tracker_rehearsal_before.sql`
and `_after.sql`, and prints the converted rows. Result (now six launch files, checked by catalog markers rather than a ledger): 4 fictional rows
converted (review/not_applied → saved; pursue/interviewing → interviewing; pursue/withdrawn → closed +
withdrawn; pass/not_applied → closed + archived); 1 history row backfilled into events; 0 stage/legacy
disagreements; 0 closed rows without a reason; 0 browser grants; settings 100 / 1 / 3. (The first run
reported one disagreement: the check itself was too strict about the old "pass" = archived pair; fixed.)

### Staging rehearsal plan (**not executed**)

Superseded on 2026-10-28 by `docs/launch-review/STAGING.md`, which was reviewed against the
repository. The earlier steps here assumed `supabase db push` and five pending files. Production
has no migration ledger and, as last inspected (2026-09-25), 24 pending migrations (16–39).
STAGING.md separates local preparation, read-only remote checks, staging mutations and production
actions, names the identified targets, and keeps the contract file excluded.

## 7. Launch policy (owner review; all **config only**, never observed live)

| Setting | Value | Where |
|---|---|---|
| Free downloads | 7 successful PDF/Word per rolling 7 days | `document_begin`/`pdf_status`; `launchFacts.ts` |
| Free applications | 100 (refusal at cap; nothing hidden/deleted) | `product_settings.free_application_limit` |
| Pro applications | 10,000 safety ceiling | `applications_owner_limit` |
| Free tailoring trial | 1 per account, bound to one application, 3 successful AI runs | `product_settings` |
| AI requests | 20 per hour per account; monthly service budget | `reserve_ai_budget` (unchanged) |
| Free search | 3 manual refreshes / rolling 24 h, up to 10 results | `jobs_reserve_recommendation_refresh`, `FREE_JOB_LIMIT` |
| Pro search | up to 20 results | `PRO_JOB_LIMIT` |
| Pro price | US$14.99/month, US only (unchanged; no Stripe change) | `server/billing/catalog.ts` |

`tests/server/launch-facts.test.ts` fails if SQL, terms, pricing page and `launchFacts.ts` disagree.

## 8. Remaining blockers and external dependencies

- **Owner/legal approval** of `public/terms.html` and `public/privacy.html`
  (`docs/policies/LAUNCH_TERMS_REVIEW.md`).
- **Staging rehearsal** (§6) — needs owner approval and staging credentials.
- **Live verification** of: www→apex redirect, hosted Auth, Stripe checkout/portal, Techmap
  results, OpenAI output quality and support rate, PDF rendering in production, analytics, renewal
  reminder delivery (promise removed from the terms until verified).
- **AI monthly budget**: service-wide AI spend is capped at US$25 per UTC month, now read from
  `product_settings.ai_monthly_budget_micro_usd` (default and maximum `25000000`). Owner decision
  before launch.
- `scripts/check-packaged-functions.mjs` **passed** locally on 2026-10-28 against
  `vercel build --standalone` output (`docs/launch-review/test-results/13-packaged-functions.txt`);
  hosted execution is still unverified.
- `npm run test:db:concurrency` (real PostgreSQL races) needs PostgreSQL 17 server binaries; not run.
- Assistive-technology and real-device testing.

## 9. Owner demo script (fictional data, staging only)

1. Home → **Organize my applications** → sign in → quick add "Example Clinic / Front desk
   coordinator" (no resume). Import a CSV with "Applied", "No response" and a duplicate row; keep
   or skip the duplicate.
2. Change one to Interviewing; add next action "Send thank-you note" due yesterday → **Today** shows
   it as a suggestion.
3. Home → **Find my jobs** → a role, Remote, Mid level, priorities Flexibility + Pay, dealbreaker
   On-site → Discover: read "Fits your stated preferences", "Ranked lower…", "Not stated…".
4. Save a job → open it → **Show what my resume shows** → **Prepare my application (free trial)**.
5. Back on Match: remove a wrong requirement, add one, save; answer "I can demonstrate this".
6. Open the job-specific resume → get suggestions → check each one's targeted requirement and quoted
   resume fact; accept one, edit one, reject one, undo one.
7. Download Word with "Keep a copy" → open the application → **Yes, record as applied** → **View
   exact version**. Edit the job-specific resume again; the kept version does not change.

## Environment variable names (no values)

`APP_ORIGIN`, `EXPORTS_ENABLED`, `AI_ENABLED`, `OPENAI_API_KEY`, `EXTENSION_CAPTURE_ENABLED`,
`VITE_CLOUD_STORAGE_ENABLED`, `VITE_PAID_FEATURES_UI_ENABLED`, `VITE_BILLING_UI_ENABLED`,
`BRAND_DOMAIN_REDIRECTS_ENABLED`, `BRAND_PERMANENT_REDIRECTS_ENABLED`, `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TECHMAP_API_KEY`. None added.

## Testing note

Vite hot reload during an in-flight browser run causes spurious timeouts; don't edit `src/` while
browser suites run. Running a later suite clears `test-results/`.
