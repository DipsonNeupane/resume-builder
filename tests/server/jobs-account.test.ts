import test from 'node:test'
import assert from 'node:assert/strict'
import { accountDependencies, jobsAccount, parseSavedJobSnapshot, resumeFingerprint, savedJobSnapshot } from '../../server/jobs/account.ts'
import { analyzeJob } from '../../server/jobs/match.ts'
import { HttpError } from '../../server/http/security.ts'
import type { NormalizedJob } from '../../server/jobs/types.ts'
import { blank } from '../../src/model.ts'

const owner = '11111111-1111-1111-1111-111111111111'
const env = { APP_ORIGIN: 'https://apwico.com', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'secret' }

function request(body: unknown, origin = env.APP_ORIGIN): Request {
  return new Request('https://apwico.com/api/jobs-account', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

const job: NormalizedJob = {
  id: 'techmap:one', provider: 'techmap', providerJobId: 'one', title: 'Engineer', company: 'Example',
  location: { value: { city: 'Nairobi', region: null, country: 'KE' }, source: 'provider', confidence: 'medium' },
  workplace: { value: 'remote', source: 'provider', confidence: 'high' },
  employmentType: { value: 'full_time', source: 'provider', confidence: 'high' },
  salary: null, descriptionText: 'Build reliable services.', postedAt: null,
  expiry: { expiresAt: null, isLikelyExpired: false, source: 'unknown', confidence: 'low' },
  directness: { value: null, source: 'unknown', confidence: 'low' }, sourceUrl: 'https://jobs.example/one',
  portal: 'example', source: 'employer', dedupeKey: 'a'.repeat(64), retrievedAt: '2026-09-24T00:00:00.000Z',
}
const snapshot = savedJobSnapshot(job, { label: 'good', reasons: ['Relevant title.'] })
const savedJobId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const evidence = { headline: 'Engineer', summary: 'Builds services', skills: 'TypeScript', roles: [], qualifications: [] }
const analyzedJob = { ...job, descriptionText: 'Required: TypeScript.\nPreferred: PostgreSQL.' }
const analyzedSnapshot = savedJobSnapshot(analyzedJob, { label: 'good', reasons: ['Relevant title.'] })
const persistedAnalysis = analyzeJob(evidence, analyzedJob, { title: 'Engineer' }).analysis

function fixture(handler: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>) {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const deps = {
    ...accountDependencies,
    authenticate: async () => owner,
    serviceDatabase: (() => ({ rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return handler(name, args) } })) as unknown as typeof accountDependencies.serviceDatabase,
  }
  return { deps, calls }
}

test('builds and validates a bounded normalized snapshot with provenance', () => {
  assert.deepEqual(parseSavedJobSnapshot(snapshot), snapshot)
  assert.throws(() => parseSavedJobSnapshot({ ...snapshot, sourceUrl: 'javascript:alert(1)' }), { status: 400 })
  assert.throws(() => parseSavedJobSnapshot({ ...snapshot, dedupeKey: 'browser-made-key' }), { status: 400 })
})

test('loads only the authenticated owner account snapshot and ignores browser ownership fields', async () => {
  const expected = { isPro: false, saveLimit: 3, savedJobs: [], preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null } }
  const { deps, calls } = fixture(async name => ({ data: ['job_resume_versions_list','jobs_workflow_list','product_outcome_reports_list'].includes(name) ? [] : name === 'jobs_auto_refresh_result' ? null : expected, error: null }))
  const response = await jobsAccount(request({ action: 'load', owner: 'attacker-controlled' }), env, deps)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ...expected, jobResumeVersions: [], jobWorkflows: [], outcomeReports: [], autoRefreshResult: null })
  assert.deepEqual(calls, [
    { name: 'jobs_account_snapshot', args: { p_owner: owner } },
    { name: 'job_resume_versions_list', args: { p_owner: owner } },
    { name: 'jobs_workflow_list', args: { p_owner: owner } },
    { name: 'product_outcome_reports_list', args: { p_owner: owner } },
    { name: 'jobs_auto_refresh_result', args: { p_owner: owner } },
  ])
})

