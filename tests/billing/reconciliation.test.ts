import test from 'node:test'
import assert from 'node:assert/strict'
import { PASS_MS } from '../../server/billing/policy.ts'
import {
  recomputeEntitlement,
  type PurchaseGrant,
  type ReversalEvent,
} from '../../server/billing/reconciliation.ts'

const T0 = Date.parse('2026-01-01T00:00:00Z')

function grant(paymentId: string, passStartedAt: number, amountTotal = 1999, durationMs = PASS_MS): PurchaseGrant {
  return { paymentId, passStartedAt, passEndedAt: passStartedAt + durationMs, amountTotal }
}

function reversal(
  eventId: string,
  paymentId: string,
  kind: ReversalEvent['kind'],
  occurredAt: number,
  amountTotal = 1999,
  disputeId: string | null = kind === 'refund' ? null : 'du_1',
): ReversalEvent {
  return { eventId, paymentId, kind, disputeId, occurredAt, amountTotal }
}

test('a single unreversed grant expires exactly at its own recorded pass end', () => {
  const result = recomputeEntitlement([grant('pi_1', T0)], [])
  assert.deepEqual(result, { paidThrough: T0 + PASS_MS, voidedPaymentIds: [], anomalies: [] })
})

test('multiple active grants report the latest recorded pass end, regardless of array order', () => {
  const early = grant('pi_1', T0)
  const stacked = grant('pi_2', T0 + PASS_MS) // recorded as already stacked on pi_1's own end
  const forward = recomputeEntitlement([early, stacked], [])
  const reversed = recomputeEntitlement([stacked, early], [])
  assert.equal(forward.paidThrough, T0 + 2 * PASS_MS)
  assert.deepEqual(forward, reversed)
})

test('a full refund of the only grant voids it entirely; no naive 30-day subtraction is possible', () => {
  const result = recomputeEntitlement(
    [grant('pi_1', T0)],
    [reversal('evt_1', 'pi_1', 'refund', T0 + 1000)],
  )
  assert.deepEqual(result, { paidThrough: null, voidedPaymentIds: ['pi_1'], anomalies: [] })
})

test('refunding an earlier stacked grant never shortens a later, unrelated grant already recorded on top of it', () => {
  // pi_2's pass_started_at/pass_ended_at were already durably recorded (by
  // billing_apply_verified_payment, at the time pi_2 was applied) as
  // stacking on top of pi_1's own end. Once pi_1 is refunded, pi_2 must
  // keep EXACTLY that recorded window — this is the concrete defect
  // docs/BILLING_REVERSAL_DESIGN.md flagged in an earlier "reflow" design:
  // recomputing pi_2's start from scratch (as if pi_1 never existed) would
  // move it earlier and retroactively shorten prepaid time the customer
  // already validly holds, purely because a DIFFERENT payment was reversed.
  const earlier = grant('pi_1', T0)
  const stackedOnEarlier = grant('pi_2', T0 + PASS_MS) // pi_2's own recorded start already reflects pi_1's contribution
  const withoutReversal = recomputeEntitlement([earlier, stackedOnEarlier], [])
  assert.equal(withoutReversal.paidThrough, T0 + 2 * PASS_MS)

  const afterRefund = recomputeEntitlement(
    [earlier, stackedOnEarlier],
    [reversal('evt_1', 'pi_1', 'refund', T0 + 5000)],
  )
  // pi_2's own recorded pass_ended_at is untouched: still T0 + 2*PASS_MS, not
  // reflowed down to "pi_2's own start + PASS_MS" computed as if pi_1 never
  // contributed anything.
  assert.equal(afterRefund.paidThrough, T0 + 2 * PASS_MS)
  assert.deepEqual(afterRefund.voidedPaymentIds, ['pi_1'])
})

test('refunding the most recent grant in a stack falls back to the previous survivor\'s own recorded end', () => {
  const earlier = grant('pi_1', T0)
  const mostRecent = grant('pi_2', T0 + PASS_MS)
  const afterRefund = recomputeEntitlement(
    [earlier, mostRecent],
    [reversal('evt_1', 'pi_2', 'refund', T0 + 5000)],
  )
  assert.equal(afterRefund.paidThrough, earlier.passEndedAt)
  assert.deepEqual(afterRefund.voidedPaymentIds, ['pi_2'])
})

