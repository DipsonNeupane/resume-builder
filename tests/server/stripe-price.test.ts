import test from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import { validateCatalog, validateRecurringCatalog, type BillingConfig, type RecurringBillingConfig } from '../../server/billing/stripe.ts'

const baseConfig: BillingConfig = {
  secret: 'sk_test_fixture', webhookSecret: 'whsec_fixture', accountId: 'acct_fixture',
  priceId: 'price_one_time', live: false, origin: 'https://resumestride.com',
}

function stripeWithPrice(price: Record<string, unknown>): Stripe {
  return {
    accounts: { retrieve: async () => ({ id: 'acct_fixture', charges_enabled: true }) },
    prices: { retrieve: async () => price },
  } as unknown as Stripe
}

test('one-time catalog accepts exactly 1999 USD cents and rejects the former amount', async () => {
  const price = { active: true, livemode: false, currency: 'usd', unit_amount: 1999, type: 'one_time' }
  await assert.doesNotReject(validateCatalog(stripeWithPrice(price), baseConfig))
  await assert.rejects(validateCatalog(stripeWithPrice({ ...price, unit_amount: 999 }), baseConfig))
})

test('recurring catalog accepts exactly 1999 USD cents every 30 days', async () => {
  const config: RecurringBillingConfig = { ...baseConfig, recurringPriceId: 'price_recurring' }
  const price = { active: true, livemode: false, currency: 'usd', unit_amount: 1999, type: 'recurring', recurring: { interval: 'day', interval_count: 30 } }
  await assert.doesNotReject(validateRecurringCatalog(stripeWithPrice(price), config))
  await assert.rejects(validateRecurringCatalog(stripeWithPrice({ ...price, unit_amount: 999 }), config))
  await assert.rejects(validateRecurringCatalog(stripeWithPrice({ ...price, recurring: { interval: 'month', interval_count: 1 } }), config))
})
