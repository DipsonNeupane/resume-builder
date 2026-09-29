import type Stripe from 'stripe'
import { authenticate, HttpError, json, jsonBody, requirePost } from '../http/security.js'
import { databaseConfig, serviceDatabase } from '../database.js'
import { billingError, stripeClient } from './stripe.js'
import { assertPaidTerritory, offerCatalogConfig, offerFor, validateOffer, type Offer } from './catalog.js'

const dependencies = { authenticate, serviceDatabase, stripeClient, validateOffer }
type Dependencies = typeof dependencies

function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
}

async function customerFor(owner: string, db: ReturnType<Dependencies['serviceDatabase']>, stripe: Stripe, live: boolean) {
  const existing = await db.rpc('billing_get_customer', { p_owner: owner })
  if (existing.error) throw new Error('Customer lookup unavailable')
  if (existing.data?.stripe_customer_id) {
    if (existing.data.live !== live) throw new Error('Customer environment mismatch')
    return existing.data.stripe_customer_id as string
  }
  const customer = await stripe.customers.create({ metadata: { resumestride_owner: owner } }, { idempotencyKey: `customer:${live ? 'live' : 'test'}:${owner}` })
  const bound = await db.rpc('billing_bind_customer', { p_owner: owner, p_customer: customer.id, p_live: live })
  if (bound.error) throw new Error('Customer persistence unavailable')
  return customer.id
}

export async function offerCheckout(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
  try {
    const config = offerCatalogConfig(env)
    requirePost(request, config.origin)
    assertPaidTerritory(request, env)
    const owner = await deps.authenticate(request, databaseConfig(env))
    const body = await jsonBody(request)
    if (Object.keys(body).some(key => !['requestId', 'offerKey', 'renewalConsent', 'overlapConsent'].includes(key)) || !uuid(body.requestId) || body.renewalConsent !== true) {
      throw new HttpError(400, 'Explicit monthly renewal consent is required')
    }
    const offer = offerFor(config, body.offerKey)
    const db = deps.serviceDatabase(env)
    const currentAccess = await db.rpc('billing_effective_access', { p_owner: owner, p_template: offer.templateId || '__pro__' })
    if (currentAccess.error || !currentAccess.data?.[0]) throw new Error('Entitlement lookup unavailable')
    if (currentAccess.data[0].is_pro) throw new HttpError(409, 'Your existing Pro access already includes this subscription. Wait until it expires before starting another.')
    if (offer.kind === 'pro') {
      const templates = await db.rpc('billing_owner_template_access', { p_owner: owner })
      if (templates.error || !Array.isArray(templates.data)) throw new Error('Template subscription lookup unavailable')
      if (templates.data.length > 0 && body.overlapConsent !== true) throw new HttpError(400, 'Confirm that Pro will stop future renewals of your individual template subscriptions after its first payment succeeds.')
    }
    const begun = await db.rpc('billing_begin_offer_checkout', { p_id: body.requestId, p_owner: owner, p_offer_key: offer.key, p_price: offer.priceId, p_live: config.live })
    if (begun.error || !begun.data) throw new HttpError(409, 'Unable to start this checkout. Check your subscriptions and try again.')
    const stripe = deps.stripeClient(config)
    if (begun.data.session_id) {
      const existing = await stripe.checkout.sessions.retrieve(begun.data.session_id)
      if (!existing.url || new URL(existing.url).origin !== 'https://checkout.stripe.com') throw new HttpError(409, 'This checkout is no longer open.')
      return json(200, { url: existing.url })
    }
    await deps.validateOffer(stripe, config, offer)
    const customer = await customerFor(owner, db, stripe, config.live)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer, line_items: [{ price: offer.priceId, quantity: 1 }],
      client_reference_id: body.requestId, metadata: { checkout_id: body.requestId, offer_key: offer.key },
      subscription_data: { metadata: { offer_key: offer.key } },
      success_url: `${config.origin}/?account=1&checkout=success`, cancel_url: `${config.origin}/?account=1&checkout=cancelled`,
      allow_promotion_codes: false,
    }, { idempotencyKey: `offer:${owner}:${body.requestId}` })
    if (!session.url || session.livemode !== config.live || new URL(session.url).origin !== 'https://checkout.stripe.com') throw new Error('Unexpected checkout response')
    const bound = await db.rpc('billing_bind_offer_checkout', { p_id: body.requestId, p_owner: owner, p_session: session.id })
    if (bound.error) throw new Error('Checkout persistence unavailable')
    return json(200, { url: session.url })
  } catch (error) { return billingError(error) }
}