test('refunding an earlier grant that never overlapped a later one leaves the later grant untouched', () => {
  const earlier = grant('pi_1', T0)
  const later = grant('pi_2', T0 + PASS_MS + 24 * 60 * 60 * 1000) // its own fresh window, started after pi_1 already expired
  const alone = recomputeEntitlement([later], [])
  const afterRefund = recomputeEntitlement(
    [earlier, later],
    [reversal('evt_1', 'pi_1', 'refund', T0 + 5000)],
  )
  assert.equal(afterRefund.paidThrough, alone.paidThrough)
})

test('a chargeback later reversed by the provider (dispute won) restores the grant as if never voided', () => {
  const withoutEvents = recomputeEntitlement([grant('pi_1', T0)], [])
  const withRestoredDispute = recomputeEntitlement(
    [grant('pi_1', T0)],
    [
      reversal('evt_1', 'pi_1', 'chargeback', T0 + 1000),
      reversal('evt_2', 'pi_1', 'chargeback_reversed', T0 + 2000),
    ],
  )
  assert.deepEqual(withRestoredDispute, { ...withoutEvents, voidedPaymentIds: [], anomalies: [] })
})

test('an exact duplicate event delivery (same id, identical facts) is an idempotent no-op', () => {
  const events = [
    reversal('evt_1', 'pi_1', 'refund', T0 + 1000),
    reversal('evt_1', 'pi_1', 'refund', T0 + 1000),
  ]
  const result = recomputeEntitlement([grant('pi_1', T0)], events)
  assert.deepEqual(result, { paidThrough: null, voidedPaymentIds: ['pi_1'], anomalies: [] })
})

test('a duplicate event id disagreeing with itself is a data-integrity violation, not a silent merge', () => {
  const events = [
    reversal('evt_1', 'pi_1', 'refund', T0 + 1000, 1999),
    reversal('evt_1', 'pi_1', 'refund', T0 + 1000, 500),
  ]
  assert.throws(() => recomputeEntitlement([grant('pi_1', T0)], events))
})

test('a duplicate payment id disagreeing with itself is a data-integrity violation', () => {
  const grants = [grant('pi_1', T0, 1999), grant('pi_1', T0, 500)]
  assert.throws(() => recomputeEntitlement(grants, []))
})

test('an exact duplicate grant reading (same id, identical facts) is a harmless no-op', () => {
  const grants = [grant('pi_1', T0), grant('pi_1', T0)]
  assert.doesNotThrow(() => recomputeEntitlement(grants, []))
})

test('a partial-amount refund has no invented policy: left active, surfaced as an anomaly', () => {
  const g = grant('pi_1', T0, 1999)
  const result = recomputeEntitlement([g], [reversal('evt_1', 'pi_1', 'refund', T0 + 1000, 400)])
  assert.equal(result.paidThrough, T0 + PASS_MS)
  assert.deepEqual(result.voidedPaymentIds, [])
  assert.equal(result.anomalies.length, 1)
  assert.equal(result.anomalies[0]?.paymentId, 'pi_1')
})

test('a restoration with no matching voided chargeback is refused, not guessed at', () => {
  const g = grant('pi_1', T0)
  // Case 1: restoring a grant that was never touched.
  const stillActive = recomputeEntitlement([g], [reversal('evt_1', 'pi_1', 'chargeback_reversed', T0 + 1000)])
  assert.equal(stillActive.paidThrough, T0 + PASS_MS)
  assert.equal(stillActive.anomalies.length, 1)

  // Case 2: a plain refund (not a chargeback) cannot be "reversed" this way.
  const stillVoided = recomputeEntitlement([g], [
    reversal('evt_1', 'pi_1', 'refund', T0 + 1000),
    reversal('evt_2', 'pi_1', 'chargeback_reversed', T0 + 2000),
  ])
  assert.deepEqual(stillVoided.voidedPaymentIds, ['pi_1'])
  assert.equal(stillVoided.anomalies.length, 1)
})

test('a restoration amount that does not match the original payment is refused', () => {
  const g = grant('pi_1', T0, 1999)
  const result = recomputeEntitlement([g], [
    reversal('evt_1', 'pi_1', 'chargeback', T0 + 1000, 1999),
    reversal('evt_2', 'pi_1', 'chargeback_reversed', T0 + 2000, 500),
  ])
  assert.deepEqual(result.voidedPaymentIds, ['pi_1'])
  assert.equal(result.anomalies.length, 1)
})

