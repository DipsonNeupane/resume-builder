> September 25, Task #64: start with the consolidated [final V1 launch checklist](../FINAL_LAUNCH_CHECKLIST.md).
> The older release and account-setup records below are historical, not current acceptance.

## Additional manual extension check

Browser automation cannot open Chrome’s extension manager (explicit security-policy rejection). When back, load `apps/extension` unpacked through Chrome’s Extensions manager, then click its toolbar icon on a Greenhouse job posting and confirm captured fields. This is needed only for extension acceptance, not the already-live paid website. Do not send credentials.

> September 25, Task #60: use the concise [production/cloud OWNER ACTION checklist](PRODUCTION_OWNER_ACTIONS.md)
> for the next rollout. The records below describe earlier sessions and do not establish
> current dashboard state or authorize live changes.

# Paid web launch is live — September 20

Visit https://resumestride.com. Signup, $19.99 one-time Pro passes, optional recurring renewal, AI suggestions requiring review, and 3 free generated PDFs per 30-day signup period are enabled. Production download/auth/allowance checks passed. Real money was not charged during testing; payment/refund/cancellation lifecycle passed in Stripe sandbox.

**Owner action (when back at laptop):** create/connect TikTok and Instagram accounts and configure Higgsfield API for final marketing videos. Scripts/storyboards can proceed now; no publishing account is connected yet. No additional Stripe, OpenAI, email, password or identity setup is currently blocking the web app.

**Engineering still in progress:** cloud saving/recovery acceptance and browser extension production integration, real-site capture and store delivery. Cloud remains disabled; extension is not publicly released. Synthetic acceptance accounts must not be counted as acquired users. See HANDOFF.md for evidence and current workers.

Older checklist entries below are historical and may describe already-completed setup or pre-launch gates.

# Latest owner status — September 20

No new identity, password, API key or approval is currently required from the owner. Stripe, OpenAI, email and backup account setup are available. Remaining launch work is engineering verification: hosted PDF runtime failure, hosted AI/provider acceptance, Stripe webhook transport and final live checkout/access checks. Auth-only signup remains live.

For marketing publication, owner still needs to choose/connect the actual social accounts. Existing historical checklists below are superseded where they request already-completed account setup.

# Current status — September 20

Free auth-only signup is live and real production email sign-in passed. The older checklist below is historical where it describes signup disabled or backup payment still needed. No additional owner identity/password step is currently identified. Paid checkout, recurring coordination, refunds/disputes, generated-PDF quota and AI hosted acceptance remain engineering work. Supabase Pro and isolated baseline restore completed; hosted cloud release gates remain. Marketing task is preparing assets separately; owner still needs to select/connect social destinations before publication.

# Owner launch checklist

Updated September 19, 2026. Public resumestride.com remains a local-storage free beta. Paid launch is not complete.

## External account steps

- [x] Stripe owner verification completed; existing live key saved in Vercel as STRIPE_SECRET_KEY (Secret, Production only). Live one-time and optional 30-day recurring prices created. Payment capability/checkout/webhook verification still belongs to the implementation work below.
- [x] OpenAI funded account and OPENAI_API_KEY saved securely in Vercel. Default project has a $25 monthly hard limit enabled; billing shows $5 credit and auto-reload off. App-side budget enforcement remains engineering work.
- [x] Resend auth.resumestride.com verified, restricted sending key saved in Supabase SMTP. Owner test sign-in email returned HTTP200 and Resend recorded Delivered. End-to-end sign-in click-through remains to verify.

Supabase service-role key transfer is complete: saved as a Vercel Production-only Secret with owner approval. A backup-plan decision is now pending: the hosted Free plan explicitly has no project backups. Choose managed Pro backups (actual cost must be confirmed before purchase) or a separate backup system; either requires a restore test before cloud launch. The agent will identify any exact verification/agreement needed rather than ask the owner to repeat these completed steps. Never send passwords or secret keys in chat.

## Release authorization and status

Owner explicitly approved updated free-beta deployment and three video drafts in typed chat. Free-beta deployment dpl_8LUoRKCGhUPVdbMiLLU83joVDR2R is live at resumestride.com with accounts/cloud disabled. Videos are local drafts; no social posts or spending executed. New voice actions still require written confirmation; typed requests work normally.

## Engineering work owned by agents

Implemented locally: required personal details, forward-step/partial-entry and final-print validation, truthful deterministic Pro preview, advisory resume quality review, tested cloud-save race fixes, local extension capture/review foundation, base-preserving job draft and sign-in isolation. No live AI generation or paid checkout claimed.

Still required: toolbar-popup lifecycle testing and permitted real-site capture (unpacked Chromium API smoke passed); production account linking/entitlements; hosted authenticated acceptance of applied cloud validation/storage caps; hosted two-account/recovery/deletion verification; Stripe checkout/webhooks; generated-PDF quota enforcement; AI cost enforcement; production policy/support/email checks. These are not additional owner chores.

Latest completed checks are in HANDOFF.md and SECURITY_REVIEW.md. Claude1498 completed local migrations; independent review fixed null-validation gaps and added historical accounting. Latest local account suite27/27 passed (16:56 UTC). Claude PID73004 is open in this repo; inspect its actual work before dispatching another job. Owner explicitly authorized continuing through launch in typed chat. Hosted migration/release still requires passing the security and functional gates; authorization is not evidence those gates have passed.

## Current backup status
Pro activation and spend cap verified after owner payment. Two physical snapshots listed; isolated restore drill remains engineering work. Billing shows projected$26.65 versus$25 base; no add-ons changed. No further billing entry needed. Additional restore-target spending must be quoted before authorization.

## Recovery drill status
Owner credential step completed. Restore target ntrqseoiwyrvdsobwxaj shows COMPLETED Sep20 03:48:43UTC. Baseline schema/RLS presence checked; newer migration replay and actual account-isolation/recovery acceptance remain agent work. No further password entry requested.
