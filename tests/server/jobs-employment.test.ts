import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEmploymentType } from '../../server/jobs/employment.ts'

test('employment type is read only from the verified top-level contractType/workType fields', () => {
  assert.equal(normalizeEmploymentType({ contractType: 'Full-time' }).value, 'full_time')
  assert.equal(normalizeEmploymentType({ contractType: 'Part-time' }).value, 'part_time')
  assert.equal(normalizeEmploymentType({ contractType: 'Contract' }).value, 'contract')
  assert.equal(normalizeEmploymentType({ contractType: 'Freelance' }).value, 'contract')
  assert.equal(normalizeEmploymentType({ contractType: 'Temporary' }).value, 'temporary')
  assert.equal(normalizeEmploymentType({ workType: 'Internship' }).value, 'internship')
  // Unverified aliases from an earlier draft are no longer trusted at all.
  assert.equal(normalizeEmploymentType({ employmentType: 'Full-time' }).value, 'unknown')
  assert.equal(normalizeEmploymentType({ jobType: 'Full-time' }).value, 'unknown')
  assert.equal(normalizeEmploymentType({ type: 'Full-time' }).value, 'unknown')
})

test('contractType is tried before workType when both are present', () => {
  const result = normalizeEmploymentType({ contractType: 'Contract', workType: 'Full-time' })
  assert.equal(result.value, 'contract')
})

test('provenance/confidence: a classified provider value is high-confidence, an absent or unrecognized one degrades to unknown/low', () => {
  const classified = normalizeEmploymentType({ contractType: 'Full-time' })
  assert.equal(classified.source, 'provider')
  assert.equal(classified.confidence, 'high')

  const unrecognized = normalizeEmploymentType({ contractType: 'Seasonal Gig' })
  assert.equal(unrecognized.value, 'unknown')
  assert.equal(unrecognized.source, 'unknown')
  assert.equal(unrecognized.confidence, 'low')

  const absent = normalizeEmploymentType({})
  assert.equal(absent.value, 'unknown')
  assert.equal(absent.source, 'unknown')
  assert.equal(absent.confidence, 'low')
})

test('conflicting recognized values within the same field array are preserved as ambiguous rather than resolved to the first match', () => {
  const conflicting = normalizeEmploymentType({ contractType: ['Full-time', 'Contract'] })
  assert.equal(conflicting.value, 'unknown')
  assert.equal(conflicting.source, 'unknown')
  assert.equal(conflicting.confidence, 'low')

  // Conflicting values in the higher-priority field must not fall through to a
  // workType field that might otherwise resolve cleanly — the ambiguity in
  // contractType is itself the conclusion, not an absence of a usable field.
  const conflictingWithCleanFallback = normalizeEmploymentType({ contractType: ['Full-time', 'Temporary'], workType: 'Internship' })
  assert.equal(conflictingWithCleanFallback.value, 'unknown')

  // Repeats of the SAME recognized value are not a conflict.
  const agreeing = normalizeEmploymentType({ contractType: ['Full-time', 'Full time'] })
  assert.equal(agreeing.value, 'full_time')
  assert.equal(agreeing.confidence, 'high')
})

test('bounded string/array values: accepts a real-shaped array, ignores non-string entries, and bounds array length', () => {
  assert.equal(normalizeEmploymentType({ contractType: ['Full-time'] }).value, 'full_time')
  assert.equal(normalizeEmploymentType({ contractType: [null, 42, 'Contract'] }).value, 'contract')
  assert.equal(normalizeEmploymentType({ contractType: [] }).value, 'unknown')
  // Bounded: only the first 10 array entries are ever inspected.
  const oversizedArray = Array.from({ length: 20 }, () => 'nonsense').concat('Full-time')
  assert.equal(normalizeEmploymentType({ contractType: oversizedArray }).value, 'unknown')
  // An overlong single candidate string is skipped rather than trusted.
  assert.equal(normalizeEmploymentType({ contractType: 'Full-time '.repeat(20) }).value, 'unknown')
})
