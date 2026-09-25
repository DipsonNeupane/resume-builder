import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWorkplace } from '../../server/jobs/workplace.ts'
import { normalizeSalary } from '../../server/jobs/salary.ts'
import { expiryStatus } from '../../server/jobs/expiry.ts'
import { dedupeKey, dedupeJobs } from '../../server/jobs/dedupe.ts'
import { normalizeJob } from '../../server/jobs/normalize.ts'
import type { NormalizedJob } from '../../server/jobs/types.ts'

test('workplace normalization only trusts the explicit top-level workPlace field', () => {
  assert.equal(normalizeWorkplace({ workPlace: 'Remote' }).value, 'remote')
  assert.equal(normalizeWorkplace({ workPlace: 'Hybrid' }).value, 'hybrid')
  assert.equal(normalizeWorkplace({ workPlace: 'On-site' }).value, 'onsite')
  assert.equal(normalizeWorkplace({ workPlace: 'Field' }).value, 'field')
  // No explicit field at all -> unknown, never inferred from description text.
  const inferredAttempt = normalizeWorkplace({ description: 'This is a fully remote role, work from anywhere!' })
  assert.equal(inferredAttempt.value, 'unknown')
  assert.equal(inferredAttempt.confidence, 'low')
})

test('workplace normalization accepts a real-shaped array of workPlace strings', () => {
  // Techmap commonly returns workPlace as an array rather than a single string.
  assert.equal(normalizeWorkplace({ workPlace: ['Remote'] }).value, 'remote')
  assert.equal(normalizeWorkplace({ workPlace: ['Hybrid', 'Onsite'] }).value, 'hybrid')
  const highConfidence = normalizeWorkplace({ workPlace: ['On-site'] })
  assert.equal(highConfidence.value, 'onsite')
  assert.equal(highConfidence.source, 'provider')
  assert.equal(highConfidence.confidence, 'high')
  // An empty array, or an array with only unrecognized entries, stays unknown.
  assert.equal(normalizeWorkplace({ workPlace: [] }).value, 'unknown')
  assert.equal(normalizeWorkplace({ workPlace: ['Somewhere Else'] }).value, 'unknown')
  // Non-string array entries are skipped rather than crashing.
  assert.equal(normalizeWorkplace({ workPlace: [null, 42, 'Field'] }).value, 'field')
  // Bounded: only the first 10 array entries are ever inspected.
  const oversizedArray = Array.from({ length: 20 }, () => 'nowhere').concat('Remote')
  assert.equal(normalizeWorkplace({ workPlace: oversizedArray }).value, 'unknown')
})

test('workplace normalization preserves ambiguity for genuinely conflicting array values', () => {
  // Remote + Onsite is a real contradiction: never trust whichever value came first.
  const remoteOnsite = normalizeWorkplace({ workPlace: ['Remote', 'Onsite'] })
  assert.equal(remoteOnsite.value, 'hybrid')
  assert.equal(remoteOnsite.source, 'inferred')
  assert.equal(remoteOnsite.confidence, 'medium')

  // Same for Onsite + Remote (order-independent) and Remote + Hybrid.
  const onsiteRemote = normalizeWorkplace({ workPlace: ['Onsite', 'Remote'] })
  assert.equal(onsiteRemote.value, 'hybrid')
  assert.equal(onsiteRemote.source, 'inferred')
  assert.equal(onsiteRemote.confidence, 'medium')

  const remoteHybrid = normalizeWorkplace({ workPlace: ['Remote', 'Hybrid'] })
  assert.equal(remoteHybrid.value, 'hybrid')
  assert.equal(remoteHybrid.source, 'inferred')
  assert.equal(remoteHybrid.confidence, 'medium')

  // All three together is still a remote/onsite conflict.
  const allThree = normalizeWorkplace({ workPlace: ['Remote', 'Hybrid', 'Onsite'] })
  assert.equal(allThree.value, 'hybrid')
  assert.equal(allThree.source, 'inferred')
  assert.equal(allThree.confidence, 'medium')

  // Hybrid + Onsite is not a contradiction (hybrid already implies onsite presence) so
  // the first recognized value stays a trusted, high-confidence provider fact.
  const hybridOnsite = normalizeWorkplace({ workPlace: ['Hybrid', 'Onsite'] })
  assert.equal(hybridOnsite.value, 'hybrid')
  assert.equal(hybridOnsite.source, 'provider')
  assert.equal(hybridOnsite.confidence, 'high')
})

