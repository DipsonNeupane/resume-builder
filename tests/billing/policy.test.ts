import test from 'node:test'
import assert from 'node:assert/strict'
import { PASS_MS, freeWindow, isPro, manualPassWindow, assertManualPayment } from '../../server/billing/policy.ts'
import { PRO_PASS_AMOUNT_CENTS } from '../../server/billing/constants.ts'

test('free allowance is signup anchored, fixed 30 days and never accumulates', () => {
  const signup = Date.parse('2026-01-31T12:00:00Z')
  assert.deepEqual(freeWindow(signup, signup + PASS_MS - 1), {
    cycle: 0, startsAt: signup, endsAt: signup + PASS_MS, allowance: 3,
  })
  assert.equal(freeWindow(signup, signup + PASS_MS).cycle, 1)
  assert.equal(freeWindow(signup, signup + 20 * PASS_MS).allowance, 3)
})
test('first, early and expired purchases each provide full non-overlapping paid time', () => {
  const paid = Date.parse('2026-03-01T00:00:00Z')
  const first = manualPassWindow(null, paid)
  const early = manualPassWindow(first.endsAt, paid + 1000)
  assert.equal(first.endsAt - first.startsAt, PASS_MS)
  assert.equal(early.startsAt, first.endsAt)
  assert.equal(early.endsAt, paid + 2 * PASS_MS)
  const expired = manualPassWindow(early.endsAt, early.endsAt + 1000)
  assert.equal(expired.startsAt, early.endsAt + 1000)
})
test('access expires exactly at boundary; cancellation is not an expiry mutation', () => {
  assert.equal(isPro(1000, 999), true)
  assert.equal(isPro(1000, 1000), false)
  assert.equal(isPro(null, 999), false)
})
test('invalid or reversed authoritative timestamps fail closed', () => {
  for (const time of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => freeWindow(0, time))
    assert.throws(() => manualPassWindow(null, time))
  }
  assert.throws(() => freeWindow(1000, 999))
})
const expected = { accountId: 'acct_fixture', live: false, priceId: 'price_fixture', ownerId: 'owner_fixture' }
const payment = { ...expected, mode: 'payment', status: 'paid', currency: 'usd', amountTotal: 1999, quantity: 1, paymentId: 'pi_fixture' }
test('only an exact verified server checkout can qualify for manual grant', () => {
  assert.equal(PRO_PASS_AMOUNT_CENTS, 1999)
  assert.doesNotThrow(() => assertManualPayment(payment, expected))
  for (const change of [
    { live: true }, { accountId: 'other' }, { priceId: 'other' }, { ownerId: 'other' },
    { mode: 'subscription' }, { status: 'unpaid' }, { currency: 'eur' },
    { amountTotal: 1 }, { amountTotal: 1998 }, { quantity: 2 }, { paymentId: '' },
  ]) assert.throws(() => assertManualPayment({ ...payment, ...change }, expected))
})
