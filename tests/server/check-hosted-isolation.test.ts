import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertProjectRef,
  buildFixtureResume,
  runIsolationChecks,
  DEFAULT_ALLOWED_PROJECT_REF,
} from '../../scripts/check-hosted-isolation.mjs'

const supabaseUrl = `https://${DEFAULT_ALLOWED_PROJECT_REF}.supabase.co`
const apikey = 'fixture-anon-key'
const aId = '11111111-1111-1111-1111-111111111111'
const bId = '22222222-2222-2222-2222-222222222222'
const resumeId = '33333333-3333-3333-3333-333333333333'

// Fake but structurally real JWTs (no signature verification is ever done by
// the script — it only reads the `role` claim) so tokenA/tokenB exercise the
// same shape a real Supabase access token has.
function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.fixture-signature`
}

const tokenA = fakeJwt({ sub: aId, role: 'authenticated' })
const tokenB = fakeJwt({ sub: bId, role: 'authenticated' })
const serviceRoleToken = fakeJwt({ sub: 'service', role: 'service_role' })
const nonJwtToken = 'sb_publishable_not_a_jwt'

type Step = {
  status: number
  body?: unknown
  expectMethod?: string
  expectPathIncludes?: string
  expectBearer?: string
  expectNoBearer?: boolean
}

// Every runIsolationChecks() call makes a fixed, deterministic sequence of
// fetch() calls (documented in docs/HOSTED_ISOLATION_CHECK.md). A strict
// ordered mock — rather than a routing-by-URL mock — lets these tests assert
// on that exact sequence too, so a regression that silently reorders or drops
// a check is caught here, not only a wrong pass/fail verdict.
function mockFetch(steps: Step[]) {
  let i = 0
  const fetchImpl = async (url: string, opts: { method?: string; headers?: Record<string, string> }) => {
    assert.ok(i < steps.length, `unexpected extra fetch call #${i + 1}: ${opts.method ?? 'GET'} ${url}`)
    const step = steps[i]
    i += 1
    if (step.expectMethod) assert.equal(opts.method ?? 'GET', step.expectMethod, `call #${i} method`)
    if (step.expectPathIncludes) assert.ok(url.includes(step.expectPathIncludes), `call #${i} url ${url} should include ${step.expectPathIncludes}`)
    if (step.expectBearer !== undefined) assert.equal(opts.headers?.Authorization, `Bearer ${step.expectBearer}`, `call #${i} bearer token`)
    if (step.expectNoBearer) assert.equal(opts.headers?.Authorization, undefined, `call #${i} must send no Authorization header`)
    const ok = step.status >= 200 && step.status < 300
    return { status: step.status, ok, text: async () => JSON.stringify(step.body ?? (ok ? [] : { message: 'error' })) }
  }
  return { fetchImpl, callCount: () => i }
}

const fixtureA = () => buildFixtureResume('run-a')

function happyPathSteps(): Step[] {
  return [
    { status: 200, body: { id: aId }, expectMethod: 'GET', expectPathIncludes: '/auth/v1/user', expectBearer: tokenA },
    { status: 200, body: { id: bId }, expectMethod: 'GET', expectPathIncludes: '/auth/v1/user', expectBearer: tokenB },
    {
      status: 403,
      body: { message: 'new row violates row-level security policy', code: '42501' },
      expectMethod: 'POST',
      expectPathIncludes: '/rest/v1/resumes',
      expectBearer: tokenB,
    },
    { status: 201, body: [{ id: resumeId, revision: 1 }], expectMethod: 'POST', expectPathIncludes: '/rest/v1/resumes', expectBearer: tokenA },
    { status: 200, body: [{ id: resumeId, revision: 1 }], expectMethod: 'GET', expectPathIncludes: `id=eq.${resumeId}`, expectBearer: tokenA },
    { status: 200, body: [{ id: resumeId, revision: 2 }], expectMethod: 'PATCH', expectPathIncludes: `id=eq.${resumeId}`, expectBearer: tokenA },
    { status: 200, body: [{ revision: 1 }, { revision: 2 }], expectMethod: 'GET', expectPathIncludes: '/resume_revisions', expectBearer: tokenA },
    { status: 200, body: [], expectMethod: 'GET', expectPathIncludes: `id=eq.${resumeId}`, expectBearer: tokenB },
    { status: 200, body: [], expectMethod: 'PATCH', expectPathIncludes: `id=eq.${resumeId}`, expectBearer: tokenB },
    { status: 200, body: [{ id: resumeId, revision: 2 }], expectMethod: 'GET', expectPathIncludes: `id=eq.${resumeId}`, expectBearer: tokenA },
    { status: 200, body: [], expectMethod: 'DELETE', expectPathIncludes: `id=eq.${resumeId}`, expectBearer: tokenB },
    { status: 200, body: [{ id: resumeId }], expectMethod: 'GET', expectPathIncludes: `id=eq.${resumeId}`, expectBearer: tokenA },
    { status: 200, body: [], expectMethod: 'GET', expectPathIncludes: `id=eq.${resumeId}`, expectNoBearer: true },
    {
      status: 400,
      body: { message: 'resumes_data_shape_valid violated', code: '23514' },
      expectMethod: 'PATCH',
      expectPathIncludes: `id=eq.${resumeId}`,
      expectBearer: tokenA,
    },
    { status: 200, body: [{ id: resumeId, revision: 2 }], expectMethod: 'GET', expectPathIncludes: `id=eq.${resumeId}`, expectBearer: tokenA },
    { status: 200, body: [{ id: resumeId }], expectMethod: 'DELETE', expectPathIncludes: `id=in.(${resumeId})`, expectBearer: tokenA },
  ]
}

