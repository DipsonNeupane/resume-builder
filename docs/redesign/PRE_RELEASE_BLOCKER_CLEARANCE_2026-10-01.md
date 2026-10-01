# Pre-release blocker clearance

Date: 2026-10-01. Scope: isolated redesign candidate and additive provider preparation only. No production deployment, ResumeStride redirect, Stripe brand/catalog mutation, Supabase Site URL/sender change, hosted migration, push, merge, or destructive operation occurred.

## Result

- Repository release gate: **PASS** after permanent-route browser tests were reconciled with the implemented navigation and explicit pursue-before-tailoring policy.
- Additive provider preparation: **PASS**. APWICO DNS resolves to Vercel through two public resolvers, TLS works on apex and `www`, the alternate host remains `noindex`, Search Console ownership is verified, exact dual-domain Supabase callbacks are retained, and `auth.apwico.com` is verified by Resend.
- Local/account retention rehearsal: **PASS** for all automatable boundaries. Browser-only state remains origin-bound by design; no URL, analytics, or silent cross-origin content bridge exists.
- Production release: **NOT READY** until the short physical/human acceptance below passes and the explicitly authorized cutover window completes the staged candidate/provider/database checks in the runbook.

## Provider evidence

| Surface | Prepared/verified | Deliberately deferred to authorized cutover |
| --- | --- | --- |
| DNS / Vercel | `apwico.com` returns `216.150.1.1` and `216.150.16.1`; `www` returns the Vercel CNAME from Cloudflare and Google resolvers. Both hosts return valid TLS and Vercel headers. | Frozen APWICO candidate deployment and canonical/sitemap switch. The currently attached alternate host intentionally serves the live ResumeStride artifact with `X-Robots-Tag: noindex` and ResumeStride canonical URLs. |
| Supabase/Auth | Exact APWICO account/recovery/continuation callbacks were added while all ResumeStride callbacks were retained. | Site URL, public auth-email identity, real confirmation/recovery acceptance, and candidate migrations. Changing these now would change production behavior. |
| Email | GoDaddy Microsoft mail records were preserved. Resend reports both `auth.apwico.com` and `auth.resumestride.com` **Verified**. | Supabase sender switch and synthetic delivery/reply acceptance. |
| Stripe | Existing live account, product/subscription references, active ResumeStride webhook and commercial behavior were inventoried without mutation. | APWICO branding, return/webhook endpoint, receipt/invoice presentation, and synthetic Checkout/Portal/webhook acceptance. A second live webhook was not created because it could duplicate production event delivery. |
| Search / analytics | APWICO domain property ownership is verified; existing ResumeStride property/history is retained. Same Vercel project preserves the bounded analytics architecture. | APWICO sitemap submission, Change of Address, APWICO analytics host observation, and post-traffic field data. |

## Local-state and account-data rehearsal

| State | Intended behavior | Automated evidence |
| --- | --- | --- |
| Master/local draft | Existing `resumestride.resume.v1` and rescue identifiers remain unchanged on the same origin. Browser storage is never promised to cross origins. | Brand/release identifier checks; auth reload/local-draft tests; build and route rehearsal. |
| Job draft | Same owner can restore after reload; another account causes the foreign draft to be discarded without relabeling it or overwriting the local base. | Auth browser suite 41/41, including the real persisted-session account-switch case. |
| Account master | Same Supabase project, owner UUID, row and revision. APWICO requires reauthentication because browser auth storage is origin-bound. | Database replay/RLS and cloud-master browser tests. |
| Saved jobs / Match | Existing owner-scoped rows, opaque IDs, snapshots and evidence hashes remain unchanged. Unauthorized/missing restoration fails content-free. | Paid route/owner-isolation suite and release rehearsal. |
| Job-specific versions | Existing owner/version/job references remain unchanged; edits and exports use the separate version while the master remains unchanged. | Paid suite explicit-decision/tailoring, reload, conflict and account-isolation cases. |
| Entitlements / subscriptions | Existing database and Stripe customer/subscription/Price references are preserved; no branded replacements are created. | Database/server billing tests and live read-only inventory. Final return/webhook acceptance is a cutover validation. |
| Analytics | Same bounded event vocabulary and content-free owner-scoped conversion ledger; host/date can distinguish the transition. | Analytics sanitizer/event-contract tests. Query, hash, resume/job content and job URLs are excluded. |

Cross-origin browser-only data is intentionally **not copied**. The safe transition is coexistence: users review/export or sign in on ResumeStride, then reauthenticate on APWICO to restore account-backed state. Rollback keeps ResumeStride serving and preserves every legacy key and provider identifier.

## Automated release evidence

- `npm run test:auth -- --workers=1`: **41/41 PASS**.
- `npm run test:paid -- --workers=1`: **82/82 PASS** after focused reruns confirmed the permanent workspace routes, open full-evidence disclosure, pursue-before-tailoring gate and responsive document identity at 320/390/768/1440/1920.
- `npm run quality:gate`: **PASS** on the final candidate.
- `npm run test:server`, `npm run test:db`, `npm run brand:check`, production dependency audit and diff validation: **PASS** on the final candidate.

## One physical/human acceptance script

Use one phone and one desktop screen reader/keyboard session against the frozen, protected APWICO candidate during the authorized window. With fictional data only: (1) start by import, build, and pasted job; (2) use browser Back/Forward through Builder → Jobs → saved Match → job-specific resume and reload each saved state; (3) confirm focus, labels, zoom/reflow and reduced motion; (4) confirm the master stays unchanged after a separate tailored-version edit; (5) open a real synthetic confirmation and recovery link in a new tab; (6) cancel a test Checkout and return to the correct workspace. **PASS** only if no content crosses accounts, no critical control is unreachable or obscured, and every return/reload lands on the expected state. Any severe ownership, data-loss, auth, payment-return or accessibility defect stops release.

## Remaining classification

- **Required before production:** the physical/human acceptance above; freeze the candidate; reconcile/apply reviewed additive migrations only in the authorized window; take a current recovery point.
- **During controlled cutover:** APWICO candidate canonical/sitemap/robots; real auth/email links; Stripe return/webhook/receipt behavior; analytics/Search Console observation; synthetic two-account and local-origin coexistence smoke tests.
- **Post-launch:** Blueprint Tasks 58–61, extension publication/Task 37, additional-language launches, field-performance/search/outcome reporting after sufficient data.