export async function subscriptionStatus(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
  try {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed')
    const owner = await deps.authenticate(request, databaseConfig(env))
    const db = deps.serviceDatabase(env)
    const [access, rows, templateAccess] = await Promise.all([
      db.rpc('billing_effective_access', { p_owner: owner, p_template: '__status__' }),
      db.rpc('billing_owner_subscription_summary', { p_owner: owner }),
      db.rpc('billing_owner_template_access', { p_owner: owner }),
    ])
    if (access.error || rows.error || templateAccess.error || !access.data?.[0] || !Array.isArray(rows.data) || !Array.isArray(templateAccess.data)) throw new Error('Subscription status unavailable')
    const subscriptions = rows.data.map(row => ({ subscriptionId: row.subscription_id, offerKey: row.offer_key, kind: row.offer_kind, templateId: row.template_id, status: row.status, cancelAtPeriodEnd: row.cancel_at_period_end, currentPeriodEnd: row.current_period_end }))
    const activeTemplates = templateAccess.data.map(row=>row.template_id)
    return json(200, { isPro: Boolean(access.data[0].is_pro), activeTemplates, subscriptions, salesAvailable: (() => { try { offerCatalogConfig(env); return true } catch { return false } })() })
  } catch (error) { return billingError(error) }
}

export async function customerPortal(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
  try {
    const config = offerCatalogConfig(env, false)
    requirePost(request, config.origin)
    const owner = await deps.authenticate(request, databaseConfig(env))
    const db = deps.serviceDatabase(env)
    const stored = await db.rpc('billing_get_customer', { p_owner: owner })
    if (stored.error || !stored.data?.stripe_customer_id || stored.data.live !== config.live) throw new HttpError(404, 'No billing account is available')
    const session = await deps.stripeClient(config).billingPortal.sessions.create({ customer: stored.data.stripe_customer_id, return_url: `${config.origin}/?account=1` })
    if (new URL(session.url).protocol !== 'https:') throw new Error('Unexpected portal response')
    return json(200, { url: session.url })
  } catch (error) { return billingError(error) }
}

export async function cancelOffer(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
  try {
    const config = offerCatalogConfig(env, false)
    requirePost(request, config.origin)
    const owner = await deps.authenticate(request, databaseConfig(env))
    const body = await jsonBody(request)
    if (Object.keys(body).some(key => key !== 'subscriptionId') || typeof body.subscriptionId !== 'string') throw new HttpError(400, 'Choose a valid subscription')
    const db = deps.serviceDatabase(env)
    const rows = await db.rpc('billing_owner_subscription_summary', { p_owner: owner })
    if (rows.error || !Array.isArray(rows.data)) throw new Error('Subscription lookup unavailable')
    const owned = rows.data.find(row => row.subscription_id === body.subscriptionId && ['active','trialing','past_due','unpaid'].includes(row.status))
    if (!owned) throw new HttpError(404, 'Subscription not found')
    const subscription = await deps.stripeClient(config).subscriptions.update(body.subscriptionId, { cancel_at_period_end: true })
    if (!subscriptionStopsAtPeriodEnd(subscription)) throw new Error('Cancellation was not confirmed')
    const updated = await db.rpc('billing_update_offer_subscription', { p_subscription: subscription.id, p_owner: owner, p_status: subscription.status, p_cancel_at_period_end: true, p_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString() })
    if (updated.error) throw new Error('Cancellation persistence unavailable')
    const notice = await db.rpc('billing_enqueue_notice', { p_owner: owner, p_subscription: subscription.id, p_kind: 'cancellation', p_due_at: new Date().toISOString(), p_dedupe_key: `cancellation:${subscription.id}:${subscription.items.data[0].current_period_end}`, p_payload: { offerKey: owned.offer_key, accessEndsAt: new Date(subscription.items.data[0].current_period_end * 1000).toISOString() } })
    if (notice.error) throw new Error('Cancellation notice persistence unavailable')
    return json(200, { cancelAtPeriodEnd: true, accessEndsAt: new Date(subscription.items.data[0].current_period_end * 1000).toISOString() })
  } catch (error) { return billingError(error) }
}

export function offerFromTrusted(config: ReturnType<typeof offerCatalogConfig>, key: string): Offer { return offerFor(config, key) }

function subscriptionPeriod(subscription: Stripe.Subscription) {
  if (subscription.items.has_more || subscription.items.data.length !== 1 || subscription.items.data[0].quantity !== 1) throw new Error('Unexpected subscription items')
  const item = subscription.items.data[0]
  return { item, start: new Date(item.current_period_start * 1000), end: new Date(item.current_period_end * 1000) }
}

