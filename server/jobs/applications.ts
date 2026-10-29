/** Application tracker actions for the authenticated jobs-account route. The owner is
 * always the verified token subject passed in by jobsAccount(); no owner, limit or
 * origin from the browser is trusted. Pasted job URLs are validated and normalized
 * but never fetched by the server, so this path adds no outbound-request surface. */
import { createHash, randomUUID } from 'node:crypto'
import { captureSourceUrl } from '../../apps/extension/src/lib/capture.ts'
import {
  APPLICATION_LIMITS, ApplicationInputError, looseKey, parseApplicationInput, parseApplicationPatch, parseApplicationRecord,
  publicJobUrl, sourceIdentity, type ApplicationInput, type ApplicationRecord,
} from '../../src/lib/applications.ts'
import { HttpError, json } from '../http/security.ts'
import type { serviceDatabase } from '../database.ts'
import type { SavedJobSnapshot } from './account.ts'
import { safeJobUrl } from './url.ts'

type Db = ReturnType<typeof serviceDatabase>
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const TRACKING = /^(?:utm_[a-z_]+|gclid|fbclid|msclkid|mc_[a-z]+|_hs[a-z]+|trk|trackingid)$/i

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Public https job URL in its stored form: supported boards use the extension's
 * canonical identity (e.g. LinkedIn job id, Indeed jk); other URLs keep every
 * meaningful parameter and drop only well-known tracking parameters. */
export function normalizePastedJobUrl(raw: unknown): string | null {
  const safe = publicJobUrl(raw)
  if (!safe || safeJobUrl(safe) !== safe) return null
  const canonical = captureSourceUrl(safe)
  if (canonical) return canonical
  const url = new URL(safe)
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key)
  return url.toString()
}

export function manualSnapshot(input: ApplicationInput, now = new Date(), id: string = randomUUID()): SavedJobSnapshot {
  const providerJobId = id
  const known = (present: boolean) => present ? { source: 'user' as const, confidence: 'high' as const } : { source: 'unknown' as const, confidence: 'low' as const }
  return {
    id: `manual:${providerJobId}`, provider: 'manual', providerJobId,
    dedupeKey: createHash('sha256').update(`manual:${providerJobId}`).digest('hex'),
    title: input.title, company: input.company,
    location: { value: { city: input.location || null, region: null, country: null }, ...known(Boolean(input.location)) },
    workplace: { value: input.workplace, ...known(input.workplace !== 'unknown') },
    employmentType: { value: 'unknown', source: 'unknown', confidence: 'low' },
    salary: input.salary ? { ...input.salary, confidence: 'high' } : null,
    descriptionText: input.descriptionText.slice(0, 12000),
    postedAt: null, expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
    sourceUrl: input.sourceUrl, portal: input.sourceUrl ? new URL(input.sourceUrl).hostname : null, source: 'manual',
    retrievedAt: now.toISOString(), matchLabel: 'stretch', matchReasons: [],
  }
}

function workflowFields(input: ApplicationInput): Record<string, unknown> {
  return {
    stage: input.stage, closedReason: input.closedReason, appliedOn: input.appliedOn,
    nextAction: input.nextAction, nextActionDue: input.nextActionDue,
    notes: input.notes, contactName: input.contactName, contactDetails: input.contactDetails,
  }
}

function parseInput(value: unknown): ApplicationInput {
  try {
    const input = parseApplicationInput(value)
    if (input.sourceUrl) {
      const normalized = normalizePastedJobUrl(input.sourceUrl)
      if (!normalized) throw new ApplicationInputError('sourceUrl', 'Use a public https job link without a private address, or leave the link empty.')
      input.sourceUrl = normalized
    }
    return input
  } catch (error) {
    if (error instanceof ApplicationInputError) throw new HttpError(400, error.message)
    throw error
  }
}

