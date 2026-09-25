# External launch setup — 2026-09-18

## Verified
- Owner authorizes reusing/rebranding the old FitnessCoachAI Stripe project for ResumeStride.
- Existing Supabase ResumeStride project `ggwwzwqykkncgupdimxp` is connected through ignored `.env.local` using its public publishable key only.
- Auth Site URL is `https://resumestride.com`; exact redirects include `http://127.0.0.1:5173/?account=1` and `https://resumestride.com/?account=1`.
- Real signup email arrived at the owner's authorized test Gmail address; confirmation returned to the local app and visibly established the signed-in account. Custom production SMTP remains pending.
- Historical setup evidence: Stripe sandbox `acct_1QqPbG7sBbdVbWSQ` originally used product `prod_VHlwu2cqB4zYE3`, ResumeStride Pro — 30-Day Pass, $9.99 USD, one-off. That catalog entry is superseded by the current US$19.99 price configuration; do not reuse the historical Price ID.
- Owner reactivated Vercel; verified project creation now succeeds. Project `resumestride` (`prj_W7PZMjcFj5LnmPtZ2x9QGwIkP6tC`) created under dipsons-projects and linked locally. `resumestride.com` attached and ownership verified. DNS still points to registrar parking. Vercel recommends two A records for @: `216.150.1.1` and `216.150.16.1`. GoDaddy settings tab 1144761396 is stuck on Loading domain settings even after reload; no DNS changes made. Preserve all MX/TXT/mail records when updating web records. No deployment yet. Added vercel.json Vite build/output/security-header configuration.

## In progress / not verified
- Stripe account display-name save to ResumeStride Sandbox submitted; dashboard stalled during verification. Inspect saved name before retrying. Broader public branding/support details and optional recurring price remain pending.
- Claude session 10086 completed (there was no duplicate coding session; its concurrency warning confused its own external execution ID with another job). Review follow-up session 43194 is now active: save races, account switching/isolation, null conflicts, failed-load consent, test isolation, trigger-only checkpoints. Do not duplicate it. No migration applied.
- Initial migration review found a concern: direct authenticated insert to resume_revisions checks owner_id only, without verifying parent ownership. Also audit spoofed checkpoints and explicit anon grants/revokes. Resolve before applying migration; add actual SQL negative tests. No live migration applied.

## Remaining launch dependencies
- Finish/review storage and isolation tests; safely apply schema and verify a real save/load.
- Server-enforced generated PDF allowance, entitlements, Stripe checkout/webhooks/stacking/optional renewal.
- Server-only AI configuration, grounding controls, quotas and failure tests. See AI_PROVIDER_DECISION.md.
- Production SMTP, Vercel configuration/domain, production smoke tests, owner business/legal facts. See policies/LAUNCH_POLICY_DRAFT.md.
- Live payment activation/business verification remains owner work where identity or binding agreements are required.

Never put private keys in VITE_* or commit .env.local. Sandbox product creation does not mean billing is launch-ready.

## Follow-up scheduling
Owner requested notification when complete/live. Thread heartbeat `resumestride-launch-follow-up` created every 30 minutes to continue/review authorized work without duplicating Claude jobs. Continue independent coding while Vercel billing is blocked; pause when no meaningful independent work remains or completion is verified.

Latest: Vercel project linking added an ignored VERCEL_OIDC_TOKEN to .env.local; never print/commit it. Existing Supabase public keys were preserved. Production VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY were successfully configured in Vercel (session 36699 completed). Cloud storage must be reviewed/tested/applied before a configured public deployment.

## DNS verification pending — latest
GoDaddy DNS Manager loaded via portfolio → DNS → Domain Name dropdown. Existing A @ is WebsiteBuilder Site. Submitted replacement value 216.150.1.1, then Continue & Verify; now blocked on SMS identity code sent to owner phone ending 2672. User asked to enter it in GoDaddy iframe. Tab 1144761396 marked handoff at https://dcc.godaddy.com/control/dnsmanagement?domainName=resumestride.com. No saved change verified. After verification, inspect the A row before repeating; add second A @ 216.150.16.1 if needed. Keep email records intact. Then run vercel domains verify. Claude review-fix session 43194 is still running; no deploy or migration applied.

## Latest progress check
Claude session 43194 exited successfully. Reports build passed, builder tests 21/21, mocked auth/storage tests 12/12. Save race/account-switch/conflict fixes and trigger-only checkpoint SQL are implemented locally. Parent has not yet independently accepted these fixes; SQL tests remain unrun and migration unapplied. No Claude job currently running. DNS lookup still returns GoDaddy parking IPs 76.223.105.230 and 13.248.243.5; SMS verification/save not confirmed. Next: review changes, execute DB tests/apply schema and verify live storage, finish owner DNS verification, then deploy/test. Paid quotas/billing/AI remain unfinished.

## DNS update verified in GoDaddy
Owner supplied SMS code, entered only in GoDaddy. First A @ record replacement to 216.150.1.1 succeeded (visible row and success notification). Submitted second recommended A @ 216.150.16.1; GoDaddy requested a NEW SMS verification to the same phone. Second record not yet saved. No OTP stored in files. Preserve pending tab 1144761396. No email DNS records changed. Deployment remains pending.

## First public beta deployed — 2026-09-18
Production deployment dpl_DzRyaUf6q1hZieJFYxLwU31XYzUN is READY and aliased to https://resumestride.com. Direct URL: https://resumestride-7wzyghmn6-dipsons-projects.vercel.app . Verified deployed landing and editor in Chrome. Custom-domain HTTPS returns 200 and correct ResumeStride HTML when resolved to Vercel 216.150.1.1; local resolver/browser still sometimes reaches old GoDaddy site due to DNS cache. Do not claim propagation complete everywhere.

