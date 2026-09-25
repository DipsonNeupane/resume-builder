import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { techmapConfig } from '../../server/jobs/config.ts'
import { techmapSearch, TechmapProvider } from '../../server/jobs/techmap.ts'

const fixturePath = fileURLToPath(new URL('./fixtures/techmap-search.json', import.meta.url))
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
const config = { apiKey: 'fixture-key-0123456789', host: 'techmap-fixture.p.rapidapi.com', url: 'https://techmap-fixture.p.rapidapi.com/search' }
const retrievedAt = new Date('2026-09-24T00:00:00Z')

test('techmapConfig requires only a server-only key and points at the verified Techmap v2 endpoint', () => {
  assert.throws(() => techmapConfig({}), { status: 503 })
  assert.throws(() => techmapConfig({ TECHMAP_API_KEY: 'short' }), { status: 503 })
  const ok = techmapConfig({ TECHMAP_API_KEY: 'x'.repeat(20) })
  assert.equal(ok.apiKey.length, 20)
  assert.equal(ok.url, 'https://daily-international-job-postings.p.rapidapi.com/api/v2/jobs/search')
  assert.equal(ok.host, 'daily-international-job-postings.p.rapidapi.com')
})

test('search issues a bounded, active, non-duplicate v2 request and never sends a body or user data', async () => {
  let calls = 0
  const fetcher = (async (url: unknown, init: unknown) => {
    calls++
    const u = new URL(url as string | URL)
    const reqInit = init as RequestInit
    assert.equal(u.searchParams.get('isActive'), 'true')
    assert.equal(u.searchParams.get('isDuplicate'), 'false')
    assert.equal(u.searchParams.get('title'), 'software engineer')
    assert.equal(u.searchParams.get('countryCode'), 'US')
    assert.equal(u.searchParams.get('workPlace'), 'remote')
    assert.equal(u.searchParams.get('dateCreatedMin'), '2026-09-01')
    assert.equal(reqInit.method, 'GET')
    assert.equal(reqInit.body, undefined)
    const headers = reqInit.headers as Record<string, string>
    assert.equal(headers['X-RapidAPI-Key'], config.apiKey)
    assert.equal(headers['X-RapidAPI-Host'], config.host)
    // The API key must never be exposed as part of the URL (query string or path).
    assert.ok(!u.toString().includes(config.apiKey))
    return Response.json(fixture)
  }) as typeof fetch
  const result = await techmapSearch(
    config,
    { title: 'software engineer', countryCode: 'us', workPlace: 'remote', dateCreatedMin: '2026-09-01' },
    fetcher,
    retrievedAt,
  )
  assert.equal(calls, 1)
  // job-2 (independent-dedupe duplicate of job-1: same title/company/location and
  // description), job-4 (stale beyond the trusted freshness window), job-5 (unsafe URL)
  // and job-6 (missing company) are all dropped.
  assert.deepEqual(result.jobs.map(j => j.providerJobId), ['job-1', 'job-3', 'job-7'])
})

test('normalizes a real-shaped array workPlace value and a jsonLD.salaryCurrency fallback', async () => {
  const result = await techmapSearch(config, { title: 'software engineer' }, async () => Response.json(fixture), retrievedAt)
  const multiwork = result.jobs.find(j => j.providerJobId === 'job-7')!
  assert.equal(multiwork.workplace.value, 'hybrid')
  assert.equal(multiwork.workplace.source, 'provider')
  assert.deepEqual(multiwork.salary, { min: 90000, max: 120000, currency: 'USD', period: 'year', confidence: 'high' })
})

test('normalizes salary, workplace and provenance for a retained job', async () => {
  const result = await techmapSearch(config, { title: 'software engineer' }, async () => Response.json(fixture), retrievedAt)
  const engineer = result.jobs.find(j => j.providerJobId === 'job-1')!
  assert.equal(engineer.workplace.value, 'remote')
  assert.equal(engineer.workplace.source, 'provider')
  assert.deepEqual(engineer.salary, { min: 140000, max: 180000, currency: 'USD', period: 'year', confidence: 'high' })
  assert.equal(engineer.directness.value, true)
  assert.equal(engineer.directness.source, 'provider')
  assert.equal(engineer.sourceUrl, 'https://jobs.acme.example/postings/job-1')
  assert.equal(engineer.location.value.country, 'US')
  assert.equal(engineer.location.confidence, 'high')

  const warehouse = result.jobs.find(j => j.providerJobId === 'job-3')!
  assert.deepEqual(warehouse.salary, { min: 19.5, max: 24, currency: 'USD', period: 'hour', confidence: 'high' })
  assert.equal(warehouse.workplace.value, 'unknown')
  assert.equal(warehouse.workplace.confidence, 'low')
})

test('rejects invalid search parameters before any request is sent', async () => {
  const fetcher = (async () => { throw new Error('must not be called') }) as typeof fetch
  await assert.rejects(techmapSearch(config, { title: '' }, fetcher), { status: 400 })
  await assert.rejects(techmapSearch(config, { title: 'x'.repeat(500) }, fetcher), { status: 400 })
  await assert.rejects(techmapSearch(config, { title: 'ok', countryCode: 'USA' }, fetcher), { status: 400 })
  await assert.rejects(techmapSearch(config, { title: 'ok', workPlace: 'anywhere' as never }, fetcher), { status: 400 })
  await assert.rejects(techmapSearch(config, { title: 'ok', dateCreatedMin: '09-01-2026' }, fetcher), { status: 400 })
  await assert.rejects(techmapSearch(config, { title: 'ok', page: 0 }, fetcher), { status: 400 })
  await assert.rejects(techmapSearch(config, { title: 'ok', page: 999 }, fetcher), { status: 400 })
})

