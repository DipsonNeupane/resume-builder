# Launch terms and public copy — prepared for owner review

Status: **proposed text, not legally reviewed or approved.** Nothing here is deployed.
The proposed terms are in `public/terms.html` on branch `feat/apwico-launch-tracker`; the
pricing page is generated from `src/content/commercial.ts` by `scripts/render-templates.ts`.
Do not deploy this branch until the owner (and counsel, if used) approves this text.
No Stripe product, price or portal setting was changed.

## What changed in `public/terms.html` (dated October 27, 2026)

| Section | Change | Source of truth it must match |
|---|---|---|
| The service | Now names job search and application tracking; states saving, downloading or changing a stage never submits an application | Product behavior |
| Free plan (new) | Downloads (unchanged wording: 7 per rolling 7 days, failed never count); **up to 100 tracked applications** (all stages count; at the limit everything stays viewable/editable/exportable/removable, only adding waits; nothing hidden or deleted); **one complete tailoring trial** (bound to the first application prepared, up to 3 successful AI runs, failed runs don't count, no renewal, not transferable, no cash value); job search (3 manual refreshes / rolling 24 h, up to 10 results, optional daily refresh) | `launchFacts.ts`; `product_settings`; `document_begin`/`pdf_status`; trial migration |
| Pro subscription | US$14.99/month, US-only, monthly renewal until cancelled, express consent, Stripe shows final amount; **new "Pro limits"**: up to 10,000 applications, 20 results per search, fair-use downloads, 20 AI requests/hour/account, service-wide monthly AI limit may pause AI | `applications_owner_limit`, `PRO_JOB_LIMIT`, `reserve_ai_budget` |
| Cancellation and access | Cancel any time; access to end of paid period; then Free; Premium designs preview-only; **over-100 records stay fully available**; ending Pro never deletes resumes, versions, applications or kept documents; **the "we aim to send a reminder three days before renewal" sentence was removed (October 28)** — replaced by "We keep durable records of required billing notices. Your cancellation rights do not depend on receiving any email from us." | Billing code (unchanged); tracker RPCs |
| Your data and access (new) | CSV export; access/correction/deletion via support per privacy notice | Privacy notice (deletion is by support request; there is no self-serve account deletion) |
| Fair use | Removed individual-template-subscription clause; "no plan promises unlimited downloads or AI use" | — |
| AI and external websites | Adds: unverifiable suggestions are marked; pasted links are not fetched | Tailoring traceability; `normalizePastedJobUrl` |
| **Removed** | "Individual Premium-template subscriptions are no longer sold…" paragraph; "Existing one-time access" section; individual-template expiry wording | APWICO has no existing customers |

`tests/server/launch-facts.test.ts` fails if the terms, pricing page, SQL enforcement or
`launchFacts.ts` disagree on downloads, the 100-application cap, the trial, Pro ceilings, the
hourly AI limit or the price, and if retired products reappear in terms or pricing.

## Pricing page (`/pricing/`)

Restored the "Paid availability" block (territory, USD currency, payment methods, taxes and
invoices, refunds). It had silently disappeared because the generator inserted it after a
section that no longer exists. Added a "Limits, renewal and your data" block (Free trial,
Pro limits, renewal, cancellation, data access). Homepage Free plan copy said "Save and
track up to **10** applications" — corrected to 100 and now generated from `launchFacts`.

## Items the owner should confirm before launch

1. The whole of `public/terms.html` as legal text (governing law, consumer-rights wording,
   refund policy are unchanged from the September 30 version).
2. Renewal reminder. The mechanism exists: a daily Vercel cron (`/api/dispatch-billing-notices`,
   14:15 UTC) queues a reminder 3 days before `current_period_end` for active Pro subscriptions
   not set to cancel (`billing_schedule_renewal_notices`) and sends it through Resend. It is
   tested locally (`supabase/tests/renewal_reminder.test.sql`, `tests/billing/notices.test.ts`):
   scheduling, idempotency, no reminder for cancelling subscriptions, cancellation suppresses a
   queued one, the email states the renewal date, and a reminder is never sent after the renewal.
   **Delivery has not been verified** (needs `RESEND_API_KEY`, a verified sending domain,
   `BILLING_EMAIL_FROM`, `CRON_SECRET`, and Stripe-fed subscription periods). Because of that the
   promise was removed from the terms; `launch-facts.test.ts` fails if a reminder promise returns
   to terms, privacy or pricing. Re-adding it is an owner decision after staging check L12
   (`docs/launch-review/STAGING.md`). Note that some US state automatic-renewal laws require
   specific notices; counsel should confirm whether a monthly plan needs one.
3. That 100 Free applications, 1 trial with 3 AI runs, 10,000 Pro ceiling and 20 AI
   requests/hour are the intended launch numbers (they are configurable; see the progress doc).
4. `public/privacy.html` (updated earlier on this branch for tracker data and kept document
   copies) — review together with the terms.
5. Billing code still contains legacy individual-template plan handling behind "has an
   active legacy subscription" checks. With no customers it never renders; removing it touches
   webhook/reconciliation code and should be a separate reviewed change.