test('an event referencing a payment absent from the supplied ledger is rejected outright', () => {
  assert.throws(() => recomputeEntitlement([grant('pi_1', T0)], [reversal('evt_1', 'pi_2', 'refund', T0)]))
})

test('an unrecognized event kind is rejected outright', () => {
  const bad = { eventId: 'evt_1', paymentId: 'pi_1', kind: 'dispute_opened', occurredAt: T0, amountTotal: 1999 }
  assert.throws(() => recomputeEntitlement([grant('pi_1', T0)], [bad as unknown as ReversalEvent]))
})

test('invalid or out-of-domain grant facts fail closed', () => {
  for (const bad of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => recomputeEntitlement([{ ...grant('pi_1', T0), passStartedAt: bad }], []))
  }
  for (const bad of [NaN, Infinity, -1, 0.5]) {
    assert.throws(() => recomputeEntitlement([{ ...grant('pi_1', T0), passEndedAt: bad }], []))
  }
  assert.throws(() => recomputeEntitlement([{ ...grant('pi_1', T0), passEndedAt: T0 }], [])) // end == start
  assert.throws(() => recomputeEntitlement([{ ...grant('pi_1', T0), passEndedAt: T0 - 1000 }], [])) // end < start
  for (const bad of [NaN, 0, -1, 0.5]) {
    assert.throws(() => recomputeEntitlement([{ ...grant('pi_1', T0), amountTotal: bad }], []))
  }
  assert.throws(() => recomputeEntitlement([{ ...grant('pi_1', T0), paymentId: '' }], []))
  assert.throws(() => recomputeEntitlement([{ ...grant('pi_1', T0), paymentId: '   ' }], []))
})

test('invalid or out-of-domain event facts fail closed', () => {
  const base = reversal('evt_1', 'pi_1', 'refund', T0)
  for (const bad of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => recomputeEntitlement([grant('pi_1', T0)], [{ ...base, occurredAt: bad }]))
  }
  for (const bad of [NaN, 0, -1, 0.5]) {
    assert.throws(() => recomputeEntitlement([grant('pi_1', T0)], [{ ...base, amountTotal: bad }]))
  }
  assert.throws(() => recomputeEntitlement([grant('pi_1', T0)], [{ ...base, eventId: '' }]))
  assert.throws(() => recomputeEntitlement([grant('pi_1', T0)], [{ ...base, paymentId: '' }]))
})

test('result is invariant under permutation of both input arrays given stable facts', () => {
  const grants: PurchaseGrant[] = [
    grant('pi_1', T0),
    grant('pi_2', T0 + PASS_MS),
    grant('pi_3', T0 + 5 * PASS_MS), // its own fresh window, unrelated to pi_1/pi_2
  ]
  const events: ReversalEvent[] = [
    reversal('evt_1', 'pi_2', 'chargeback', T0 + 2000),
    reversal('evt_2', 'pi_2', 'chargeback_reversed', T0 + 3000),
    reversal('evt_3', 'pi_1', 'refund', T0 + 400, 500), // partial: anomaly, no void
  ]
  const baseline = recomputeEntitlement(grants, events)

  const permutations: Array<[PurchaseGrant[], ReversalEvent[]]> = [
    [[...grants].reverse(), [...events].reverse()],
    [[grants[2]!, grants[0]!, grants[1]!], [events[2]!, events[0]!, events[1]!]],
    [[grants[1]!, grants[2]!, grants[0]!], [events[1]!, events[2]!, events[0]!]],
  ]
  for (const [g, e] of permutations) {
    assert.deepEqual(recomputeEntitlement(g, e), baseline)
  }
  assert.equal(baseline.anomalies.length, 1)
})

test('is pure: never mutates either input array or its element objects', () => {
  const grants = Object.freeze([Object.freeze(grant('pi_1', T0)), Object.freeze(grant('pi_2', T0 + PASS_MS))])
  const events = Object.freeze([Object.freeze(reversal('evt_1', 'pi_1', 'refund', T0 + 500))])
  assert.doesNotThrow(() => recomputeEntitlement(grants, events))
  // Calling twice with the same frozen inputs must yield the same result,
  // proving no hidden state carried over between calls either.
  assert.deepEqual(recomputeEntitlement(grants, events), recomputeEntitlement(grants, events))
})