const happyPathCheckNames = [
  'tokens-are-authenticated-role',
  'distinct-test-accounts',
  'forged-owner-insert-rejected',
  'owner-creates-own',
  'owner-reads-own',
  'owner-update-bumps-revision',
  'owner-checkpoint-recorded',
  'other-account-cannot-read',
  'other-account-cannot-update',
  'update-attempt-did-not-mutate-row',
  'other-account-cannot-delete',
  'delete-attempt-did-not-remove-row',
  'anon-cannot-read',
  'invalid-shape-rejected',
  'invalid-shape-attempt-did-not-mutate-row',
  'cleanup-fixture-removed',
]

test('assertProjectRef accepts only the recovery project exact origin', () => {
  assert.equal(assertProjectRef(supabaseUrl), `${DEFAULT_ALLOWED_PROJECT_REF}.supabase.co`)
  assert.throws(() => assertProjectRef('https://some-other-project.supabase.co'), /Refusing to run/)
  assert.throws(() => assertProjectRef('not-a-url'), /not a valid URL/)
  assert.throws(() => assertProjectRef('http://' + DEFAULT_ALLOWED_PROJECT_REF + '.supabase.co'), /Refusing to run/, 'must be https, not http')
  assert.throws(() => assertProjectRef(`https://user:pass@${DEFAULT_ALLOWED_PROJECT_REF}.supabase.co`), /Refusing to run/, 'must reject embedded credentials')
  assert.throws(() => assertProjectRef(`https://${DEFAULT_ALLOWED_PROJECT_REF}.supabase.co:8443`), /Refusing to run/, 'must reject a non-default port')
  assert.throws(() => assertProjectRef(`https://${DEFAULT_ALLOWED_PROJECT_REF}.supabase.co/rest/v1`), /Refusing to run/, 'must reject a path')
  assert.throws(() => assertProjectRef(`https://${DEFAULT_ALLOWED_PROJECT_REF}.supabase.co/?x=1`), /Refusing to run/, 'must reject a query string')
  assert.throws(() => assertProjectRef(`https://${DEFAULT_ALLOWED_PROJECT_REF}.supabase.co/#frag`), /Refusing to run/, 'must reject a fragment')
  assert.throws(
    () => assertProjectRef(`https://evil-${DEFAULT_ALLOWED_PROJECT_REF}.supabase.co`),
    /Refusing to run/,
    'must reject a hostname that merely contains the ref as a substring'
  )
})

test('buildFixtureResume produces a shape the app itself would accept', () => {
  const resume = fixtureA()
  assert.equal(resume.version, 1)
  assert.ok(['modern', 'classic', 'minimal'].includes(resume.template))
  assert.ok(['A4', 'Letter'].includes(resume.paper))
  assert.ok(/^#[0-9a-f]{6}$/i.test(resume.accent))
  assert.ok(Array.isArray(resume.sections) && resume.sections.length > 0)
  const ids = resume.sections.flatMap((s) => [s.id, ...s.entries.map((e) => e.id)])
  assert.equal(new Set(ids).size, ids.length, 'section/entry ids must be unique')
})

test('runIsolationChecks: happy path — every check passes and cleanup runs once', async () => {
  const { fetchImpl, callCount } = mockFetch(happyPathSteps())
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB })
  assert.equal(result.ok, true)
  assert.ok(result.checks.every((c) => c.pass), JSON.stringify(result.checks.filter((c) => !c.pass)))
  assert.deepEqual(result.checks.map((c) => c.name), happyPathCheckNames)
  assert.equal(callCount(), 16)
})

