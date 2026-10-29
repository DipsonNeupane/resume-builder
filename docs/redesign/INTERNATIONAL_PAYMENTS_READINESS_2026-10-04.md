# International paid access readiness — 2026-10-04

## Decision

International paid access remains **not ready**. Stripe can technically accept
international cards against USD Prices, but technical acceptance is not the same
as APWICO being registered and operationally ready to collect, report, and remit
indirect tax in every jurisdiction where a customer may buy.

Production stays U.S.-only. The current trusted `x-vercel-ip-country` gate and all
customer-facing U.S.-availability language remain unchanged.

## Provider evidence

Read-only Stripe dashboard audit on 2026-10-04:

- Account head office: United States, Texas.
- Product tax category is configured for digital business/web services.
- Price tax behavior is automatic.
- Stripe Tax threshold monitoring and obligation-email notifications are on.
- No Texas tax registration is present; Stripe explicitly reports that tax will
  not be collected until a registration is added.
- Existing Checkout Sessions do not calculate automatic tax.
- Checkout API sessions currently present USD Prices and use Stripe's compatible
  dynamic payment-method selection.

Official Stripe references checked 2026-10-04:

- Automatic tax must be enabled on each Checkout Session:
  https://docs.stripe.com/tax/checkout
- Registration and threshold obligations are jurisdiction-specific:
  https://docs.stripe.com/tax/registering
- Stripe Tax monitors thresholds but does not itself create registrations:
  https://docs.stripe.com/tax/monitoring
- Checkout can collect billing addresses and tax IDs:
  https://docs.stripe.com/tax/checkout/tax-ids

No conclusion here is tax or legal advice.

## Technical preparation completed

`PAID_TERRITORY_MODE` now defaults to `us`. An `international` value fails closed
unless `STRIPE_AUTOMATIC_TAX_ENABLED=true` is also explicitly set. Only in that
gated mode does subscription Checkout add:

- `automatic_tax.enabled=true`;
- required billing-address collection;
- safe customer name/address updates;
- tax-ID collection.

Unknown modes and incomplete international configuration return a configuration
error. Existing production settings omit the new flags, so behavior is unchanged.
Tests cover the U.S. default, non-U.S. rejection, invalid modes, the fail-closed
tax dependency, and the exact international Checkout options.

## Genuine owner/external gates

Before changing production territory mode, the owner and qualified tax/legal
advisers must determine:

1. Where APWICO has a present registration obligation, starting with its home
   jurisdiction and then each intended sales territory.
2. Required registrations, filing/remittance cadence, invoice wording, refund
   tax treatment, and whether any territory should remain excluded.
3. Which registrations to create in Stripe Tax and their effective dates.
4. Whether Terms, Privacy, Pricing, refund language, and support operations need
   territory-specific changes.
5. A Stripe test-mode acceptance matrix covering taxable/exempt addresses, tax
   IDs, failed tax calculation, invoices/receipts, refunds, renewals, and webhooks.

Only after these gates pass should a separately authorized production change set
both international flags, update public availability language, and run live
low-value acceptance. Local currencies are optional for the first expansion;
USD presentment is technically supported but must be disclosed.

