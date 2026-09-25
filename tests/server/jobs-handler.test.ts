import test from 'node:test'
import assert from 'node:assert/strict'
import { searchJobs, dependencies, FREE_JOB_LIMIT, PRO_JOB_LIMIT } from '../../server/jobs/handler.ts'
import { resetJobsCacheForTests } from '../../server/jobs/cache.ts'
import { HttpError } from '../../server/http/security.ts'
import type { NormalizedJob } from '../../server/jobs/types.ts'

const env = {
  APP_ORIGIN: 'https://resumestride.com',
  TECHMAP_API_KEY: 'x'.repeat(20),
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture',
}

let titleCounter = 0
// A fresh title per fixture call keeps each test's Techmap fetch out of the handler's
// short-lived, now account-agnostic cache (cache.ts), which intentionally persists
// across requests — and across accounts — within one warm process/test run.
function uniqueTitle(): string {
  titleCounter += 1
  return `engineer-${titleCounter}`
}

function job(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  const id = overrides.id ?? 'techmap:1'
  return {
    id, provider: 'techmap', providerJobId: overrides.providerJobId ?? id.split(':')[1] ?? '1',
    title: 'Senior Software Engineer', company: 'Acme Inc.',
    location: { value: { city: 'Austin', region: 'TX', country: 'US' }, source: 'provider', confidence: 'high' },
    workplace: { value: 'remote', source: 'provider', confidence: 'high' },
    employmentType: { value: 'unknown', source: 'unknown', confidence: 'low' },
    salary: null,
    descriptionText: 'Build backend services using TypeScript and PostgreSQL.',
    postedAt: null,
    expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
    directness: { value: null, source: 'unknown', confidence: 'low' },
    sourceUrl: `https://jobs.example/${id}`,
    portal: 'acme-careers', source: 'employer', dedupeKey: `key-${id}`, retrievedAt: '2026-09-24T00:00:00Z',
    ...overrides,
  }
}

function fixture(options: { isPro?: boolean; page1?: NormalizedJob[]; page2?: NormalizedJob[]; hasMore?: boolean; page2Error?: Error; owner?: string } = {}) {
  const page1 = options.page1 ?? [job()]
  const calls: { page: number; params: Record<string, unknown> }[] = []
  const techmapSearch = (async (_config: unknown, params: { page?: number; [key: string]: unknown }) => {
    calls.push({ page: params.page ?? 1, params })
    if (params.page === 2) {
      if (options.page2Error) throw options.page2Error
      return { jobs: options.page2 ?? [], page: 2, hasMore: false }
    }
    return { jobs: page1, page: 1, hasMore: options.hasMore ?? false }
  }) as unknown as typeof dependencies.techmapSearch
  const dbCalls: string[] = []
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> = []
  const deps = {
    ...dependencies,
    authenticate: async () => { dbCalls.push('authenticate'); return options.owner ?? `owner-${Math.random().toString(36).slice(2)}` },
    serviceDatabase: ((..._args: unknown[]) => { dbCalls.push('serviceDatabase'); return {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        rpcCalls.push({ name, args })
        return name === 'billing_get_entitlement' ? { data: [{ is_pro: options.isPro ?? false }], error: null } : { data: null, error: null }
      },
    } }) as unknown as typeof dependencies.serviceDatabase,
    techmapSearch,
    delay: async (_ms: number) => { /* no-op in tests: real delay is covered by a dedicated timing test */ },
  }
  return { deps, calls, dbCalls, rpcCalls }
}

const evidence = { headline: 'Senior Software Engineer', skills: 'TypeScript, PostgreSQL', roles: [] }

