/** Server-only, LOCAL policy foundation for the OPTIONAL recurring USD 19.99 /
 * 30-day subscription. The one-time manual pass (server/billing/policy.ts,
 * `20260919210000_billing_ledger.sql`) remains the default purchase; this
 * module never changes that path and is not imported by it.
 *
 * This file is pure: no Stripe/provider call, no database access, no mutation
 * of its inputs. It does not verify webhook signatures and does not decide
 * what counts as a verified invoice — a caller holding the service-role key
 * must already have done that (retrieved the invoice from Stripe itself,
 * confirmed its subscription/customer/price against a server-trusted
 * record) before calling any function here. See docs/RECURRING_IMPLEMENTATION.md
 * for the full design, the matching SQL layer, and what is NOT implemented.
 *
 * Installed Stripe SDK note (checked against node_modules/stripe 22.6.2's
 * own .d.ts, not assumed from memory): in this API version `Subscription`
 * has NO top-level `current_period_end`/`current_period_start` — those moved
 * to each subscription item. `Invoice` DOES have top-level `period_start`/
 * `period_end`, and its subscription reference is nested at
 * `invoice.parent.subscription_details.subscription`, not a top-level
 * `invoice.subscription`. Callers must use the verified purchased invoice line period for coverage;
 * invoice-level period fields describe invoice accounting, not necessarily
 * the service period being purchased. */

import { PRO_PASS_AMOUNT_CENTS, PRO_PASS_CURRENCY } from './constants.js'

const MAX_TIMESTAMP = 8_640_000_000_000_000
/** Defense in depth: this product bills a fixed 30-day price, so a genuine
 * invoice period is always close to 30 days. This is a generous outer bound
 * (not an exact-30-day check, since Stripe may still report a slightly
 * different span for reasons outside this module's control) that only
 * exists to reject corrupt/absurd data before it reaches interval math. */
const MAX_PERIOD_MS = 366 * 24 * 60 * 60 * 1000

export const RECURRING_AMOUNT = PRO_PASS_AMOUNT_CENTS
export const RECURRING_CURRENCY = PRO_PASS_CURRENCY

function timestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TIMESTAMP) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function nonBlank(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 255) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

/** Mirrors the installed Stripe SDK's own `Subscription.Status` union
 * (node_modules/stripe/cjs/resources/Subscriptions.d.ts), minus its
 * `OtherString` escape hatch — an unrecognized status must fail closed here,
 * not be silently treated as one of these. */
export type SubscriptionStatus =
  | 'active' | 'past_due' | 'canceled' | 'incomplete'
  | 'incomplete_expired' | 'paused' | 'trialing' | 'unpaid'

const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'paused', 'trialing', 'unpaid',
]

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
}

/** Mirrors the installed Stripe SDK's own `Invoice.Status` union
 * (node_modules/stripe/cjs/resources/Invoices.d.ts), minus `OtherString`. */
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'

const INVOICE_STATUSES: readonly InvoiceStatus[] = ['draft', 'open', 'paid', 'uncollectible', 'void']

/** The installed SDK's own `Invoice.Status` type is actually `InvoiceStatus
 * | OtherString`, where `OtherString` is structurally just `string` — so
 * TypeScript's own control-flow narrowing cannot exclude it by comparing
 * against known literals. A caller MUST run a live invoice's status through
 * this guard (fails closed on anything unrecognized, including Stripe's own
 * `null`) before it can be treated as a plain `InvoiceStatus` at all. */
export function isInvoiceStatus(value: string | null): value is InvoiceStatus {
  return value !== null && (INVOICE_STATUSES as readonly string[]).includes(value)
}

/** The server's OWN record of a subscription's identity, established once
 * (e.g. when a checkout.session.completed for mode:'subscription' first
 * arrives, from the ALREADY-AUTHENTICATED owner who started that checkout —
 * never from any field inside a webhook payload) and never mutated
 * afterward. Every subsequent webhook event must be checked against this
 * record, not trusted on its own; the SQL layer in
 * supabase/migrations/*_recurring_billing.sql enforces that a
 * subscription_id can never be rebound to a different owner/price. */
