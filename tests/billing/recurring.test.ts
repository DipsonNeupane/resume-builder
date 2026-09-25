import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RECURRING_AMOUNT, RECURRING_CURRENCY,
  assertVerifiedSubscriptionInvoice, assertFailedSubscriptionInvoice,
  subscriptionInvoiceGrant, failedInvoiceGrant, cancellationPreservesEntitlement,
  willRenew, isSubscriptionStatus, parseOwnerSubscriptionRow,
} from '../../server/billing/recurring.ts'

const trustedSubscription = { subscriptionId: 'sub_fixture', ownerId: 'owner_fixture', priceId: 'price_recurring_fixture', live: false }
const expected = { accountId: 'acct_fixture', live: false, priceId: 'price_recurring_fixture', subscription: trustedSubscription }
const invoice = {
  accountId: 'acct_fixture', live: false, subscriptionId: 'sub_fixture', invoiceId: 'in_fixture',
  priceId: 'price_recurring_fixture', quantity: 1, currency: 'usd', amountPaid: 1999,
  status: 'paid' as const, periodStart: Date.parse('2026-01-01T00:00:00Z'), periodEnd: Date.parse('2026-01-31T00:00:00Z'),
  paymentIntentId: 'pi_fixture',
}

test('a genuine paid invoice matching every trusted fact is accepted', () => {
  assert.doesNotThrow(() => assertVerifiedSubscriptionInvoice(invoice, expected))
})

test('any mismatched fact on the invoice is rejected, never silently accepted', () => {
  for (const change of [
    { live: true }, { accountId: 'other' }, { priceId: 'other' }, { subscriptionId: 'sub_other' },
    { status: 'open' as const }, { status: 'draft' as const }, { status: 'uncollectible' as const }, { status: 'void' as const },
    { currency: 'eur' }, { amountPaid: 1 }, { amountPaid: 1998 }, { quantity: 2 }, { invoiceId: '' },
    { paymentIntentId: '' }, { paymentIntentId: '   ' },
  ]) assert.throws(() => assertVerifiedSubscriptionInvoice({ ...invoice, ...change }, expected))
})

test('the expected price/owner authority must itself come from the trusted server record, not the caller', () => {
  assert.throws(() => assertVerifiedSubscriptionInvoice(invoice, { ...expected, priceId: 'different_price' }))
  assert.throws(() => assertVerifiedSubscriptionInvoice(invoice, { ...expected, subscription: { ...trustedSubscription, priceId: 'different_price' } }))
  assert.throws(() => assertVerifiedSubscriptionInvoice(invoice, { ...expected, subscription: { ...trustedSubscription, ownerId: '' } }))
  assert.throws(() => assertVerifiedSubscriptionInvoice(invoice, { ...expected, subscription: { ...trustedSubscription, subscriptionId: 'sub_other' } }))
})

test('an out-of-order or reversed invoice period is rejected', () => {
  assert.throws(() => assertVerifiedSubscriptionInvoice({ ...invoice, periodEnd: invoice.periodStart }, expected))
  assert.throws(() => assertVerifiedSubscriptionInvoice({ ...invoice, periodEnd: invoice.periodStart - 1000 }, expected))
  assert.throws(() => assertVerifiedSubscriptionInvoice({ ...invoice, periodEnd: invoice.periodStart + 400 * 24 * 60 * 60 * 1000 }, expected))
})

test('a failed invoice must not claim status paid and must still match subscription identity', () => {
  const failed = { accountId: 'acct_fixture', live: false, subscriptionId: 'sub_fixture', invoiceId: 'in_failed', status: 'uncollectible' as const }
  assert.doesNotThrow(() => assertFailedSubscriptionInvoice(failed, { accountId: 'acct_fixture', subscription: trustedSubscription }))
  assert.throws(() => assertFailedSubscriptionInvoice({ ...failed, status: 'paid' as const }, { accountId: 'acct_fixture', subscription: trustedSubscription }))
  assert.throws(() => assertFailedSubscriptionInvoice({ ...failed, subscriptionId: 'sub_other' }, { accountId: 'acct_fixture', subscription: trustedSubscription }))
  assert.throws(() => assertFailedSubscriptionInvoice({ ...failed, accountId: 'other' }, { accountId: 'acct_fixture', subscription: trustedSubscription }))
})

test('a first invoice with no prior entitlement grants exactly its own period end', () => {
  const periodEnd = Date.parse('2026-01-31T00:00:00Z')
  assert.deepEqual(subscriptionInvoiceGrant(null, periodEnd), { paidThrough: periodEnd, advanced: true })
})

test('renewal does not charge for already-prepaid time: an invoice period ending before existing paid_through is a no-op', () => {
  const existing = Date.parse('2026-06-01T00:00:00Z') // e.g. a manual pass purchased on top
  const periodEnd = Date.parse('2026-01-31T00:00:00Z')
  assert.deepEqual(subscriptionInvoiceGrant(existing, periodEnd), { paidThrough: existing, advanced: false })
})

test('an invoice period ending exactly at the current paid_through is also a no-op (never shrinks, never doubles)', () => {
  const boundary = Date.parse('2026-01-31T00:00:00Z')
  assert.deepEqual(subscriptionInvoiceGrant(boundary, boundary), { paidThrough: boundary, advanced: false })
})

test('a genuinely later invoice period advances paid_through to that period end, not additively', () => {
  const existing = Date.parse('2026-01-31T00:00:00Z')
  const periodEnd = Date.parse('2026-03-02T00:00:00Z')
  assert.deepEqual(subscriptionInvoiceGrant(existing, periodEnd), { paidThrough: periodEnd, advanced: true })
})