function request(body: unknown): Request {
  return new Request('https://resumestride.com/api/jobs-search', {
    method: 'POST',
    headers: { origin: env.APP_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('Free accounts see at most FREE_JOB_LIMIT real jobs, with an honest availableCount', async () => {
  const jobs = Array.from({ length: 12 }, (_, i) => job({ id: `techmap:${i}`, company: `Company ${i}`, portal: `portal-${i}` }))
  const { deps } = fixture({ isPro: false, page1: jobs })
  const response = await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.isPro, false)
  assert.equal(body.jobs.length, FREE_JOB_LIMIT)
  assert.equal(body.availableCount, 12)
})

test('bounded resume evidence stays server-side and is never forwarded to Techmap', async () => {
  const { deps, calls } = fixture()
  const privateEvidence = {
    headline: 'Engineer', summary: 'PRIVATE SUMMARY', skills: 'TypeScript',
    roles: [{ title: 'Engineer', description: 'PRIVATE ROLE EVIDENCE', dates: '2020–2024' }],
    qualifications: [{ section: 'Education', title: 'PRIVATE QUALIFICATION', description: 'PRIVATE DETAIL' }],
  }
  const response = await searchJobs(request({ criteria: { title: uniqueTitle(), countryCode: 'US', workplace: 'remote' }, evidence: privateEvidence }), env, deps)
  assert.equal(response.status, 200)
  assert.equal(calls.length, 1)
  assert.deepEqual(Object.keys(calls[0].params).sort(), ['countryCode', 'page', 'title', 'workPlace'])
  assert.doesNotMatch(JSON.stringify(calls[0].params), /PRIVATE|Engineer.*PRIVATE|QUALIFICATION/)
})

test('Pro accounts see up to PRO_JOB_LIMIT jobs, never more', async () => {
  const jobs = Array.from({ length: 35 }, (_, i) => job({ id: `techmap:${i}`, company: `Company ${i}`, portal: `portal-${i}` }))
  const { deps } = fixture({ isPro: true, page1: jobs })
  const response = await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  const body = await response.json()
  assert.equal(body.isPro, true)
  assert.equal(body.jobs.length, PRO_JOB_LIMIT)
  assert.equal(body.availableCount, PRO_JOB_LIMIT)
})

test('retrieves at most two Techmap pages per search, deduping the combined result', async () => {
  const { deps, calls } = fixture({
    page1: [job({ id: 'techmap:1' }), job({ id: 'techmap:2' })],
    hasMore: true,
    page2: [job({ id: 'techmap:2' }), job({ id: 'techmap:3' })], // job 2 duplicated across pages
  })
  const response = await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  const body = await response.json()
  assert.equal(calls.length, 2)
  assert.equal(body.availableCount, 3) // 1, 2, 3 -- duplicate collapsed
})

test('does not fetch a second page when the first page reports no more results', async () => {
  const { deps, calls } = fixture({ page1: [job()], hasMore: false })
  await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  assert.equal(calls.length, 1)
})

test('forwards expiry provenance so inferred staleness cannot become provider unavailability', async () => {
  const observed = [
    job({ id: 'techmap:inferred', expiry: { expiresAt: null, isLikelyExpired: true, confidence: 'medium', source: 'inferred' } }),
    job({ id: 'techmap:expired', expiry: { expiresAt: '2026-09-23T00:00:00Z', isLikelyExpired: true, confidence: 'high', source: 'provider' } }),
  ]
  const { deps, rpcCalls } = fixture({ page1: observed, owner: 'owner-expiry-test' })
  await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  const refresh = rpcCalls.find(call => call.name === 'jobs_mark_seen')
  assert.deepEqual(refresh?.args, {
    p_owner: 'owner-expiry-test',
    p_provider_ids: ['techmap:inferred', 'techmap:expired'],
    p_expires_at: [null, '2026-09-23T00:00:00Z'],
    p_expiry_sources: ['inferred', 'provider'],
  })
})

test('waits at least 1100ms via the injectable delay before an optional second page, and never for a single-page search', async () => {
  const delays: number[] = []
  const { deps } = fixture({ page1: [job()], hasMore: true, page2: [job({ id: 'techmap:2' })] })
  deps.delay = async (ms: number) => { delays.push(ms) }
  await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  assert.deepEqual(delays, [1100])

  const { deps: singlePageDeps } = fixture({ page1: [job()], hasMore: false })
  const singlePageDelays: number[] = []
  singlePageDeps.delay = async (ms: number) => { singlePageDelays.push(ms) }
  await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, singlePageDeps)
  assert.deepEqual(singlePageDelays, [])
})

test('a 429 on the optional second page still returns the first page results rather than failing', async () => {
  const rateLimitError = new HttpError(429, 'Job search rate limit reached. Try again later.')
  const { deps, calls } = fixture({ page1: [job()], hasMore: true, page2Error: rateLimitError })
  const response = await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  assert.equal(response.status, 200)
  assert.equal(calls.length, 2)
  const body = await response.json()
  assert.equal(body.availableCount, 1)
})

test('a 429 on the first page fails the whole request without an automatic retry', async () => {
  const rateLimitError = new HttpError(429, 'Job search rate limit reached. Try again later.')
  const { deps } = fixture()
  deps.techmapSearch = (async () => { throw rateLimitError }) as unknown as typeof dependencies.techmapSearch
  const response = await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  assert.equal(response.status, 429)
})

test('employment type and salary preference filter jobs without being sent to Techmap', async () => {
  const jobs = [
    job({ id: 'techmap:1', employmentType: { value: 'full_time', source: 'provider', confidence: 'high' } }),
    job({ id: 'techmap:2', employmentType: { value: 'contract', source: 'provider', confidence: 'high' } }),
  ]
  const { deps, rpcCalls } = fixture({ page1: jobs })
  const response = await searchJobs(request({ criteria: { title: uniqueTitle(), employmentType: 'full_time' }, evidence }), env, deps)
  const body = await response.json()
  assert.equal(body.jobs.length, 1)
  assert.equal(body.jobs[0].id, 'techmap:1')
  const invalidation = rpcCalls.find(call => call.name === 'jobs_invalidate_job_analyses')
  assert.deepEqual(invalidation?.args?.p_provider_ids, ['techmap:1', 'techmap:2'], 'all observed jobs are checked for changed material, including a locally filtered job')
  assert.ok((invalidation?.args?.p_job_hashes as unknown[]).every(hash => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)))
})

test('salary preference filters by range overlap, and location filters by a bounded local match, without being sent to Techmap', async () => {
  const jobs = [
    job({ id: 'techmap:1', salary: { min: 100000, max: 120000, currency: 'USD', period: 'year', confidence: 'high' }, location: { value: { city: 'Austin', region: 'TX', country: 'US' }, source: 'provider', confidence: 'high' } }),
    job({ id: 'techmap:2', salary: { min: 200000, max: 250000, currency: 'USD', period: 'year', confidence: 'high' }, location: { value: { city: 'Denver', region: 'CO', country: 'US' }, source: 'provider', confidence: 'high' } }),
    // Unknown location stays eligible even against an explicit location preference.
    job({ id: 'techmap:3', salary: { min: 100000, max: 120000, currency: 'USD', period: 'year', confidence: 'high' }, location: { value: { city: null, region: null, country: null }, source: 'unknown', confidence: 'low' } }),
  ]
  const { deps } = fixture({ page1: jobs })
  const response = await searchJobs(request({
    criteria: { title: uniqueTitle(), location: 'Austin', salary: { period: 'year', currency: 'USD', min: null, max: 150000 } },
    evidence,
  }), env, deps)
  const body = await response.json()
  const ids = body.jobs.map((j: { id: string }) => j.id).sort()
  assert.deepEqual(ids, ['techmap:1', 'techmap:3'])
})

test('an identical normalized public query is reused across different accounts (no owner in the cache signature)', async () => {
  resetJobsCacheForTests()
  const sharedTitle = uniqueTitle()
  const jobs = [job({ id: 'techmap:1' })]
  const { deps, calls } = fixture({ page1: jobs, owner: 'owner-a' })
  await searchJobs(request({ criteria: { title: sharedTitle }, evidence }), env, deps)
  assert.equal(calls.length, 1)

  const secondDeps = { ...deps, authenticate: async () => 'owner-b' }
  await searchJobs(request({ criteria: { title: sharedTitle }, evidence }), env, secondDeps)
  // The second account's request never re-hit the provider: the cache reused the first
  // account's fetch even though it's a different account.
  assert.equal(calls.length, 1)
})

test('calls the per-owner search throttle before touching Techmap or the entitlement lookup', async () => {
  const { deps, rpcCalls, calls } = fixture({ owner: 'owner-throttle-order' })
  await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  const throttleCall = rpcCalls.find(call => call.name === 'jobs_throttle_search_attempt')
  assert.deepEqual(throttleCall?.args, { p_owner: 'owner-throttle-order' })
  const throttleIndex = rpcCalls.findIndex(call => call.name === 'jobs_throttle_search_attempt')
  const entitlementIndex = rpcCalls.findIndex(call => call.name === 'billing_get_entitlement')
  assert.ok(throttleIndex < entitlementIndex, 'throttle must be checked before the entitlement lookup')
  assert.equal(calls.length, 1, 'a permitted request still reaches the provider')
})

test('a throttled owner receives 429 without reaching Techmap', async () => {
  const { deps, calls } = fixture()
  deps.serviceDatabase = (() => ({
    rpc: async (name: string) => name === 'jobs_throttle_search_attempt'
      ? { data: null, error: { code: '54000', message: 'Too many job searches. Wait a few minutes and try again.' } }
      : { data: [{ is_pro: false }], error: null },
  })) as unknown as typeof dependencies.serviceDatabase
  const response = await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  assert.equal(response.status, 429)
  assert.equal(calls.length, 0, 'a throttled request must never reach the provider')
})

test('an unrelated throttle RPC failure fails closed with a 503, not a silent bypass', async () => {
  const { deps, calls } = fixture()
  deps.serviceDatabase = (() => ({
    rpc: async (name: string) => name === 'jobs_throttle_search_attempt'
      ? { data: null, error: { code: 'XXOOO', message: 'unavailable' } }
      : { data: [{ is_pro: false }], error: null },
  })) as unknown as typeof dependencies.serviceDatabase
  const response = await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  assert.equal(response.status, 503)
  assert.equal(calls.length, 0)
})

test('rejects a request missing resume evidence', async () => {
  const { deps } = fixture()
  const response = await searchJobs(request({ criteria: { title: uniqueTitle() } }), env, deps)
  assert.equal(response.status, 400)
})

test('rejects a request with an invalid origin or method', async () => {
  const { deps } = fixture()
  const badOrigin = new Request('https://resumestride.com/api/jobs-search', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ criteria: { title: uniqueTitle() }, evidence }) })
  assert.equal((await searchJobs(badOrigin, env, deps)).status, 403)
  const badMethod = new Request('https://resumestride.com/api/jobs-search', { method: 'GET', headers: { origin: env.APP_ORIGIN } })
  assert.equal((await searchJobs(badMethod, env, deps)).status, 405)
})

