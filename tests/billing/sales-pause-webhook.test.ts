import test from 'node:test'
import assert from 'node:assert/strict'
import { webhook, checkout, subscribeCheckout, dependencies } from '../../server/billing/handlers.ts'
import { stripeClient, billingServiceConfig } from '../../server/billing/stripe.ts'

/** Regression coverage for the sales-pause-must-not-block-reconciliation fix:
 * server/billing/stripe.ts's billingServiceConfig/recurringServiceConfig are
 * independent of BILLING_ENABLED/BILLING_RECURRING_ENABLED, and
 * server/billing/handlers.ts's webhook() + its recurring sub-handlers use
 * those instead of the sales-gated billingConfig/recurringConfig. Only
 * checkout()/subscribeCheckout() (which START a new sale) still gate on the
 * sales flags. */

const baseEnv = {
  STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
  STRIPE_ACCOUNT_ID: 'acct_fixture', STRIPE_PASS_PRICE_ID: 'price_manual', STRIPE_RECURRING_PRICE_ID: 'price_recurring',
  APP_ORIGIN: 'https://resumestride.com', SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
}
// Both sales flags OFF: new one-time-pass AND new subscription sales paused.
const pausedEnv = { ...baseEnv, BILLING_ENABLED: 'false', BILLING_RECURRING_ENABLED: 'false' }

function signedRequest(payload: string, env: typeof pausedEnv = pausedEnv) {
  const stripe = stripeClient(billingServiceConfig(env))
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET })
  return new Request(env.APP_ORIGIN + '/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } })
}

test('a validly signed manual-pass refund still reconciles while both sales flags are off', async () => {
  const stripe = stripeClient(billingServiceConfig(pausedEnv))
  stripe.charges.retrieve = (async () => ({ id: 'ch_fixture', payment_intent: 'pi_fixture', amount_refunded: 1999 })) as unknown as typeof stripe.charges.retrieve
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const deps = {
    ...dependencies, stripeClient: () => stripe,
    serviceDatabase: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'billing_lookup_reversal_target') return { data: 'manual', error: null }
      return { data: { paid_through: null, status: 'voided_refund', applied: true, anomaly: null }, error: null }
    } }) as unknown as ReturnType<typeof dependencies.serviceDatabase>,
  }
  const payload = JSON.stringify({ id: 'evt_fixture', type: 'charge.refunded', livemode: false, created: 1700000000, data: { object: { id: 'ch_fixture', amount_refunded: 1999 } } })
  const result = await webhook(signedRequest(payload), pausedEnv, deps)
  assert.equal(result.status, 200)
  assert.ok(calls.some(c => c.name === 'billing_apply_reversal_event'))
})

test('a validly signed recurring invoice.paid event still reconciles while both sales flags are off', async () => {
  const stripe = stripeClient(billingServiceConfig(pausedEnv))
  const line = { quantity: 1, pricing: { price_details: { price: 'price_recurring' } }, period: { start: 1700000000, end: 1702592000 } }
  const payment = { status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_fixture' } }
  stripe.invoices.retrieve = (async () => ({
    id: 'in_fixture', parent: { subscription_details: { subscription: 'sub_fixture' } }, status: 'paid', livemode: false,
    currency: 'usd', amount_paid: 1999, lines: { has_more: false, data: [line] }, payments: { has_more: false, data: [payment] },
  })) as unknown as typeof stripe.invoices.retrieve
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const deps = {
    ...dependencies, stripeClient: () => stripe,
    serviceDatabase: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: name === 'billing_lookup_subscription' ? { owner_id: 'owner', price_id: 'price_recurring', live: false } : null, error: null }
    } }) as unknown as ReturnType<typeof dependencies.serviceDatabase>,
  }
  const payload = JSON.stringify({ id: 'evt_invoice', type: 'invoice.paid', livemode: false, created: 1700000000, data: { object: { id: 'in_fixture' } } })
  const result = await webhook(signedRequest(payload), pausedEnv, deps)
  assert.equal(result.status, 200)
  assert.ok(calls.some(c => c.name === 'billing_apply_mapped_subscription_invoice'))
})

test('a validly signed subscription status/cancellation event still reconciles while both sales flags are off', async () => {
  const stripe = stripeClient(billingServiceConfig(pausedEnv))
  const subscription = { id: 'sub_fixture', livemode: false, status: 'canceled', cancel_at_period_end: false }
  stripe.subscriptions.retrieve = (async () => subscription) as unknown as typeof stripe.subscriptions.retrieve
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const deps = {
    ...dependencies, stripeClient: () => stripe,
    serviceDatabase: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: name === 'billing_lookup_subscription' ? { owner_id: 'owner', price_id: 'price_recurring', live: false } : null, error: null }
    } }) as unknown as ReturnType<typeof dependencies.serviceDatabase>,
  }
  const payload = JSON.stringify({ id: 'evt_status', type: 'customer.subscription.deleted', livemode: false, created: 1700000000, data: { object: { id: 'sub_fixture' } } })
  const result = await webhook(signedRequest(payload), pausedEnv, deps)
  assert.equal(result.status, 200)
  assert.ok(calls.some(c => c.name === 'billing_update_subscription_status'))
})

test('an invalid signature is still rejected while both sales flags are off; the pause never weakens verification', async () => {
  const payload = JSON.stringify({ id: 'evt_forged', type: 'charge.refunded', livemode: false, created: 1700000000, data: { object: { id: 'ch_fixture' } } })
  const request = new Request(pausedEnv.APP_ORIGIN + '/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': 't=1700000000,v1=forged' } })
  const result = await webhook(request, pausedEnv, dependencies)
  assert.equal(result.status, 400)
})

test('checkout creation still denies new sales when BILLING_ENABLED is off', async () => {
  const request = new Request(pausedEnv.APP_ORIGIN + '/api/checkout', { method: 'POST', headers: { origin: pausedEnv.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ requestId: '11111111-1111-4111-8111-111111111111' }) })
  const result = await checkout(request, pausedEnv, dependencies)
  assert.equal(result.status, 503)
})

test('subscription checkout creation still denies new sales when BILLING_RECURRING_ENABLED is off, even with BILLING_ENABLED on', async () => {
  const env = { ...baseEnv, BILLING_ENABLED: 'true', BILLING_RECURRING_ENABLED: 'false' }
  const request = new Request(env.APP_ORIGIN + '/api/subscribe', { method: 'POST', headers: { origin: env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ requestId: '11111111-1111-4111-8111-111111111111', renewalOptIn: true }) })
  const result = await subscribeCheckout(request, env, dependencies)
  assert.equal(result.status, 503)
})
