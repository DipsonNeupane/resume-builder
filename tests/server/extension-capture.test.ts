import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCapture } from '../../server/jobs/capture.ts'
import { isJobCapture } from '../../apps/extension/src/lib/capture.ts'
import { accountDependencies, jobsAccount, savedJobSnapshot } from '../../server/jobs/account.ts'

const capture = { title: 'Support specialist', company: 'Example', description: 'Required: customer support.', sourceUrl: 'https://jobs.example/one', capturedAt: '2026-09-24T00:00:00Z', site: 'jsonld' as const, original: { title: 'Support specialist', company: 'Example', description: 'Original requirements.' } }
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const savedId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const evidence = { headline: 'Support specialist', summary: 'Customer support', skills: 'Support', roles: [], qualifications: [] }
const env = { APP_ORIGIN: 'https://resumestride.com', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'test-only' }
const request = (body: unknown) => new Request('https://resumestride.com/api/jobs-account', { method: 'POST', headers: { origin: env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('capture contract rejects URL credentials/tracking/protocols, unknown fields, malformed metadata and hard overflow', () => {
  assert.equal(isJobCapture(capture), true)
  for (const change of [
    { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:secret@example.com/job' },
    { sourceUrl: 'https://example.com/job?token=private' }, { sourceUrl: 'https://example.com/job#private' },
    { description: 'x'.repeat(12001) }, { title: 'x'.repeat(301) }, { description: 'bad\u0000' },
    { capturedAt: 'invalid' }, { capturedAt: '2026-02-30T00:00:00Z' }, { site: 'techmap' }, { authToken: 'private' },
    { original: { ...capture.original, description: 'x'.repeat(12001) } },
    { salary: { min: 10, max: 1, currency: 'USD', period: 'hour' } }, { salary: { min: 0, max: Infinity, currency: 'USD', period: 'year' } },
  ]) assert.equal(isJobCapture({ ...capture, ...change }), false, JSON.stringify(change).slice(0,100))
  assert.equal(isJobCapture({ ...capture, description: '界'.repeat(12000) }), true)
})

test('normalization preserves original/reviewed text, honest source, unknown expiry, and stable URL identity across edits', () => {
  const normalized = normalizeCapture(capture)
  assert.equal(normalized.provider, 'extension')
  assert.equal(normalized.source, 'extension:jsonld')
  assert.deepEqual(normalized.capture, capture)
  assert.equal(normalized.expiry.source, 'unknown')
  assert.equal(normalized.workplace.value, 'unknown')
  assert.equal(normalized.salary, null)
  assert.equal(normalized.providerJobId, normalizeCapture({ ...capture, title: 'Edited', sourceUrl: capture.sourceUrl + '/' }).providerJobId)
  assert.throws(() => normalizeCapture({ ...capture, sourceUrl: 'http://localhost/job' }), { status: 400 })
  assert.throws(() => normalizeCapture({ ...capture, title: '' }), { status: 400 })
})

test('capture save uses authenticated ownership, existing quota save, account context and authoritative duplicate snapshot for match', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const snapshot = savedJobSnapshot({ ...normalizeCapture(capture), provider: 'techmap', providerJobId: 'existing', id: 'techmap:existing', descriptionText: 'Required: Spanish.' }, { label: 'good', reasons: [] })
  const deps = { ...accountDependencies, authenticate: async () => owner,
    serviceDatabase: (() => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'jobs_match_context') return { data: { criteria: { title: 'Support' }, clarifications: {} }, error: null }
      if (name === 'jobs_save') return { data: { savedJobId: savedId, alreadySaved: true }, error: null }
      if (name === 'jobs_saved_match_inputs') return { data: { snapshot, criteria: { title: 'Support' }, clarifications: {}, isPro: false }, error: null }
      if (name === 'jobs_replace_match_analysis') return { data: true, error: null }
      throw new Error(`Unexpected RPC ${name}`)
    } })) as unknown as typeof accountDependencies.serviceDatabase }
  const response = await jobsAccount(request({ action: 'capture_save', capture, evidence, owner: 'attacker' }), env, deps)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { savedJobId: savedId, alreadySaved: true })
  assert.ok(calls.every(call => call.args.p_owner === owner))
  const saved = calls.find(call => call.name === 'jobs_save')!.args.p_job as Record<string, unknown>
  assert.equal(saved.provider, 'extension')
  assert.deepEqual(saved.capture, capture)
  const analysis = calls.find(call => call.name === 'jobs_replace_match_analysis')!.args.p_analysis as { requirements: unknown[]; jobHash: string }
  assert.match(JSON.stringify(analysis), /Spanish/)
  assert.doesNotMatch(JSON.stringify(analysis), /Original requirements/)
  assert.equal(calls.some(call => call.name === 'job_resume_version_create'), false)
})

test('capture quota failures and kill switch preserve existing policy without creating a resume or calling a provider', async () => {
  let calls = 0
  const deps = { ...accountDependencies, authenticate: async () => owner,
    serviceDatabase: (() => ({ rpc: async (name: string) => {
      calls++
      return name === 'jobs_match_context' ? { data: { clarifications: {} }, error: null } : { data: null, error: { message: 'Free saved-job limit reached' } }
    } })) as unknown as typeof accountDependencies.serviceDatabase }
  assert.equal((await jobsAccount(request({ action: 'capture_save', capture, evidence }), { ...env, EXTENSION_CAPTURE_ENABLED: 'false' }, deps)).status, 503)
  assert.equal(calls, 0)
  assert.equal((await jobsAccount(request({ action: 'capture_save', capture, evidence }), env, deps)).status, 403)
  assert.equal(calls, 2)
  assert.equal((await jobsAccount(request({ action: 'capture_save', capture }), env, deps)).status, 400)
})