test('an invalid origin or method never reaches authentication, provider config, the database, or the provider', async () => {
  const { deps, calls, dbCalls } = fixture()
  let techmapConfigTouched = false
  const badEnv = { ...env, get TECHMAP_API_KEY(): string { techmapConfigTouched = true; return env.TECHMAP_API_KEY } }
  const badOrigin = new Request('https://resumestride.com/api/jobs-search', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ criteria: { title: uniqueTitle() }, evidence }) })
  await searchJobs(badOrigin, badEnv as unknown as typeof env, deps)
  assert.equal(dbCalls.length, 0, 'authenticate/serviceDatabase must never be called for a rejected origin')
  assert.equal(calls.length, 0, 'the provider must never be called for a rejected origin')
  assert.equal(techmapConfigTouched, false, 'TECHMAP_API_KEY must never even be read for a rejected origin')

  const badMethod = new Request('https://resumestride.com/api/jobs-search', { method: 'GET', headers: { origin: env.APP_ORIGIN } })
  await searchJobs(badMethod, badEnv as unknown as typeof env, deps)
  assert.equal(dbCalls.length, 0, 'authenticate/serviceDatabase must never be called for a rejected method')
  assert.equal(calls.length, 0, 'the provider must never be called for a rejected method')
})

test('a failed authentication never reaches provider config, the database entitlement lookup, or the provider', async () => {
  const { deps, calls } = fixture()
  let techmapConfigTouched = false
  const badEnv = { ...env, get TECHMAP_API_KEY(): string { techmapConfigTouched = true; return env.TECHMAP_API_KEY } }
  let serviceDatabaseCalled = false
  const failingDeps = {
    ...deps,
    authenticate: async () => { throw new HttpError(401, 'Sign in required') },
    serviceDatabase: (() => { serviceDatabaseCalled = true; return { rpc: async () => ({ data: null, error: null }) } }) as unknown as typeof dependencies.serviceDatabase,
  }
  const response = await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), badEnv as unknown as typeof env, failingDeps)
  assert.equal(response.status, 401)
  assert.equal(serviceDatabaseCalled, false, 'the database must never be touched after a failed authentication')
  assert.equal(calls.length, 0, 'the provider must never be called after a failed authentication')
  assert.equal(techmapConfigTouched, false, 'TECHMAP_API_KEY must never even be read after a failed authentication')
})