test('salary normalization reads jsonLD.baseSalary and requires explicit amount, currency and period, enforcing sanity bounds', () => {
  assert.deepEqual(
    normalizeSalary({ jsonLD: { baseSalary: { currency: 'USD', value: { minValue: 100000, maxValue: 150000, unitText: 'YEAR' } } } }),
    { min: 100000, max: 150000, currency: 'USD', period: 'year', confidence: 'high' },
  )
  assert.deepEqual(
    normalizeSalary({ jsonLD: { baseSalary: { currency: 'usd', value: { minValue: 20, maxValue: 30, unitText: '1 hour' } } } }),
    { min: 20, max: 30, currency: 'USD', period: 'hour', confidence: 'high' },
  )
  // Missing currency, missing period, or an unrecognized period string all yield null.
  assert.equal(normalizeSalary({ jsonLD: { baseSalary: { value: { minValue: 1, maxValue: 2, unitText: 'YEAR' } } } }), null)
  assert.equal(normalizeSalary({ jsonLD: { baseSalary: { currency: 'USD', value: { minValue: 1, maxValue: 2 } } } }), null)
  assert.equal(normalizeSalary({ jsonLD: { baseSalary: { currency: 'USD', value: { minValue: 1, maxValue: 2, unitText: 'MONTH' } } } }), null)
  // An hourly figure mislabeled at annual scale (or vice versa) is out of bounds and rejected.
  assert.equal(normalizeSalary({ jsonLD: { baseSalary: { currency: 'USD', value: { minValue: 60000, maxValue: 80000, unitText: 'HOUR' } } } }), null)
  assert.equal(normalizeSalary({ jsonLD: { baseSalary: { currency: 'USD', value: { minValue: 5, maxValue: 10, unitText: 'YEAR' } } } }), null)
  // Reversed range is rejected rather than silently swapped.
  assert.equal(normalizeSalary({ jsonLD: { baseSalary: { currency: 'USD', value: { minValue: 90000, maxValue: 50000, unitText: 'YEAR' } } } }), null)
  // No jsonLD/baseSalary at all -> unknown, but eligible (null, not filtered elsewhere).
  assert.equal(normalizeSalary({}), null)
})

test('salary normalization falls back to jsonLD.salaryCurrency only when baseSalary.currency is absent', () => {
  assert.deepEqual(
    normalizeSalary({ jsonLD: {
      salaryCurrency: 'usd',
      baseSalary: { value: { minValue: 100000, maxValue: 150000, unitText: 'YEAR' } },
    } }),
    { min: 100000, max: 150000, currency: 'USD', period: 'year', confidence: 'high' },
  )
  // baseSalary.currency, when present, always wins over the sibling fallback.
  assert.deepEqual(
    normalizeSalary({ jsonLD: {
      salaryCurrency: 'EUR',
      baseSalary: { currency: 'USD', value: { minValue: 100000, maxValue: 150000, unitText: 'YEAR' } },
    } }),
    { min: 100000, max: 150000, currency: 'USD', period: 'year', confidence: 'high' },
  )
  // The fallback currency alone is not enough: amount and period must still be explicit.
  assert.equal(normalizeSalary({ jsonLD: {
    salaryCurrency: 'USD',
    baseSalary: { value: { minValue: 100000, maxValue: 150000 } },
  } }), null)
  assert.equal(normalizeSalary({ jsonLD: { salaryCurrency: 'USD', baseSalary: {} } }), null)
})

test('expiry handling is conservative: distrusts dateActive entirely and a missing expiry signal', () => {
  const now = new Date('2026-09-24T00:00:00Z')
  assert.equal(expiryStatus({ dateExpired: '2026-09-01T00:00:00Z' }, now).isLikelyExpired, true)
  assert.equal(expiryStatus({ dateExpired: '2026-09-01T00:00:00Z' }, now).source, 'provider')
  // dateActive is never read as a liveness signal, even when it claims the job is
  // active far into the future.
  assert.equal(expiryStatus({ dateActive: '2027-01-01T00:00:00Z' }, now).isLikelyExpired, false)
  // Posted far outside the trusted window with no explicit expiry date.
  const stale = expiryStatus({ dateCreated: '2026-06-01T00:00:00Z' }, now)
  assert.equal(stale.isLikelyExpired, true)
  assert.equal(stale.source, 'inferred')
  // Recently posted and still within the trusted window.
  assert.equal(expiryStatus({ dateCreated: '2026-09-20T00:00:00Z' }, now).isLikelyExpired, false)
  // No date signal at all is not assumed expired, but confidence is low.
  const unknown = expiryStatus({}, now)
  assert.equal(unknown.isLikelyExpired, false)
  assert.equal(unknown.confidence, 'low')
  assert.equal(unknown.source, 'unknown')
})