/** Stripe's hosted portal can represent an end-of-period cancellation with
 * `cancel_at` equal to the current period end while leaving
 * `cancel_at_period_end` false (notably for flexible billing mode). Normalize
 * both provider representations before persisting renewal state. */
export function subscriptionStopsAtPeriodEnd(subscription: Stripe.Subscription): boolean {
  const items = subscription.items?.data
  const item = items?.length === 1 ? items[0] : undefined
  return subscription.cancel_at_period_end || (
    typeof subscription.cancel_at === 'number' &&
    typeof item?.current_period_end === 'number' &&
    subscription.cancel_at <= item.current_period_end
  )
}

export async function applyOfferCheckoutSession(session: Stripe.Checkout.Session, stripe: Stripe, db: ReturnType<typeof serviceDatabase>, env: NodeJS.ProcessEnv): Promise<Response | null> {
  const lookup = await db.rpc('billing_lookup_offer_checkout', { p_session: session.id })
  if (lookup.error) throw new Error('Trusted offer checkout unavailable')
  if (!lookup.data?.owner_id) return null
  const config = offerCatalogConfig(env, false)
  const offer = offerFromTrusted(config, lookup.data.offer_key)
  if (session.status !== 'complete') return json(200, { received: true })
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  if (!subscriptionId) throw new Error('Missing subscription reference')
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const { item, start, end } = subscriptionPeriod(subscription)
  if (session.livemode !== config.live || subscription.livemode !== config.live || item.price.id !== offer.priceId || lookup.data.price_id !== offer.priceId) throw new Error('Offer subscription identity mismatch')
  const stored = await db.rpc('billing_record_offer_subscription', {
    p_owner: lookup.data.owner_id, p_subscription: subscription.id, p_price: offer.priceId, p_live: config.live,
    p_status: subscription.status, p_cancel_at_period_end: subscriptionStopsAtPeriodEnd(subscription),
    p_period_start: start.toISOString(), p_period_end: end.toISOString(), p_offer_key: offer.key, p_offer_kind: offer.kind, p_template_id: offer.templateId,
  })
  if (stored.error) throw new Error('Offer subscription persistence unavailable')
  const completed = await db.rpc('billing_complete_offer_checkout', { p_session: session.id })
  if (completed.error) throw new Error('Offer checkout completion unavailable')
  return json(200, { received: true })
}