test('an empty ledger has no entitlement', () => {
  assert.deepEqual(recomputeEntitlement([], []), { paidThrough: null, voidedPaymentIds: [], anomalies: [] })
})

test('winning a dispute cannot restore a payment that was also fully refunded', () => {
  const events = [reversal('evt_dispute', 'pi_1', 'chargeback', T0 + 1000), reversal('evt_refund', 'pi_1', 'refund', T0 + 2000), reversal('evt_win', 'pi_1', 'chargeback_reversed', T0 + 3000)]
  const result = recomputeEntitlement([grant('pi_1', T0)], events)
  assert.equal(result.paidThrough, null)
  assert.deepEqual(result.voidedPaymentIds, ['pi_1'])
  assert.deepEqual(result, recomputeEntitlement([grant('pi_1', T0)], [...events].reverse()))
})

test('voiding one of several unrelated active grants leaves every other grant\'s own recorded window untouched', () => {
  const a = grant('pi_1', T0)
  const b = grant('pi_2', T0 + 10 * PASS_MS) // unrelated, its own fresh window
  const c = grant('pi_3', T0 + 20 * PASS_MS) // unrelated, its own fresh window
  const result = recomputeEntitlement([a, b, c], [reversal('evt_1', 'pi_2', 'refund', T0 + 11 * PASS_MS)])
  assert.equal(result.paidThrough, c.passEndedAt)
  assert.deepEqual(result.voidedPaymentIds, ['pi_2'])
})

test('voided payment ids are sorted for a deterministic result regardless of input order', () => {
  const grants = [grant('pi_c', T0), grant('pi_a', T0 + 10 * PASS_MS), grant('pi_b', T0 + 20 * PASS_MS)]
  const events = [
    reversal('evt_1', 'pi_c', 'refund', T0 + 1000),
    reversal('evt_2', 'pi_a', 'refund', T0 + 1000),
    reversal('evt_3', 'pi_b', 'refund', T0 + 1000),
  ]
  const result = recomputeEntitlement(grants, events)
  assert.deepEqual(result.voidedPaymentIds, ['pi_a', 'pi_b', 'pi_c'])
  assert.equal(result.paidThrough, null)
})

test('reconciliation rejects oversized ledgers and identifiers before processing', () => {
  assert.throws(() => recomputeEntitlement(Array(10001).fill(grant('pi_1', T0)), []))
  assert.throws(() => recomputeEntitlement([], Array(50001).fill(null)))
  assert.throws(() => recomputeEntitlement([grant('x'.repeat(256), T0)], []))
})

test('disputeId is required, non-blank for chargeback/chargeback_reversed and required null for refund', () => {
  const g = grant('pi_1', T0)
  assert.throws(() => recomputeEntitlement([g], [{ ...reversal('evt_1', 'pi_1', 'chargeback', T0), disputeId: null }]))
  assert.throws(() => recomputeEntitlement([g], [{ ...reversal('evt_1', 'pi_1', 'chargeback', T0), disputeId: '' }]))
  assert.throws(() => recomputeEntitlement([g], [{ ...reversal('evt_1', 'pi_1', 'chargeback_reversed', T0), disputeId: null }]))
  assert.throws(() => recomputeEntitlement([g], [{ ...reversal('evt_1', 'pi_1', 'refund', T0), disputeId: 'du_1' }]))
})

test('the same dispute id can never be claimed by two different payments', () => {
  const grants = [grant('pi_1', T0), grant('pi_2', T0 + PASS_MS)]
  const events = [
    reversal('evt_1', 'pi_1', 'chargeback', T0 + 1000, 1999, 'du_shared'),
    reversal('evt_2', 'pi_2', 'chargeback', T0 + 1000, 1999, 'du_shared'),
  ]
  assert.throws(() => recomputeEntitlement(grants, events))
})