test('runIsolationChecks: refuses a non-recovery URL before any network call, even called directly', async () => {
  const { fetchImpl, callCount } = mockFetch([])
  await assert.rejects(
    () => runIsolationChecks({ fetchImpl, supabaseUrl: 'https://production-project.supabase.co', apikey, tokenA, tokenB }),
    /Refusing to run/
  )
  assert.equal(callCount(), 0, 'no fetch call may happen before the project-ref guard passes')
})

test('runIsolationChecks: a service-role token for account A is rejected before any network call', async () => {
  const { fetchImpl, callCount } = mockFetch([])
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA: serviceRoleToken, tokenB })
  assert.equal(result.ok, false)
  assert.deepEqual(result.checks.map((c) => c.name), ['tokens-are-authenticated-role'])
  assert.match(result.checks[0].note ?? '', /service_role/)
  assert.equal(callCount(), 0, 'a privileged/malformed token must be rejected before any network call')
})

test('runIsolationChecks: a non-JWT key used as a user token is rejected, not silently treated as anonymous', async () => {
  const { fetchImpl, callCount } = mockFetch([])
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB: nonJwtToken })
  assert.equal(result.ok, false)
  assert.deepEqual(result.checks.map((c) => c.name), ['tokens-are-authenticated-role'])
  assert.match(result.checks[0].note ?? '', /unparseable/)
  assert.equal(callCount(), 0)
})

test('runIsolationChecks: a service-role apikey is rejected before any network call', async () => {
  const { fetchImpl, callCount } = mockFetch([])
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey: serviceRoleToken, tokenA, tokenB })
  assert.equal(result.ok, false)
  assert.deepEqual(result.checks.map((c) => c.name), ['tokens-are-authenticated-role', 'apikey-is-not-privileged'])
  assert.equal(callCount(), 0)
})

test('runIsolationChecks: same token for both accounts aborts before any mutation', async () => {
  const { fetchImpl, callCount } = mockFetch([
    { status: 200, body: { id: aId }, expectMethod: 'GET', expectPathIncludes: '/auth/v1/user' },
    { status: 200, body: { id: aId }, expectMethod: 'GET', expectPathIncludes: '/auth/v1/user' },
  ])
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB: tokenA })
  assert.equal(result.ok, false)
  assert.deepEqual(result.checks.map((c) => c.name), ['tokens-are-authenticated-role', 'distinct-test-accounts'])
  assert.equal(callCount(), 2)
})

test('runIsolationChecks: detects a broken policy that lets account B read account A data', async () => {
  const steps = happyPathSteps()
  // Simulate the bug: B's read returns the row instead of an empty array.
  steps[7] = { ...steps[7], body: [{ id: resumeId, revision: 2 }] }
  const { fetchImpl } = mockFetch(steps)
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB })
  assert.equal(result.ok, false)
  const failed = result.checks.filter((c) => !c.pass).map((c) => c.name)
  assert.deepEqual(failed, ['other-account-cannot-read'])
})

test('runIsolationChecks: an unexpected 500 on a denial check fails the check instead of a false-positive pass', async () => {
  const steps = happyPathSteps()
  // Simulate a broken/erroring backend: B's read 500s instead of returning
  // 200 + []. Before the fix, `Array.isArray(json) ? json : []` would treat
  // the unparseable error body as an empty array and mark this a PASS.
  steps[7] = { status: 500, body: { message: 'internal server error' } }
  const { fetchImpl } = mockFetch(steps)
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB })
  assert.equal(result.ok, false)
  const check = result.checks.find((c) => c.name === 'other-account-cannot-read')
  assert.equal(check?.pass, false)
  assert.equal(check?.status, 500)
})

test('runIsolationChecks: a forged-owner insert that returns 200 with no code is not falsely accepted as rejected', async () => {
  const steps = happyPathSteps()
  // Simulate a non-RLS failure shape: wrong status/no error code at all,
  // rather than the genuine 403/42501 an RLS WITH CHECK violation produces.
  steps[2] = { status: 200, body: [] }
  const { fetchImpl } = mockFetch(steps)
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB })
  assert.equal(result.ok, false)
  const check = result.checks.find((c) => c.name === 'forged-owner-insert-rejected')
  assert.equal(check?.pass, false)
})

