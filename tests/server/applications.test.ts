import test from 'node:test'
import assert from 'node:assert/strict'
import { accountDependencies, jobsAccount, parseSavedJobSnapshot } from '../../server/jobs/account.ts'
import { classifyImportRows, manualSnapshot, normalizePastedJobUrl } from '../../server/jobs/applications.ts'
import { parseApplicationInput, parseApplicationPatch, sourceIdentity } from '../../src/lib/applications.ts'

const owner = '11111111-1111-1111-1111-111111111111'
const savedJobId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const env = { APP_ORIGIN: 'https://apwico.com', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'secret' }
const request = (body: unknown) => new Request('https://apwico.com/api/jobs-account', { method: 'POST', headers: { origin: env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) })
function fixture(handler: (name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }) {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const deps = { ...accountDependencies, authenticate: async () => owner,
    serviceDatabase: (() => ({ rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return handler(name, args) } })) as unknown as typeof accountDependencies.serviceDatabase }
  return { deps, calls }
}
const row = (overrides: Record<string, unknown> = {}) => ({ savedJobId, stage: 'saved', closedReason: null, priorStage: null, appliedOn: null, nextAction: '', nextActionDue: null,
  notes: '', contactName: '', contactDetails: '', origin: 'user', revision: 1, createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z', events: [], documents: [], ...overrides })

test('quick add needs only company, role and stage, and the owner comes from the token', async () => {
  const { deps, calls } = fixture(() => ({ data: { savedJobId, alreadySaved: false }, error: null }))
  const response = await jobsAccount(request({ action: 'application_create', owner: 'forged', application: { company: 'Example Company', title: 'Support specialist', stage: 'saved' } }), env, deps)
  assert.equal(response.status, 200)
  assert.equal(calls[0].name, 'applications_create')
  assert.equal(calls[0].args.p_owner, owner)
  assert.equal(calls[0].args.p_origin, 'user')
  const job = calls[0].args.p_job as Record<string, unknown>
  assert.equal(job.provider, 'manual')
  assert.equal(job.sourceUrl, null)
  assert.deepEqual(parseSavedJobSnapshot(job), job, 'manual snapshot satisfies the shared saved-job validator')
})

test('pasted URLs are validated and normalized without any server fetch', async () => {
  assert.equal(normalizePastedJobUrl('https://boards.greenhouse.io/acme/jobs/123?gh_jid=123&utm_source=x'), 'https://boards.greenhouse.io/acme/jobs/123?gh_jid=123')
  assert.equal(normalizePastedJobUrl('https://www.linkedin.com/jobs/view/support-specialist-4012345678/?trk=abc'), 'https://www.linkedin.com/jobs/view/4012345678/')
  for (const unsafe of ['http://jobs.acme.com/1', 'https://user:pw@jobs.acme.com/1', 'https://10.0.0.5/jobs', 'https://localhost/jobs', 'https://jobs.acme.com:8443/1', 'https://intranet/jobs', 'javascript:alert(1)', 'https://[::1]/x']) {
    assert.equal(normalizePastedJobUrl(unsafe), null, unsafe)
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() => { throw new Error('server must not fetch pasted URLs') }) as typeof fetch
  try {
    const { deps } = fixture(() => ({ data: { savedJobId, alreadySaved: false }, error: null }))
    const unsupported = await jobsAccount(request({ action: 'application_create', application: { company: 'Acme', title: 'Analyst', stage: 'saved', sourceUrl: 'https://careers.acme.com/openings/77' } }), env, deps)
    assert.equal(unsupported.status, 200, 'an unsupported but public URL is kept for manual completion')
    const rejected = await jobsAccount(request({ action: 'application_create', application: { company: 'Acme', title: 'Analyst', stage: 'saved', sourceUrl: 'https://192.168.1.1/job' } }), env, deps)
    assert.equal(rejected.status, 400)
  } finally { globalThis.fetch = originalFetch }
})

test('stage updates are validated before the database and conflicts are recoverable', async () => {
  assert.throws(() => parseApplicationPatch({ stage: 'closed' }), /why this application is closed/)
  assert.throws(() => parseApplicationPatch({ stage: 'rejected' }), /valid stage/)
  assert.deepEqual(parseApplicationPatch({ stage: 'closed', closedReason: 'no_response' }), { stage: 'closed', closedReason: 'no_response' })
  const ok = fixture(() => ({ data: row({ stage: 'interviewing', revision: 2 }), error: null }))
  const response = await jobsAccount(request({ action: 'application_update', savedJobId, expectedRevision: 1, patch: { stage: 'interviewing' } }), env, ok.deps)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).application.stage, 'interviewing')
  assert.deepEqual(ok.calls[0].args, { p_owner: owner, p_saved_job: savedJobId, p_expected_revision: 1, p_fields: { stage: 'interviewing' } })
  const conflict = fixture(() => ({ data: null, error: { message: 'Application conflict' } }))
  const stale = await jobsAccount(request({ action: 'application_update', savedJobId, expectedRevision: 1, patch: { stage: 'offer' } }), env, conflict.deps)
  assert.equal(stale.status, 409)
  assert.match((await stale.json()).error, /another tab/)
})

test('Free cap refusal explains the limit without deleting or hiding records', async () => {
  const { deps } = fixture(() => ({ data: null, error: { message: 'Free application limit reached' } }))
  const response = await jobsAccount(request({ action: 'application_create', application: { company: 'Acme', title: 'Analyst', stage: 'saved' } }), env, deps)
  assert.equal(response.status, 403)
  assert.match((await response.json()).error, /up to 100 applications\. Every existing record stays available/)
})