export type TrustedSubscription = {
  subscriptionId: string
  ownerId: string
  priceId: string
  live: boolean
}

/** Already-extracted, already-retrieved-from-Stripe-directly facts about one
 * invoice (never the webhook event payload's own claims about itself). */
export type VerifiedSubscriptionInvoice = {
  accountId: string
  live: boolean
  subscriptionId: string
  invoiceId: string
  priceId: string
  quantity: number
  currency: string
  amountPaid: number
  status: InvoiceStatus
  periodStart: number
  periodEnd: number
  /** The PaymentIntent id backing this invoice's own single, already-`paid`
   * `InvoicePayment` (Stripe's `invoice.payments`, expanded and re-retrieved
   * directly from Stripe — never trusted from webhook metadata). This is the
   * ONLY fact that later lets a `charge.refunded`/dispute event (which only
   * ever carries a payment_intent, never an invoice id) be durably and
   * correctly attributed back to this specific invoice/owner — see
   * `billing_record_subscription_invoice_payment_intent` and
   * `billing_apply_subscription_invoice_reversal_event`
   * (`20260920060000_recurring_invoice_reversals.sql`). */
  paymentIntentId: string
}

function assertTrustedSubscription(trusted: TrustedSubscription) {
  nonBlank(trusted.subscriptionId, 'trusted subscription id')
  nonBlank(trusted.ownerId, 'trusted owner id')
  nonBlank(trusted.priceId, 'trusted price id')
  if (typeof trusted.live !== 'boolean') throw new Error('Invalid trusted live flag')
}

/** Defense in depth AFTER provider verification and lookup of the server's
 * own TrustedSubscription record. `expected` must come from server
 * config/the trusted record, never from anything the browser or a webhook
 * payload supplied — a subscription's owner and price are fixed at
 * creation time and can never be changed by an invoice event. Throws unless
 * every fact matches AND the invoice is actually paid. */
export function assertVerifiedSubscriptionInvoice(
  invoice: VerifiedSubscriptionInvoice,
  expected: { accountId: string; live: boolean; priceId: string; subscription: TrustedSubscription },
): void {
  assertTrustedSubscription(expected.subscription)
  if (!expected.accountId || !expected.priceId) throw new Error('Invalid expected billing configuration')
  if (
    invoice.accountId !== expected.accountId ||
    invoice.live !== expected.live ||
    invoice.priceId !== expected.priceId ||
    invoice.priceId !== expected.subscription.priceId ||
    invoice.live !== expected.subscription.live ||
    invoice.subscriptionId !== expected.subscription.subscriptionId ||
    invoice.status !== 'paid' ||
    invoice.currency !== RECURRING_CURRENCY ||
    invoice.amountPaid !== RECURRING_AMOUNT ||
    invoice.quantity !== 1 ||
    !invoice.invoiceId?.trim() ||
    !invoice.paymentIntentId?.trim()
  ) {
    throw new Error('Invoice does not match the authorized recurring subscription')
  }
  timestamp(invoice.periodStart, 'invoice period start')
  timestamp(invoice.periodEnd, 'invoice period end')
  if (invoice.periodEnd <= invoice.periodStart) throw new Error('Invoice period is not ordered')
  if (invoice.periodEnd - invoice.periodStart > MAX_PERIOD_MS) throw new Error('Invoice period is implausibly long')
}

/** A failed/uncollectible/voided invoice is checked against the SAME
 * identity facts as a paid one (an attacker-controlled or corrupt event
 * still must not be attributed to the wrong subscription/owner) but must
 * explicitly NOT be 'paid' — callers must route an actually-paid invoice
 * through assertVerifiedSubscriptionInvoice + subscriptionInvoiceGrant
 * instead, never through this failure path. */