test('runIsolationChecks: a forged-owner insert that succeeds is reported as a failure and still cleaned up', async () => {
  const forgedId = '44444444-4444-4444-4444-444444444444'
  const steps = happyPathSteps()
  // Simulate the bug: B's forged-owner insert succeeds and returns a row.
  steps[2] = { ...steps[2], status: 201, body: [{ id: forgedId, revision: 1 }] }
  // Final cleanup must now target both the legitimate fixture and the residue.
  steps[15] = { status: 200, body: [{ id: resumeId }, { id: forgedId }], expectMethod: 'DELETE', expectBearer: tokenA }
  const { fetchImpl } = mockFetch(steps)
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB })
  assert.equal(result.ok, false)
  const forgedCheck = result.checks.find((c) => c.name === 'forged-owner-insert-rejected')
  assert.equal(forgedCheck?.pass, false)
  const cleanup = result.checks.find((c) => c.name === 'cleanup-fixture-removed')
  assert.equal(cleanup?.pass, true)
})

test('runIsolationChecks: a cleanup that returns 200 but misses an id is reported as a failed cleanup, and flips overall ok', async () => {
  const steps = happyPathSteps()
  // Simulate a partial-cleanup bug: HTTP 200 but only one of the (in this
  // case, only) fixture id actually came back deleted.
  steps[15] = { status: 200, body: [], expectMethod: 'DELETE', expectBearer: tokenA }
  const { fetchImpl } = mockFetch(steps)
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB })
  const cleanup = result.checks.find((c) => c.name === 'cleanup-fixture-removed')
  assert.equal(cleanup?.pass, false)
  // Every acceptance check itself passed; only cleanup failed — this must
  // still flip the overall result, since `ok` is now computed after cleanup.
  assert.ok(result.checks.filter((c) => c.name !== 'cleanup-fixture-removed').every((c) => c.pass))
  assert.equal(result.ok, false)
})

test('runIsolationChecks: fixture creation failure skips dependent checks instead of throwing', async () => {
  const steps = happyPathSteps().slice(0, 4)
  steps[3] = { status: 403, body: { message: 'denied' }, expectMethod: 'POST', expectPathIncludes: '/rest/v1/resumes', expectBearer: tokenA }
  const { fetchImpl, callCount } = mockFetch(steps)
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB })
  assert.equal(result.ok, false)
  assert.equal(result.checks.find((c) => c.name === 'owner-creates-own')?.pass, false)
  const skipped = result.checks.find((c) => c.name === 'owner-reads-own')
  assert.equal(skipped?.pass, false)
  assert.match(skipped?.note ?? '', /skipped/)
  // No cleanup call: nothing was created (the forged-owner attempt was rejected).
  assert.equal(callCount(), 4)
})

test('runIsolationChecks: an unexpected thrown error mid-run is reported as a failed check and cleanup still runs', async () => {
  const steps = happyPathSteps()
  let i = 0
  const fetchImpl = async (url: string, opts: { method?: string }) => {
    const step = steps[i]
    i += 1
    // Simulate a network-level failure (not an HTTP error response) on the
    // owner-reads-own call (step index 4).
    if (i === 5) throw new Error('simulated network failure')
    const ok = step.status >= 200 && step.status < 300
    return { status: step.status, ok, text: async () => JSON.stringify(step.body ?? (ok ? [] : { message: 'error' })) }
  }
  const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB })
  assert.equal(result.ok, false)
  const errorCheck = result.checks.find((c) => c.name === 'unexpected-error')
  assert.equal(errorCheck?.pass, false)
  assert.match(errorCheck?.note ?? '', /simulated network failure/)
  // Cleanup must still have been attempted for the fixture created before the throw.
  const cleanup = result.checks.find((c) => c.name === 'cleanup-fixture-removed')
  assert.ok(cleanup, 'cleanup must still run after an unexpected error')
})

test('hosted anon table privilege denial is valid, unrelated unauthorized errors are not', async () => {
  for (const code of ['42501', 'PGRST301']) {
    const steps = happyPathSteps()
    steps[12] = { ...steps[12], status: 401, body: { code } }
    const { fetchImpl } = mockFetch(steps)
    const result = await runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB })
    assert.equal(result.ok, code === '42501')
  }
})