test('account reload reconstructs Pro depth from persisted analysis while Free reload omits it', async () => {
  for (const isPro of [true, false]) {
    const stored = { id: savedJobId, snapshot: analyzedSnapshot, providerAvailable: true, availabilityCheckedAt: '2026-09-24T00:00:00Z', unavailableAt: null, savedAt: '2026-09-24T00:00:00Z', matchAnalysis: persistedAnalysis, analysisCurrent: true, analysisInvalidationReason: null }
    const { deps } = fixture(async name => ({ data: ['job_resume_versions_list','jobs_workflow_list','product_outcome_reports_list'].includes(name) ? [] : { isPro, saveLimit: isPro ? 10000 : 3, savedJobs: [stored], preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null } }, error: null }))
    const response = await jobsAccount(request({ action: 'load', evidence }), env, deps)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.savedJobs[0].matchAnalysis.additionalAreasAnalyzed, isPro ? 2 : 1)
    if (isPro) assert.equal(body.savedJobs[0].matchAnalysis.fullAnalysis.requirements.length, 2)
    else {
      assert.equal(body.savedJobs[0].matchAnalysis.fullAnalysis, undefined)
      assert.equal(body.savedJobs[0].matchAnalysis.limitedAnalysis.requirements.length, 1)
    }
  }
})

test('creates one account-owned job resume only when tailoring begins and never trusts browser ownership', async () => {
  const resume = blank()
  const row = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', owner_id: owner, saved_job_id: savedJobId,
    job_snapshot: analyzedSnapshot, source_master_resume_id: null, source_master_revision: null,
    source_master_fingerprint: 'f'.repeat(64), data: resume, revision: 1,
    created_at: '2026-09-24T00:00:00Z', updated_at: '2026-09-24T00:00:00Z',
  }
  const { deps, calls } = fixture(async name => {
    if (name === 'job_resume_master') return { data: null, error: null }
    if (name === 'job_resume_version_create') return { data: { created: true, version: row }, error: null }
    return { data: null, error: { message: `unexpected ${name}` } }
  })
  const response = await jobsAccount(request({ action: 'create_job_resume', savedJobId, resume, owner: 'attacker' }), env, deps)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).version.savedJobId, savedJobId)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].args.p_owner, owner)
  assert.equal(calls[1].args.p_saved_job, savedJobId)
  assert.deepEqual(calls[1].args.p_data, resume)
  assert.match(String(calls[1].args.p_fingerprint), /^[0-9a-f]{64}$/)
})

test('maps the server-side pursue-decision gate without creating a job-specific resume', async () => {
  const blocked = fixture(async name => name === 'job_resume_master'
    ? { data: null, error: null }
    : { data: null, error: { message: 'Pursue decision required' } })
  const response = await jobsAccount(request({ action: 'create_job_resume', savedJobId, resume: blank() }), env, blocked.deps)
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /Choose Pursue/i)
})

test('cloud-backed master is authoritative when a browser starts a job-specific version', async () => {
  const browserResume = blank()
  const cloudResume = { ...blank(), name: 'Cloud master' }
  const row = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', owner_id: owner, saved_job_id: savedJobId,
    job_snapshot: analyzedSnapshot, source_master_resume_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', source_master_revision: 7,
    source_master_fingerprint: 'f'.repeat(64), data: cloudResume, revision: 1,
    created_at: '2026-09-24T00:00:00Z', updated_at: '2026-09-24T00:00:00Z',
  }
  const { deps, calls } = fixture(async name => name === 'job_resume_master'
    ? { data: { id: row.source_master_resume_id, revision: 7, data: cloudResume }, error: null }
    : { data: { created: true, version: row }, error: null })
  const response = await jobsAccount(request({ action: 'create_job_resume', savedJobId, resume: browserResume }), env, deps)
  assert.equal(response.status, 200)
  assert.deepEqual(calls[1].args.p_data, cloudResume)
  assert.notEqual(calls[1].args.p_fingerprint, resumeFingerprint(browserResume))
})

test('preserves optimistic conflict protection for manual and accepted-suggestion job-resume writes', async () => {
  const resume = blank()
  const conflict = fixture(async () => ({ data: null, error: { message: 'Job resume conflict' } }))
  const response = await jobsAccount(request({ action: 'update_job_resume', versionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', expectedRevision: 4, resume }), env, conflict.deps)
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /not overwritten/i)
  assert.equal(conflict.calls[0].args.p_owner, owner)
  assert.equal(conflict.calls[0].args.p_expected_revision, 4)
})

test('allows an existing job resume to load after Pro expires', async () => {
  const resume = blank()
  const row = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', owner_id: owner, saved_job_id: savedJobId,
    job_snapshot: analyzedSnapshot, source_master_resume_id: null, source_master_revision: null,
    source_master_fingerprint: 'f'.repeat(64), data: resume, revision: 2,
    created_at: '2026-09-24T00:00:00Z', updated_at: '2026-09-24T01:00:00Z',
  }
  const { deps } = fixture(async () => ({ data: row, error: null }))
  const response = await jobsAccount(request({ action: 'get_job_resume', versionId: row.id }), env, deps)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).version.revision, 2)
})

