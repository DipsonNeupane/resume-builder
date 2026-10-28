import test from 'node:test'
import assert from 'node:assert/strict'
import { postingLevel, preferenceSignals } from '../../src/lib/jobPreferences.ts'

const posting = (overrides: Record<string, unknown> = {}) => ({ title: 'Support specialist', descriptionText: 'Help customers by email.', workplace: 'unknown', employmentType: 'unknown', salary: null, ...overrides })

test('posting level comes only from the title or an explicit years-of-experience statement', () => {
  assert.deepEqual(postingLevel(posting({ title: 'Senior Support Specialist' })), { level: 'senior', basis: 'the title says “Senior”' })
  assert.equal(postingLevel(posting({ title: 'Head of Support' }))?.level, 'lead')
  assert.equal(postingLevel(posting({ title: 'Graduate Support Analyst' }))?.level, 'entry')
  assert.deepEqual(postingLevel(posting({ descriptionText: 'You have 3+ years of experience in support.' })), { level: 'mid', basis: 'the posting asks for 3+ years' })
  assert.equal(postingLevel(posting({ descriptionText: 'Requires at least 6 years experience.' }))?.level, 'senior')
  assert.equal(postingLevel(posting({ descriptionText: 'Founded 25 years ago.' })), null, 'years not about experience are ignored')
  assert.equal(postingLevel(posting({ title: 'Account Manager' })), null, '"manager" alone does not mean a people lead')
  assert.equal(postingLevel(posting()), null)
})

test('soft signals: fit adds, clear mismatch subtracts, unknown is reported and scores zero', () => {
  const fit = preferenceSignals(posting({ title: 'Junior Support Specialist', workplace: 'remote', employmentType: 'full_time', salary: { min: 1, max: 2, currency: 'USD', period: 'year' } }), { experienceLevel: 'entry', priorities: ['flexibility', 'stability', 'pay'] })
  assert.ok(fit.score > 0)
  assert.deepEqual(fit.fits, ['Looks entry level, as you chose (the title says “Junior”)', 'Remote — matches your flexibility priority', 'Full-time — matches your stability priority', 'Pay is stated in the posting'])
  const miss = preferenceSignals(posting({ title: 'Senior Support Specialist', workplace: 'onsite', employmentType: 'contract' }), { experienceLevel: 'entry', priorities: ['flexibility', 'stability'] })
  assert.ok(miss.score < 0)
  assert.equal(miss.mismatches[0], 'Looks more senior than entry level (the title says “Senior”)')
  const unknown = preferenceSignals(posting(), { experienceLevel: 'mid', priorities: ['flexibility', 'stability', 'pay'] })
  assert.deepEqual(unknown, { score: 0, fits: [], mismatches: [], unknown: ['seniority', 'work arrangement', 'employment type', 'pay'] })
  assert.deepEqual(preferenceSignals(posting({ title: 'Senior X' }), { experienceLevel: 'unsure' }), { score: 0, fits: [], mismatches: [], unknown: [] })
})