This is the LOCAL-STORAGE FREE BETA only. Deployed with explicit build overrides VITE_SUPABASE_URL= and VITE_SUPABASE_PUBLISHABLE_KEY= so unverified cloud/auth is unavailable. Project-level production public keys remain configured; future plain deploys would enable them, so retain these empty overrides until database/cloud verification is complete. Payments/AI/generated-PDF quotas remain unavailable. Independent production build and 21/21 builder tests passed before deployment.

Both recommended GoDaddy A @ records are now saved and visibly verified: 216.150.1.1 (1 hour TTL) and 216.150.16.1 (600 seconds TTL). Second SMS verification succeeded. No mail records changed. No more DNS SMS input pending.

## Cloud verification continued
- Owner confirms beta visible on real domain.
- Claude execution 7573 active on additional cloud write races, request-storm recovery, logout-during-load and slow-load edits. No duplicate job; source only, no deploy.
- Added reproducible `npm run test:db` using dev-only PGlite + pgTAP and minimal auth schema. Corrected five pgTAP throws_ok signatures and an assertion that incorrectly tried to read A's data as B. Added cross-account delete and anonymous read/write checks. 24/24 database assertions pass locally. This verifies real Postgres RLS/triggers locally, not hosted Auth/PostgREST.
- Supabase SQL editor preflight submitted to check existing resumes/revision tables; no migration applied yet. Browser tab 1144761458 query 3639f7fb-c344-4bd1-ae59-f541552ef2d6.
- Owner decisions: Texas personal operation under ResumeStride; do NOT publish personal legal name. No voluntary refunds, mandatory rights preserved. AI cap USD25/month approved; funded API account/key remains required. Public beta remains unchanged.

## Continued launch work — 2026-09-18
Owner confirms real-domain beta is visible. Keep public beta deployment with empty Supabase build overrides until cloud flows pass live verification. Claude session 7573 is actively fixing remaining create/conflict-write races, retry storms, logout-during-load and slow-load edits. Do not duplicate it.

Added dev-only PGlite/pgTAP and scripts/test-database.mjs; npm run test:db runs actual Postgres RLS/triggers using a minimal Supabase auth schema. Fixed invalid pgTAP throws_ok signatures and user-B visibility assertion; added cross-account delete/anonymous access tests. 24/24 pass. npm run build passes. Hosted Auth/PostgREST is not covered by this harness.

Applied the storage migration through Supabase SQL Editor as a transaction after confirming both tables absent. SQL was equivalent DDL to supabase/migrations/20260918120000_resume_storage.sql, excluding comments/IF NOT EXISTS/dropping absent triggers; final result verified resumes and resume_revisions both exist with relrowsecurity=true. UI query 3639f7fb-c344-4bd1-ae59-f541552ef2d6, project ggwwzwqykkncgupdimxp. No CLI migration-history entry created; reconcile before any future db push (do not reapply create policies). No hosted save/load or full hosted role tests yet.

Owner: Texas personal operation, public brand ResumeStride; explicitly do NOT publish personal legal name. No voluntary refunds, preserve mandatory rights. AI monthly cap USD25 approved; funded API account/server-only key still needed. See policy draft and provider decision docs. Other likely owner setup: Stripe private identity/business verification and production SMTP authorization. Do not ask for passwords/private keys in chat.

## Security audit and headers — 2026-09-18
User explicitly requested security testing. Read docs/SECURITY_REVIEW.md for evidence, limits and release blockers. npm audit: zero known vulnerabilities. Two adversarial browser tests pass. Hosted anonymous/invalid-token limit=0 probes on both tables rejected with HTTP401. Public secret/source/map paths return404; targeted bundle private-key patterns absent.

Security-only deployment dpl_53wTkneektw3BZck8RoqmMvavnys is READY, aliased resumestride.com; direct URL https://resumestride-2wqe2v5k0-dipsons-projects.vercel.app . It reuses EXACT previous public index.html/assets via prebuilt static output, so no unreviewed Claude source/cloud configuration was deployed. Added CSP and Permissions-Policy from vercel.json; headers verified via HTTPS against Vercel IP and landing/editor verified in Chrome. Static build directory /var/folders/hr/6p7q082n53951xm63kkj1zzc0000gn/T/resumestride-security-release-4exoqm_e. Standard future source deploys still need empty Supabase build overrides until account security release gates pass.

High cloud launch blocker: unbounded full-document revisions/no server write limits allow an abusive authenticated account to exhaust storage/cost. Implement bounded write/storage policy with non-destructive handling, consistent client retry UX, tested retention and server validation before public account enablement. Hosted two-account tests, production SMTP controls, deletion/export, payment/AI security still pending. Claude7573 continues source reliability fixes; don't duplicate. Public beta still stores drafts only in browser.

## September 19 — live Stripe inspection
Owner renewed authorization to complete available setup. Sandbox account name visibly confirmed ResumeStride Sandbox. Switch to live account navigated to https://dashboard.stripe.com/acct_1QqPbAGGSDSNHj5K/account/onboarding . The live activation page remained a blank loading surface, including after one reload; no requirements/form or verified activation result available yet. No financial details, terms, or live charges submitted. Live account ID differs from sandbox acct_1QqPbG7sBbdVbWSQ. Preserve this onboarding tab for next attempt; do not claim owner verification is definitely needed before the form can be inspected.