test('out-of-order invoice delivery cannot grant double time: applying an earlier period after a later one is a no-op', () => {
  const first = subscriptionInvoiceGrant(null, Date.parse('2026-03-02T00:00:00Z'))
  const outOfOrder = subscriptionInvoiceGrant(first.paidThrough, Date.parse('2026-01-31T00:00:00Z'))
  assert.deepEqual(outOfOrder, { paidThrough: first.paidThrough, advanced: false })
})

test('applying the exact same invoice period twice is idempotent', () => {
  const periodEnd = Date.parse('2026-01-31T00:00:00Z')
  const once = subscriptionInvoiceGrant(null, periodEnd)
  const twice = subscriptionInvoiceGrant(once.paidThrough, periodEnd)
  assert.deepEqual(twice, { paidThrough: periodEnd, advanced: false })
})

test('a failed invoice never changes the entitlement, active or absent', () => {
  assert.equal(failedInvoiceGrant(null), null)
  const existing = Date.parse('2026-01-31T00:00:00Z')
  assert.equal(failedInvoiceGrant(existing), existing)
})

test('cancellation preserves whatever paid-through already exists, unconditionally', () => {
  assert.equal(cancellationPreservesEntitlement(null), null)
  const existing = Date.parse('2026-01-31T00:00:00Z')
  assert.equal(cancellationPreservesEntitlement(existing), existing)
})

test('invalid timestamps are rejected across every timestamp-accepting function', () => {
  for (const bad of [NaN, Infinity, -1, 0.5]) {
    assert.throws(() => subscriptionInvoiceGrant(null, bad))
    assert.throws(() => subscriptionInvoiceGrant(bad, Date.now()))
    assert.throws(() => failedInvoiceGrant(bad))
    assert.throws(() => cancellationPreservesEntitlement(bad))
  }
})

test('willRenew reflects active-and-not-cancel-pending only', () => {
  assert.equal(willRenew('active', false), true)
  assert.equal(willRenew('active', true), false)
  assert.equal(willRenew('past_due', false), false)
  assert.equal(willRenew('canceled', false), false)
})

test('isSubscriptionStatus rejects unrecognized/foreign values', () => {
  assert.equal(isSubscriptionStatus('active'), true)
  assert.equal(isSubscriptionStatus('paused'), true)
  assert.equal(isSubscriptionStatus('made_up_status'), false)
  assert.equal(isSubscriptionStatus(''), false)
})

test('recurring price constants match the $19.99 catalog price', () => {
  assert.equal(RECURRING_AMOUNT, 1999)
  assert.equal(RECURRING_CURRENCY, 'usd')
})

// billing_lookup_owner_subscription is declared `returns public.billing_subscriptions`
// with a scalar `select ... limit 1` body: when no row matches, PostgREST wires that SQL
// NULL of the composite type as a JSON OBJECT with every column null, never a bare JSON
// null. This is the REAL shape a parent-reported live Stripe-sandbox run observed for a
// fresh owner with no subscription at all.
const REAL_ABSENT_ROW = {
  subscription_id: null, owner_id: null, price_id: null, live: null,
  status: null, cancel_at_period_end: null, current_period_end: null,
  created_at: null, updated_at: null,
}
const REAL_PRESENT_ROW = {
  subscription_id: 'sub_fixture', owner_id: 'owner_fixture', price_id: 'price_recurring_fixture', live: false,
  status: 'active', cancel_at_period_end: false, current_period_end: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

test('parseOwnerSubscriptionRow treats both the real all-null-column wire shape and a bare null as no subscription', () => {
  assert.equal(parseOwnerSubscriptionRow(REAL_ABSENT_ROW), null)
  assert.equal(parseOwnerSubscriptionRow(null), null)
  assert.throws(() => parseOwnerSubscriptionRow(undefined))
})

test('parseOwnerSubscriptionRow accepts a real, fully-populated row (current_period_end stays null, as every handler leaves it today)', () => {
  assert.deepEqual(parseOwnerSubscriptionRow(REAL_PRESENT_ROW), {
    subscriptionId: 'sub_fixture', ownerId: 'owner_fixture', status: 'active', cancelAtPeriodEnd: false,
  })
})

test('parseOwnerSubscriptionRow fails closed on a partial/malformed row instead of treating it as absent or present', () => {
  for (const change of [
    { subscription_id: null }, // owner_id etc. present but the id itself missing
    { owner_id: null },
    { status: null },
    { cancel_at_period_end: null },
    { created_at: null },
    { updated_at: null },
    { subscription_id: '' }, // blank, not null — still not a valid id
    { subscription_id: '   ' },
    { owner_id: '' },
    { status: 'made_up_status' }, // not in the RPC's own known-status filter
    { cancel_at_period_end: 'false' }, // wrong type
    { cancel_at_period_end: 1 },
    { price_id: 42 }, { live: 'false' }, { created_at: 'invalid' }, { updated_at: 123 },
  ]) {
    assert.throws(() => parseOwnerSubscriptionRow({ ...REAL_PRESENT_ROW, ...change }), JSON.stringify(change))
  }
})

test('parseOwnerSubscriptionRow rejects non-object, non-null wire shapes outright', () => {
  for (const bad of ['sub_fixture', 42, true, [], {}, { subscription_id: null }]) assert.throws(() => parseOwnerSubscriptionRow(bad))
})
