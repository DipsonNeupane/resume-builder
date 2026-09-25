import test from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import { webhook, dependencies } from '../../server/billing/handlers.ts'
import { stripeClient, billingConfig } from '../../server/billing/stripe.ts'

const env = { BILLING_ENABLED: 'true', STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', STRIPE_ACCOUNT_ID: 'acct_fixture', STRIPE_PASS_PRICE_ID: 'price_fixture', APP_ORIGIN: 'https://resumestride.com', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'fixture' }

function fixture(options: { charge?: Record<string, unknown>; dispute?: Record<string, unknown>; rpcError?: boolean; target?: 'manual' | 'subscription' | null; lookupError?: boolean } = {}) {
  const stripe = stripeClient(billingConfig(env))
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const charge = { id: 'ch_fixture', payment_intent: 'pi_fixture', amount_refunded: 1999, ...options.charge }
  const dispute = { id: 'du_fixture', payment_intent: 'pi_fixture', amount: 1999, status: 'won', ...options.dispute }
  stripe.charges.retrieve = (async () => charge) as unknown as typeof stripe.charges.retrieve
  stripe.disputes.retrieve = (async () => dispute) as unknown as typeof stripe.disputes.retrieve
  const deps = {
    ...dependencies, stripeClient: () => stripe,
    serviceDatabase: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'billing_lookup_reversal_target') {
        return { data: options.target === undefined ? 'manual' : options.target, error: options.lookupError ? {} : null }
      }
      return { data: { paid_through: null, status: 'voided_refund', applied: true, anomaly: null }, error: options.rpcError ? {} : null }
    } }) as unknown as ReturnType<typeof dependencies.serviceDatabase>,
  }
  return { deps, calls, charge, dispute }
}

function requestFor(type: string, object: Record<string, unknown>) {
  const stripe = stripeClient(billingConfig(env))
  const payload = JSON.stringify({ id: 'evt_fixture', type, livemode: false, created: 1700000000, data: { object } })
  return new Request(env.APP_ORIGIN + '/api/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET }) },
    body: payload,
  })
}

test('charge.refunded re-retrieves the charge and reverses by its own payment_intent and cumulative amount_refunded, never trusting the event body', async () => {
  const { deps, calls } = fixture()
  const request = requestFor('charge.refunded', { id: 'ch_fixture', payment_intent: 'attacker_pi', amount_refunded: 1999 })
  const result = await webhook(request, env, deps)
  assert.equal(result.status, 200)
  assert.deepEqual(calls, [
    { name: 'billing_lookup_reversal_target', args: { p_payment_intent_id: 'pi_fixture' } },
    { name: 'billing_apply_reversal_event', args: { p_event_id: 'evt_fixture', p_payment_id: 'pi_fixture', p_kind: 'refund', p_dispute_id: null, p_occurred_at: '2023-11-14T22:13:20.000Z', p_amount_total: 1999 } },
  ])
})

test('a zero-amount charge.refunded event (no real refund yet, e.g. a related event type) is acknowledged without calling the RPC', async () => {
  const { deps, calls } = fixture({ charge: { amount_refunded: 0 } })
  const result = await webhook(requestFor('charge.refunded', { id: 'ch_fixture', amount_refunded: 1999 }), env, deps)
  assert.equal(result.status, 200)
  assert.deepEqual(calls, [])
})

test('a charge with no string payment_intent (unexpanded or absent) is acknowledged without calling the RPC', async () => {
  const { deps, calls } = fixture({ charge: { payment_intent: null } })
  const result = await webhook(requestFor('charge.refunded', { id: 'ch_fixture', amount_refunded: 1999 }), env, deps)
  assert.equal(result.status, 200)
  assert.deepEqual(calls, [])
})

test('charge.dispute.created reverses as a chargeback using the dispute\'s own retrieved amount and id', async () => {
  const { deps, calls } = fixture({ dispute: { id: 'du_fixture', amount: 1999 } })
  const result = await webhook(requestFor('charge.dispute.created', { id: 'attacker_du', payment_intent: 'attacker_pi' }), env, deps)
  assert.equal(result.status, 200)
  assert.deepEqual(calls, [
    { name: 'billing_lookup_reversal_target', args: { p_payment_intent_id: 'pi_fixture' } },
    { name: 'billing_apply_reversal_event', args: { p_event_id: 'evt_fixture', p_payment_id: 'pi_fixture', p_kind: 'chargeback', p_dispute_id: 'du_fixture', p_occurred_at: '2023-11-14T22:13:20.000Z', p_amount_total: 1999 } },
  ])
})