function applicationError(error: { message: string }): never {
  if (error.message.includes('Free application limit reached')) throw new HttpError(403, 'Free accounts can track up to 100 applications. Every existing record stays available; upgrade to Pro to add more.')
  if (error.message.includes('Saved-job safety limit reached')) throw new HttpError(409, 'Application safety limit reached. Existing records are unchanged.')
  if (error.message.includes('Application conflict')) throw new HttpError(409, 'This application changed in another tab. Reload to see the latest version before saving again.', 'database_conflict')
  if (error.message.includes('Closed reason required')) throw new HttpError(400, 'Choose why this application is closed.')
  if (error.message.includes('Saved job not found')) throw new HttpError(404, 'This application is no longer available.')
  if (error.message.includes('not found')) throw new HttpError(404, 'This application document is no longer available.')
  throw new HttpError(503, 'Unable to save this application')
}

function recordOrFail(value: unknown): ApplicationRecord {
  const parsed = parseApplicationRecord(value)
  if (!parsed) throw new HttpError(503, 'Application returned an unusable response')
  return parsed
}

export async function listApplications(owner: string, db: Db): Promise<ApplicationRecord[] | null> {
  const result = await db.rpc('applications_list', { p_owner: owner })
  if (result.error || !Array.isArray(result.data)) return null
  const parsed = result.data.map(parseApplicationRecord)
  return parsed.every(Boolean) ? parsed as ApplicationRecord[] : null
}

type Identity = { savedJobId: string; sourceIdentity: string | null; company: string; title: string }
async function identities(owner: string, db: Db): Promise<Identity[]> {
  const result = await db.rpc('applications_identities', { p_owner: owner })
  if (result.error || !Array.isArray(result.data)) throw new HttpError(503, 'Unable to check for duplicate applications')
  return result.data.filter(record).map(item => ({
    savedJobId: String(item.savedJobId), sourceIdentity: typeof item.sourceIdentity === 'string' ? item.sourceIdentity : null,
    company: String(item.company ?? ''), title: String(item.title ?? ''),
  }))
}

export type ImportRowResult = {
  row: number
  status: 'ready' | 'invalid' | 'duplicate' | 'possible_duplicate' | 'created' | 'skipped' | 'failed'
  message?: string
  field?: string
  savedJobId?: string
}

/** Validates rows and classifies duplicates. Same URL identity is a duplicate (never
 * imported again); same company + role is only a possible duplicate the user reviews. */
export function classifyImportRows(rows: unknown[], existing: Identity[]): { results: ImportRowResult[]; inputs: (ApplicationInput | null)[] } {
  const byUrl = new Map(existing.filter(item => item.sourceIdentity).map(item => [item.sourceIdentity as string, item.savedJobId]))
  const byLoose = new Map(existing.map(item => [looseKey(item.company, item.title), item.savedJobId]))
  const seenUrl = new Map<string, number>()
  const results: ImportRowResult[] = []
  const inputs: (ApplicationInput | null)[] = []
  rows.forEach((raw, index) => {
    const row = index + 1
    let input: ApplicationInput
    try { input = parseInput(raw) } catch (error) {
      results.push({ row, status: 'invalid', message: error instanceof Error ? error.message : 'Row is invalid.' }); inputs.push(null); return
    }
    inputs.push(input)
    const identity = input.sourceUrl ? sourceIdentity(input.sourceUrl) : null
    if (identity && byUrl.has(identity)) { results.push({ row, status: 'duplicate', savedJobId: byUrl.get(identity), message: 'This job link is already in your applications.' }); return }
    if (identity && seenUrl.has(identity)) { results.push({ row, status: 'duplicate', message: `Same job link as row ${seenUrl.get(identity)}.` }); return }
    if (identity) seenUrl.set(identity, row)
    const loose = byLoose.get(looseKey(input.company, input.title))
    if (loose) { results.push({ row, status: 'possible_duplicate', savedJobId: loose, message: 'An application with this company and role already exists. It may be a different opening.' }); return }
    results.push({ row, status: 'ready' })
  })
  return { results, inputs }
}

