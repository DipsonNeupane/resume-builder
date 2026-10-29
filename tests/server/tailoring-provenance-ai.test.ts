/** Provenance persistence and AI safeguards through the REAL handlers and REAL SQL on a fresh
 * local PGlite database. The OpenAI response is a controlled fixture; nothing reaches a provider
 * or a hosted database. PGlite runs one query at a time, so "simultaneous" requests here
 * interleave between database calls (the application-level race) but do not exercise
 * PostgreSQL row locks; scripts/test-database-concurrency.mjs covers those on a real server. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { migratedDatabase, rpcClient } from './pgliteDatabase.ts'
import { jobsAccount, savedJobSnapshot } from '../../server/jobs/account.ts'
import { tailor, reservationError } from '../../api/tailor.ts'
import { generateTailoringSuggestions } from '../../server/ai/tailoring.ts'
import { exportDocx } from '../../server/export/docx-handler.ts'
import { renderDocx } from '../../server/export/docx.ts'
import { parseProvenance, provenanceState, withAccepted, MAX_PROVENANCE_BYTES, type ProvenanceEntry } from '../../src/lib/tailoringProvenance.ts'
import { example, type Resume } from '../../src/model.ts'
import type { NormalizedJob } from '../../server/jobs/types.ts'

const FREE = 'a9a9a9a9-a9a9-4a9a-8a9a-a9a9a9a9a9a9'
const PRO = 'b9b9b9b9-b9b9-4b9b-8b9b-b9b9b9b9b9b9'
const env = {
  APP_ORIGIN: 'https://apwico.com', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  AI_ENABLED: 'true', OPENAI_API_KEY: 'sk-fixture', EXPORTS_ENABLED: 'true',
} as unknown as NodeJS.ProcessEnv

function job(n: number): NormalizedJob {
  return {
    id: `fixture:${n}`, provider: 'fixture', providerJobId: String(n), title: 'Customer Support Specialist', company: `Fixture Outfitters ${n}`,
    location: { value: { city: 'Leeds', region: null, country: 'GB' }, source: 'provider', confidence: 'high' },
    workplace: { value: 'remote', source: 'provider', confidence: 'high' }, employmentType: { value: 'full_time', source: 'provider', confidence: 'high' },
    salary: null, descriptionText: `Posting ${n}. Required: supporting customers by email and live chat.`, postedAt: null,
    expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' }, directness: { value: null, source: 'unknown', confidence: 'low' },
    sourceUrl: `https://jobs.fixture.example/${n}`, portal: `portal-${n}`, source: 'employer', dedupeKey: String(n).padStart(64, 'a'), retrievedAt: '2026-10-28T00:00:00Z',
  }
}

async function setup() {
  const pg = await migratedDatabase()
  await pg.exec(`insert into auth.users(id, created_at) values ('${FREE}', now() - interval '1 day'),('${PRO}', now() - interval '1 day');
    insert into public.billing_entitlements(owner_id, paid_through) values ('${PRO}', now() + interval '20 days');`)
  const db = rpcClient(pg)
  let owner = FREE
  const as = (id: string) => { owner = id }
  const deps = { authenticate: async () => owner, serviceDatabase: (() => db) as never }
  const post = (url: string, body: unknown) => new Request(`https://apwico.com${url}`, { method: 'POST', headers: { origin: 'https://apwico.com', 'content-type': 'application/json', authorization: 'Bearer fixture' }, body: JSON.stringify(body) })
  const account = async (body: Record<string, unknown>) => {
    const response = await jobsAccount(post('/api/jobs-account', body), env, deps as never)
    return { status: response.status, body: await response.json() as Record<string, unknown> }
  }
  const prepare = async (n: number) => {
    const saved = await account({ action: 'save', job: savedJobSnapshot(job(n), { label: 'good', reasons: [] }) })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    const savedJobId = (saved.body.savedJobId ?? (saved.body.job as { id: string } | undefined)?.id) as string
    const created = await account({ action: 'create_job_resume', savedJobId, resume: example() })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    return { savedJobId, version: created.body.version as { id: string; revision: number; resume: Resume; provenance: ProvenanceEntry[] } }
  }
  let providerCalls = 0
  const run = async (target: { savedJobId: string; version: { id: string } }, requestId: string, provider: typeof fetch) => {
    const response = await tailor(post('/api/tailor', { consent: true, savedJobId: target.savedJobId, versionId: target.version.id, requestId }), env, {
      ...deps,
      generateTailoringSuggestions: ((config, prereqs, resume, jobText, _fetch, match) => generateTailoringSuggestions(config, prereqs, resume, jobText,
        (async (...args: Parameters<typeof fetch>) => { providerCalls++; return provider(...args) }) as typeof fetch, match)) as typeof generateTailoringSuggestions,
    } as never)
    return { status: response.status, body: await response.json() as Record<string, unknown> }
  }
  const trial = async () => {
    const status = await db.rpc('product_trial_status', { p_owner: FREE, p_saved_job: null })
    return (status.data as { runsRemaining: number }).runsRemaining
  }
  return { pg, db, as, deps, post, account, prepare, run, trial, providerCalls: () => providerCalls }
}

const summary = example().summary
function ok(text = summary.replace(/\.$/, ' for customers.')): typeof fetch {
  return (async () => Response.json({ id: 'resp_fixture', model: 'gpt-fixture', status: 'completed', usage: { input_tokens: 400, output_tokens: 90 },
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ suggestions: [{ sectionId: null, entryId: null, field: 'summary', originalText: summary, suggestedText: text, why: 'Keeps the existing summary and names the audience.', targetRequirementIds: [], supportingQuotes: [] }] }) }] }] })) as typeof fetch
}
const serverError: typeof fetch = (async () => new Response('{}', { status: 500 })) as typeof fetch
const dropped: typeof fetch = (async () => { throw new TypeError('socket hang up') }) as typeof fetch
const id = (n: number) => `0c0c0c0c-0c0c-4c0c-8c0c-${String(n).padStart(12, '0')}`

function entry(overrides: Partial<ProvenanceEntry> = {}): ProvenanceEntry {
  return { id: '5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e', field: 'summary', sectionId: null, entryId: null, origin: 'ai', originalText: summary, aiText: 'Supports customers by email.',
    keptText: 'Supports customers by email.', userFact: null, requirements: [{ id: 'r-1', text: 'Supporting customers by email.' }],
    resumeQuotes: [{ location: 'Summary', quote: 'customers' }], acceptedAt: '2026-10-28T10:00:00.000Z', ...overrides }
}

test('provenance validation: strict shape, origins, bounds and state against the resume', () => {
  assert.deepEqual(parseProvenance([entry()]), [entry()])
  for (const bad of [
    [{ ...entry(), extra: true }], [entry({ origin: 'model' as never })], [entry({ origin: 'ai_with_user_fact' })], [entry({ userFact: 'I did this every week.' })],
    [entry({ field: 'description' })], [entry({ id: 'not-a-uuid' })], [entry(), entry()], [entry({ requirements: [{ id: 'r', text: 't' }, { id: 'r', text: 't' }, { id: 'r', text: 't' }, { id: 'r', text: 't' }] })],
    Array.from({ length: 61 }, (_, i) => entry({ id: `5e5e5e5e-5e5e-4e5e-8e5e-${String(i).padStart(12, '0')}` })), {},
  ]) assert.throws(() => parseProvenance(bad), /invalid/, JSON.stringify(bad).slice(0, 120))
  assert.ok(parseProvenance([entry({ origin: 'ai_with_user_fact', userFact: 'I answered email and chat every shift.' })]))
  const resume = { ...example(), summary: 'Supports customers by email.' }
  assert.equal(provenanceState(entry(), resume), 'current')
  assert.equal(provenanceState(entry(), { ...resume, summary: 'Changed later.' }), 'edited')
  assert.equal(provenanceState(entry({ field: 'description', sectionId: 'gone', entryId: 'gone' }), resume), 'removed')
  // The record stays within its stored bound by dropping the oldest entries, never the newest.
  let list: ProvenanceEntry[] = []
  for (let i = 0; i < 70; i++) list = withAccepted(list, entry({ id: `5e5e5e5e-5e5e-4e5e-8e5e-${String(i).padStart(12, '0')}`, originalText: 'x'.repeat(4000) }))
  assert.ok(new TextEncoder().encode(JSON.stringify(list)).byteLength <= MAX_PROVENANCE_BYTES)
  assert.equal(list.at(-1)!.id, '5e5e5e5e-5e5e-4e5e-8e5e-000000000069')
  assert.doesNotThrow(() => parseProvenance(list))
})

test('provenance is saved with the version, survives reloads and edits, is kept with exports and cleared by a reset', { timeout: 60_000 }, async () => {
  const h = await setup()
  const target = await h.prepare(1)
  assert.deepEqual(target.version.provenance, [])
  const accepted = { ...target.version.resume, summary: 'Supports customers by email.' }
  const record = [entry({ originalText: target.version.resume.summary })]

  const invalid = await h.account({ action: 'update_job_resume', versionId: target.version.id, expectedRevision: 1, resume: accepted, provenance: [{ ...record[0], origin: 'model' }] })
  assert.equal(invalid.status, 400, 'an invalid record is refused')
  assert.equal(((await h.account({ action: 'get_job_resume', versionId: target.version.id })).body.version as { revision: number }).revision, 1, 'and nothing was saved with it')

  const saved = await h.account({ action: 'update_job_resume', versionId: target.version.id, expectedRevision: 1, resume: accepted, provenance: record })
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  const reloaded = (await h.account({ action: 'get_job_resume', versionId: target.version.id })).body.version as { revision: number; resume: Resume; provenance: ProvenanceEntry[] }
  assert.deepEqual(reloaded.provenance, record, 'a reload returns the record')

  // A manual edit afterwards (sent with the unchanged record) keeps it; the state reads as edited.
  const edited = await h.account({ action: 'update_job_resume', versionId: target.version.id, expectedRevision: reloaded.revision, resume: { ...accepted, summary: 'Supports customers by email and phone.' }, provenance: record })
  const afterEdit = edited.body.version as { revision: number; resume: Resume; provenance: ProvenanceEntry[] }
  assert.deepEqual(afterEdit.provenance, record)
  assert.equal(provenanceState(afterEdit.provenance[0], afterEdit.resume), 'edited')

  // A stale tab cannot overwrite the record: the conflict returns the stored version.
  const stale = await h.account({ action: 'update_job_resume', versionId: target.version.id, expectedRevision: reloaded.revision, resume: accepted, provenance: [] })
  assert.equal(stale.status, 409)
  assert.deepEqual((stale.body.version as { provenance: ProvenanceEntry[] }).provenance, record)

  // Export the exact version; the kept document carries the record as it was then.
  const exported = await exportDocx(h.post('/api/export-docx', { requestId: id(900), resume: afterEdit.resume, jobResumeVersionId: target.version.id, attachToApplication: true }), env,
    { ...h.deps, renderDocument: renderDocx } as never)
  assert.equal(exported.headers.get('X-APWICO-Application-Document'), 'attached')
  const apps = (await h.account({ action: 'applications' })).body.applications as { documents: { id: string }[] }[]
  const documentId = apps[0].documents[0].id
  const later = [...record, entry({ id: '6f6f6f6f-6f6f-4f6f-8f6f-6f6f6f6f6f6f', origin: 'user', aiText: 'AI text.', keptText: 'Later wording.' })]
  await h.account({ action: 'update_job_resume', versionId: target.version.id, expectedRevision: afterEdit.revision, resume: { ...afterEdit.resume, summary: 'Later wording.' }, provenance: later })
  const kept = (await h.account({ action: 'application_document', documentId })).body.document as { resume: Resume; provenance: ProvenanceEntry[] }
  assert.deepEqual(kept.provenance, record, 'later changes never alter the kept record')
  assert.equal(provenanceState(kept.provenance[0], kept.resume), 'edited', 'the kept record is read against the kept snapshot')

  const current = (await h.account({ action: 'get_job_resume', versionId: target.version.id })).body.version as { revision: number; provenance: ProvenanceEntry[] }
  assert.equal(current.provenance.length, 2)
  const reset = await h.account({ action: 'reset_job_resume', versionId: target.version.id, expectedRevision: current.revision, resume: example() })
  assert.deepEqual((reset.body.version as { provenance: ProvenanceEntry[] }).provenance, [], 'resetting from the master clears the record')
  await h.pg.close()
})

test('failed AI requests use no trial run or allowance, are never replaced with substitute output, and can be retried', { timeout: 60_000 }, async () => {
  const h = await setup()
  const target = await h.prepare(2)
  assert.equal(await h.trial(), 3)

  const failed = await h.run(target, id(1), serverError)
  assert.equal(failed.status, 503)
  assert.match(String(failed.body.error), /temporarily unavailable\. This failed request did not use your trial or hourly AI allowance\./)
  assert.equal(failed.body.suggestions, undefined, 'no substitute suggestions')
  assert.equal(await h.trial(), 3, 'a provider failure uses no trial run')

  // The browser sends a new request id after any response; a cleanly failed request can be retried at once.
  const retried = await h.run(target, id(2), ok())
  assert.equal(retried.status, 200, JSON.stringify(retried.body))
  assert.equal((retried.body.trial as { runsRemaining: number }).runsRemaining, 2)

  // A dropped connection may have been processed, so the same content waits rather than risk paying twice.
  // (A success also blocks an identical request for ten minutes; move it out of that window first.)
  await h.pg.exec(`update public.ai_budget_requests set created_at = now() - interval '11 minutes' where owner_id = '${FREE}'`)
  const uncertain = await h.run(target, id(3), (async () => { throw new TypeError('socket hang up') }) as typeof fetch)
  assert.equal(uncertain.status, 503)
  const cooldown = await h.run(target, id(4), ok())
  assert.equal(cooldown.status, 409)
  assert.match(String(cooldown.body.error), /try again in 10 minutes\. It did not use your trial/)
  assert.equal(await h.trial(), 2, 'neither the uncertain request nor the refused retry used a run')

  // Twenty failures in an hour do not use the hourly allowance of 20 requests.
  await h.pg.exec(`update public.ai_budget_requests set created_at = now() - interval '2 hours' where owner_id = '${FREE}';
    insert into public.ai_budget_requests(request_id, owner_id, month_start, reserved_micro_usd, status)
    select gen_random_uuid(), '${FREE}', date_trunc('month', timezone('UTC', now()))::date, 1, 'failed' from generate_series(1, 20);`)
  assert.equal((await h.run(target, id(5), ok('Supports customers by chat and email.'))).status, 200)
  await h.pg.close()
})

test('the monthly AI budget is configurable; exhaustion is explained, consumes nothing, and recovers', { timeout: 60_000 }, async () => {
  const h = await setup()
  const target = await h.prepare(3)
  await h.pg.exec(`update public.product_settings set ai_monthly_budget_micro_usd = 1 where id`)
  const before = h.providerCalls()
  const paused = await h.run(target, id(10), ok())
  assert.equal(paused.status, 503)
  assert.match(String(paused.body.error), /^AI suggestions are paused for all accounts until the monthly AI budget resets on [A-Z][a-z]+ 1 \(UTC\)\. This request did not use your trial or hourly AI allowance\. You can still edit this resume yourself\.$/)
  assert.equal(h.providerCalls(), before, 'the provider is never called once the budget is reached')
  assert.equal(await h.trial(), 3, 'exhaustion uses no trial run')
  assert.equal((await h.pg.query(`select 1 from public.product_tailoring_trial_runs`)).rows.length, 0, 'the trial reservation was released')

  // Recovery: raising the setting (or the next month) restores service with no other action.
  await h.pg.exec(`update public.product_settings set ai_monthly_budget_micro_usd = 25000000 where id`)
  const recovered = await h.run(target, id(11), ok())
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body))
  assert.equal(await h.trial(), 2)
  // Message dates are computed in UTC.
  assert.match(reservationError({ message: 'AI monthly budget reached', code: '54000' }, new Date('2026-12-31T23:30:00Z')).message, /resets on January 1 \(UTC\)/)
  assert.match(reservationError({ message: 'AI request limit reached', code: '54000' }).message, /limit of 20 AI suggestion requests in an hour\. Failed requests are not counted/)
  assert.equal(reservationError({ message: 'connection refused' }).status, 503)
  await h.pg.close()
})

test('simultaneous requests cannot exceed the trial or the monthly budget', { timeout: 60_000 }, async () => {
  const h = await setup()
  const target = await h.prepare(4)
  await h.pg.exec(`insert into public.product_tailoring_trial_runs(request_id, owner_id) values (gen_random_uuid(), '${FREE}'), (gen_random_uuid(), '${FREE}')`)
  assert.equal(await h.trial(), 1)
  const texts = ['Supports customers by chat.', 'Supports customers by email.', 'Supports customers by chat and email.']
  const results = await Promise.all(texts.map((text, n) => h.run(target, id(20 + n), ok(text))))
  assert.deepEqual(results.map(result => result.status).sort(), [200, 402, 402], JSON.stringify(results.map(result => result.body)))
  assert.equal(await h.trial(), 0)
  assert.equal((await h.pg.query<{ n: number }>(`select count(*)::int as n from public.product_tailoring_trial_runs where owner_id = '${FREE}'`)).rows[0].n, 3, 'exactly the allowed three runs exist')

  // Pro: three different applications race for a budget with room for only one more request.
  h.as(PRO)
  const targets = [await h.prepare(5), await h.prepare(6), await h.prepare(7)]
  const probe = await h.run(await h.prepare(8), id(30), ok())
  assert.equal(probe.status, 200)
  const cost = Number((await h.pg.query<{ reserved: string }>(`select reserved_micro_usd::text as reserved from public.ai_budget_requests where request_id = '${id(30)}'`)).rows[0].reserved)
  const spent = Number((await h.pg.query<{ total: string }>(`select (spent_micro_usd + reserved_micro_usd)::text as total from public.ai_budget_months`)).rows[0].total)
  await h.pg.exec(`update public.product_settings set ai_monthly_budget_micro_usd = ${spent + Math.ceil(cost * 1.5)} where id`)
  const raced = await Promise.all(targets.map((item, n) => h.run(item, id(40 + n), ok(texts[n]))))
  assert.deepEqual(raced.map(result => result.status).sort(), [200, 503, 503])
  const month = (await h.pg.query<{ total: string; cap: string }>(`select (m.spent_micro_usd + m.reserved_micro_usd)::text as total, s.ai_monthly_budget_micro_usd::text as cap from public.ai_budget_months m, public.product_settings s`)).rows[0]
  assert.ok(Number(month.total) <= Number(month.cap), `${month.total} <= ${month.cap}`)
  await h.pg.close()
})