export async function applyOfferInvoice(invoice: Stripe.Invoice, eventCreated: number, eventType: string, stripe: Stripe, db: ReturnType<typeof serviceDatabase>, trustedRow: Record<string, unknown>, env: NodeJS.ProcessEnv): Promise<Response> {
  const config = offerCatalogConfig(env, false)
  const offer = offerFromTrusted(config, String(trustedRow.offer_key))
  const subscriptionRef = invoice.parent?.subscription_details?.subscription
  const subscriptionId = typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id
  if (!subscriptionId || subscriptionId !== trustedRow.subscription_id || invoice.livemode !== config.live) throw new Error('Offer invoice identity mismatch')
  if (invoice.status === 'open' || invoice.status === 'draft') {
    if(eventType==='invoice.payment_failed')await db.rpc('billing_enqueue_notice',{p_owner:trustedRow.owner_id,p_subscription:subscriptionId,p_kind:'payment_failed',p_due_at:new Date().toISOString(),p_dedupe_key:`payment-failed:${invoice.id}`,p_payload:{offerKey:offer.key}})
    return json(200, { received: true })
  }
  if (invoice.status !== 'paid') {
    const updated = await db.rpc('billing_update_offer_subscription', { p_subscription: subscriptionId, p_owner: trustedRow.owner_id, p_status: 'past_due', p_cancel_at_period_end: Boolean(trustedRow.cancel_at_period_end), p_period_end: trustedRow.current_period_end })
    if (updated.error) throw new Error('Offer payment status persistence unavailable')
    await db.rpc('billing_enqueue_notice', { p_owner: trustedRow.owner_id, p_subscription: subscriptionId, p_kind: 'payment_failed', p_due_at: new Date().toISOString(), p_dedupe_key: `payment-failed:${invoice.id}`, p_payload: { offerKey: offer.key } })
    return json(200, { received: true })
  }
  if (invoice.lines.has_more || invoice.lines.data.length !== 1) throw new Error('Unexpected offer invoice lines')
  const line = invoice.lines.data[0]
  const priceRef = line.pricing?.price_details?.price
  const priceId = typeof priceRef === 'string' ? priceRef : priceRef?.id
  if (priceId !== offer.priceId || line.quantity !== 1 || invoice.currency !== 'usd' || line.amount !== offer.amount || (invoice.amount_paid ?? 0) < offer.amount) throw new Error('Offer invoice catalog mismatch')
  if (!invoice.payments || invoice.payments.has_more || invoice.payments.data.length !== 1 || invoice.payments.data[0].status !== 'paid' || invoice.payments.data[0].payment.type !== 'payment_intent') throw new Error('Unexpected offer invoice payment')
  const paymentRef=invoice.payments.data[0].payment.payment_intent
  const paymentIntent=typeof paymentRef==='string'?paymentRef:paymentRef?.id
  if(!paymentIntent)throw new Error('Missing offer payment intent')
  const applied = await db.rpc('billing_apply_offer_invoice', {
    p_subscription: subscriptionId, p_invoice: invoice.id, p_owner: trustedRow.owner_id, p_payment_intent:paymentIntent,p_price: offer.priceId, p_live: config.live,
    p_amount: invoice.amount_paid, p_currency: invoice.currency, p_period_start: new Date(line.period.start * 1000).toISOString(),
    p_period_end: new Date(line.period.end * 1000).toISOString(), p_verified_at: new Date(eventCreated * 1000).toISOString(),
  })
  if (applied.error) throw new Error('Offer invoice persistence unavailable')
  const noticeKind = invoice.billing_reason === 'subscription_create' ? 'purchase' : 'renewal_receipt'
  await db.rpc('billing_enqueue_notice', { p_owner: trustedRow.owner_id, p_subscription: subscriptionId, p_kind: noticeKind, p_due_at: new Date().toISOString(), p_dedupe_key: `${noticeKind}:${invoice.id}`, p_payload: { offerKey: offer.key, amount: offer.amount, currency: 'usd', periodEnd: new Date(line.period.end * 1000).toISOString() } })
  if (offer.kind === 'pro') {
    const rows = await db.rpc('billing_owner_subscription_summary', { p_owner: trustedRow.owner_id })
    if (rows.error || !Array.isArray(rows.data)) throw new Error('Overlap lookup unavailable')
    for (const row of rows.data) {
      if (row.offer_kind !== 'template' || !['active','trialing'].includes(row.status) || row.cancel_at_period_end) continue
      const stopped = await stripe.subscriptions.update(row.subscription_id, { cancel_at_period_end: true })
      const period = subscriptionPeriod(stopped)
      const saved = await db.rpc('billing_update_offer_subscription', { p_subscription: row.subscription_id, p_owner: trustedRow.owner_id, p_status: stopped.status, p_cancel_at_period_end: true, p_period_end: period.end.toISOString() })
      if (saved.error) throw new Error('Overlap cancellation persistence unavailable')
      await db.rpc('billing_enqueue_notice', { p_owner: trustedRow.owner_id, p_subscription: row.subscription_id, p_kind: 'cancellation', p_due_at: new Date().toISOString(), p_dedupe_key: `pro-overlap:${invoice.id}:${row.subscription_id}`, p_payload: { offerKey: row.offer_key, accessEndsAt: period.end.toISOString(), reason: 'pro_activation' } })
    }
  }
  return json(200, { received: true })
}

export async function applyOfferSubscriptionStatus(subscription: Stripe.Subscription, db: ReturnType<typeof serviceDatabase>, trustedRow: Record<string, unknown>): Promise<Response> {
  const { end } = subscriptionPeriod(subscription)
  const stopsAtPeriodEnd = subscriptionStopsAtPeriodEnd(subscription)
  const updated = await db.rpc('billing_update_offer_subscription', { p_subscription: subscription.id, p_owner: trustedRow.owner_id, p_status: subscription.status, p_cancel_at_period_end: stopsAtPeriodEnd, p_period_end: end.toISOString() })
  if (updated.error) throw new Error('Offer subscription status persistence unavailable')
  if (stopsAtPeriodEnd) {
    const notice = await db.rpc('billing_enqueue_notice', { p_owner: trustedRow.owner_id, p_subscription: subscription.id, p_kind: 'cancellation', p_due_at: new Date().toISOString(), p_dedupe_key: `cancellation:${subscription.id}:${subscription.items.data[0].current_period_end}`, p_payload: { offerKey: trustedRow.offer_key, accessEndsAt: end.toISOString() } })
    if (notice.error) throw new Error('Cancellation notice persistence unavailable')
  }
  if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
    const notice = await db.rpc('billing_enqueue_notice', { p_owner: trustedRow.owner_id, p_subscription: subscription.id, p_kind: 'expiration', p_due_at: new Date().toISOString(), p_dedupe_key: `expiration:${subscription.id}:${subscription.status}`, p_payload: { offerKey: trustedRow.offer_key } })
    if (notice.error) throw new Error('Expiration notice persistence unavailable')
  }
  return json(200, { received: true })
}
