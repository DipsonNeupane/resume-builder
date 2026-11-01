import test from 'node:test'
import assert from 'node:assert/strict'
import { editorialReviewDate, evidenceIsCurrent } from '../../src/content/comparisons.ts'

test('comparison evidence remains current through its review date in the editorial timezone', () => {
  const beforeChicagoMidnight = new Date('2026-10-31T02:00:00.000Z')
  const afterChicagoMidnight = new Date('2026-10-31T06:00:00.000Z')
  assert.equal(editorialReviewDate(beforeChicagoMidnight), '2026-10-30')
  assert.equal(evidenceIsCurrent('2026-10-30', editorialReviewDate(beforeChicagoMidnight)), true)
  assert.equal(editorialReviewDate(afterChicagoMidnight), '2026-10-31')
  assert.equal(evidenceIsCurrent('2026-10-30', editorialReviewDate(afterChicagoMidnight)), false)
})