test('a dispute created and won at the SAME timestamp resolves to won regardless of which event\'s id sorts first lexically', () => {
  const g = grant('pi_1', T0)
  // 'evt_a_reversed' sorts lexically BEFORE 'evt_b_created' — under the old
  // (occurredAt, eventId)-sequential fold this would process the "won" fact
  // before the "created" fact and wrongly treat it as an orphan restoration,
  // leaving the payment voided. Dispute identity makes the outcome the SET
  // property "both facts exist for this disputeId", not a race.
  const createdFirstLexically = recomputeEntitlement([g], [
    reversal('evt_a_created', 'pi_1', 'chargeback', T0 + 1000, 1999, 'du_tie'),
    reversal('evt_b_reversed', 'pi_1', 'chargeback_reversed', T0 + 1000, 1999, 'du_tie'),
  ])
  const reversedFirstLexically = recomputeEntitlement([g], [
    reversal('evt_a_reversed', 'pi_1', 'chargeback_reversed', T0 + 1000, 1999, 'du_tie'),
    reversal('evt_b_created', 'pi_1', 'chargeback', T0 + 1000, 1999, 'du_tie'),
  ])
  const expected = { paidThrough: T0 + PASS_MS, voidedPaymentIds: [], anomalies: [] }
  assert.deepEqual(createdFirstLexically, expected)
  assert.deepEqual(reversedFirstLexically, expected)
})

test('a dispute created and won at the SAME timestamp resolves to won regardless of array order', () => {
  const g = grant('pi_1', T0)
  const created = reversal('evt_created', 'pi_1', 'chargeback', T0 + 5000, 1999, 'du_tie2')
  const won = reversal('evt_won', 'pi_1', 'chargeback_reversed', T0 + 5000, 1999, 'du_tie2')
  const forward = recomputeEntitlement([g], [created, won])
  const reversedOrder = recomputeEntitlement([g], [won, created])
  const expected = { paidThrough: T0 + PASS_MS, voidedPaymentIds: [], anomalies: [] }
  assert.deepEqual(forward, expected)
  assert.deepEqual(reversedOrder, expected)
})

test('multiple independent disputes on the same payment: the payment stays voided until EVERY dispute is won', () => {
  const g = grant('pi_1', T0)
  // Dispute A is raised and lost (never reversed); dispute B is raised and
  // won. The payment must remain voided because of A, regardless of B.
  const stillVoided = recomputeEntitlement([g], [
    reversal('evt_a_created', 'pi_1', 'chargeback', T0 + 1000, 1999, 'du_a'),
    reversal('evt_b_created', 'pi_1', 'chargeback', T0 + 2000, 1999, 'du_b'),
    reversal('evt_b_won', 'pi_1', 'chargeback_reversed', T0 + 3000, 1999, 'du_b'),
  ])
  assert.deepEqual(stillVoided.voidedPaymentIds, ['pi_1'])
  assert.equal(stillVoided.paidThrough, null)
  assert.deepEqual(stillVoided.anomalies, [])

  // Once A is ALSO won, the payment is fully restored.
  const fullyRestored = recomputeEntitlement([g], [
    reversal('evt_a_created', 'pi_1', 'chargeback', T0 + 1000, 1999, 'du_a'),
    reversal('evt_a_won', 'pi_1', 'chargeback_reversed', T0 + 1500, 1999, 'du_a'),
    reversal('evt_b_created', 'pi_1', 'chargeback', T0 + 2000, 1999, 'du_b'),
    reversal('evt_b_won', 'pi_1', 'chargeback_reversed', T0 + 3000, 1999, 'du_b'),
  ])
  assert.deepEqual(fullyRestored, { paidThrough: T0 + PASS_MS, voidedPaymentIds: [], anomalies: [] })
})

test('restoring one dispute never restores a DIFFERENT dispute on the same payment', () => {
  const g = grant('pi_1', T0)
  // A restoration event for dispute B must not be interpreted as resolving
  // dispute A — each dispute is tracked strictly by its own disputeId.
  const result = recomputeEntitlement([g], [
    reversal('evt_a_created', 'pi_1', 'chargeback', T0 + 1000, 1999, 'du_a'),
    reversal('evt_b_won', 'pi_1', 'chargeback_reversed', T0 + 2000, 1999, 'du_b'),
  ])
  assert.deepEqual(result.voidedPaymentIds, ['pi_1'])
  // The orphan chargeback_reversed for du_b (no matching chargeback under
  // du_b) is surfaced, not silently treated as resolving du_a.
  assert.equal(result.anomalies.length, 1)
})