test('rejects impossible or out-of-range calendar dates before any request is sent', async () => {
  const fetcher = (async () => { throw new Error('must not be called') }) as typeof fetch
  // Not a real calendar date (2026 is not a leap year / no 13th month / no 32nd day).
  await assert.rejects(techmapSearch(config, { title: 'ok', dateCreatedMin: '2026-02-30' }, fetcher), { status: 400 })
  await assert.rejects(techmapSearch(config, { title: 'ok', dateCreatedMax: '2026-13-01' }, fetcher), { status: 400 })
  await assert.rejects(techmapSearch(config, { title: 'ok', dateCreatedMin: '2026-04-31' }, fetcher), { status: 400 })
})

test('rejects a dateCreatedMin after dateCreatedMax before any request is sent', async () => {
  const fetcher = (async () => { throw new Error('must not be called') }) as typeof fetch
  await assert.rejects(
    techmapSearch(config, { title: 'ok', dateCreatedMin: '2026-09-10', dateCreatedMax: '2026-09-01' }, fetcher),
    { status: 400 },
  )
})

test('caps an explicit date range to 31 days, rejecting a wider one before any request is sent', async () => {
  const fetcher = (async () => { throw new Error('must not be called') }) as typeof fetch
  // Exactly 31 days apart is allowed.
  let calls = 0
  const okFetcher = (async () => { calls++; return Response.json({ result: [] }) }) as typeof fetch
  await techmapSearch(config, { title: 'ok', dateCreatedMin: '2026-09-01', dateCreatedMax: '2026-10-02' }, okFetcher)
  assert.equal(calls, 1)
  // 32 days apart is rejected pre-fetch.
  await assert.rejects(
    techmapSearch(config, { title: 'ok', dateCreatedMin: '2026-09-01', dateCreatedMax: '2026-10-03' }, fetcher),
    { status: 400 },
  )
})

test('rate limit (429) is reported distinctly and never retried automatically', async () => {
  let calls = 0
  const fetcher = (async () => { calls++; return new Response('', { status: 429 }) }) as typeof fetch
  await assert.rejects(techmapSearch(config, { title: 'ok' }, fetcher), { status: 429 })
  assert.equal(calls, 1)
})

test('a hung provider request times out with a generic, non-leaking error', async () => {
  const fetcher = (async (_url: unknown, init: unknown) => {
    return new Promise<Response>((_resolve, reject) => {
      (init as RequestInit)?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'TimeoutError'
        reject(error)
      })
    })
  }) as typeof fetch
  await assert.rejects(techmapSearch(config, { title: 'ok' }, fetcher), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal((error as { status?: number }).status, 503)
    assert.ok(!String((error as Error).message).includes(config.apiKey))
    return true
  })
})

test('non-ok and malformed responses fail closed without leaking provider details', async () => {
  await assert.rejects(techmapSearch(config, { title: 'ok' }, async () => new Response('', { status: 500 })), { status: 503 })
  await assert.rejects(techmapSearch(config, { title: 'ok' }, async () => new Response('not json', { status: 200 })), { status: 502 })
})

test('an oversized response body is rejected rather than buffered without bound', async () => {
  const huge = JSON.stringify({ result: [{ title: 'x'.repeat(3_000_000) }] })
  await assert.rejects(techmapSearch(config, { title: 'ok' }, async () => new Response(huge, { status: 200 })), { status: 502 })
})

test('a response with no recognizable job array yields an empty result, not a crash', async () => {
  const result = await techmapSearch(config, { title: 'ok' }, async () => Response.json({ unexpected: true }), retrievedAt)
  assert.deepEqual(result.jobs, [])
})

test('a page beyond the fixed provider page size is bounded rather than trusted verbatim', async () => {
  const oversizedPage = { result: Array.from({ length: 40 }, (_, i) => ({
    title: 'Bulk Listing', company: 'Bulk Co', countryCode: 'US', city: `City${i}`,
    dateCreated: '2026-09-20T00:00:00Z',
    jsonLD: { identifier: `bulk-${i}`, description: `Listing number ${i}.`, url: `https://careers.example/bulk-${i}` },
  })) }
  const result = await techmapSearch(config, { title: 'bulk' }, async () => Response.json(oversizedPage), retrievedAt)
  assert.equal(result.jobs.length, 10)
  assert.equal(result.hasMore, true)
})

test('TechmapProvider implements the provider-neutral interface', async () => {
  // Deliberately date-free (no dateCreated/dateExpired) so this assertion never
  // becomes flaky as real wall-clock time moves away from the other fixed-date tests.
  const timelessFixture = { result: [{
    title: 'Platform Engineer', company: 'Fixture Inc', countryCode: 'US', isDirect: true,
    jsonLD: { identifier: 'p-1', description: 'Own the platform.', url: 'https://careers.fixture.example/p-1' },
  }] }
  const provider = new TechmapProvider(config, async () => Response.json(timelessFixture))
  assert.equal(provider.name, 'techmap')
  const result = await provider.search({ title: 'platform engineer' })
  assert.equal(result.jobs.length, 1)
  assert.equal(result.jobs[0].providerJobId, 'p-1')
})