export function assertFailedSubscriptionInvoice(
  invoice: Pick<VerifiedSubscriptionInvoice, 'accountId' | 'live' | 'subscriptionId' | 'invoiceId' | 'status'>,
  expected: { accountId: string; subscription: TrustedSubscription },
): void {
  assertTrustedSubscription(expected.subscription)
  if (!expected.accountId) throw new Error('Invalid expected billing configuration')
  if (
    invoice.accountId !== expected.accountId ||
    invoice.live !== expected.subscription.live ||
    invoice.subscriptionId !== expected.subscription.subscriptionId ||
    !invoice.invoiceId?.trim() ||
    invoice.status === 'paid'
  ) {
    throw new Error('Failed invoice does not match the authorized recurring subscription')
  }
}

/** The core prepaid-time coordination policy. A one-time manual pass STACKS
 * (server/billing/policy.ts's manualPassWindow adds a fresh 30 days onto
 * whatever remains) because each purchase is an independent, deliberately
 * repeatable add-on. A recurring invoice is different: Stripe already
 * decides the billing cadence and amount on its own schedule, so this
 * module must not ALSO add 30 days on every invoice — that would silently
 * double-grant time whenever a customer's entitlement already reaches past
 * the invoice's own period end, which happens whenever:
 *   (a) the same customer also holds manual-pass prepaid time beyond this
 *       invoice's period (the explicit "renewal does not charge for
 *       already prepaid time" requirement — 30 days of manual pass a
 *       customer already paid for is not consumed or shortened by a
 *       subscription invoice that covers an earlier or overlapping span), or
 *   (b) invoices for the same subscription arrive out of chronological
 *       order (Stripe does not guarantee webhook delivery order), or
 *   (c) the exact same invoice is redelivered (idempotency; the SQL layer's
 *       unique invoice_id additionally guarantees this never runs twice for
 *       a truly identical event, but this function is independently safe
 *       even if called twice with the same arguments).
 *
 * Using `max(currentPaidThrough, invoice.periodEnd)` instead of addition
 * makes all three safe at once: it can only ever move access forward to the
 * invoice's own period end, never past it and never below whatever the
 * customer already had, and applying the same or an older period end again
 * is a no-op. */
export function subscriptionInvoiceGrant(
  paidThrough: number | null,
  periodEnd: number,
): { paidThrough: number; advanced: boolean } {
  timestamp(periodEnd, 'invoice period end')
  const current = paidThrough === null ? null : timestamp(paidThrough, 'current paid-through')
  if (current !== null && current >= periodEnd) return { paidThrough: current, advanced: false }
  return { paidThrough: periodEnd, advanced: true }
}

/** A failed, uncollectible, or voided invoice grants nothing, ever. This
 * function's only job is to make that invariant explicit and testable —
 * the correct amount of "handling" for a failed invoice is exactly zero
 * change to the entitlement a customer already holds. */
export function failedInvoiceGrant(paidThrough: number | null): number | null {
  return paidThrough === null ? null : timestamp(paidThrough, 'current paid-through')
}

/** Cancellation stops FUTURE renewal; it never retracts access already paid
 * for. `billing_entitlements.paid_through` was already advanced by prior
 * paid invoices (subscriptionInvoiceGrant above) and/or manual passes —
 * canceling must not touch it. This function's only job, like
 * failedInvoiceGrant, is to make that invariant explicit and testable: the
 * caller must never call this on any path that also mutates paid_through. */
export function cancellationPreservesEntitlement(paidThrough: number | null): number | null {
  return paidThrough === null ? null : timestamp(paidThrough, 'current paid-through')
}

/** Whether a subscription is expected to bill again, for display/decision
 * purposes only (e.g. whether to offer "cancel" vs "resume"). This does not
 * affect `billing_entitlements.paid_through` in any way. */