test('match reasons and labels are present and deterministic across two identical requests', async () => {
  const { deps } = fixture({ page1: [job()] })
  const response1 = await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps)
  const body1 = await response1.json()
  assert.ok(['strong', 'good', 'stretch'].includes(body1.jobs[0].matchLabel))
  assert.ok(body1.jobs[0].matchReasons.length > 0)
  const { deps: deps2 } = fixture({ page1: [job()] })
  const response2 = await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, deps2)
  const body2 = await response2.json()
  assert.deepEqual(body1.jobs[0].matchLabel, body2.jobs[0].matchLabel)
  assert.deepEqual(body1.jobs[0].matchReasons, body2.jobs[0].matchReasons)
})

test('Free responses contain only bounded analysis previews while Pro receives full requirement depth', async () => {
  const analyzedJob = job({ descriptionText: 'Required: TypeScript.\nPreferred: PostgreSQL.\nNice to have: Kubernetes.' })
  const freeFixture = fixture({ isPro: false, page1: [analyzedJob] })
  const freeBody = await (await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, freeFixture.deps)).json()
  assert.equal(freeBody.jobs[0].matchAnalysis.fullAnalysis, undefined)
  assert.ok(freeBody.jobs[0].matchAnalysis.observations.length <= 3)
  assert.ok(freeBody.jobs[0].matchAnalysis.additionalAreasAnalyzed >= 0)

  const proFixture = fixture({ isPro: true, page1: [analyzedJob] })
  const proBody = await (await searchJobs(request({ criteria: { title: uniqueTitle() }, evidence }), env, proFixture.deps)).json()
  assert.deepEqual(proBody.jobs[0].matchAnalysis.fullAnalysis.requirements.map((item: { category: string }) => item.category), ['required', 'preferred', 'nice_to_have'])
  assert.equal(proBody.jobs[0].matchAnalysis.fullAnalysis.tailoringAction, 'Tailor my resume for this job')
  assert.doesNotMatch(JSON.stringify(proBody.jobs[0].matchAnalysis), /\d+%|hiring probability/i)
})
