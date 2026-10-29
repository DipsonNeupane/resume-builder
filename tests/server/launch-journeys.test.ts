/** Connected launch journeys through the REAL server handlers and REAL SQL functions on a
 * fresh local PGlite database (every migration applied). Controlled fixtures replace only
 * what cannot run locally: the Techmap provider response, the OpenAI response and the
 * Supabase access-token check. Fictional people and employers only. This is fixture-based
 * coverage, not verification against a real provider or a hosted database. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { migratedDatabase, rpcClient } from './pgliteDatabase.ts'
import { jobsAccount } from '../../server/jobs/account.ts'
import { searchJobs, dependencies as searchDependencies } from '../../server/jobs/handler.ts'
import { resetJobsCacheForTests } from '../../server/jobs/cache.ts'
import { tailor } from '../../api/tailor.ts'
import { generateTailoringSuggestions } from '../../server/ai/tailoring.ts'
import { exportDocx } from '../../server/export/docx-handler.ts'
import { renderDocx } from '../../server/export/docx.ts'
import { applySuggestion } from '../../src/features/tailoring/applySuggestion.ts'
import { buildResumeEvidence } from '../../src/features/jobs/evidence.ts'
import { example, type Resume } from '../../src/model.ts'
import type { NormalizedJob } from '../../server/jobs/types.ts'

const FREE = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1'
const PRO = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2'
const env = {
  APP_ORIGIN: 'https://apwico.com', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  TECHMAP_API_KEY: 'x'.repeat(20), AI_ENABLED: 'true', OPENAI_API_KEY: 'sk-fixture', EXPORTS_ENABLED: 'true',
} as unknown as NodeJS.ProcessEnv

const POSTING = [
  'Customer Support Specialist at Fixture Outfitters.',
  'Requirements:',
  '- Experience supporting customers across email, phone and live chat.',
  '- Fluency in Spanish.',
  '- Experience with Zendesk.',
  'Preferred:',
  '- Experience helping new team members build product knowledge.',
].join('\n')

function providerJob(n: number, overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    id: `techmap:${n}`, provider: 'techmap', providerJobId: String(n), title: 'Customer Support Specialist', company: `Fixture Outfitters ${n}`,
    location: { value: { city: 'Leeds', region: null, country: 'GB' }, source: 'provider', confidence: 'high' },
    workplace: { value: 'remote', source: 'provider', confidence: 'high' },
    employmentType: { value: 'full_time', source: 'provider', confidence: 'high' },
    salary: null, descriptionText: POSTING, postedAt: null,
    expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
    directness: { value: null, source: 'unknown', confidence: 'low' },
    sourceUrl: `https://jobs.fixture.example/${n}`, portal: `portal-${n}`, source: 'employer', dedupeKey: String(n).repeat(64).slice(0, 64).replace(/[^0-9a-f]/g, 'a'), retrievedAt: '2026-10-27T00:00:00Z',
    ...overrides,
  }
}

async function setup() {
  resetJobsCacheForTests()
  const pg = await migratedDatabase()
  await pg.exec(`insert into auth.users(id, created_at) values ('${FREE}', now() - interval '1 day'),('${PRO}', now() - interval '1 day');
    insert into public.billing_entitlements(owner_id, paid_through) values ('${PRO}', now() + interval '20 days');`)
  const calls: string[] = []
  const db = rpcClient(pg, calls)
  let owner = FREE
  const as = (id: string) => { owner = id }
  const authenticate = async () => owner
  const serviceDatabase = (() => db) as never
  const post = (url: string, body: unknown) => new Request(`https://apwico.com${url}`, { method: 'POST', headers: { origin: 'https://apwico.com', 'content-type': 'application/json', authorization: 'Bearer fixture' }, body: JSON.stringify(body) })
  const account = async (body: Record<string, unknown>) => {
    const response = await jobsAccount(post('/api/jobs-account', body), env, { authenticate, serviceDatabase } as never)
    return { status: response.status, body: await response.json() as Record<string, unknown> }
  }
  return { pg, db, calls, as, authenticate, serviceDatabase, post, account }
}

/** A controlled provider response that quotes the source field and names issued ids. */
function providerFetch(suggestion: Record<string, unknown>): typeof fetch {
  return (async () => Response.json({ id: 'resp_fixture', model: 'gpt-fixture', status: 'completed', usage: { input_tokens: 400, output_tokens: 90 },
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ suggestions: [suggestion] }) }] }] })) as typeof fetch
}

