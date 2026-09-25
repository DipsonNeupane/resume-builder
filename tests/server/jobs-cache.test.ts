import test from 'node:test'
import assert from 'node:assert/strict'
import { cacheKey, getCachedJobs, getOrFetchJobs, resetJobsCacheForTests, setCachedJobs } from '../../server/jobs/cache.ts'
import type { NormalizedJob } from '../../server/jobs/types.ts'

function job(id: string): NormalizedJob {
  return {
    id, provider: 'techmap', providerJobId: id,
    title: 'Engineer', company: 'Acme',
    location: { value: { city: null, region: null, country: null }, source: 'unknown', confidence: 'low' },
    workplace: { value: 'unknown', source: 'unknown', confidence: 'low' },
    employmentType: { value: 'unknown', source: 'unknown', confidence: 'low' },
    salary: null, descriptionText: '', postedAt: null,
    expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
    directness: { value: null, source: 'unknown', confidence: 'low' },
    sourceUrl: `https://jobs.example/${id}`,
    portal: null, source: null, dedupeKey: id, retrievedAt: '2026-09-24T00:00:00Z',
  }
}

test('the cache key is purely the normalized public query, with no owner/account component', () => {
  resetJobsCacheForTests()
  const key = cacheKey(JSON.stringify({ title: 'engineer', countryCode: 'US', workplace: null }))
  setCachedJobs(key, [job('1')])
  // A different account issuing the identical normalized query reuses the same entry.
  assert.deepEqual(getCachedJobs(key), [job('1')])
})

test('getOrFetchJobs reuses a cached result across "accounts" without invoking fetchJobs again', async () => {
  resetJobsCacheForTests()
  const key = cacheKey(JSON.stringify({ title: 'engineer', countryCode: null, workplace: null }))
  let calls = 0
  const fetchJobs = async () => { calls++; return [job('1')] }
  const first = await getOrFetchJobs(key, fetchJobs)
  const second = await getOrFetchJobs(key, fetchJobs)
  assert.equal(calls, 1)
  assert.deepEqual(first, second)
})

test('getOrFetchJobs coalesces simultaneous identical cache misses onto one in-flight fetch', async () => {
  resetJobsCacheForTests()
  const key = cacheKey(JSON.stringify({ title: 'engineer', countryCode: null, workplace: null }))
  let calls = 0
  let resolveFetch!: (jobs: NormalizedJob[]) => void
  const fetchJobs = () => { calls++; return new Promise<NormalizedJob[]>(resolve => { resolveFetch = resolve }) }
  const first = getOrFetchJobs(key, fetchJobs)
  const second = getOrFetchJobs(key, fetchJobs)
  const third = getOrFetchJobs(key, fetchJobs)
  resolveFetch([job('1')])
  const [a, b, c] = await Promise.all([first, second, third])
  assert.equal(calls, 1, 'only one provider fetch should have been started for three simultaneous identical misses')
  assert.deepEqual(a, [job('1')])
  assert.deepEqual(b, [job('1')])
  assert.deepEqual(c, [job('1')])
})

test('a failed fetch is never cached and is not left registered as in-flight, so the next call retries', async () => {
  resetJobsCacheForTests()
  const key = cacheKey(JSON.stringify({ title: 'engineer', countryCode: null, workplace: null }))
  let calls = 0
  const failingThenSucceeding = async () => {
    calls++
    if (calls === 1) throw new Error('provider unavailable')
    return [job('recovered')]
  }
  await assert.rejects(getOrFetchJobs(key, failingThenSucceeding))
  const result = await getOrFetchJobs(key, failingThenSucceeding)
  assert.equal(calls, 2)
  assert.deepEqual(result, [job('recovered')])
})

test('an expired entry is not returned and getOrFetchJobs re-fetches', async () => {
  resetJobsCacheForTests()
  const key = cacheKey(JSON.stringify({ title: 'engineer', countryCode: null, workplace: null }))
  setCachedJobs(key, [job('stale')], 0)
  assert.equal(getCachedJobs(key, 10 * 60 * 1000), null) // 10 minutes later, well past the TTL
  let calls = 0
  const fetchJobs = async () => { calls++; return [job('fresh')] }
  const result = await getOrFetchJobs(key, fetchJobs, 10 * 60 * 1000)
  assert.equal(calls, 1)
  assert.deepEqual(result, [job('fresh')])
})
