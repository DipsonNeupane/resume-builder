# Premium template monetization and production-integration architecture

Date researched: 2026-09-28  
Status: **implementation blocked at the requested compliance/owner-decision gate**  
Scope: research and implementation-readiness only. No billing, entitlement, template, email, Stripe catalog, hosted database, Chrome Web Store, or production behavior was changed.

This is a product/engineering analysis, not legal advice. ResumeStride needs qualified counsel for the jurisdictions in which paid subscriptions will be offered.

## Executive decision

The proposed recurring model is technically feasible in Stripe, but it is not safe to implement exactly as written for an unrestricted worldwide launch.

Three changes or decisions are required first:

1. **Choose paid sales territories.** The site is worldwide and the current checkout has no documented jurisdiction allowlist. Consumer-subscription, tax, operator-disclosure, withdrawal, refund, sanctions, and language duties vary by buyer location. Recommended first release: paid subscriptions only where the owner has completed legal/tax review (initially the United States is the narrowest practical option), while keeping the Free product worldwide. Do not infer that a USD Stripe Checkout makes worldwide selling compliant.
2. **Add a mandatory-rights exception to the cancellation/refund contract.** “Access continues through the already-paid period” is a good ordinary cancellation policy, but it cannot override statutory withdrawal, refund, defective-service, unauthorized-charge, or other mandatory remedies. EU distance sales generally carry a 14-day withdrawal right for services; beginning performance early and any loss/limitation of that right require the correct express request/acknowledgment. The existing policy draft also leaves the refund commitment unresolved.
3. **Resolve the billing-period mismatch.** The brief says US$19.99 “per month,” while the current production recurring implementation and catalog validation use **every 30 days**. Those are not the same cadence. If “monthly” is locked, use Stripe `interval=month`, `interval_count=1` and disclose the actual next charge date. Otherwise all UI and emails must say “every 30 days,” not “monthly.” Existing one-time/recurring Pro customers also need a migration/coexistence decision before changing the catalog.

Until those decisions are made, the correct action under the brief is to stop before implementing billing.

## 1. Compliance findings

### United States baseline

For internet negative-option offers, ROSCA requires material terms to be clearly disclosed before billing information is obtained, express informed consent before charging, and a simple way to stop recurring charges. The FTC's 2024 amended Click-to-Cancel rule is not a safe implementation baseline by itself: the current FTC page records a new 2026 rulemaking, while ROSCA, the FTC Act, and state automatic-renewal laws remain relevant.

California Business and Professions Code §17602 currently requires, among other things:

- clear and conspicuous terms near consent;
- affirmative consent and retention of consent evidence for at least three years or one year after termination, whichever is longer;
- a retainable acknowledgment containing terms, cancellation policy, and cancellation instructions;
- online cancellation for an online purchase, without obstructive steps;
- fee-change notice no less than 7 and no more than 30 days before the change;
- an annual reminder stating the product/service, charge frequency and amount, and cancellation method;
- special 3–21-day notice for trials/promotional prices longer than 31 days and 15–45-day notice for initial terms of at least one year.

New York General Business Law §527-a likewise requires clear terms, affirmative consent, a retainable acknowledgment, an easy cancellation mechanism and online cancellation for online enrollment. Its reminder windows apply to longer terms and longer free trials; material changes, including price increases, require advance notice.

The proposed plans have no trial or introductory price, so trial-conversion rules should not be activated. Do not add trials, coupons that change later, or introductory pricing without a new compliance review.

### Outside the United States

The EU's official consumer guidance says online services generally have a 14-day withdrawal period, with specific rules for beginning service/digital performance early and for reimbursement. It also requires clear pre-contract information and total prices including taxes/charges; these rights can apply to non-EU traders targeting EU consumers.

The UK's new DMCCA subscription-contract regime is expected to come into force in Spring 2027. Government implementation material anticipates clear pre-contract information, easy online exit, reminder notices (roughly every sixth renewal for rolling monthly contracts), renewal cooling-off rights in defined cases, and end-of-contract notices. It is not the present launch rule yet, but a worldwide architecture should be able to support it rather than hard-code one US email cadence.

Stripe also prohibits transactions involving restricted jurisdictions/persons and makes the seller responsible for legally and tax-compliant invoices. Stripe Checkout, Billing, Tax, and the Customer Portal are tools, not a transfer of the merchant's compliance responsibility.

### Source record (authoritative/current sources)

