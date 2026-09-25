import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesLocation, matchesSalaryPreference } from '../../server/jobs/filter.ts'
import type { NormalizedJob } from '../../server/jobs/types.ts'

function job(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    id: 'techmap:1', provider: 'techmap', providerJobId: '1',
    title: 'Engineer', company: 'Acme',
    location: { value: { city: null, region: null, country: null }, source: 'unknown', confidence: 'low' },
    workplace: { value: 'unknown', source: 'unknown', confidence: 'low' },
    employmentType: { value: 'unknown', source: 'unknown', confidence: 'low' },
    salary: null,
    descriptionText: '',
    postedAt: null,
    expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
    directness: { value: null, source: 'unknown', confidence: 'low' },
    sourceUrl: 'https://jobs.example/1',
    portal: null, source: null, dedupeKey: 'k', retrievedAt: '2026-09-24T00:00:00Z',
    ...overrides,
  }
}

test('salary preference compares by range overlap only when currency and period match exactly', () => {
  const usdYear = job({ salary: { min: 100000, max: 150000, currency: 'USD', period: 'year', confidence: 'high' } })
  assert.equal(matchesSalaryPreference(usdYear, undefined), true)
  assert.equal(matchesSalaryPreference(usdYear, { period: 'year', currency: 'USD', min: 120000, max: null }), true) // overlaps
  assert.equal(matchesSalaryPreference(usdYear, { period: 'year', currency: 'USD', min: 200000, max: null }), false) // job.max < pref.min
  assert.equal(matchesSalaryPreference(usdYear, { period: 'year', currency: 'USD', min: null, max: 90000 }), false) // job.min > pref.max
  assert.equal(matchesSalaryPreference(usdYear, { period: 'year', currency: 'USD', min: null, max: 120000 }), true) // overlaps
  // Mismatched currency or period never excludes.
  assert.equal(matchesSalaryPreference(usdYear, { period: 'year', currency: 'EUR', min: 500000, max: null }), true)
  assert.equal(matchesSalaryPreference(usdYear, { period: 'hour', currency: 'USD', min: 500, max: null }), true)
  // Unknown job salary always stays eligible.
  const unknownSalary = job({ salary: null })
  assert.equal(matchesSalaryPreference(unknownSalary, { period: 'year', currency: 'USD', min: 100000, max: null }), true)
})

test('salary range overlap treats an open min or max as unbounded on that side', () => {
  const hourly = job({ salary: { min: 20, max: 25, currency: 'USD', period: 'hour', confidence: 'high' } })
  assert.equal(matchesSalaryPreference(hourly, { period: 'hour', currency: 'USD', min: 10, max: 15 }), false) // no overlap
  assert.equal(matchesSalaryPreference(hourly, { period: 'hour', currency: 'USD', min: 22, max: 24 }), true) // fully inside
  assert.equal(matchesSalaryPreference(hourly, { period: 'hour', currency: 'USD', min: 24, max: 30 }), true) // partial overlap
})

test('location filter keeps unknown-location jobs eligible and compares bounded normalized text', () => {
  const noLocation = job()
  assert.equal(matchesLocation(noLocation, 'Bengaluru'), true)

  const bengaluru = job({ location: { value: { city: 'Bengaluru', region: 'Karnataka', country: 'IN' }, source: 'provider', confidence: 'high' } })
  assert.equal(matchesLocation(bengaluru, undefined), true)
  assert.equal(matchesLocation(bengaluru, 'Bengaluru'), true)
  assert.equal(matchesLocation(bengaluru, 'bengaluru'), true) // case-insensitive
  assert.equal(matchesLocation(bengaluru, 'Karnataka'), true) // matches region
  assert.equal(matchesLocation(bengaluru, 'Mumbai'), false)

  const london = job({ location: { value: { city: 'London', region: null, country: 'GB' }, source: 'provider', confidence: 'medium' } })
  assert.equal(matchesLocation(london, 'London'), true)
  assert.equal(matchesLocation(london, 'GB'), true)
  assert.equal(matchesLocation(london, 'Greater London'), true) // substring in either direction

  // International, non-ASCII place name — diacritics/case are normalized away.
  const zurich = job({ location: { value: { city: 'Zürich', region: null, country: 'CH' }, source: 'provider', confidence: 'medium' } })
  assert.equal(matchesLocation(zurich, 'zurich'), true)
  assert.equal(matchesLocation(zurich, 'Zürich'), true)

  const tokyo = job({ location: { value: { city: '東京', region: null, country: 'JP' }, source: 'provider', confidence: 'medium' } })
  assert.equal(matchesLocation(tokyo, '東京'), true)
  assert.equal(matchesLocation(tokyo, 'Osaka'), false)
})