test('import preview separates invalid rows, URL duplicates and possible duplicates', () => {
  const existing = [{ savedJobId, sourceIdentity: sourceIdentity('https://careers.acme.com/openings/77'), company: 'Acme', title: 'Analyst' }]
  const { results } = classifyImportRows([
    { company: 'Acme', title: 'Analyst', stage: 'applied', appliedOn: '2026-10-01' },
    { company: 'Beta', title: 'Designer', sourceUrl: 'https://careers.acme.com/openings/77?utm_campaign=x' },
    { company: 'Gamma', title: 'Writer', stage: 'interview' },
    { company: 'Delta', title: 'Nurse', sourceUrl: 'https://delta.health/jobs/9' },
    { company: 'Epsilon', title: 'Nurse', sourceUrl: 'https://delta.health/jobs/9/' },
    { company: '', title: 'No company' },
  ], existing)
  assert.deepEqual(results.map(item => item.status), ['possible_duplicate', 'duplicate', 'invalid', 'ready', 'duplicate', 'invalid'])
})

test('import commits only reviewed rows, with import origin and per-row errors', async () => {
  let created = 0
  const { deps, calls } = fixture(name => {
    if (name === 'applications_identities') return { data: [{ savedJobId, sourceIdentity: null, company: 'Acme', title: 'Analyst' }], error: null }
    created += 1
    return created === 2 ? { data: null, error: { message: 'Free application limit reached' } } : { data: { savedJobId, alreadySaved: false }, error: null }
  })
  const response = await jobsAccount(request({ action: 'application_import', rows: [
    { company: 'Acme', title: 'Analyst' }, { company: 'Acme', title: 'Analyst' }, { company: 'Beta', title: 'Designer' }, { company: 'Gamma', title: 'Writer' },
  ], keepPossibleDuplicates: [2] }), env, deps)
  const body = await response.json()
  assert.deepEqual(body.rows.map((item: { status: string }) => item.status), ['skipped', 'created', 'failed', 'created'])
  assert.match(body.rows[2].message, /Free limit of 100/)
  assert.ok(calls.filter(call => call.name === 'applications_create').every(call => call.args.p_origin === 'import' && call.args.p_owner === owner))
  const tooMany = await jobsAccount(request({ action: 'application_import', rows: Array.from({ length: 201 }, () => ({ company: 'A', title: 'B' })) }), env, deps)
  assert.equal(tooMany.status, 400)
})

test('only an explicit confirmation records applied, optionally binding the exported document', async () => {
  const { deps, calls } = fixture(() => ({ data: row({ stage: 'applied', appliedOn: '2026-10-27', revision: 3 }), error: null }))
  const documentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const response = await jobsAccount(request({ action: 'application_confirm_submitted', savedJobId, expectedRevision: 2, documentId, appliedOn: '2026-10-27' }), env, deps)
  assert.equal(response.status, 200)
  assert.deepEqual(calls[0], { name: 'applications_confirm_submitted', args: { p_owner: owner, p_saved_job: savedJobId, p_expected_revision: 2, p_document: documentId, p_applied_on: '2026-10-27' } })
})

test('input validation bounds every field and never accepts future applied dates', () => {
  const now = new Date('2026-10-27T12:00:00Z')
  assert.throws(() => parseApplicationInput({ company: 'A', title: 'B', appliedOn: '2026-12-01' }, now), /not in the future/)
  assert.throws(() => parseApplicationInput({ company: 'A', title: 'B', appliedOn: '2026-02-30' }, now), /real date/)
  assert.throws(() => parseApplicationInput({ company: 'A'.repeat(301), title: 'B' }, now), /company/)
  assert.throws(() => parseApplicationInput({ company: 'A', title: 'B', nextActionDue: '2026-11-01T00:00:00Z' }, now), /next action/i)
  assert.throws(() => parseApplicationInput({ company: 'A', title: 'B', salary: { min: 10, max: 5, currency: 'USD', period: 'year' } }, now), /Salary/)
  const parsed = parseApplicationInput({ company: ' Acme ', title: 'Analyst', stage: 'closed' }, now)
  assert.equal(parsed.company, 'Acme')
  assert.equal(parsed.closedReason, 'other')
  const snap = manualSnapshot(parsed, now, '22222222-2222-4222-8222-222222222222')
  assert.equal(snap.id, 'manual:22222222-2222-4222-8222-222222222222')
  assert.equal(snap.location.source, 'unknown', 'missing location stays unknown')
})

test('application records: the stored "no edits" default `{}` never reaches the UI as a partial edits object', async () => {
  const { parseApplicationRecord } = await import('../../src/lib/applications.ts')
  const base = { savedJobId: '11111111-1111-4111-8111-111111111111', stage: 'preparing', closedReason: null, priorStage: 'saved', appliedOn: null, nextAction: '', nextActionDue: null,
    notes: '', contactName: '', contactDetails: '', origin: 'user', revision: 2, createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z', events: [], documents: [] }
  assert.equal(parseApplicationRecord({ ...base, requirementEdits: {} })?.requirementEdits, undefined)
  assert.equal(parseApplicationRecord({ ...base, requirementEdits: { removed: 'x' } })?.requirementEdits, undefined)
  const edits = { removed: ['a'.repeat(16)], categories: {}, added: [{ id: 'b'.repeat(16), text: 'Weekend availability', category: 'required' }] }
  assert.deepEqual(parseApplicationRecord({ ...base, requirementEdits: edits })?.requirementEdits, edits)
})