- FTC, ROSCA/negative options: https://www.ftc.gov/business-guidance/blog/2016/09/negative-options-make-them-positive
- FTC, current Negative Option Rule docket: https://www.ftc.gov/legal-library/browse/rules/negative-option-rule
- California BPC §17602: https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=17602.
- New York GBS §527-a: https://legislation.nysenate.gov/pdf/laws/GBS527-A
- EU withdrawal rights: https://europa.eu/youreurope/citizens/consumers/shopping/returns/index_en.htm
- EU distance-selling duties: https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/ecommerce-distance-selling/index_en.htm
- UK implementation status: https://www.gov.uk/guidance/writing-a-fair-contract-for-customers
- UK subscription-regime consultation outcome: https://www.gov.uk/government/consultations/consultation-on-the-implementation-of-the-new-subscription-contracts-regime/outcome/government-response-to-consultation-on-the-implementation-of-the-new-subscription-contracts-regime-web-accessible-version
- Stripe subscriptions: https://docs.stripe.com/billing/subscriptions/overview
- Stripe customer emails: https://docs.stripe.com/billing/revenue-recovery/customer-emails
- Stripe portal: https://docs.stripe.com/customer-management
- Stripe cancellation: https://docs.stripe.com/billing/subscriptions/cancel
- Stripe currency minimums: https://docs.stripe.com/currencies
- Stripe prohibited/restricted activity: https://stripe.com/legal/restricted-businesses

## 2. Renewal reminder rule

**Do not treat “3 days before every renewal” as the legal rule.** It can remain a customer-friendly product promise, but it must be one layer in a jurisdiction-aware notice policy.

Recommended implementation baseline for the initial no-trial plans:

- send a renewal reminder **3 calendar days before every charge**, with product/template name, exact amount and currency, charge date, cadence, and a direct manage/cancel link;
- send a California-compatible annual reminder with product/service, charge frequency, amount, and cancellation method (a monthly reminder can count only if it contains the required information and delivery evidence is retained; model this as a distinct compliance obligation rather than relying on an assumption);
- send price-change notice **30 calendar days before** the change, plus any jurisdiction-specific confirmation/consent requirement; never mutate an existing Stripe Price;
- add trial/introductory and long-term reminder policies only if those offers are later introduced;
- store immutable notice attempts/delivery outcomes and the policy/version that selected the date.

Stripe can send configurable upcoming-renewal emails for automatic-charge subscriptions and failed-payment/receipt emails. Use that where it satisfies the chosen policy, but keep a local notice ledger and a server scheduler because legal timing/content and application-specific cancellation links must not depend on an unverified Dashboard setting. Sandbox does not send all customer emails automatically, so email acceptance needs controlled inbox tests.

## 3. Stripe catalog and subscription model

Recommended catalog:

- one Stripe Product, `ResumeStride Pro`, with one active USD monthly Price;
- one Stripe Product per Premium template, each with one active USD 1.99 monthly Price;
- immutable local catalog table mapping `offer_key -> product_id -> price_id -> template_id/tier -> amount/currency/interval -> live/test -> effective dates`;
- Stripe metadata is a reconciliation aid, never authorization authority;
- new price object for every price/cadence change; do not edit historical meaning.

One product per template gives clear Checkout, receipt, invoice, email and Customer Portal names. A single generic product with 20 prices would make customer-facing billing harder to understand. A multi-item subscription can hold up to 20 items, but it couples billing dates and makes independent purchases/cancellations and the 20-template-plus-Pro case awkward. Use one subscription per individually purchased template and one for Pro.

The server creates Checkout Sessions from an allowlisted offer key only. It supplies the Price, quantity `1`, authenticated owner/customer, return URLs and idempotency key. The browser never supplies an amount, Price ID, entitlement, customer ID, or subscription status.

Stripe supports US$1.99 recurring charges (above the documented US$0.50 minimum), multiple subscriptions, cancellation at period end, portal management, invoices/receipts, retries, refunds, disputes and lifecycle webhooks. Economics still need owner acceptance: at commonly published US card economics, the fixed transaction component is significant relative to US$1.99, and Stripe Billing/tax/email/provider costs may be additional. Measure actual account pricing before promising margin or unlimited infrastructure consumption.

## 4. Entitlement model

Use server-authoritative, account-owned grants derived from verified Stripe state. Suggested minimal records:

```text
billing_offers
  offer_key, kind(pro|template), template_id?, stripe_product_id,
  stripe_price_id, amount, currency, interval, live, active

billing_customers
  owner_id unique, stripe_customer_id unique, live

billing_subscriptions
  stripe_subscription_id, owner_id, offer_key, status,
  cancel_at_period_end, current_period_end, latest_invoice_id,
  created_at, provider_updated_at

billing_invoices / billing_events
  immutable provider ids and verified facts; unique event/invoice ids

entitlement_grants
  owner_id, kind(pro|template), template_id?, source_subscription_id,
  starts_at, ends_at, state, reversal metadata

transactional_notices
  owner_id, subscription_id, kind, due_at, sent_at, provider_message_id,
  policy_version, delivery_state
```

