# Paid backend release gates

Production setup is not paid-launch completion. Leave BILLING_ENABLED and AI_ENABLED unset/false until the following checks pass. The public free beta also keeps both VITE_SUPABASE build values empty until hosted cloud acceptance.

## Configuration

Existing production secrets: OPENAI_API_KEY, STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY (Secret, Production only; save verified). Production Supabase publishable key/URL exist, but account UI remains disabled in the deployed artifact. Supabase SMTP delivery was verified through Resend.

Server still needs STRIPE_WEBHOOK_SECRET (endpoint not created), STRIPE_ACCOUNT_ID, STRIPE_PASS_PRICE_ID and STRIPE_MODE. APP_ORIGIN must be the exact trusted HTTPS origin, never derived from request Host. Use separate test values for sandbox validation. Never copy production Stripe credentials into tests or VITE variables.

## Local increments

- server/http/security.ts: verified Auth endpoint identity, bounded streamed body, trusted origin, safe responses.
- server/billing/stripe.ts: strict configuration gate, provider account/price checks, server-priced card checkout, raw-body signature verification with SDK tolerance and mode/Connect rejection.
- server/billing/policy.ts: three PDFs per signup-anchored 30-day window, manual pass stacking.
- AI budget SQL: service-only reservations/settlements, global $25 UTC-calendar-month cap, 20 reservations/account/hour. Unknown provider outcomes retain their reservation; automatic retries must never authorize another call. At month crossover, outstanding provider spend can post late; provider-level hard limit remains required. No AI content is stored in this ledger.
- server/ai/cost.ts: conservative text-only reservation arithmetic for candidate gpt-4.1-mini-2025-04-14 ($0.40/$1.60 per million tokens, official documentation checked September19). Model choice remains subject to multilingual/occupation quality checks, not claimed best-in-class. Include instructions and schema in reservation input; disallow unbudgeted tools/images.

## Acceptance still required

1. Apply reviewed migrations only after reconciling existing hosted schema and backup/recovery procedure.
2. Hosted real-user account isolation, session revoke/logout, conflict/recovery, deletion and export.
3. Local checkout intent/provider binding and payment ledger are implemented; verify these through real sandbox checkout and signed hosted webhook deliveries. Local replay/signature/race tests pass, not hosted acceptance.
4. Sandbox first/active/expired purchase and recurring lifecycle, cancellation and prepaid schedule coordination. Do not offer recurring before these exist.
5. PDF atomic accounting and authenticated UI implemented locally. Six template/paper samples visually checked; global script text extraction and deployed Chromium/font packaging remain open.
6. AI entitlement, consent, timeout/cost/schema checks and reviewed separate-draft UI implemented locally. Real provider multilingual/occupation quality evaluation and hosted budget verification remain open.
7. Configure signed webhook, production account and price checks, deploy disabled backend, verify gates, then explicitly enable only accepted capabilities.

No current local unit test certifies hosted security, a live payment or installed-extension behavior.

References: [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [Stripe signature verification](https://docs.stripe.com/webhooks/signature), [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

## Packaging check
Run `node scripts/check-packaged-functions.mjs /absolute/path/to/.vercel/output` after an isolated `vercel build --standalone` with disabled gates. Six compiled handlers, required PDF assets and font-embedded HTML passed September19. This does not launch Linux Chromium or validate hosted credentials. Keep production gates disabled until hosted acceptance.