test('charge.dispute.closed with status won reverses as chargeback_reversed carrying the same retrieved dispute id', async () => {
  const { deps, calls } = fixture({ dispute: { id: 'du_fixture', status: 'won' } })
  const result = await webhook(requestFor('charge.dispute.closed', { id: 'du_fixture' }), env, deps)
  assert.equal(result.status, 200)
  assert.equal(calls[1]?.args.p_kind, 'chargeback_reversed')
  assert.equal(calls[1]?.args.p_dispute_id, 'du_fixture')
})

test('charge.dispute.closed with a non-won status (lost, warning_closed, etc.) is acknowledged without calling the RPC', async () => {
  for (const status of ['lost', 'warning_closed', 'under_review']) {
    const { deps, calls } = fixture({ dispute: { status } })
    const result = await webhook(requestFor('charge.dispute.closed', { id: 'du_fixture' }), env, deps)
    assert.equal(result.status, 200, status)
    assert.deepEqual(calls, [], status)
  }
})

test('a dispute with no string payment_intent is acknowledged without calling the RPC', async () => {
  const { deps, calls } = fixture({ dispute: { payment_intent: null } })
  const result = await webhook(requestFor('charge.dispute.created', { id: 'du_fixture' }), env, deps)
  assert.equal(result.status, 200)
  assert.deepEqual(calls, [])
})

test('an unrecognized event type is acknowledged without any Stripe retrieval or database call', async () => {
  const { deps, calls } = fixture()
  const stripeCalls: string[] = []
  const stripe = deps.stripeClient()
  stripe.charges.retrieve = (async () => { stripeCalls.push('charges'); throw new Error('must not run') }) as unknown as typeof stripe.charges.retrieve
  stripe.disputes.retrieve = (async () => { stripeCalls.push('disputes'); throw new Error('must not run') }) as unknown as typeof stripe.disputes.retrieve
  const result = await webhook(requestFor('customer.created', { id: 'cus_fixture' }), env, { ...deps, stripeClient: () => stripe })
  assert.equal(result.status, 200)
  assert.deepEqual(calls, [])
  assert.deepEqual(stripeCalls, [])
})

test('reversal persistence failure requests webhook retry without acknowledging successful processing', async () => {
  const { deps, calls } = fixture({ rpcError: true })
  const result = await webhook(requestFor('charge.refunded', { id: 'ch_fixture', amount_refunded: 1999 }), env, deps)
  assert.equal(result.status, 503)
  assert.ok(calls.some(call => call.name === 'billing_apply_reversal_event'))
  assert.equal(result.headers.get('cache-control'), 'no-store')
  assert.ok(!(await result.text()).includes('pi_fixture'))
})

test('a reversal-target lookup failure requests webhook retry without ever calling an apply RPC', async () => {
  const { deps, calls } = fixture({ lookupError: true })
  const result = await webhook(requestFor('charge.refunded', { id: 'ch_fixture', amount_refunded: 1999 }), env, deps)
  assert.equal(result.status, 503)
  assert.deepEqual(calls, [{ name: 'billing_lookup_reversal_target', args: { p_payment_intent_id: 'pi_fixture' } }])
})

test('refund retries retain the signed event amount after further refunds', async () => {
  const { deps, calls } = fixture({ charge: { amount_refunded: 500 } })
  const response = await webhook(requestFor('charge.refunded', { id: 'ch_fixture', amount_refunded: 200 }), env, deps)
  assert.equal(response.status, 200)
  assert.equal(calls[1].args.p_amount_total, 200)
})