test('saves the validated snapshot and maps the Free ceiling to truthful upgrade copy', async () => {
  const success = fixture(async () => ({ data: { savedJobId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', alreadySaved: false }, error: null }))
  const response = await jobsAccount(request({ action: 'save', job: snapshot, owner: 'forged' }), env, success.deps)
  assert.equal(response.status, 200)
  assert.equal(success.calls[0].args.p_owner, owner)
  assert.deepEqual(success.calls[0].args.p_job, snapshot)

  const limited = fixture(async () => ({ data: null, error: { message: 'Free saved-job limit reached' } }))
  const blocked = await jobsAccount(request({ action: 'save', job: snapshot }), env, limited.deps)
  assert.equal(blocked.status, 403)
  assert.match((await blocked.json()).error, /existing saved jobs are kept/i)
})

test('persists bounded preferences and explicit Auto Refresh opt-out', async () => {
  const { deps, calls } = fixture(async () => ({ data: null, error: null }))
  const response = await jobsAccount(request({ action: 'preferences', criteria: { title: 'Nurse', countryCode: 'GB' }, autoRefresh: false }), env, deps)
  assert.equal(response.status, 200)
  assert.deepEqual(calls[0], { name: 'jobs_set_preferences_v2', args: { p_owner: owner, p_criteria: { title: 'Nurse', countryCode: 'GB' }, p_auto_refresh: false, p_evidence: null } })
})

test('Auto Refresh opt-in stores only validated non-contact evidence and cannot be enabled without it', async () => {
  const { deps, calls } = fixture(async () => ({ data: true, error: null }))
  const response = await jobsAccount(request({ action:'preferences', criteria:{title:'Engineer'}, autoRefresh:true,
    evidence:{ headline:'Engineer', summary:'Builds systems', skills:'TypeScript', roles:[], qualifications:[], email:'must-not-store@example.com' } }),env,deps)
  assert.equal(response.status,200)
  assert.deepEqual(calls[0],{name:'jobs_set_preferences_v2',args:{p_owner:owner,p_criteria:{title:'Engineer'},p_auto_refresh:true,
    p_evidence:{headline:'Engineer',summary:'Builds systems',skills:'TypeScript',roles:[],qualifications:[]}}})
  const missing=await jobsAccount(request({action:'preferences',criteria:{title:'Engineer'},autoRefresh:true}),env,deps)
  assert.equal(missing.status,400)
})

test('persists a manual owner-scoped application workflow with revision protection and no inferred submission', async () => {
  const workflow = {
    savedJobId, decision: 'pursue', applicationStatus: 'applied', notes: 'Follow up next week.',
    contactName: 'Hiring team', contactDetails: 'Recruiting inbox', reminderEnabled: true,
    reminderAt: '2099-10-02T15:00:00.000Z', revision: 2, updatedAt: '2026-09-30T15:00:00.000Z',
    history: [{ decision: 'pursue', applicationStatus: 'applied', changedAt: '2026-09-30T15:00:00.000Z' }],
  }
  const { deps, calls } = fixture(async name => name === 'jobs_workflow_upsert'
    ? { data: workflow, error: null }
    : { data: null, error: { message: `unexpected ${name}` } })
  const response = await jobsAccount(request({
    action: 'update_workflow', savedJobId, expectedRevision: 1, owner: 'forged', submittedAutomatically: true,
    workflow: { decision: 'pursue', applicationStatus: 'applied', notes: workflow.notes, contactName: workflow.contactName,
      contactDetails: workflow.contactDetails, reminderEnabled: true, reminderAt: workflow.reminderAt },
  }), env, deps)
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).workflow, workflow)
  assert.deepEqual(calls, [{ name: 'jobs_workflow_upsert', args: {
    p_owner: owner, p_saved_job: savedJobId, p_decision: 'pursue', p_application_status: 'applied',
    p_notes: workflow.notes, p_contact_name: workflow.contactName, p_contact_details: workflow.contactDetails,
    p_reminder_enabled: true, p_reminder_at: workflow.reminderAt, p_expected_revision: 1,
  } }])
})

test('rejects implicit reminders, oversized workflow content and stale revisions', async () => {
  const noCalls = fixture(async () => ({ data: null, error: null }))
  const base = { decision: 'review', applicationStatus: 'not_applied', notes: '', contactName: '', contactDetails: '', reminderEnabled: false, reminderAt: null }
  assert.equal((await jobsAccount(request({ action: 'update_workflow', savedJobId, expectedRevision: 0, workflow: { ...base, reminderEnabled: true } }), env, noCalls.deps)).status, 400)
  assert.equal((await jobsAccount(request({ action: 'update_workflow', savedJobId, expectedRevision: 0, workflow: { ...base, notes: 'x'.repeat(4001) } }), env, noCalls.deps)).status, 400)
  assert.equal(noCalls.calls.length, 0)

  const conflict = fixture(async () => ({ data: null, error: { message: 'Job workflow conflict' } }))
  const response = await jobsAccount(request({ action: 'update_workflow', savedJobId, expectedRevision: 4, workflow: base }), env, conflict.deps)
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /another tab/i)
})

test('records only bounded owner-scoped evidence-review metadata', async () => {
  const { deps, calls } = fixture(async name => name === 'product_record_evidence_review'
    ? { data: { scope: 'limited', newlyRecorded: true }, error: null }
    : { data: null, error: { message: `unexpected ${name}` } })
  const jobKey = 'd'.repeat(64)
  const analysisKey = 'e'.repeat(64)
  const response = await jobsAccount(request({ action: 'record_evidence_review', jobKey, analysisKey, reviewScope: 'limited', owner: 'forged', jobText: 'must not persist' }), env, deps)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { recorded: true, reviewScope: 'limited', newlyRecorded: true })
  assert.deepEqual(calls, [{ name: 'product_record_evidence_review', args: { p_owner: owner, p_job_key: jobKey, p_analysis_key: analysisKey, p_scope: 'limited' } }])
  assert.equal((await jobsAccount(request({ action: 'record_evidence_review', jobKey: 'not-a-key', analysisKey, reviewScope: 'full' }), env, deps)).status, 400)
  assert.equal((await jobsAccount(request({ action: 'record_evidence_review', jobKey, analysisKey, reviewScope: 'preview' }), env, deps)).status, 400)
})

