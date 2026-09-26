import Stripe from 'stripe'
import { emitDiagnostic, markResponse } from '../observability.js'
import { HttpError, safeError } from '../http/security.js'
import { PRO_PASS_AMOUNT_CENTS, PRO_PASS_CURRENCY } from './constants.js'
import { RECURRING_AMOUNT, RECURRING_CURRENCY } from './recurring.js'

export type BillingConfig = {
  secret: string; webhookSecret: string; accountId: string; priceId: string; live: boolean; origin: string
}
export function billingConfig(env: NodeJS.ProcessEnv): BillingConfig {
  if (env.BILLING_ENABLED !== 'true') throw new HttpError(503, 'Purchases are not available yet', 'configuration')
  return billingServiceConfig(env)
}

/** Provider configuration independent of new-sale availability. Existing
 * customers must still be able to stop renewal during a sales pause. */
export function billingServiceConfig(env: NodeJS.ProcessEnv): BillingConfig {
  const { STRIPE_SECRET_KEY: secret, STRIPE_WEBHOOK_SECRET: webhookSecret, STRIPE_ACCOUNT_ID: accountId, STRIPE_PASS_PRICE_ID: priceId, APP_ORIGIN: origin } = env
  const live = env.STRIPE_MODE === 'live'
  if (!['live','test'].includes(env.STRIPE_MODE ?? '') || !secret?.startsWith(live ? 'sk_live_' : 'sk_test_') || !webhookSecret?.startsWith('whsec_') || !accountId?.startsWith('acct_') || !priceId?.startsWith('price_') || !origin) throw new HttpError(503, 'Purchases are not configured', 'configuration')
  const url = new URL(origin)
  if (url.origin !== origin || (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && url.protocol === 'http:' && url.hostname === 'localhost'))) throw new HttpError(503, 'Purchases are not configured', 'configuration')
  return { secret, webhookSecret, accountId, priceId, live, origin }
}

export function stripeClient(config: BillingConfig): Stripe {
  const stripe = new Stripe(config.secret, { timeout: 15000, maxNetworkRetries: 2 })
  // SDK events also contain account, path, idempotency keys and sometimes bodies.
  // Destructure only timing/status; never forward the event to a logger.
  stripe.on('response', ({ status, elapsed }: { status?: number; elapsed: number }) => {
    emitDiagnostic('billing', 'billing_provider', status !== undefined && status < 400 ? 'ok' : status === 429 ? 'provider_rate_limit' : 'provider_failure', elapsed, status)
  })
  return stripe
}

export function billingError(error: unknown): Response {
  // Connection failures may have no SDK response event. Only classify the SDK
  // error type; no message, payment details, metadata or stack crosses the sink.
  if (error instanceof Stripe.errors.StripeError) {
    const category = error.type === 'StripeRateLimitError' ? 'provider_rate_limit' : 'provider_failure'
    emitDiagnostic('billing', 'billing_provider', category)
    return markResponse(safeError(error), category)
  }
  return safeError(error)
}

/** Validate the actual connected account and price before offering a checkout. */
export async function validateCatalog(stripe: Stripe, config: BillingConfig): Promise<void> {
  const [account, price] = await Promise.all([stripe.accounts.retrieve(config.accountId), stripe.prices.retrieve(config.priceId)])
  if (account.id !== config.accountId || !account.charges_enabled || !price.active || price.livemode !== config.live || price.currency !== PRO_PASS_CURRENCY || price.unit_amount !== PRO_PASS_AMOUNT_CENTS || price.type !== 'one_time') {
    throw new HttpError(503, 'Purchases are not available yet', 'configuration')
  }
}

export async function createPassCheckout(stripe: Stripe, config: BillingConfig, checkoutId: string, ownerId: string) {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', line_items: [{ price: config.priceId, quantity: 1 }],
    client_reference_id: checkoutId, metadata: { checkout_id: checkoutId },
    success_url: `${config.origin}/?account=1&checkout=success`,
    cancel_url: `${config.origin}/?account=1&checkout=cancelled`,
    allow_promotion_codes: false,
    // Do not pin this session to US-centric cards. Omitting
    // payment_method_types lets Stripe dynamically offer only the Dashboard-
    // enabled methods compatible with the buyer's location, device, USD
    // presentment and this one-time flow. Cards remain available worldwide.
    // Price/owner/return URLs are never accepted from the browser.
  }, { idempotencyKey: `pass:${ownerId}:${checkoutId}` })
  if (!session.url || new URL(session.url).origin !== 'https://checkout.stripe.com' || session.livemode !== config.live) throw new Error('Unexpected checkout response')
  return { id: session.id, url: session.url }
}