Effective access at request time:

```text
free template                 -> always allowed
premium template              -> active Pro grant OR active matching-template grant
Pro Jobs/Match/Tailoring      -> active Pro grant only
premium-template export       -> same template entitlement checked against resume.template
```

`cancel_at_period_end` does not revoke a paid-through grant. `past_due` does not extend access; an already paid grant remains until its verified end. `unpaid`, `canceled`, `incomplete_expired`, a full refund, or a lost dispute cannot create new access. Refund/dispute policy must distinguish full and partial reversals instead of guessing. Content/history rows are never deleted by entitlement transitions.

Process only signature-verified webhooks, retrieve provider objects when identity/financial facts matter, bind subscriptions to the authenticated checkout owner and one allowlisted offer, enforce unique IDs/idempotency, and make updates monotonic so replayed/out-of-order events cannot move access backward or resurrect reversed grants. Reconcile periodically from Stripe to repair missed delivery. Stale clients may display cached UI, but every privileged API/export request re-evaluates server entitlement.

## 5. Individual US$1.99 template behavior

- Full preview is available before purchase.
- Checkout discloses: `US$1.99 per month`, auto-renewal, charge timing, cancellation method, refund/mandatory-rights policy, and “PDF keeps the selected design; Word gives a clean, editable version of the same content.”
- Successful verified invoice grants only that template through the invoice period end.
- Cancellation schedules no future charge and preserves already-paid access, except where a mandatory remedy requires earlier termination/refund.
- At expiry, keep the resume and selected template ID. Open it read-only/with editing intact, show that the design is unavailable for new preview/export, and offer a Free-template switch, restart, or Pro. Never silently rewrite the saved template ID.

## 6. Pro overlap

Safest customer-friendly rule:

1. Before Pro Checkout, list individually renewing template subscriptions and explicitly state that activating Pro will schedule those renewals to stop at their current period ends.
2. Require affirmative confirmation; do not silently change subscriptions merely because the Pro page was viewed.
3. Only after the first Pro invoice is verified as paid, set each individual template subscription to `cancel_at_period_end=true`, idempotently. Preserve its paid-through grant.
4. If Pro payment fails, do not cancel template subscriptions. If a provider update partially fails, retry and visibly report the remaining renewals; never claim completion prematurely.
5. While Pro is active, all 27 templates are available and template upsells are hidden. Individually paid template periods may overlap, but none renew after the confirmed transition.
6. If Pro ends while an individual template grant is still paid through (including a subscription the customer resumed), that template remains available. Otherwise access returns to the seven Free templates and Free Jobs/Match limits without deleting data.

This prevents silent ongoing double payment. Stripe does not provide a true “pause until Pro later ends and then automatically resume without renewed customer consent” abstraction suitable for this promise, so do not invent one.

## 7. Export policy

An active matching-template grant or Pro grant permits PDF and DOCX exports for that resume without consuming the Free three-download allowance. Keep the wording “unlimited for ordinary personal use” out of the contract unless abuse limits are disclosed; implement a generous server fair-use ceiling instead (recommended starting control: rolling per-account and per-IP rate limits, concurrency 1–2, document-size/page ceilings, and anomaly review). Do not use an exceeded abuse limit to consume Free quota or revoke the subscription.

The export endpoint must derive the template from the validated server request/document and authorize it server-side. Direct calls using a locked Premium ID must return an entitlement error. PDF uses the selected visual renderer; DOCX stays the existing template-neutral editable representation.

User-facing copy:

> PDF keeps your template's design. Word (.docx) gives you a clean, editable version of the same resume content; it does not reproduce the template's visual layout.

## 8. Transactional emails

Required product lifecycle set:

- purchase acknowledgment/receipt: plan/template, amount, cadence, next charge date, cancellation link, refund/mandatory-rights information;
- upcoming renewal: per the jurisdiction-aware schedule above;
- cancellation confirmation: immediately after the provider accepts cancellation, including final access date;
- payment failure/action required: link to update/confirm payment, without implying paid access was extended;
- renewal receipt: verified paid invoice and new period;
- access-expired notice where useful, with Free-template/content-preservation explanation;
- price/material-change notice before it takes effect.

Use Stripe's receipts, invoice emails, renewal reminders and recovery links where configured and verified. ResumeStride still needs its own durable compliance notice ledger and likely a small transactional sender for wording/events Stripe cannot cover. No general marketing list or promotional content belongs in these messages. There is no existing general transactional-email provider in the repository; provider selection, sender-domain authentication, bounce handling and retention are owner/setup decisions, not something to introduce casually in code.