test('dedupe key requires full location and description agreement, and is independent of any provider duplicate flag', () => {
  const loc = { value: { city: 'Austin', region: null, country: null }, source: 'provider' as const, confidence: 'medium' as const }
  const jobA = { title: 'Software Engineer', company: 'Acme Inc.', location: loc, descriptionText: 'Build backend services.' }
  const jobB = { title: '  software engineer  ', company: 'ACME INC', location: loc, descriptionText: 'Build backend services.' }
  assert.equal(dedupeKey(jobA), dedupeKey(jobB))

  // Same title/company, different location (e.g. a different country) never collides.
  const otherCountryLoc = { value: { city: 'London', region: null, country: 'GB' }, source: 'provider' as const, confidence: 'medium' as const }
  const jobC = { title: 'Software Engineer', company: 'Acme Inc.', location: otherCountryLoc, descriptionText: 'Build backend services.' }
  assert.notEqual(dedupeKey(jobA), dedupeKey(jobC))

  const jobs = [jobA, jobB].map((j, i) => ({
    ...j, dedupeKey: dedupeKey(j), providerJobId: String(i), sourceUrl: `https://x.example/${i}`,
  })) as unknown as NormalizedJob[]
  assert.equal(dedupeJobs(jobs).length, 1)
})

test('dedupeJobs collapses on the namespaced id, not the raw providerJobId, so two providers with coincidentally equal ids never collide', () => {
  const locA = { value: { city: 'Austin', region: null, country: 'US' }, source: 'provider' as const, confidence: 'medium' as const }
  const locB = { value: { city: 'London', region: null, country: 'GB' }, source: 'provider' as const, confidence: 'medium' as const }
  const jobFromProviderA = {
    id: 'techmap:42', provider: 'techmap', providerJobId: '42',
    title: 'Software Engineer', company: 'Acme Inc.', location: locA, descriptionText: 'Build backend services.',
    sourceUrl: 'https://jobs.acme.example/42',
  }
  const jobFromProviderB = {
    id: 'otherprovider:42', provider: 'otherprovider', providerJobId: '42',
    title: 'Marketing Manager', company: 'Totally Different Co', location: locB, descriptionText: 'Run campaigns.',
    sourceUrl: 'https://jobs.other.example/42',
  }
  const jobs = [jobFromProviderA, jobFromProviderB].map(j => ({
    ...j, dedupeKey: dedupeKey(j),
  })) as unknown as NormalizedJob[]
  const result = dedupeJobs(jobs)
  assert.equal(result.length, 2)
  assert.deepEqual(result.map(j => j.id), ['techmap:42', 'otherprovider:42'])
})

test('normalizeJob drops records missing a stable id, title, company, or safe URL', () => {
  const retrievedAt = new Date('2026-09-24T00:00:00Z')
  const noId = normalizeJob({ title: 'Engineer', company: 'Acme', jsonLD: { url: 'https://x.example/1' } }, 'techmap', retrievedAt)
  assert.equal(noId, null)
  const noTitle = normalizeJob({ company: 'Acme', jsonLD: { identifier: '1', url: 'https://x.example/1' } }, 'techmap', retrievedAt)
  assert.equal(noTitle, null)
  const noCompany = normalizeJob({ title: 'Engineer', jsonLD: { identifier: '1', url: 'https://x.example/1' } }, 'techmap', retrievedAt)
  assert.equal(noCompany, null)
  const unsafeUrl = normalizeJob({ title: 'Engineer', company: 'Acme', jsonLD: { identifier: '1', url: 'not-a-url' } }, 'techmap', retrievedAt)
  assert.equal(unsafeUrl, null)
  assert.equal(normalizeJob(null, 'techmap', retrievedAt), null)
  assert.equal(normalizeJob('a string', 'techmap', retrievedAt), null)

  const job = normalizeJob(
    { title: 'Engineer', company: 'Acme', countryCode: 'US', jsonLD: { identifier: '1', url: 'https://x.example/1' } },
    'techmap',
    retrievedAt,
  )
  assert.equal(job?.id, 'techmap:1')
  assert.equal(job?.retrievedAt, retrievedAt.toISOString())
  assert.equal(job?.location.value.country, 'US')
})