test('records only an explicitly consented, content-free self-reported outcome for the authenticated owner', async () => {
  const report = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', savedJobId, outcome: 'interview_received', provenance: 'self_reported',
    occurredOn: '2026-09-30', timeSavedBucket: '15_to_30_minutes', clarityRating: 4, confidenceRating: 3,
    consentVersion: 'outcomes-v1', consentedAt: '2026-09-30T16:00:00Z', methodologyVersion: 'outcomes-v1',
    reportedAt: '2026-09-30T16:00:00Z', updatedAt: '2026-09-30T16:00:00Z',
  }
  const { deps, calls } = fixture(async name => name === 'product_outcome_report'
    ? { data: report, error: null }
    : { data: null, error: { message: `unexpected ${name}` } })
  const response = await jobsAccount(request({ action:'report_outcome', savedJobId, owner:'forged', resumeText:'must not persist', jobUrl:'https://private.example', report:{ outcome:'interview_received', occurredOn:'2026-09-30', timeSavedBucket:'15_to_30_minutes', clarityRating:4, confidenceRating:3, consent:true, consentVersion:'outcomes-v1' } }),env,deps)
  assert.equal(response.status,200)
  assert.deepEqual((await response.json()).report,report)
  assert.deepEqual(calls,[{name:'product_outcome_report',args:{p_owner:owner,p_saved_job:savedJobId,p_outcome:'interview_received',p_occurred_on:'2026-09-30',p_time_saved_bucket:'15_to_30_minutes',p_clarity_rating:4,p_confidence_rating:3,p_consent:true,p_consent_version:'outcomes-v1'}}])
  assert.equal((await jobsAccount(request({action:'report_outcome',savedJobId,report:{outcome:'offer_received',occurredOn:null,timeSavedBucket:null,clarityRating:null,confidenceRating:null,consent:false,consentVersion:'outcomes-v1'}}),env,deps)).status,400)
})

