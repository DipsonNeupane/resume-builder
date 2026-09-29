import type Stripe from 'stripe'
import { authenticate, boundedBody, HttpError, json, jsonBody, requirePost } from '../http/security.js'
import { databaseConfig, serviceDatabase } from '../database.js'
import { billingError, billingConfig, billingServiceConfig, createPassCheckout, createSubscriptionCheckout, recurringConfig, recurringServiceConfig, stripeClient, validateCatalog, validateRecurringCatalog, verifyEvent, type BillingConfig } from './stripe.js'
import { assertManualPayment } from './policy.js'
import { assertFailedSubscriptionInvoice, assertVerifiedSubscriptionInvoice, isInvoiceStatus, isSubscriptionStatus, parseOwnerSubscriptionRow } from './recurring.js'
import { PRO_PASS_AMOUNT_CENTS, PRO_PASS_CURRENCY } from './constants.js'
import { acquireOwnerCheckoutLock, releaseOwnerCheckoutBySession, tryRecoverStuckLock, type OwnerCheckoutLock } from './reservation.js'
import { applyOfferCheckoutSession, applyOfferInvoice, applyOfferSubscriptionStatus, subscriptionStopsAtPeriodEnd } from './offer-handlers.js'

export const dependencies = { authenticate, serviceDatabase, stripeClient, validateCatalog, recurringConfig, recurringServiceConfig, validateRecurringCatalog, createSubscriptionCheckout }
type Dependencies = typeof dependencies

/** Resolves a STUCK reservation of either kind that is blocking the current
 * request's owner. `config` only needs to be BillingConfig-shaped (both
 * billingConfig's and recurringConfig's results qualify — the latter is a
 * superset) because createPassCheckout never reads recurringPriceId; when
 * the stuck lock's own kind differs from the current request's, its own
 * config is fetched fresh via deps.recurringConfig. Never called for a
 * bound reservation (tryRecoverStuckLock itself refuses those). */
async function recoverOwnerCheckout(env: NodeJS.ProcessEnv, deps: Dependencies, db: ReturnType<Dependencies['serviceDatabase']>, stripe: Stripe, config: BillingConfig, stuck: OwnerCheckoutLock): Promise<boolean> {
  return tryRecoverStuckLock(stuck, async () => {
    if (stuck.kind === 'manual') return createPassCheckout(stripe, config, stuck.request_id, stuck.owner_id)
    return deps.createSubscriptionCheckout(stripe, deps.recurringConfig(env), stuck.request_id, stuck.owner_id)
  }, db, async (sessionId) => {
    const bound = stuck.kind === 'manual'
      ? await db.rpc('billing_bind_intent', { p_id: stuck.request_id, p_owner: stuck.owner_id, p_session: sessionId })
      : await db.rpc('billing_bind_subscription_intent', { p_id: stuck.request_id, p_owner: stuck.owner_id, p_session: sessionId })
    if (bound.error) throw new Error('Unable to persist checkout')
  })
}