/** The OPTIONAL recurring subscription's own config, layered on top of the
 * one-time pass's BillingConfig. `BILLING_RECURRING_ENABLED` is a SEPARATE
 * gate from `BILLING_ENABLED` — the one-time pass stays the default purchase
 * and works whether or not this is ever turned on. Left unset/anything other
 * than the literal string 'true', this fails closed exactly like
 * `billingConfig`'s own `BILLING_ENABLED` check. */
export type RecurringBillingConfig = BillingConfig & { recurringPriceId: string }

export function recurringConfig(env: NodeJS.ProcessEnv): RecurringBillingConfig {
  const config = recurringServiceConfig(env)
  if (env.BILLING_RECURRING_ENABLED !== 'true') throw new HttpError(503, 'Recurring purchases are not available yet', 'configuration')
  return config
}

/** Recurring provider configuration independent of BOTH new-sale gates
 * (`BILLING_ENABLED` and `BILLING_RECURRING_ENABLED`). Existing subscribers'
 * invoices, status transitions, and reversals must still reconcile while
 * either or both flags are off pausing new subscription sales — see
 * `billingServiceConfig` above for the one-time-pass equivalent. */
export function recurringServiceConfig(env: NodeJS.ProcessEnv): RecurringBillingConfig {
  const config = billingServiceConfig(env)
  const recurringPriceId = env.STRIPE_RECURRING_PRICE_ID
  // Deliberately distinct from the one-time pass's own priceId: the two
  // purchase modes must never be configured to point at the same Stripe
  // price, or catalog validation below could no longer tell them apart.
  if (!recurringPriceId?.startsWith('price_') || recurringPriceId === config.priceId) {
    throw new HttpError(503, 'Recurring purchases are not configured', 'configuration')
  }
  return { ...config, recurringPriceId }
}

/** Validate the actual connected account and recurring price before offering
 * a subscription checkout. `price.recurring.interval`/`interval_count` are
 * checked against the exact "every 30 days" cadence this product bills —
 * a differently-configured recurring price (monthly, annual, a trial) must
 * never be silently accepted just because its type is 'recurring'. */
export async function validateRecurringCatalog(stripe: Stripe, config: RecurringBillingConfig): Promise<void> {
  const [account, price] = await Promise.all([stripe.accounts.retrieve(config.accountId), stripe.prices.retrieve(config.recurringPriceId)])
  if (
    account.id !== config.accountId || !account.charges_enabled ||
    !price.active || price.livemode !== config.live ||
    price.currency !== RECURRING_CURRENCY || price.unit_amount !== RECURRING_AMOUNT ||
    price.type !== 'recurring' || price.recurring?.interval !== 'day' || price.recurring?.interval_count !== 30
  ) {
    throw new HttpError(503, 'Recurring purchases are not available yet', 'configuration')
  }
}

export async function createSubscriptionCheckout(stripe: Stripe, config: RecurringBillingConfig, checkoutId: string, ownerId: string) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription', line_items: [{ price: config.recurringPriceId, quantity: 1 }],
    client_reference_id: checkoutId, metadata: { checkout_id: checkoutId },
    success_url: `${config.origin}/?account=1&checkout=success`,
    cancel_url: `${config.origin}/?account=1&checkout=cancelled`,
    allow_promotion_codes: false,
    // Dynamic payment methods are filtered by Stripe for subscription
    // compatibility as well as location, device and the USD Price. This keeps
    // the explicit renewal-consent and exact-price verification below intact.
    // Price/owner/return URLs are never accepted from the browser.
  }, { idempotencyKey: `sub:${ownerId}:${checkoutId}` })
  if (!session.url || new URL(session.url).origin !== 'https://checkout.stripe.com' || session.livemode !== config.live) throw new Error('Unexpected checkout response')
  return { id: session.id, url: session.url }
}

export function verifyEvent(stripe: Stripe, config: BillingConfig, raw: string, signature: string | null): Stripe.Event {
  if (!signature) throw new HttpError(400, 'Missing payment signature')
  let event: Stripe.Event
  try { event = stripe.webhooks.constructEvent(raw, signature, config.webhookSecret) }
  catch { throw new HttpError(400, 'Invalid payment signature') }
  // Direct-account integration only: never accept Connect-account events.
  if (event.livemode !== config.live || event.account) throw new HttpError(400, 'Unexpected payment environment')
  return event
}