export function willRenew(status: SubscriptionStatus, cancelAtPeriodEnd: boolean): boolean {
  return status === 'active' && !cancelAtPeriodEnd
}

/** The trusted, already-validated shape of a real
 * `billing_lookup_owner_subscription` row — see parseOwnerSubscriptionRow. */
export type OwnerSubscriptionRow = {
  subscriptionId: string
  ownerId: string
  status: SubscriptionStatus
  cancelAtPeriodEnd: boolean
}

/** `billing_lookup_owner_subscription` is declared `returns public.
 * billing_subscriptions` and its body is a scalar `select s from ... limit
 * 1` — when no row matches, Postgres returns a SQL NULL of that composite
 * type, not the absence of a row. Confirmed against the real PostgREST
 * endpoint for a fresh owner: the wire response is a JSON OBJECT with every
 * column set to `null` (`{subscription_id:null,owner_id:null,...}`), never a
 * bare JSON `null`. Every identity and status column in this table is `not null`
 * (billing_subscriptions in
 * 20260920020000_recurring_billing.sql), so a real row always has ALL of
 * them populated together — the only two reachable wire shapes are "every
 * field null" (no subscription) and "every field populated" (a real one). A
 * caller that only checks the returned object's own truthiness (e.g. `if
 * (data)`) is always true for the all-null shape too, so it must never do
 * that — see the checkout()/subscribeCheckout() 409 this caused for owners
 * with no subscription at all, and billing-status.ts's `subscription`
 * field failing the frontend's own isSubscriptionState validation for every
 * such owner.
 *
 * This parses that wire shape strictly: all-null is "no subscription" and
 * returns null; a row with every required field populated and well-formed
 * returns it; anything else (a partial mix, wrong types, an unrecognized
 * status) is corrupt and throws — fail closed rather than either silently
 * granting a phantom "already subscribed" state or silently hiding a real
 * one. `current_period_end` is deliberately excluded from the presence
 * check: it is a nullable column never populated by any handler today (see
 * docs/RECURRING_IMPLEMENTATION.md), so it is legitimately null on a real
 * row too and cannot discriminate absence from presence. */
export function parseOwnerSubscriptionRow(row: unknown): OwnerSubscriptionRow | null {
  if (row === null) return null
  if (typeof row !== 'object' || Array.isArray(row)) throw new Error('Malformed subscription row')
  const r = row as Record<string, unknown>
  const requiredKeys = ['subscription_id', 'owner_id', 'price_id', 'live', 'status', 'cancel_at_period_end', 'created_at', 'updated_at'] as const
  if (requiredKeys.some(key => !Object.hasOwn(r, key) || r[key] === undefined)) throw new Error('Malformed subscription row')
  const presentCount = requiredKeys.filter(key => r[key] !== null && r[key] !== undefined).length
  if (presentCount === 0) return null
  if (presentCount !== requiredKeys.length) throw new Error('Malformed subscription row')
  if (typeof r.subscription_id !== 'string' || r.subscription_id.trim().length === 0) throw new Error('Malformed subscription row')
  if (typeof r.owner_id !== 'string' || r.owner_id.trim().length === 0) throw new Error('Malformed subscription row')
  if (typeof r.status !== 'string' || !isSubscriptionStatus(r.status)) throw new Error('Malformed subscription row')
  if (typeof r.price_id !== 'string' || !r.price_id.trim() || typeof r.live !== 'boolean') throw new Error('Malformed subscription row')
  for (const key of ['created_at', 'updated_at']) {
    if (typeof r[key] !== 'string' || !Number.isFinite(Date.parse(r[key] as string))) throw new Error('Malformed subscription row')
  }
  if (typeof r.cancel_at_period_end !== 'boolean') throw new Error('Malformed subscription row')
  return { subscriptionId: r.subscription_id, ownerId: r.owner_id, status: r.status, cancelAtPeriodEnd: r.cancel_at_period_end }
}