test('Journey A: preferences → discovery → save → correct requirements → clarify → tailor (trial) → export exact version → confirm applied → retrieve submitted', { timeout: 120_000 }, async () => {
  const h = await setup()
  const master = example()
  const evidence = buildResumeEvidence(master)

  // 1. Preferences: soft (level, priorities) and hard (dealbreaker) kept apart.
  const criteria = { title: 'Customer Support Specialist', workplace: 'remote', experienceLevel: 'mid', priorities: ['flexibility', 'pay'], dealbreakers: ['onsite'] }
  const prefs = await h.account({ action: 'preferences', criteria, autoRefresh: false })
  assert.equal(prefs.status, 200, JSON.stringify(prefs.body))
  const loaded = await h.account({ action: 'load' })
  assert.deepEqual((loaded.body.preferences as { criteria: unknown }).criteria, criteria)

  // 2. Discovery from a controlled provider fixture; preferences reorder within a label.
  const candidates = [
    providerJob(1, { title: 'Senior Customer Support Specialist', workplace: { value: 'onsite', source: 'provider', confidence: 'high' } }),
    providerJob(2, { salary: { min: 30000, max: 34000, currency: 'GBP', period: 'year', confidence: 'high' } as never }),
    providerJob(3),
  ]
  const search = await searchJobs(h.post('/api/jobs-search', { criteria, evidence }), env, {
    ...searchDependencies, authenticate: h.authenticate, serviceDatabase: h.serviceDatabase,
    techmapSearch: (async () => ({ jobs: candidates, page: 1, hasMore: false })) as never, delay: async () => {},
  } as never)
  assert.equal(search.status, 200, await search.clone().text())
  const results = await search.json() as { jobs: { id: string; savedSnapshot: Record<string, unknown> }[] }
  assert.ok(results.jobs.length >= 2)
  assert.equal(results.jobs[0].id, 'techmap:2', 'remote + pay stated ranks first for a mid-level, flexibility+pay preference')
  assert.ok(results.jobs.findIndex(job => job.id === 'techmap:1') > results.jobs.findIndex(job => job.id === 'techmap:3'), 'senior on-site role ranks below an equivalent remote one')

  // 3. Save: one application record, saved stage; saving twice never duplicates.
  const chosen = results.jobs[0]
  const saved = await h.account({ action: 'save', job: chosen.savedSnapshot, evidence, criteria })
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  const savedJobId = saved.body.savedJobId as string
  assert.equal((await h.account({ action: 'save', job: chosen.savedSnapshot, evidence, criteria })).body.alreadySaved, true)
  let apps = (await h.account({ action: 'applications' })).body.applications as Record<string, unknown>[]
  assert.equal(apps.length, 1)
  assert.equal(apps[0].stage, 'saved')

  // 4. Review/correct requirements: remove one, reclassify one, add one (never assumed met).
  const reanalyzed = await h.account({ action: 'reanalyze', savedJobId, evidence })
  assert.equal(reanalyzed.status, 200, JSON.stringify(reanalyzed.body))
  const inputs = await h.db.rpc('jobs_saved_match_inputs', { p_owner: FREE, p_saved_job: savedJobId })
  assert.equal(inputs.error, null)
  const stored = (await h.pg.query<{ analysis: { requirements: { id: string; text: string }[] } }>(`select match_analysis as analysis from public.saved_jobs where id = $1`, [savedJobId])).rows[0].analysis
  const zendesk = stored.requirements.find(r => /Zendesk/.test(r.text))!
  const coaching = stored.requirements.find(r => /new team members/.test(r.text))!
  const spanish = stored.requirements.find(r => /Spanish/.test(r.text))!
  assert.ok(zendesk && coaching && spanish, 'shared extractor finds the posting requirements')
  const edited = await h.account({ action: 'requirement_edits', savedJobId, evidence, edits: {
    removed: [zendesk.id], categories: { [coaching.id]: 'required' }, added: [{ id: 'u-0000000000000001', text: 'Weekend availability', category: 'preferred' }],
  } })
  assert.equal(edited.status, 200, JSON.stringify(edited.body))
  const after = (await h.pg.query<{ analysis: { requirements: { id: string; text: string; category: string; status: string; origin?: string; originalCategory?: string }[] } }>(`select match_analysis as analysis from public.saved_jobs where id = $1`, [savedJobId])).rows[0].analysis.requirements
  assert.ok(!after.some(r => r.id === zendesk.id), 'removed requirement no longer counts')
  assert.deepEqual(after.find(r => r.id === coaching.id) && [after.find(r => r.id === coaching.id)!.category, after.find(r => r.id === coaching.id)!.originalCategory], ['required', 'preferred'])
  const added = after.find(r => r.text === 'Weekend availability')!
  assert.equal(added.origin, 'user'); assert.equal(added.status, 'not_demonstrated')

  // 5. Clarify evidence (account-scoped fact): the owner confirms they have it.
  const clarified = await h.account({ action: 'clarification', requirementId: added.id, value: 'demonstrated', savedJobId, evidence })
  assert.equal(clarified.status, 200, JSON.stringify(clarified.body))
  const confirmedFact = (await h.pg.query<{ analysis: { requirements: { id: string; status: string; evidence: string[] }[] } }>(`select match_analysis as analysis from public.saved_jobs where id = $1`, [savedJobId])).rows[0].analysis.requirements.find(r => r.id === added.id)!
  assert.deepEqual([confirmedFact.status, confirmedFact.evidence], ['demonstrated', ['Confirmed by you.']])

  // 6. Prepare: Free trial binds to this application and moves it to Preparing.
  const created = await h.account({ action: 'create_job_resume', savedJobId, resume: master })
  assert.equal(created.status, 200, JSON.stringify(created.body))
  const version = created.body.version as { id: string; revision: number; resume: Resume }
  apps = (await h.account({ action: 'applications' })).body.applications as Record<string, unknown>[]
  assert.equal(apps[0].stage, 'preparing')

  // 7. Tailor through the real route; the provider fixture targets an issued id and quotes the field.
  const requirementForTarget = after.find(r => /email, phone and live chat/.test(r.text))!
  const source = master.sections[0].entries[0].description
  const suggestion = { sectionId: 'experience', entryId: 'role1', field: 'description', originalText: source,
    suggestedText: source.replace('Support customers across email, phone, and live chat', 'Support customers by email, phone and live chat'),
    why: 'Uses the posting’s channel wording for experience already listed.', targetRequirementIds: [requirementForTarget.id], supportingQuotes: ['Support customers across email, phone, and live chat'] }
  const tailored = await tailor(h.post('/api/tailor', { consent: true, savedJobId, versionId: version.id, requestId: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a' }), env, {
    authenticate: h.authenticate, serviceDatabase: h.serviceDatabase,
    generateTailoringSuggestions: ((config, prereqs, resume, jobText, _fetch, match) => generateTailoringSuggestions(config, prereqs, resume, jobText, providerFetch(suggestion), match)) as typeof generateTailoringSuggestions,
  } as never)
  const tailoredBody = await tailored.json() as { suggestions: Record<string, unknown>[]; trial?: { runsRemaining: number } }
  assert.equal(tailored.status, 200, JSON.stringify(tailoredBody))
  const [traced] = tailoredBody.suggestions as { grounded: boolean; targetRequirements: { id: string; text: string }[]; supportingFacts: { location: string; quote: string }[] }[]
  assert.equal(traced.grounded, true)
  assert.equal(traced.targetRequirements[0].id, requirementForTarget.id)
  assert.equal(traced.supportingFacts[0].location, 'Experience · Customer Experience Specialist, Example Company')
  assert.equal(tailoredBody.trial?.runsRemaining, 2, 'a successful trial run is counted once')

  // 8. Accept (client applies), save to the job version; the master is untouched.
  const accepted = applySuggestion(version.resume, tailoredBody.suggestions[0] as never)
  const updated = await h.account({ action: 'update_job_resume', versionId: version.id, expectedRevision: version.revision, resume: accepted })
  assert.equal(updated.status, 200, JSON.stringify(updated.body))
  const current = (updated.body.version as { resume: Resume; revision: number })
  assert.notEqual(current.resume.sections[0].entries[0].description, master.sections[0].entries[0].description)
  assert.equal(example().sections[0].entries[0].description, master.sections[0].entries[0].description)

  // 9. Export that exact version as Word, kept with the application. Downloading is not applying.
  const exported = await exportDocx(h.post('/api/export-docx', { requestId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', resume: current.resume, jobResumeVersionId: version.id, attachToApplication: true }), env,
    { authenticate: h.authenticate, serviceDatabase: h.serviceDatabase, renderDocument: renderDocx } as never)
  assert.equal(exported.status, 200, await exported.clone().text())
  assert.equal(exported.headers.get('X-APWICO-Application-Document'), 'attached')
  apps = (await h.account({ action: 'applications' })).body.applications as Record<string, unknown>[]
  assert.equal(apps[0].stage, 'preparing', 'exporting never marks the application applied')
  const documents = apps[0].documents as { id: string; submittedAt: string | null }[]
  assert.equal(documents.length, 1); assert.equal(documents[0].submittedAt, null)

  // 10. Confirm applied explicitly, with the document that was sent.
  const confirmed = await h.account({ action: 'application_confirm_submitted', savedJobId, expectedRevision: apps[0].revision, documentId: documents[0].id, appliedOn: '2026-10-27' })
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body))
  assert.equal((confirmed.body.application as { stage: string }).stage, 'applied')

  // 11. Later edits to the job version never change what was submitted.
  await h.account({ action: 'update_job_resume', versionId: version.id, expectedRevision: current.revision, resume: { ...current.resume, summary: 'Edited after submitting.' } })
  const retrieved = await h.account({ action: 'application_document', documentId: documents[0].id })
  assert.equal(retrieved.status, 200)
  const snapshot = (retrieved.body.document as { resume: Resume; submittedAt: string | null })
  assert.deepEqual(snapshot.resume, current.resume, 'the exact exported content is retrievable')
  assert.ok(snapshot.submittedAt)

  // Free boundary: the trial does not extend to a second application.
  const second = await h.account({ action: 'save', job: results.jobs[1].savedSnapshot, evidence, criteria })
  const secondVersion = await h.account({ action: 'create_job_resume', savedJobId: second.body.savedJobId, resume: master })
  assert.equal(secondVersion.status, 403, 'Free cannot prepare a second application after its one trial')
  await h.pg.close()
})

test('Journey B: tracker-first quick add and CSV import → stage update → next action → visible as due work', { timeout: 120_000 }, async () => {
  const h = await setup()
  const quick = await h.account({ action: 'application_create', application: { company: 'Example Clinic', title: 'Front desk coordinator', stage: 'saved' } })
  assert.equal(quick.status, 200, JSON.stringify(quick.body))
  const rows = [
    { company: 'Fixture Labs', title: 'Lab assistant', stage: 'applied', appliedOn: '2026-10-01' },
    { company: 'Example Clinic', title: 'Front desk coordinator', stage: 'saved' },
    { company: 'Sample Works', title: 'Operations associate', stage: 'closed', closedReason: 'no_response' },
    { company: '', title: 'Missing company' },
  ]
  const preview = await h.account({ action: 'application_import_preview', rows })
  assert.deepEqual((preview.body.rows as { status: string }[]).map(row => row.status), ['ready', 'possible_duplicate', 'ready', 'invalid'])
  const imported = await h.account({ action: 'application_import', rows })
  assert.deepEqual((imported.body.rows as { status: string }[]).map(row => row.status), ['created', 'skipped', 'created', 'invalid'], 'possible duplicates need an explicit keep')
  type App = { savedJobId: string; company: string; stage: string; closedReason: string | null; revision: number; nextAction: string; nextActionDue: string | null; events: { kind: string; origin: string }[] }
  const list = async () => {
    const body = (await h.account({ action: 'applications' })).body as { applications: App[]; savedJobs: { id: string; snapshot: { company: string } }[] }
    const company = new Map(body.savedJobs.map(job => [job.id, job.snapshot.company]))
    return body.applications.map(app => ({ ...app, company: company.get(app.savedJobId) ?? '' }))
  }
  let apps = await list()
  assert.equal(apps.length, 3)
  const closed = apps.find(app => app.company === 'Sample Works')!
  assert.equal(closed.closedReason, 'no_response', '“no response” is never recorded as a rejection')
  const lab = apps.find(app => app.company === 'Fixture Labs')!
  assert.equal(lab.events.at(-1)?.origin, 'import')
  const moved = await h.account({ action: 'application_update', savedJobId: lab.savedJobId, expectedRevision: lab.revision, patch: { stage: 'interviewing' } })
  assert.equal(moved.status, 200, JSON.stringify(moved.body))
  const due = new Date(Date.now() - 86_400_000).toISOString()
  const next = await h.account({ action: 'application_update', savedJobId: lab.savedJobId, expectedRevision: (moved.body.application as { revision: number }).revision, patch: { nextAction: 'Send interview thank-you note', nextActionDue: due } })
  assert.equal(next.status, 200, JSON.stringify(next.body))
  apps = await list()
  const updated = apps.find(app => app.savedJobId === lab.savedJobId)!
  assert.equal(updated.stage, 'interviewing')
  assert.equal(updated.nextAction, 'Send interview thank-you note')
  assert.ok(updated.nextActionDue && Date.parse(updated.nextActionDue) < Date.now(), 'Today derives “due” from this stored next action')
  // Owner isolation: another account sees none of it.
  h.as(PRO)
  assert.equal(((await h.account({ action: 'applications' })).body.applications as unknown[]).length, 0)
  await h.pg.close()
})

test('Pro boundary: Pro prepares any number of applications without a trial and is not trial-counted', { timeout: 120_000 }, async () => {
  const h = await setup()
  h.as(PRO)
  const master = example()
  const ids: string[] = []
  for (const n of [1, 2]) {
    const created = await h.account({ action: 'application_create', application: { company: `Fixture Co ${n}`, title: 'Support specialist', stage: 'saved', descriptionText: 'Experience supporting customers is required.' } })
    ids.push(created.body.savedJobId as string)
  }
  for (const id of ids) assert.equal((await h.account({ action: 'create_job_resume', savedJobId: id, resume: master })).status, 200)
  const snapshot = (await h.account({ action: 'applications' })).body
  assert.equal(snapshot.isPro, true)
  assert.equal((await h.pg.query<{ n: number }>(`select count(*)::int as n from public.product_tailoring_trials`)).rows[0].n, 0, 'Pro never consumes the Free trial')
  await h.pg.close()
})

test('missing posting recovery is owner-scoped and preserves kept exports and trial', { timeout: 120_000 }, async () => {
 const h = await setup();
 try {
  const created = await h.account({ action: 'application_create', application: { company: 'Recovery fixture', title: 'Support specialist', stage: 'saved' } });
  const savedJobId = created.body.savedJobId as string;
  const legacy = await h.db.rpc('job_resume_version_create', { p_owner: FREE, p_saved_job: savedJobId, p_data: example(), p_fingerprint: 'a'.repeat(64) });
  assert.equal(legacy.error, null);
  const version = (legacy.data as {version:{id:string}}).version;
  const exported = await exportDocx(h.post('/api/export-docx', { requestId: '1b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', resume: example(), jobResumeVersionId: version.id, attachToApplication: true }), env, { authenticate: h.authenticate, serviceDatabase: h.serviceDatabase, renderDocument: renderDocx } as never);
  assert.equal(exported.status, 200);
  const before = await h.pg.query('select * from public.job_application_documents');
  const trial = await h.pg.query('select * from public.product_tailoring_trials');
  h.as(PRO);
  assert.equal((await h.account({action:'application_fill_posting',savedJobId,description:POSTING})).status,404);
  h.as(FREE);
  assert.equal((await h.account({action:'application_fill_posting',savedJobId,description:' '})).status,400);
  const saved = await h.account({action:'application_fill_posting',savedJobId,description:POSTING});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  const restored = await h.account({action:'get_job_resume',versionId:version.id});
  assert.equal((restored.body.version as {jobSnapshot:{descriptionText:string}}).jobSnapshot.descriptionText,POSTING);
  assert.equal((await h.account({action:'application_fill_posting',savedJobId,description:'Overwrite'})).status,409);
  assert.deepEqual((await h.pg.query('select * from public.job_application_documents')).rows,before.rows);
  assert.deepEqual((await h.pg.query('select * from public.product_tailoring_trials')).rows,trial.rows);
  const grants=await h.pg.query<{anon:boolean;authenticated:boolean}>("select has_function_privilege('anon','public.applications_fill_missing_posting(uuid,uuid,text)','EXECUTE') as anon, has_function_privilege('authenticated','public.applications_fill_missing_posting(uuid,uuid,text)','EXECUTE') as authenticated");
  assert.deepEqual(grants.rows,[{anon:false,authenticated:false}]);
 } finally { await h.pg.close(); }
});