export async function checkout(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
 try {
  const config=billingConfig(env)
  requirePost(request,config.origin)
  const owner=await deps.authenticate(request,databaseConfig(env))
  const body=await jsonBody(request)
  if(Object.keys(body).some(k=>k!=='requestId') || typeof body.requestId!=='string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.requestId)) throw new HttpError(400,'A checkout request ID is required')
  const requestId=body.requestId
  const stripe=deps.stripeClient(config), db=deps.serviceDatabase(env)
  // A single durable per-owner reservation, shared with subscribeCheckout()
  // below via the SAME table/advisory-lock namespace, closes the race the
  // separate preflight checks below cannot: two concurrent checkouts (manual
  // + subscription, or two subscriptions from two tabs) could previously
  // both pass their own "no active subscription/pass yet" check before
  // either committed anything durable. See
  // supabase/migrations/20260920050000_owner_checkout_reservation.sql.
  await acquireOwnerCheckoutLock(db,'manual',requestId,owner,config.priceId,config.live,
    stuck=>recoverOwnerCheckout(env,deps,db,stripe,config,stuck))
  // Conservative mixed-mode guard (see docs/RECURRING_IMPLEMENTATION.md,
  // "Parent review correction"): the recurring ledger's greatest() rule only
  // protects local entitlement accounting, not what Stripe actually charges.
  // A customer with an active recurring subscription who also buys a manual
  // pass would still be charged by Stripe for the subscription's next
  // invoice covering time they just separately paid for -- real provider
  // schedule/credit coordination is NOT implemented, so refuse to START that
  // combination here rather than silently allow an overlapping charge. The
  // reservation above already guarantees no CONCURRENT subscription attempt
  // can race this check; this still guards against an already-established
  // subscription from a past, separate purchase.
  const activeSub=await db.rpc('billing_lookup_owner_subscription',{p_owner_id:owner})
  if(activeSub.error) throw new Error('Subscription lookup unavailable')
  const activeSubscription=parseOwnerSubscriptionRow(activeSub.data)
  if(activeSubscription && activeSubscription.ownerId!==owner) throw new Error('Subscription lookup unavailable')
  if(activeSubscription) throw new HttpError(409,'You already have an active subscription. Buying an additional one-time pass while subscribed is not supported yet.')
  const {data:intent,error}=await db.rpc('billing_begin_intent',{p_id:requestId,p_owner:owner,p_price:config.priceId,p_live:config.live})
  if(error || !intent) throw new HttpError(409,'Unable to start this checkout. Wait and try again.')
  // Removing the unnecessary catalog re-validation on the reuse path (below) only cut
  // Stripe-call amplification; it did not cap how often checkout() itself may run. A
  // durable, per-owner, bounded-storage throttle here — checked immediately before any
  // Stripe network call and for every branch (new, unbound, or already-bound intent) —
  // closes that remaining edge: an attacker can still retry a bound or unbound
  // requestId, or mint fresh ones once billing_begin_intent's own 3/hour creation limit
  // is hit, so the cap has to live outside that per-requestId bookkeeping.
  const throttled=await db.rpc('billing_throttle_checkout_attempt',{p_owner:owner})
  if(throttled.error?.code==='54000') throw new HttpError(429,'Too many checkout attempts. Wait up to an hour and try again.')
  if(throttled.error) throw new Error('Checkout throttle unavailable')
  // Only a NEW session needs a fresh catalog check: an already-bound session's price
  // was validated and fixed at creation time and cannot change at Stripe's end.
  const session = intent.session_id
    ? await stripe.checkout.sessions.retrieve(intent.session_id)
    : await (async()=>{await deps.validateCatalog(stripe,config); return createPassCheckout(stripe,config,requestId,owner)})()
  if(!session.url || new URL(session.url).origin!=='https://checkout.stripe.com') throw new HttpError(409,'This checkout is no longer open. Check your account before purchasing again.')
  const bound=await db.rpc('billing_bind_intent',{p_id:requestId,p_owner:owner,p_session:session.id})
  if(bound.error) throw new Error('Unable to persist checkout')
  const lockBound=await db.rpc('billing_bind_owner_checkout',{p_owner:owner,p_kind:'manual',p_id:requestId,p_session:session.id})
  if(lockBound.error) throw new Error('Unable to persist checkout')
  return json(200,{url:session.url})
 } catch(error) {return billingError(error)}
}

/** Whether a NEW purchase of this kind could start right now (feature flag
 * on AND provider fully configured) — never throws itself, since billingStatus
 * must keep reporting an owner's own subscription/entitlement even while new
 * sales are paused (see cancelSubscription's own billingServiceConfig, which
 * is deliberately not gated the same way). */
function saleAvailable(probe: () => unknown): boolean {
  try { probe(); return true } catch { return false }
}

/** GET-only status the paid UI polls: entitlement, whether each sale kind is
 * currently open, and the owner's own in-force subscription (if any). Looked
 * up regardless of whether NEW sales are enabled — an existing
 * subscriber/pass holder must still see and cancel their own subscription
 * during a sales pause. `billing_lookup_owner_subscription` returns a SQL
 * NULL of its composite type when the owner has none, which PostgREST wires
 * as an object with every column null rather than a bare JSON null — see
 * parseOwnerSubscriptionRow in recurring.ts for why a naive truthiness check
 * on that object is always true and must never be used here. */
export async function billingStatus(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
 try {
  if(request.method!=='GET') throw new HttpError(405,'Method not allowed')
  const owner=await deps.authenticate(request,databaseConfig(env))
  const db=deps.serviceDatabase(env)
  const {data:entitlement,error:entitlementError}=await db.rpc('billing_get_entitlement',{p_owner:owner})
  if(entitlementError || !entitlement?.[0]) throw new Error('Entitlement unavailable')
  const {data:subscriptionRow,error:subscriptionError}=await db.rpc('billing_lookup_owner_subscription',{p_owner_id:owner})
  if(subscriptionError) throw new Error('Subscription lookup unavailable')
  const subscription=parseOwnerSubscriptionRow(subscriptionRow)
  if(subscription && subscription.ownerId!==owner) throw new Error('Subscription lookup unavailable')
  return json(200,{
    paidThrough:entitlement[0].paid_through,
    isPro:entitlement[0].is_pro,
    manualPassAvailable:saleAvailable(()=>billingConfig(env)),
    recurringAvailable:saleAvailable(()=>deps.recurringConfig(env)),
    // current_period_end is intentionally never surfaced here: it is not
    // populated by any handler today (see docs/RECURRING_IMPLEMENTATION.md),
    // and a guessed renewal date would not be truthful.
    subscription:subscription?{subscriptionId:subscription.subscriptionId,status:subscription.status,cancelAtPeriodEnd:subscription.cancelAtPeriodEnd}:null,
  })
 } catch(error) {return billingError(error)}
}

/** OPTIONAL recurring US$19.99/30-day subscription checkout. Gated by its own
 * `BILLING_RECURRING_ENABLED` flag (server/billing/stripe.ts's
 * recurringConfig), separate from and defaulting more closed than
 * `BILLING_ENABLED` — the one-time pass above is unaffected either way.
 * Nothing auto-enrolls anyone: this only ever runs when an authenticated
 * user's browser explicitly calls it, i.e. after an explicit "start
 * recurring billing" action the (not-yet-built, deliberately out of scope
 * here) opt-in UI would present. Mirrors checkout() above almost exactly,
 * against its own separate intent/checkout/throttle tables
 * (20260920040000_recurring_checkout.sql) so the two purchase flows' dedup
 * and rate-limit bookkeeping can never cross-contaminate each other. */
export async function subscribeCheckout(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
 try {
  const config=deps.recurringConfig(env)
  requirePost(request,config.origin)
  const owner=await deps.authenticate(request,databaseConfig(env))
  const body=await jsonBody(request)
  if(Object.keys(body).some(k=>k!=='requestId' && k!=='renewalOptIn') || typeof body.requestId!=='string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.requestId)) throw new HttpError(400,'A checkout request ID is required')
  if(body.renewalOptIn!==true) throw new HttpError(400,'Explicit recurring renewal consent is required')
  const requestId=body.requestId
  const stripe=deps.stripeClient(config), db=deps.serviceDatabase(env)
  // Same shared reservation as checkout() above — the SAME owner/table/
  // advisory-lock namespace — so two concurrent subscription checkouts (two
  // tabs, two different request ids) or a subscription racing a manual
  // checkout can no longer both pass their own preflight check before
  // either commits anything durable.
  await acquireOwnerCheckoutLock(db,'subscription',requestId,owner,config.recurringPriceId,config.live,
    stuck=>recoverOwnerCheckout(env,deps,db,stripe,config,stuck))
  // Same conservative mixed-mode guard as checkout() above, in the other
  // direction: refuse to START a subscription while unexpired manual-pass
  // prepaid time is already active (and not itself backed by an existing
  // subscription — a currently-subscribed owner's own paid_through being in
  // the future is expected, not a mixed-mode conflict, so that case is
  // checked first and short-circuits before this one even applies). The
  // reservation above already guarantees no CONCURRENT attempt can race
  // this check; this still guards against a past, already-established one.
  const activeSub=await db.rpc('billing_lookup_owner_subscription',{p_owner_id:owner})
  if(activeSub.error) throw new Error('Subscription lookup unavailable')
  const activeSubscription=parseOwnerSubscriptionRow(activeSub.data)
  if(activeSubscription && activeSubscription.ownerId!==owner) throw new Error('Subscription lookup unavailable')
  if(activeSubscription) throw new HttpError(409,'You already have an active subscription.')
  const entitlement=await db.rpc('billing_get_entitlement',{p_owner:owner})
  if(entitlement.error) throw new Error('Entitlement lookup unavailable')
  if(!Array.isArray(entitlement.data) || entitlement.data.length!==1 || typeof entitlement.data[0]?.is_pro!=='boolean') throw new Error('Invalid entitlement response')
  if(entitlement.data[0].is_pro) throw new HttpError(409,'You have prepaid time active from a one-time pass. Starting a subscription while that time remains is not supported yet — wait until it expires or contact support.')
  const {data:intent,error}=await db.rpc('billing_begin_subscription_intent',{p_id:requestId,p_owner:owner,p_price:config.recurringPriceId,p_live:config.live})
  if(error || !intent) throw new HttpError(409,'Unable to start this checkout. Wait and try again.')
  const throttled=await db.rpc('billing_throttle_subscription_checkout_attempt',{p_owner:owner})
  if(throttled.error?.code==='54000') throw new HttpError(429,'Too many checkout attempts. Wait up to an hour and try again.')
  if(throttled.error) throw new Error('Checkout throttle unavailable')
  const session = intent.session_id
    ? await stripe.checkout.sessions.retrieve(intent.session_id)
    : await (async()=>{await deps.validateRecurringCatalog(stripe,config); return deps.createSubscriptionCheckout(stripe,config,requestId,owner)})()
  if(!session.url || new URL(session.url).origin!=='https://checkout.stripe.com') throw new HttpError(409,'This checkout is no longer open. Check your account before purchasing again.')
  const bound=await db.rpc('billing_bind_subscription_intent',{p_id:requestId,p_owner:owner,p_session:session.id})
  if(bound.error) throw new Error('Unable to persist checkout')
  const lockBound=await db.rpc('billing_bind_owner_checkout',{p_owner:owner,p_kind:'subscription',p_id:requestId,p_session:session.id})
  if(lockBound.error) throw new Error('Unable to persist checkout')
  return json(200,{url:session.url})
 } catch(error) {return billingError(error)}
}

/** Explicit user-initiated cancellation (renewal opt-out). Sets
 * cancel_at_period_end on the caller's OWN subscription — looked up strictly
 * from billing_lookup_owner_subscription, never from a client-supplied
 * subscription id — so this can never be used to cancel anyone else's
 * subscription. Never touches billing_entitlements: access already paid for
 * (paid_through) is preserved exactly like cancellationPreservesEntitlement
 * documents, and lapses naturally at its own boundary. */
export { cancelSubscription } from './cancel.js'

const CHECKOUT_EVENT_TYPES = ['checkout.session.completed', 'checkout.session.async_payment_succeeded']
// Stripe's OWN terminal signal for an abandoned, never-completed Checkout
// Session — fired once the session's real expires_at passes (Stripe's
// default is 24 hours, customizable per session; this app never guesses at
// that boundary locally). This is the ONLY way an owner's checkout
// reservation is ever released without a completed payment/subscription —
// see applyCheckoutExpiredEvent and
// supabase/migrations/20260920050000_owner_checkout_reservation.sql.
const CHECKOUT_EXPIRED_EVENT_TYPES = ['checkout.session.expired']
// A dispute's OWN status has more terminal values than 'won' (e.g. 'lost',
// 'warning_closed'); only 'won' means funds were restored to the merchant.
// Every other charge.dispute.closed status leaves the chargeback recorded by
// the earlier charge.dispute.created event as the payment's last word — no
// second reversal event is needed or generated for those.
const REVERSAL_EVENT_TYPES = ['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed']
// Recurring subscription lifecycle. checkout.session.completed is already in
// CHECKOUT_EVENT_TYPES above and reused for subscription-mode sessions too
// (applyCheckoutEvent dispatches on the retrieved session's own `mode`) —
// it is deliberately NOT duplicated into this list.
const INVOICE_EVENT_TYPES = ['invoice.paid', 'invoice.payment_failed', 'invoice.marked_uncollectible', 'invoice.voided']
const SUBSCRIPTION_STATUS_EVENT_TYPES = ['customer.subscription.updated', 'customer.subscription.deleted']

export async function webhook(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
 try {
  if(request.method!=='POST') throw new HttpError(405,'Method not allowed')
  // Sales-flag-INDEPENDENT config: a webhook must keep reconciling existing
  // customers' refunds, paid invoices, and cancellation/status transitions
  // even while BILLING_ENABLED/BILLING_RECURRING_ENABLED pause NEW sales.
  // Only checkout()/subscribeCheckout() above (which START a new sale) gate
  // on billingConfig/recurringConfig; every check below (signature, live
  // mode, connected account) still applies in full.
  const config=billingServiceConfig(env), stripe=deps.stripeClient(config)
  const raw=await boundedBody(request,262144)
  const event=verifyEvent(stripe,config,raw,request.headers.get('stripe-signature'))
  if(CHECKOUT_EVENT_TYPES.includes(event.type)) return await applyCheckoutEvent(event,stripe,deps.serviceDatabase(env),config,deps,env)
  if(CHECKOUT_EXPIRED_EVENT_TYPES.includes(event.type)) return await applyCheckoutExpiredEvent(event,stripe,deps.serviceDatabase(env))
  if(REVERSAL_EVENT_TYPES.includes(event.type)) return await applyReversalEvent(event,stripe,deps.serviceDatabase(env))
  if(INVOICE_EVENT_TYPES.includes(event.type)) return await applyInvoiceEvent(event,stripe,deps.serviceDatabase(env),deps,env)
  if(SUBSCRIPTION_STATUS_EVENT_TYPES.includes(event.type)) return await applySubscriptionStatusEvent(event,stripe,deps.serviceDatabase(env))
  return json(200,{received:true})
 } catch(error) {return billingError(error)}
}

async function applyCheckoutEvent(event: Stripe.Event, stripe: Stripe, db: ReturnType<Dependencies['serviceDatabase']>, config: BillingConfig, deps: Dependencies, env: NodeJS.ProcessEnv): Promise<Response> {
  const eventSession=event.data.object as Stripe.Checkout.Session
  const session=await stripe.checkout.sessions.retrieve(eventSession.id,{expand:['line_items','payment_intent','subscription']})
  // The one-time pass and the OPTIONAL recurring subscription share this
  // single webhook endpoint and both raise checkout.session.completed; a
  // subscription-mode session is routed to its own handler entirely (never
  // through assertManualPayment below, which is fixed to mode:'payment' and
  // would otherwise just reject it as a generic mismatch on every delivery).
  if(session.mode==='subscription') return await applySubscriptionCheckoutEvent(session,stripe,db,deps,env)
  if(session.mode!=='payment') return json(200,{received:true})
  if(session.payment_status!=='paid') return json(200,{received:true})
  const {data:record,error}=await db.rpc('billing_lookup_checkout',{p_session:session.id})
  if(error || !record?.owner_id) throw new Error('Trusted checkout unavailable')
  const lines=session.line_items
  const intent=session.payment_intent
  if(!lines || lines.has_more || lines.data.length!==1 || !intent || typeof intent==='string' || intent.status!=='succeeded' || intent.amount_received!==PRO_PASS_AMOUNT_CENTS || intent.currency!==PRO_PASS_CURRENCY) throw new Error('Payment requires reconciliation')
  assertManualPayment({accountId:config.accountId,live:session.livemode,mode:session.mode,status:session.payment_status,currency:session.currency??'',amountTotal:session.amount_total??0,priceId:lines.data[0].price?.id??'',quantity:lines.data[0].quantity??0,paymentId:intent.id,ownerId:record.owner_id}, {accountId:config.accountId,live:config.live,priceId:config.priceId,ownerId:record.owner_id})
  // Record was established from verified Auth BEFORE returning the checkout URL.
  // Never derive the beneficiary from event metadata or the success redirect.
  const result=await db.rpc('billing_apply_verified_payment',{p_owner_id:record.owner_id,p_session_id:session.id,p_event_id:event.id,p_payment_id:intent.id,p_price_id:config.priceId,p_live:config.live,p_amount_total:PRO_PASS_AMOUNT_CENTS,p_currency:PRO_PASS_CURRENCY,p_verified_at:new Date(event.created*1000).toISOString()})
  if(result.error) throw new Error('Payment persistence unavailable')
  // Provider-confirmed terminal outcome: releases the owner's shared
  // checkout reservation (idempotent against redelivery/replay) so a repeat
  // manual pass purchase, or a subscription checkout, can start afterward.
  await releaseOwnerCheckoutBySession(db,record.owner_id,'manual',session.id)
  return json(200,{received:true})
}

/** Stripe's own checkout.session.expired event: the session is re-retrieved
 * and its OWN status re-checked (never trusting the event payload alone,
 * matching every other handler in this file) before releasing anything, and
 * no entitlement/ledger row is ever touched here — an expired session was
 * never paid. Dispatches on the retrieved session's mode exactly like
 * applyCheckoutEvent above, since manual and subscription checkouts share
 * this one webhook endpoint and both kinds of session can expire. */
async function applyCheckoutExpiredEvent(event: Stripe.Event, stripe: Stripe, db: ReturnType<Dependencies['serviceDatabase']>): Promise<Response> {
  const eventSession=event.data.object as Stripe.Checkout.Session
  const session=await stripe.checkout.sessions.retrieve(eventSession.id)
  if(session.status!=='expired') return json(200,{received:true})
  if(session.mode==='payment') {
    const {data:record,error}=await db.rpc('billing_lookup_checkout',{p_session:session.id})
    if(error) throw new Error('Checkout expiry lookup unavailable')
    if(!record?.owner_id) return json(200,{received:true})
    await releaseOwnerCheckoutBySession(db,record.owner_id,'manual',session.id)
    return json(200,{received:true})
  }
  if(session.mode==='subscription') {
    const {data:record,error}=await db.rpc('billing_lookup_subscription_checkout',{p_session:session.id})
    if(error) throw new Error('Checkout expiry lookup unavailable')
    if(!record?.owner_id) return json(200,{received:true})
    await releaseOwnerCheckoutBySession(db,record.owner_id,'subscription',session.id)
    return json(200,{received:true})
  }
  return json(200,{received:true})
}

/** FIRST sight of a new subscription: establishes the trusted identity
 * record from the session's OWN already-authenticated owner (looked up via
 * the checkout record billing_bind_subscription_intent wrote before this
 * session ever existed), never from event metadata. Re-retrieves the
 * subscription itself from Stripe rather than trusting anything on the
 * (already-expanded, but still event-triggered) session object, matching
 * applyCheckoutEvent's own re-retrieval discipline above. */
async function applySubscriptionCheckoutEvent(session: Stripe.Checkout.Session, stripe: Stripe, db: ReturnType<Dependencies['serviceDatabase']>, deps: Dependencies, env: NodeJS.ProcessEnv): Promise<Response> {
  const offerResult=await applyOfferCheckoutSession(session,stripe,db,env)
  if(offerResult)return offerResult
  // Sales-flag-INDEPENDENT: this only ever fires for a session that already
  // started (created while sales were open, or via cancel/recover flows) —
  // recording its completion is not "starting a new sale" and must not be
  // blocked by a since-flipped BILLING_RECURRING_ENABLED.
  const config=deps.recurringServiceConfig(env)
  if(session.status!=='complete') return json(200,{received:true})
  const {data:record,error}=await db.rpc('billing_lookup_subscription_checkout',{p_session:session.id})
  if(error || !record?.owner_id) throw new Error('Trusted subscription checkout unavailable')
  const subscriptionRef=session.subscription
  const subscriptionId=typeof subscriptionRef==='string' ? subscriptionRef : subscriptionRef?.id
  if(!subscriptionId) throw new Error('Missing subscription reference')
  const subscription=await stripe.subscriptions.retrieve(subscriptionId)
  const item=subscription.items.data[0]
  const itemPriceId=item?.price?.id
  if(subscription.id!==subscriptionId || session.livemode!==config.live || record.live!==config.live || subscription.items.has_more || subscription.items.data.length!==1 || item?.quantity!==1 || subscription.livemode!==config.live || itemPriceId!==config.recurringPriceId || itemPriceId!==record.price_id) {
    throw new Error('Subscription does not match its trusted checkout record')
  }
  if(!isSubscriptionStatus(subscription.status)) throw new Error('Unrecognized subscription status')
  const result=await db.rpc('billing_record_subscription',{p_owner_id:record.owner_id,p_subscription_id:subscription.id,p_price_id:itemPriceId,p_live:subscription.livemode,p_status:subscription.status})
  if(result.error) throw new Error('Subscription persistence unavailable')
  // Provider-confirmed terminal outcome: releases the owner's shared
  // checkout reservation so a manual pass purchase, or a later subscription
  // resubscribe after this one lapses/cancels, can start afterward.
  await releaseOwnerCheckoutBySession(db,record.owner_id,'subscription',session.id)
  return json(200,{received:true})
}

/** Recurring invoice lifecycle (invoice.paid / invoice.payment_failed /
 * invoice.marked_uncollectible / invoice.voided). Deliberately dispatches on
 * the freshly RE-RETRIEVED invoice's own current `status`, not on which of
 * those four event types triggered this call: Stripe's Smart Retries can
 * succeed on a later attempt after an earlier invoice.payment_failed has
 * already been delivered, so trusting the event type alone could otherwise
 * try to record an already-paid invoice as failed (assertFailedSubscriptionInvoice
 * explicitly rejects that) and get stuck retrying forever. An 'open' or
 * 'draft' invoice is non-terminal — Stripe is still retrying or the invoice
 * has not been finalized — and is intentionally ignored; a later event for
 * the same invoice id will eventually resolve it one way or the other. */
async function applyInvoiceEvent(event: Stripe.Event, stripe: Stripe, db: ReturnType<Dependencies['serviceDatabase']>, deps: Dependencies, env: NodeJS.ProcessEnv): Promise<Response> {
  // Sales-flag-INDEPENDENT: an existing subscriber's invoice lifecycle
  // (paid/failed/uncollectible/voided) must keep reconciling during a sales
  // pause, same as applySubscriptionCheckoutEvent above.
  const eventInvoice=event.data.object as Stripe.Invoice
  // Expanded so a 'paid' invoice's own settled InvoicePayment (and the
  // PaymentIntent it names) can be read below — the ONLY durable fact that
  // later lets a refund/dispute event (which only ever carries a
  // payment_intent) be attributed back to this specific invoice/owner. Never
  // taken from webhook metadata; this is the retrieved invoice's own record.
  const invoice=await stripe.invoices.retrieve(eventInvoice.id,{expand:['payments']})
  const subscriptionRef=invoice.parent?.subscription_details?.subscription
  if(!subscriptionRef) return json(200,{received:true})
  const subscriptionId=typeof subscriptionRef==='string' ? subscriptionRef : subscriptionRef.id
  const {data:trustedRow,error:lookupError}=await db.rpc('billing_lookup_subscription',{p_subscription_id:subscriptionId})
  if(lookupError || !trustedRow?.owner_id) throw new Error('Trusted subscription unavailable')
  const trusted={subscriptionId,ownerId:trustedRow.owner_id,priceId:trustedRow.price_id,live:trustedRow.live}

  if(trustedRow.offer_key) return applyOfferInvoice(invoice,event.created,event.type,stripe,db,trustedRow,env)

  const config=deps.recurringServiceConfig(env)

  if(!isInvoiceStatus(invoice.status)) throw new Error('Unrecognized invoice status')
  if(invoice.status==='open' || invoice.status==='draft') return json(200,{received:true})

  if(invoice.status==='paid') {
    if(invoice.lines.has_more || invoice.lines.data.length!==1) throw new Error('Unexpected invoice lines')
    const line=invoice.lines.data[0]
    // Installed Stripe SDK note (22.6.2, checked not assumed): an
    // InvoiceLineItem no longer carries a top-level `price` field in this
    // API version — it moved to `pricing.price_details.price`.
    const priceRef=line?.pricing?.price_details?.price
    const priceId=typeof priceRef==='string' ? priceRef : priceRef?.id ?? ''
    // Exactly one already-settled InvoicePayment is required, matching this
    // handler's existing "reject pagination/multiple lines instead of
    // trusting the first" discipline for invoice lines above. A partial-
    // payment or multi-attempt shape has no defined mapping policy here.
    if(!invoice.payments || invoice.payments.has_more || invoice.payments.data.length!==1) throw new Error('Unexpected invoice payments')
    const invoicePayment=invoice.payments.data[0]
    if(invoicePayment.status!=='paid' || invoicePayment.payment.type!=='payment_intent') throw new Error('Unexpected invoice payment shape')
    const paymentIntentRef=invoicePayment.payment.payment_intent
    const paymentIntentId=typeof paymentIntentRef==='string' ? paymentIntentRef : paymentIntentRef?.id
    if(!paymentIntentId) throw new Error('Missing invoice payment intent')
    const verified={
      accountId:config.accountId, live:invoice.livemode, subscriptionId, invoiceId:invoice.id,
      priceId, quantity:line?.quantity??0, currency:invoice.currency??'', amountPaid:invoice.amount_paid??0,
      status:invoice.status, periodStart:line.period.start*1000, periodEnd:line.period.end*1000,
      paymentIntentId,
    }
    assertVerifiedSubscriptionInvoice(verified,{accountId:config.accountId,live:config.live,priceId:config.recurringPriceId,subscription:trusted})
    const result=await db.rpc('billing_apply_mapped_subscription_invoice',{
      p_subscription_id:subscriptionId, p_invoice_id:invoice.id, p_owner_id:trusted.ownerId, p_payment_intent_id:paymentIntentId,
      p_price_id:config.recurringPriceId, p_live:config.live, p_amount_paid:invoice.amount_paid,
      p_currency:invoice.currency, p_period_start:new Date(line.period.start*1000).toISOString(),
      p_period_end:new Date(line.period.end*1000).toISOString(), p_verified_at:new Date(event.created*1000).toISOString(),
    })
    if(result.error) throw new Error('Subscription invoice persistence unavailable')
    return json(200,{received:true})
  }

  if(invoice.status!=='uncollectible' && invoice.status!=='void') throw new Error('Unrecognized invoice status')
  assertFailedSubscriptionInvoice({accountId:config.accountId,live:invoice.livemode,subscriptionId,invoiceId:invoice.id,status:invoice.status}, {accountId:config.accountId,subscription:trusted})
  const failResult=await db.rpc('billing_record_failed_subscription_invoice',{p_subscription_id:subscriptionId,p_invoice_id:invoice.id,p_owner_id:trusted.ownerId,p_currency:invoice.currency,p_verified_at:new Date(event.created*1000).toISOString()})
  if(failResult.error) throw new Error('Subscription invoice persistence unavailable')
  return json(200,{received:true})
}

/** customer.subscription.updated / customer.subscription.deleted. Re-
 * retrieves the subscription fresh (never trusts the event payload's own
 * status/cancel_at_period_end) and never touches billing_entitlements —
 * cancellation/status transitions preserve paid_through by construction
 * (billing_update_subscription_status's own body has no reference to that
 * table at all; see recurring.ts's cancellationPreservesEntitlement). */
async function applySubscriptionStatusEvent(event: Stripe.Event, stripe: Stripe, db: ReturnType<Dependencies['serviceDatabase']>): Promise<Response> {
  const eventSubscription=event.data.object as Stripe.Subscription
  const subscription=await stripe.subscriptions.retrieve(eventSubscription.id)
  const {data:trustedRow,error:lookupError}=await db.rpc('billing_lookup_subscription',{p_subscription_id:subscription.id})
  if(lookupError || !trustedRow?.owner_id) throw new Error('Trusted subscription unavailable')
  if(subscription.id!==eventSubscription.id || subscription.livemode!==event.livemode || subscription.livemode!==trustedRow.live) throw new Error('Subscription identity mismatch')
  if(!isSubscriptionStatus(subscription.status)) throw new Error('Unrecognized subscription status')
  if(trustedRow.offer_key) return applyOfferSubscriptionStatus(subscription,db,trustedRow)
  const result=await db.rpc('billing_update_subscription_status',{p_subscription_id:subscription.id,p_owner_id:trustedRow.owner_id,p_status:subscription.status,p_cancel_at_period_end:subscriptionStopsAtPeriodEnd(subscription)})
  if(result.error) throw new Error('Subscription status persistence unavailable')
  return json(200,{received:true})
}

/** Refund/dispute lifecycle events. Ownership is never taken from this event
 * or its payload — both RPCs this routes to look the owner up strictly from
 * an ALREADY-VERIFIED row the given payment_intent id names (billing_payments
 * for a one-time pass, billing_subscription_invoices for a recurring
 * invoice), exactly like applyCheckoutEvent above never trusts a
 * session/event's own metadata for the beneficiary. See
 * docs/BILLING_REVERSAL_DESIGN.md for the full refund/chargeback/dispute-won
 * policy this applies (permanent refunds, chargeback-only restoration,
 * partial amounts left as an anomaly, never reflowing an unrelated
 * payment/invoice's own recorded window). Each object is re-retrieved fresh
 * from Stripe by id (never trusting the event payload alone) — the same
 * defense-in-depth applyCheckoutEvent already uses for the Checkout Session.
 * The dispute's own retrieved `id` is carried through as `disputeId` on every
 * chargeback/chargeback_reversed call — it is what lets the RPC resolve a
 * dispute's terminal won/lost state correctly even if its 'created' and
 * 'closed' events arrive out of order or with an identical timestamp,
 * instead of relying on which event this table happened to see first.
 *
 * A single Stripe payment_intent id can name EITHER a one-time manual pass
 * OR a recurring subscription invoice's own settled payment (never both —
 * they are disjoint checkout flows) — `billing_lookup_reversal_target`
 * durably distinguishes the two from the SAME retrieved facts each purchase
 * flow already recorded (billing_payments.payment_id at checkout time;
 * billing_subscription_invoices.payment_intent_id at invoice.paid time, see
 * applyInvoiceEvent above), never from this event's own metadata. An id
 * belonging to neither (e.g. a reversal delivered before its own purchase
 * event has finished being recorded) falls through to
 * billing_apply_reversal_event, which fails closed with its existing
 * "unknown payment" error — that failure signals Stripe to retry, exactly as
 * before this routing existed. */
async function applyReversalEvent(event: Stripe.Event, stripe: Stripe, db: ReturnType<Dependencies['serviceDatabase']>): Promise<Response> {
  let paymentId: string, kind: 'refund' | 'chargeback' | 'chargeback_reversed', disputeId: string | null, amountTotal: number
  if(event.type==='charge.refunded') {
    const eventCharge=event.data.object as Stripe.Charge
    const charge=await stripe.charges.retrieve(eventCharge.id)
    const intent=charge.payment_intent
    if(typeof intent!=='string' || charge.amount_refunded<=0) return json(200,{received:true})
    // Use the signed event's immutable amount, not the charge's later cumulative
    // total: another refund between retries must not mutate this event's ledger facts.
    if(!Number.isSafeInteger(eventCharge.amount_refunded) || eventCharge.amount_refunded<=0 || eventCharge.amount_refunded>charge.amount_refunded) throw new Error('Invalid refund snapshot')
    paymentId=intent; kind='refund'; disputeId=null; amountTotal=eventCharge.amount_refunded
  } else {
    const eventDispute=event.data.object as Stripe.Dispute
    // The dispute's own id (never trusted from the event body alone — re-retrieved
    // below) is the fact that ties a 'created' and a later 'won' event to the SAME
    // dispute, so their relative delivery order/timestamp can never decide which one
    // "wins" for a single dispute's outcome.
    const dispute=await stripe.disputes.retrieve(eventDispute.id)
    const intent=dispute.payment_intent
    if(typeof intent!=='string') return json(200,{received:true})
    paymentId=intent; disputeId=dispute.id; amountTotal=dispute.amount
    if(event.type==='charge.dispute.created') kind='chargeback'
    else if(dispute.status==='won') kind='chargeback_reversed'
    else return json(200,{received:true})
  }
  const target=await db.rpc('billing_lookup_reversal_target',{p_payment_intent_id:paymentId})
  if(target.error) throw new Error('Reversal target lookup unavailable')
  if(target.data==='subscription') {
    const result=await db.rpc('billing_apply_subscription_invoice_reversal_event',{p_event_id:event.id,p_payment_intent_id:paymentId,p_kind:kind,p_dispute_id:disputeId,p_occurred_at:new Date(event.created*1000).toISOString(),p_amount_total:amountTotal})
    if(result.error) throw new Error('Subscription invoice reversal persistence unavailable')
    return json(200,{received:true})
  }
  const result=await db.rpc('billing_apply_reversal_event',{p_event_id:event.id,p_payment_id:paymentId,p_kind:kind,p_dispute_id:disputeId,p_occurred_at:new Date(event.created*1000).toISOString(),p_amount_total:amountTotal})
  if(result.error) throw new Error('Reversal persistence unavailable')
  return json(200,{received:true})
}