export async function handleApplicationAction(action: string, body: Record<string, unknown>, owner: string, db: Db): Promise<Response | null> {
  if (action === 'applications') {
    const snapshot = await db.rpc('jobs_account_snapshot', { p_owner: owner })
    const applications = await listApplications(owner, db)
    if (snapshot.error || !record(snapshot.data) || !applications) throw new HttpError(503, 'Unable to load your applications')
    const { isPro, saveLimit, savedCount, savedJobs, preferences, tailoringTrial } = snapshot.data
    return json(200, { isPro, saveLimit, savedCount, savedJobs, preferences, tailoringTrial, applications })
  }
  if (action === 'application_create') {
    const input = parseInput(body.application)
    const result = await db.rpc('applications_create', { p_owner: owner, p_job: manualSnapshot(input), p_fields: workflowFields(input), p_origin: 'user' })
    if (result.error) applicationError(result.error)
    if (!record(result.data) || typeof result.data.savedJobId !== 'string' || !UUID.test(result.data.savedJobId)) throw new HttpError(503, 'Unable to save this application')
    return json(200, { savedJobId: result.data.savedJobId, alreadySaved: result.data.alreadySaved === true })
  }
  if (action === 'application_update') {
    if (typeof body.savedJobId !== 'string' || !UUID.test(body.savedJobId)) throw new HttpError(400, 'Application is invalid')
    if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw new HttpError(400, 'Application revision is invalid')
    let patch
    try { patch = parseApplicationPatch(body.patch) } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Application update is invalid') }
    const result = await db.rpc('applications_update', { p_owner: owner, p_saved_job: body.savedJobId, p_expected_revision: body.expectedRevision, p_fields: patch })
    if (result.error) applicationError(result.error)
    return json(200, { application: recordOrFail(result.data) })
  }
  if (action === 'application_import_preview' || action === 'application_import') {
    if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > APPLICATION_LIMITS.importRows) {
      throw new HttpError(400, `Import between 1 and ${APPLICATION_LIMITS.importRows} rows at a time.`)
    }
    const { results, inputs } = classifyImportRows(body.rows, await identities(owner, db))
    if (action === 'application_import_preview') return json(200, { rows: results })
    // Possible duplicates are imported only when the user explicitly kept that row.
    const keep = Array.isArray(body.keepPossibleDuplicates) ? new Set(body.keepPossibleDuplicates.filter(Number.isSafeInteger)) : new Set()
    for (const result of results) {
      const input = inputs[result.row - 1]
      if (!input || result.status === 'invalid' || result.status === 'duplicate') continue
      if (result.status === 'possible_duplicate' && !keep.has(result.row)) { result.status = 'skipped'; result.message = 'Skipped after duplicate review.'; continue }
      const created = await db.rpc('applications_create', { p_owner: owner, p_job: manualSnapshot(input), p_fields: workflowFields(input), p_origin: 'import' })
      if (created.error) {
        result.status = 'failed'
        result.message = created.error.message.includes('Free application limit reached')
          ? 'Not imported: the Free limit of 100 applications is reached. Existing records are unchanged.' : 'Not imported. Try this row again.'
        continue
      }
      const data = created.data
      result.status = record(data) && data.alreadySaved === true ? 'duplicate' : 'created'
      result.savedJobId = record(data) && typeof data.savedJobId === 'string' ? data.savedJobId : undefined
      delete result.message
    }
    return json(200, { rows: results })
  }
  if (action === 'application_confirm_submitted') {
    if (typeof body.savedJobId !== 'string' || !UUID.test(body.savedJobId)
      || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0
      || (body.documentId !== null && (typeof body.documentId !== 'string' || !UUID.test(body.documentId)))
      || typeof body.appliedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.appliedOn)) throw new HttpError(400, 'Submission confirmation is invalid')
    const result = await db.rpc('applications_confirm_submitted', {
      p_owner: owner, p_saved_job: body.savedJobId, p_expected_revision: body.expectedRevision, p_document: body.documentId, p_applied_on: body.appliedOn,
    })
    if (result.error) applicationError(result.error)
    return json(200, { application: recordOrFail(result.data) })
  }
  if (action === 'application_document') {
    if (typeof body.documentId !== 'string' || !UUID.test(body.documentId)) throw new HttpError(400, 'Application document is invalid')
    const result = await db.rpc('applications_document_get', { p_owner: owner, p_document: body.documentId })
    if (result.error) throw new HttpError(503, 'Unable to load this application document')
    if (!record(result.data)) throw new HttpError(404, 'This application document is no longer available.')
    return json(200, { document: result.data })
  }
  return null
}
