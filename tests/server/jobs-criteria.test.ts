import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSearchCriteria } from '../../server/jobs/criteria.ts'

test('salary preference requires at least one of min/max and rejects min > max', () => {
  assert.throws(() => parseSearchCriteria({ title: 'engineer', salary: { period: 'year', currency: 'USD' } }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'engineer', salary: { period: 'year', currency: 'USD', min: 200000, max: 100000 } }), { status: 400 })
  const minOnly = parseSearchCriteria({ title: 'engineer', salary: { period: 'year', currency: 'USD', min: 100000 } })
  assert.deepEqual(minOnly.salary, { period: 'year', currency: 'USD', min: 100000, max: null })
  const maxOnly = parseSearchCriteria({ title: 'engineer', salary: { period: 'hour', currency: 'usd', max: 80 } })
  assert.deepEqual(maxOnly.salary, { period: 'hour', currency: 'USD', min: null, max: 80 })
  const both = parseSearchCriteria({ title: 'engineer', salary: { period: 'year', currency: 'USD', min: 100000, max: 150000 } })
  assert.deepEqual(both.salary, { period: 'year', currency: 'USD', min: 100000, max: 150000 })
})

test('salary preference distinguishes annual and hourly and rejects out-of-bounds amounts', () => {
  assert.throws(() => parseSearchCriteria({ title: 'engineer', salary: { period: 'hour', currency: 'USD', min: 5000 } }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'engineer', salary: { period: 'year', currency: 'USD', min: -1 } }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'engineer', salary: { period: 'nonsense', currency: 'USD', min: 1 } }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'engineer', salary: { period: 'year', currency: 'US', min: 1 } }), { status: 400 })
})

test('a request with no salary key at all expresses "no preference" rather than an explicit sentinel', () => {
  const criteria = parseSearchCriteria({ title: 'engineer' })
  assert.equal(criteria.salary, undefined)
})

test('location is a bounded optional human-readable field, distinct from countryCode', () => {
  const criteria = parseSearchCriteria({ title: 'engineer', countryCode: 'IN', location: 'Bengaluru' })
  assert.equal(criteria.countryCode, 'IN')
  assert.equal(criteria.location, 'Bengaluru')
  assert.throws(() => parseSearchCriteria({ title: 'engineer', location: '' }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'engineer', location: 'x'.repeat(201) }), { status: 400 })
})

test('rejects malformed employment type and workplace values', () => {
  assert.throws(() => parseSearchCriteria({ title: 'engineer', employmentType: 'gig' }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'engineer', workplace: 'anywhere' }), { status: 400 })
})

test('discovery preferences are bounded closed vocabularies and stay separate from evidence', async () => {
  const { parseSearchCriteria } = await import('../../server/jobs/criteria.ts')
  const parsed = parseSearchCriteria({ title: 'Support specialist', roles: ['Support specialist', 'Customer success associate'], experienceLevel: 'unsure', priorities: ['flexibility', 'pay'], dealbreakers: ['onsite'] })
  assert.deepEqual(parsed.roles, ['Customer success associate'])
  assert.equal(parsed.experienceLevel, 'unsure')
  assert.throws(() => parseSearchCriteria({ title: 'A', priorities: ['religion'] }))
  // Removed from setup because postings do not state them reliably.
  for (const removed of ['progression', 'learning', 'impact']) assert.throws(() => parseSearchCriteria({ title: 'A', priorities: [removed] }))
  assert.throws(() => parseSearchCriteria({ title: 'A', experienceLevel: 'age_50_plus' }))
  assert.throws(() => parseSearchCriteria({ title: 'A', dealbreakers: ['below_salary'] }), /minimum salary/)
  assert.throws(() => parseSearchCriteria({ title: 'A', roles: ['a', 'b', 'c', 'd', 'e'] }))
  assert.ok(JSON.stringify(parseSearchCriteria({ title: 'A'.repeat(200), roles: Array.from({ length: 4 }, (_, i) => `${'B'.repeat(195)}${i}`), priorities: ['flexibility', 'stability', 'pay'], dealbreakers: ['onsite', 'contract', 'part_time'], location: 'L'.repeat(200), experienceLevel: 'senior' })).length < 2000, 'the largest preference set fits the stored 2,000-byte bound')
})