test('a second, later dispute on the same payment carries its own distinct dispute id, never reusing the first', async () => {
  const first = fixture({ dispute: { id: 'du_first' } })
  await webhook(requestFor('charge.dispute.created', { id: 'du_first' }), env, first.deps)
  assert.equal(first.calls[1]?.args.p_dispute_id, 'du_first')

  const second = fixture({ dispute: { id: 'du_second' } })
  await webhook(requestFor('charge.dispute.created', { id: 'du_second' }), env, second.deps)
  assert.equal(second.calls[1]?.args.p_dispute_id, 'du_second')
  assert.notEqual(first.calls[1]?.args.p_dispute_id, second.calls[1]?.args.p_dispute_id)
})

// --- Subscription invoice reversal routing -----------------------------
// A payment_intent backing a recurring subscription invoice (established
// once, durably, by applyInvoiceEvent's billing_record_subscription_invoice_payment_intent
// call — see tests/billing/recurring-handler.test.ts) must route to the
// subscription-invoice reversal RPC instead of the one-time-pass one, from
// the SAME retrieved Charge/Dispute facts, never anything the event itself
// claims about which purchase flow it belongs to.

test('charge.refunded against a subscription invoice payment_intent routes to the subscription reversal RPC, not the one-time-pass one', async () => {
  const { deps, calls } = fixture({ target: 'subscription' })
  const result = await webhook(requestFor('charge.refunded', { id: 'ch_fixture', amount_refunded: 1999 }), env, deps)
  assert.equal(result.status, 200)
  assert.deepEqual(calls, [
    { name: 'billing_lookup_reversal_target', args: { p_payment_intent_id: 'pi_fixture' } },
    { name: 'billing_apply_subscription_invoice_reversal_event', args: { p_event_id: 'evt_fixture', p_payment_intent_id: 'pi_fixture', p_kind: 'refund', p_dispute_id: null, p_occurred_at: '2023-11-14T22:13:20.000Z', p_amount_total: 1999 } },
  ])
  assert.ok(!calls.some(call => call.name === 'billing_apply_reversal_event'))
})

test('charge.dispute.created/closed against a subscription invoice payment_intent carries the retrieved dispute id through the subscription reversal RPC', async () => {
  const created = fixture({ target: 'subscription', dispute: { id: 'du_sub', amount: 1999 } })
  const createdResult = await webhook(requestFor('charge.dispute.created', { id: 'du_sub' }), env, created.deps)
  assert.equal(createdResult.status, 200)
  assert.equal(created.calls[1]?.name, 'billing_apply_subscription_invoice_reversal_event')
  assert.equal(created.calls[1]?.args.p_kind, 'chargeback')
  assert.equal(created.calls[1]?.args.p_dispute_id, 'du_sub')

  const won = fixture({ target: 'subscription', dispute: { id: 'du_sub', status: 'won' } })
  const wonResult = await webhook(requestFor('charge.dispute.closed', { id: 'du_sub' }), env, won.deps)
  assert.equal(wonResult.status, 200)
  assert.equal(won.calls[1]?.name, 'billing_apply_subscription_invoice_reversal_event')
  assert.equal(won.calls[1]?.args.p_kind, 'chargeback_reversed')
})

test('a payment_intent belonging to neither domain falls through to the one-time-pass RPC and fails closed for retry', async () => {
  const { deps, calls } = fixture({ target: null, rpcError: true })
  const result = await webhook(requestFor('charge.refunded', { id: 'ch_fixture', amount_refunded: 1999 }), env, deps)
  assert.equal(result.status, 503)
  assert.deepEqual(calls, [
    { name: 'billing_lookup_reversal_target', args: { p_payment_intent_id: 'pi_fixture' } },
    { name: 'billing_apply_reversal_event', args: { p_event_id: 'evt_fixture', p_payment_id: 'pi_fixture', p_kind: 'refund', p_dispute_id: null, p_occurred_at: '2023-11-14T22:13:20.000Z', p_amount_total: 1999 } },
  ])
})

test('subscription invoice reversal persistence failure requests webhook retry without acknowledging successful processing', async () => {
  const { deps, calls } = fixture({ target: 'subscription', rpcError: true })
  const result = await webhook(requestFor('charge.refunded', { id: 'ch_fixture', amount_refunded: 1999 }), env, deps)
  assert.equal(result.status, 503)
  assert.ok(calls.some(call => call.name === 'billing_apply_subscription_invoice_reversal_event'))
  assert.equal(result.headers.get('cache-control'), 'no-store')
})