test('recomputes versioned saved analysis server-side and persists explicit clarification for the authenticated owner', async () => {
  const { deps, calls } = fixture(async name => {
    if (name === 'jobs_match_context') return { data: { clarifications: {} }, error: null }
    return { data: { savedJobId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', alreadySaved: false }, error: null }
  })
  const response = await jobsAccount(request({ action: 'save', job: snapshot, evidence, criteria: { title: 'Engineer' }, analysis: { fabricated: true } }), env, deps)
  assert.equal(response.status, 200)
  const persisted = calls.find(call => call.name === 'jobs_save_v2')
  assert.equal(persisted?.args.p_owner, owner)
  assert.equal((persisted?.args.p_analysis as { version: number }).version, 2)
  assert.equal(JSON.stringify(persisted?.args.p_analysis).includes('fabricated'), false)
  assert.doesNotMatch(JSON.stringify(persisted?.args.p_analysis), /\d+%|probability/i)

  const clarification = await jobsAccount(request({ action: 'clarification', requirementId: '0123456789abcdef', value: 'not_have', owner: 'forged' }), env, deps)
  assert.equal(clarification.status, 200)
  assert.deepEqual(calls.at(-1), { name: 'jobs_set_match_clarification', args: { p_owner: owner, p_requirement_id: '0123456789abcdef', p_value: 'not_have' } })
})

test('manually refreshes stale saved analysis from the owner snapshot and current account context without a provider', async () => {
  const { deps, calls } = fixture(async name => {
    if (name === 'jobs_saved_match_inputs') return { data: { snapshot: analyzedSnapshot, criteria: { title: 'Engineer', workplace: 'remote' }, clarifications: {}, isPro: true }, error: null }
    if (name === 'jobs_replace_match_analysis') return { data: true, error: null }
    return { data: null, error: { message: `unexpected ${name}` } }
  })
  const response = await jobsAccount(request({ action: 'reanalyze', savedJobId, evidence, owner: 'forged', job: { fabricated: true } }), env, deps)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.matchAnalysis.fullAnalysis.requirements.length, 2)
  assert.ok(body.matchAnalysis.fullAnalysis.constraints.some((item: string) => /workplace preference/i.test(item)))
  assert.deepEqual(calls[0], { name: 'jobs_saved_match_inputs', args: { p_owner: owner, p_saved_job: savedJobId } })
  assert.equal(calls[1].args.p_owner, owner)
  assert.equal(calls[1].args.p_saved_job, savedJobId)
  assert.equal(JSON.stringify(calls[1].args).includes('fabricated'), false)
})

test('saving a clarification reanalyzes the affected saved job without a provider search', async () => {
  const baseline = analyzeJob({ ...evidence, skills: '' }, analyzedJob, { title: 'Engineer' })
  const requirementId = baseline.analysis.requirements[0].id
  const { deps, calls } = fixture(async (name, args) => {
    if (name === 'jobs_set_match_clarification') return { data: null, error: null }
    if (name === 'jobs_saved_match_inputs') return { data: { snapshot: analyzedSnapshot, criteria: { title: 'Engineer' }, clarifications: { [requirementId]: args.p_saved_job ? 'not_have' : 'not_have' }, isPro: false }, error: null }
    if (name === 'jobs_replace_match_analysis') return { data: true, error: null }
    return { data: null, error: { message: `unexpected ${name}` } }
  })
  const response = await jobsAccount(request({ action: 'clarification', requirementId, value: 'not_have', savedJobId, evidence: { ...evidence, skills: '' } }), env, deps)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.matchAnalysis.fullAnalysis, undefined)
  assert.match(body.matchAnalysis.importantWarning, /confirmed incompatibility/i)
  assert.deepEqual(calls.map(call => call.name), ['jobs_set_match_clarification', 'jobs_saved_match_inputs', 'jobs_replace_match_analysis'])
  assert.ok(calls.every(call => call.args.p_owner === owner))
})

test('rejects origin and auth failures before constructing the database client', async () => {
  let databaseTouched = false
  const deps = {
    ...accountDependencies,
    authenticate: async () => { throw new HttpError(401, 'Sign in required') },
    serviceDatabase: (() => { databaseTouched = true; throw new Error('must not run') }) as typeof accountDependencies.serviceDatabase,
  }
  assert.equal((await jobsAccount(request({ action: 'load' }, 'https://evil.example'), env, deps)).status, 403)
  assert.equal((await jobsAccount(request({ action: 'load' }), env, deps)).status, 401)
  assert.equal(databaseTouched, false)
})