## 9. Customer Portal

Use the Stripe Customer Portal for payment-method updates, invoice/receipt history and per-subscription cancellation at period end. Create short-lived portal sessions server-side for the authenticated account's bound Stripe Customer. Disable plan/quantity switching unless explicitly designed and tested. Keep an in-app billing summary because 20 independently named template subscriptions plus Pro need clearer grouping and overlap warnings than a generic portal alone.

Portal access does not replace ResumeStride's ownership checks, entitlement display, cancellation confirmation, notice ledger, or webhook reconciliation.

## 10. Template integration

Preserve `template-library/` as the approved visual source and move it into production in bounded layers:

1. Promote the registry to the production template metadata source for all 27 templates. Extend `TemplateId`/resume validation to the 20 IDs; metadata includes tier/status/factual release date. `NEW` is derived from `releasedAt`; no Popular/Recommended labels until real aggregated usage supports them.
2. Promote the pure resume-to-view normalization and Premium renderers/styles without changing the approved designs.
3. Bundle the OFL font files and license texts as build assets required by the application/PDF runtime. Keep network access disabled in PDF rendering. Verify Vercel packaged-function inclusion, PDF embedding, Latin Extended and existing Noto script fallbacks, and actual bundle/function sizes.
4. Add access state around selection/export, not inside renderers. Locked templates remain fully previewable.
5. Preserve the selected Premium ID after expiry; use an explicit preview/export fallback state rather than mutating resume data.

The existing registry already contains 7 Free and 20 approved Premium prototypes, factual metadata, no fabricated popularity, and an additive path for future cohorts.

## 11. Free preview parity fix

Replace the current viewport-relative `cqw` page geometry with the Premium library's fixed A4/Letter print geometry for **all** templates, scaling only the outer page for screen display. Reuse the same paginator/page-break rules for preview and PDF. Do not change Free template markup or styling beyond what is necessary for geometry/parity.

Regression fixtures must cover the reported 360px mismatches (Modern, Classic, Bold, Ledger and the Compact clinical sample) at A4 and Letter, plus long, RTL, Latin Extended and CJK/Arabic fallback content. The acceptance invariant is preview page count equals rendered PDF page count, not merely “no overflow.”

## 12. Analytics

Extend the existing privacy-closed event allowlist with:

- `template_viewed`
- `premium_template_previewed`
- `premium_template_checkout_started`
- `premium_template_activated`
- `premium_template_cancelled`
- `premium_template_renewed`
- `pro_checkout_from_template`

Allowed properties: stable template ID, tier, surface, user state/plan, and bounded outcome vocabulary. Never include resume text, job text, names, email, Stripe/customer/subscription IDs, prices supplied by the client, URLs, or free-form errors. Server/webhook lifecycle events should be aggregated from trusted offer IDs; browser events are product telemetry, not billing evidence.

## 13. Verification plan

Before release, require:

- unit/property tests for the 27-template registry and effective-entitlement matrix;
- database tests for account isolation, immutable offer/subscription binding, replay, ordering, concurrent Checkout reservation, cancellation, paid-through preservation, failure, full/partial refund and disputes;
- provider sandbox tests for each lifecycle event, Portal cancellation/payment update/invoice history, duplicate/out-of-order delivery, Pro overlap transition and recovery from partial cancellation updates;
- direct export API tests for Free, matching template, other Premium template, Pro, expired, stale client and account switch;
- PDF/DOCX content/fidelity tests and all 400 existing Premium parity cases, plus the Free 360px regressions;
- mobile Builder and keyboard/screen-reader coverage for preview, locked-state dialog, disclosure/consent, cancellation and expiry recovery;
- controlled transactional-email tests for timing, content, direct cancellation links, duplicate suppression, bounced delivery and timezone handling;
- packaged Vercel-function/font checks and a non-production deployment smoke;
- legal/policy/checkout-copy review for every enabled sales territory;
- no production deployment or Stripe live catalog mutation without explicit owner approval.

## Owner decisions required before implementation

1. Paid territory at launch: **US-only initially (recommended)**, or provide reviewed jurisdictions and jurisdiction-specific requirements for a wider launch.
2. Pro cadence: true calendar month (recommended because the brief says monthly) or retain every 30 days and change all wording.
3. Existing Pro coexistence/migration: current one-time pass and existing recurring customers versus the new US$19.99 subscription.
4. Mandatory-rights/refund policy and process, reviewed for enabled territories.
5. Operator/business disclosure and tax registration/collection readiness for enabled territories.
6. Transactional email provider/domain setup if Stripe email alone cannot satisfy the selected notice policy.

