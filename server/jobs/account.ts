/** Authenticated saved-job and preference API. Ownership always comes from the
 * verified access token; no owner field from the browser is accepted or forwarded. */
import { normalizeCapture } from './capture.ts'
import { isJobCapture, type JobCapture } from '../../apps/extension/src/lib/capture.ts'
import { createHash } from 'node:crypto'
import { authenticate, HttpError, json, jsonBody, requirePost, safeError } from '../http/security.ts'
import { markResponse, setRequestFeature } from '../observability.js'
import { databaseConfig, serviceDatabase } from '../database.ts'
import { contentLength, isResume, maxContentChars, type Resume } from '../../src/model.ts'
import { parseSearchCriteria, type SearchCriteria } from './criteria.ts'
import { safeJobUrl } from './url.ts'
import { analysisView, analyzeJob, matchHash, parseClarifications, parseFullMatchAnalysis, parseResumeEvidence, type MatchResult, type ResumeEvidence } from './match.ts'
import type { Confidence, EmploymentType, FieldProvenance, JobLocation, NormalizedJob, SalaryNormalized, Workplace } from './types.ts'

export const FREE_SAVED_JOB_LIMIT = 3
/** Effectively unlimited for normal use while retaining a hard abuse/storage bound. */
export const PRO_SAVED_JOB_SAFETY_LIMIT = 10_000
const MAX_BODY_BYTES = 1_000_000
const CONFIDENCE: Confidence[] = ['high', 'medium', 'low']
const WORKPLACES: Workplace[] = ['remote', 'hybrid', 'onsite', 'field', 'unknown']
const EMPLOYMENT_TYPES: EmploymentType[] = ['full_time', 'part_time', 'contract', 'temporary', 'internship', 'unknown']
const SAVED_JOB_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const VERSION_ID = SAVED_JOB_ID

export function resumeFingerprint(resume: Resume): string {
  return createHash('sha256').update(JSON.stringify(resume)).digest('hex')
}

function storedResume(value: unknown): Resume {
  if (!isResume(value) || contentLength(value) > maxContentChars) throw new HttpError(400, 'Resume content is invalid')
  return value
}

async function authoritativeMaster(owner: string, fallback: Resume, db: ReturnType<typeof serviceDatabase>): Promise<Resume> {
  const result = await db.rpc('job_resume_master', { p_owner: owner })
  if (result.error) throw new HttpError(503, 'Unable to load the current master resume')
  if (result.data === null) return fallback
  if (!record(result.data)) throw new HttpError(503, 'Unable to load the current master resume')
  return storedResume(result.data.data)
}

function jobResumeVersion(value: unknown): Record<string, unknown> {
  if (!record(value) || typeof value.id !== 'string' || !VERSION_ID.test(value.id)
    || typeof value.saved_job_id !== 'string' || !SAVED_JOB_ID.test(value.saved_job_id)
    || !record(value.job_snapshot) || typeof value.source_master_fingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.source_master_fingerprint)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
    || typeof value.created_at !== 'string' || typeof value.updated_at !== 'string') {
    throw new HttpError(503, 'Job-specific resume returned an unusable response')
  }
  const resume = storedResume(value.data)
  return {
    id: value.id, savedJobId: value.saved_job_id, jobSnapshot: value.job_snapshot,
    sourceMasterResumeId: typeof value.source_master_resume_id === 'string' ? value.source_master_resume_id : null,
    sourceMasterRevision: typeof value.source_master_revision === 'number' ? value.source_master_revision : null,
    sourceMasterFingerprint: value.source_master_fingerprint, resume, revision: value.revision,
    createdAt: value.created_at, updatedAt: value.updated_at,
  }
}

export type SavedJobSnapshot = {
  capture?: JobCapture
  id: string
  provider: string
  providerJobId: string
  dedupeKey: string
  title: string
  company: string
  location: FieldProvenance<JobLocation>
  workplace: FieldProvenance<Workplace>
  employmentType: FieldProvenance<EmploymentType>
  salary: SalaryNormalized
  descriptionText: string
  postedAt: string | null
  expiry: NormalizedJob['expiry']
  sourceUrl: string
  portal: string | null
  source: string | null
  retrievedAt: string
  matchLabel: MatchResult['label']
  matchReasons: string[]
}

export function savedJobSnapshot(job: NormalizedJob, match: Pick<MatchResult, 'label' | 'reasons'>): SavedJobSnapshot {
  return {
    id: job.id,
    provider: job.provider,
    providerJobId: job.providerJobId,
    dedupeKey: job.dedupeKey,
    title: job.title,
    company: job.company,
    location: job.location,
    workplace: job.workplace,
    employmentType: job.employmentType,
    salary: job.salary,
    descriptionText: job.descriptionText.slice(0, 12000),
    postedAt: job.postedAt,
    expiry: job.expiry,
    sourceUrl: job.sourceUrl,
    portal: job.portal,
    source: job.source,
    retrievedAt: job.retrievedAt,
    matchLabel: match.label,
    matchReasons: match.reasons.slice(0, 5).map(reason => reason.slice(0, 300)),
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}
function nullableString(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= max)
}
function isoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value))
}
function provenance<T extends string>(value: unknown, allowed: readonly T[]): value is FieldProvenance<T> {
  if (!record(value) || typeof value.value !== 'string' || !allowed.includes(value.value as T)) return false
  return (value.source === 'provider' || value.source === 'inferred' || value.source === 'unknown')
    && typeof value.confidence === 'string' && CONFIDENCE.includes(value.confidence as Confidence)
}

export function parseSavedJobSnapshot(value: unknown): SavedJobSnapshot {
  const bad = () => new HttpError(400, 'Saved job snapshot is invalid')
  if (!record(value) || Buffer.byteLength(JSON.stringify(value), 'utf8') > 150_000) throw bad()
  if (value.capture !== undefined && (!isJobCapture(value.capture) || value.provider !== 'extension')) throw bad()
  const location = value.location
  if (!record(location) || !record(location.value)
    || !nullableString(location.value.city, 200) || !nullableString(location.value.region, 200) || !nullableString(location.value.country, 200)
    || (location.source !== 'provider' && location.source !== 'inferred' && location.source !== 'unknown')
    || typeof location.confidence !== 'string' || !CONFIDENCE.includes(location.confidence as Confidence)) throw bad()
  if (!provenance(value.workplace, WORKPLACES) || !provenance(value.employmentType, EMPLOYMENT_TYPES)) throw bad()
  const salary = value.salary
  if (salary !== null && (!record(salary) || typeof salary.min !== 'number' || !Number.isFinite(salary.min)
    || typeof salary.max !== 'number' || !Number.isFinite(salary.max) || salary.min > salary.max
    || typeof salary.currency !== 'string' || !/^[A-Z]{3}$/.test(salary.currency) || (salary.period !== 'hour' && salary.period !== 'year')
    || typeof salary.confidence !== 'string' || !CONFIDENCE.includes(salary.confidence as Confidence))) throw bad()
  const expiry = value.expiry
  if (!record(expiry) || (expiry.expiresAt !== null && !isoDate(expiry.expiresAt)) || typeof expiry.isLikelyExpired !== 'boolean'
    || typeof expiry.confidence !== 'string' || !CONFIDENCE.includes(expiry.confidence as Confidence)
    || (expiry.source !== 'provider' && expiry.source !== 'inferred' && expiry.source !== 'unknown')) throw bad()
  if (!boundedString(value.id, 241) || !boundedString(value.provider, 40) || !boundedString(value.providerJobId, 200)
    || value.id !== `${value.provider}:${value.providerJobId}` || typeof value.dedupeKey !== 'string' || !/^[0-9a-f]{64}$/.test(value.dedupeKey)
    || !boundedString(value.title, 300) || !boundedString(value.company, 300) || typeof value.descriptionText !== 'string' || value.descriptionText.length > 12000
    || (value.postedAt !== null && !isoDate(value.postedAt)) || !isSafeUrl(value.sourceUrl)
    || !nullableString(value.portal, 200) || !nullableString(value.source, 200) || !isoDate(value.retrievedAt)
    || (value.matchLabel !== 'strong' && value.matchLabel !== 'good' && value.matchLabel !== 'stretch')
    || !Array.isArray(value.matchReasons) || value.matchReasons.length > 5
    || !value.matchReasons.every(reason => typeof reason === 'string' && reason.length <= 300)) throw bad()
  return value as unknown as SavedJobSnapshot
}

function isSafeUrl(value: unknown): value is string {
  return typeof value === 'string' && safeJobUrl(value) === value.trim()
}

function normalizedJob(job: SavedJobSnapshot): NormalizedJob {
  return {
    id: job.id, provider: job.provider, providerJobId: job.providerJobId, dedupeKey: job.dedupeKey,
    title: job.title, company: job.company, location: job.location, workplace: job.workplace,
    employmentType: job.employmentType, salary: job.salary, descriptionText: job.descriptionText,
    postedAt: job.postedAt, expiry: job.expiry, directness: { value: null, source: 'unknown', confidence: 'low' },
    sourceUrl: job.sourceUrl, portal: job.portal, source: job.source, retrievedAt: job.retrievedAt,
  }
}

/** Converts persisted full analysis into the same entitlement-shaped view returned by
 * search. Free shaping happens here even if a database fixture accidentally supplies a
 * raw payload, so Pro-only requirement depth never crosses the API boundary. */
export function shapeAccountSnapshot(value: Record<string, unknown>): Record<string, unknown> {
  const isPro = value.isPro === true
  if (!Array.isArray(value.savedJobs)) return value
  return {
    ...value,
    savedJobs: value.savedJobs.map(item => {
      if (!record(item)) return item
      const persisted = item.matchAnalysis == null ? null : parseFullMatchAnalysis(item.matchAnalysis)
      return { ...item, matchAnalysis: persisted ? analysisView(persisted, isPro) : null }
    }),
  }
}

async function savedReanalysis(owner: string, savedJobId: string, evidence: ResumeEvidence, db: ReturnType<typeof serviceDatabase>) {
  const input = await db.rpc('jobs_saved_match_inputs', { p_owner: owner, p_saved_job: savedJobId })
  if (input.error || !record(input.data) || !record(input.data.snapshot) || typeof input.data.isPro !== 'boolean') {
    throw new HttpError(503, 'Unable to refresh this saved analysis')
  }
  const job = parseSavedJobSnapshot(input.data.snapshot)
  let criteria: SearchCriteria
  let clarifications
  try {
    criteria = input.data.criteria == null ? { title: job.title } : parseSearchCriteria(input.data.criteria)
    clarifications = parseClarifications(input.data.clarifications)
  } catch { throw new HttpError(503, 'Unable to refresh this saved analysis') }
  const analysis = analyzeJob(evidence, normalizedJob(job), criteria, clarifications).analysis
  const stored = await db.rpc('jobs_replace_match_analysis', { p_owner: owner, p_saved_job: savedJobId, p_analysis: analysis })
  if (stored.error || stored.data !== true) throw new HttpError(503, 'Unable to refresh this saved analysis')
  return analysisView(analysis, input.data.isPro)
}

export const accountDependencies = { authenticate, serviceDatabase }
type Dependencies = typeof accountDependencies

export async function jobsAccount(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = accountDependencies): Promise<Response> {
  try {
    if (!env.APP_ORIGIN) throw new HttpError(503, 'Saved jobs are not configured', 'configuration')
    requirePost(request, env.APP_ORIGIN)
    const owner = await deps.authenticate(request, databaseConfig(env))
    const body = await jsonBody(request, MAX_BODY_BYTES)
    const action = body.action
    if (typeof action !== 'string') throw new HttpError(400, 'Saved-job action is required')
    if (action === 'reanalyze' || action === 'clarification') setRequestFeature('match')
    if (action === 'capture_save') setRequestFeature('extension')
    if (['create_job_resume', 'get_job_resume', 'update_job_resume', 'reset_job_resume'].includes(action)) setRequestFeature('cloud')
    const db = deps.serviceDatabase(env)

    if (action === 'load') {
      const evidence = body.evidence === undefined ? null : parseResumeEvidence(body.evidence)
      if (body.evidence !== undefined && !evidence) throw new HttpError(400, 'Resume evidence is required')
      const result = evidence
        ? await db.rpc('jobs_account_snapshot_v2', { p_owner: owner, p_resume_hash: matchHash(evidence) })
        : await db.rpc('jobs_account_snapshot', { p_owner: owner })
      if (result.error || !record(result.data)) throw new HttpError(503, 'Unable to load saved jobs')
      const versions = await db.rpc('job_resume_versions_list', { p_owner: owner })
      if (versions.error || !Array.isArray(versions.data)) throw new HttpError(503, 'Unable to load job-specific resumes')
      return json(200, { ...shapeAccountSnapshot(result.data), jobResumeVersions: versions.data })
    }
    if (action === 'create_job_resume') {
      if (typeof body.savedJobId !== 'string' || !SAVED_JOB_ID.test(body.savedJobId)) throw new HttpError(400, 'Saved job is invalid')
      const resume = await authoritativeMaster(owner, storedResume(body.resume), db)
      const result = await db.rpc('job_resume_version_create', {
        p_owner: owner, p_saved_job: body.savedJobId, p_data: resume, p_fingerprint: resumeFingerprint(resume),
      })
      if (result.error) {
        if (result.error.message.includes('Active Pro required')) throw new HttpError(403, 'An active Pro pass is required to start new AI tailoring. Existing job-specific resumes remain available.')
        if (result.error.message.includes('Saved job not found')) throw new HttpError(404, 'Save this job before starting tailoring.')
        throw new HttpError(503, 'Unable to start this job-specific resume')
      }
      if (!record(result.data) || typeof result.data.created !== 'boolean') throw new HttpError(503, 'Unable to start this job-specific resume')
      return json(200, { created: result.data.created, version: jobResumeVersion(result.data.version) })
    }
    if (action === 'get_job_resume') {
      if (typeof body.versionId !== 'string' || !VERSION_ID.test(body.versionId)) throw new HttpError(400, 'Job-specific resume is invalid')
      const result = await db.rpc('job_resume_version_get', { p_owner: owner, p_version: body.versionId })
      if (result.error) throw new HttpError(result.error.message.includes('not found') ? 404 : 503, 'Unable to load this job-specific resume')
      return json(200, { version: jobResumeVersion(result.data) })
    }
    if (action === 'update_job_resume' || action === 'reset_job_resume') {
      if (typeof body.versionId !== 'string' || !VERSION_ID.test(body.versionId)
        || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) throw new HttpError(400, 'Job-specific resume update is invalid')
      const providedResume = storedResume(body.resume)
      const resume = action === 'reset_job_resume' ? await authoritativeMaster(owner, providedResume, db) : providedResume
      const rpc = action === 'reset_job_resume' ? 'job_resume_version_reset' : 'job_resume_version_update'
      const args: Record<string, unknown> = {
        p_owner: owner, p_version: body.versionId, p_expected_revision: body.expectedRevision, p_data: resume,
      }
      if (action === 'reset_job_resume') args.p_fingerprint = resumeFingerprint(resume)
      const result = await db.rpc(rpc, args)
      if (result.error) {
        if (result.error.message.includes('conflict')) {
          const current = await db.rpc('job_resume_version_get', { p_owner: owner, p_version: body.versionId })
          if (!current.error) return markResponse(json(409, { error: 'This job-specific resume was updated elsewhere. Your current edits were not overwritten.', version: jobResumeVersion(current.data) }), 'database_conflict')
          throw new HttpError(409, 'This job-specific resume was updated elsewhere. Your current edits were not overwritten.', 'database_conflict')
        }
        if (result.error.message.includes('not found')) throw new HttpError(404, 'This job-specific resume is no longer available.')
        throw new HttpError(503, 'Unable to save this job-specific resume')
      }
      return json(200, { version: jobResumeVersion(result.data) })
    }
    if (action === 'save' || action === 'capture_save') {
      if (action === 'capture_save' && env.EXTENSION_CAPTURE_ENABLED === 'false') throw new HttpError(503, 'Extension job saving is temporarily disabled. Your capture is still available for retry.', 'configuration')
      const captured = action === 'capture_save' ? normalizeCapture(body.capture) : null
      const job = captured ? { ...savedJobSnapshot(captured, { label: 'stretch', reasons: [] }), capture: captured.capture } : parseSavedJobSnapshot(body.job)
      const evidence = parseResumeEvidence(body.evidence)
      if (!evidence && body.evidence === undefined && !captured) {
        const legacy = await db.rpc('jobs_save', { p_owner: owner, p_job: job })
        if (legacy.error) {
          if (legacy.error.message.includes('Free saved-job limit reached')) throw new HttpError(403, 'Free accounts can save up to 3 jobs. Your existing saved jobs are kept; upgrade to Pro to save more.')
          if (legacy.error.message.includes('Saved-job safety limit reached')) throw new HttpError(409, 'Saved-job safety limit reached. Existing saved jobs are unchanged.')
          throw new HttpError(503, 'Unable to save this job')
        }
        return json(200, legacy.data)
      }
      if (!evidence) throw new HttpError(400, 'Resume evidence is required')
      let criteria = body.criteria == null ? { title: job.title.slice(0, 200) } : parseSearchCriteria(body.criteria)
      const context = await db.rpc('jobs_match_context', { p_owner: owner })
      if (context.error) throw new HttpError(503, 'Unable to load match preferences')
      if (captured && record(context.data) && context.data.criteria != null) criteria = parseSearchCriteria(context.data.criteria)
      let clarifications
      try { clarifications = parseClarifications(record(context.data) ? context.data.clarifications : null) }
      catch { throw new HttpError(503, 'Unable to load match preferences') }
      const analysis = analyzeJob(evidence, normalizedJob(job), criteria, clarifications).analysis
      if (captured) { job.matchLabel = analysis.label; job.matchReasons = analysis.observations.slice(0, 5).map(reason => reason.slice(0, 300)) }
      const result = captured
        ? await db.rpc('jobs_save', { p_owner: owner, p_job: job })
        : await db.rpc('jobs_save_v2', { p_owner: owner, p_job: job, p_analysis: analysis })
      if (result.error) {
        if (result.error.message.includes('Free saved-job limit reached')) {
          throw new HttpError(403, 'Free accounts can save up to 3 jobs. Your existing saved jobs are kept; upgrade to Pro to save more.')
        }
        if (result.error.message.includes('Saved-job safety limit reached')) throw new HttpError(409, 'Saved-job safety limit reached. Existing saved jobs are unchanged.')
        throw new HttpError(503, 'Unable to save this job')
      }
      if (captured) {
        if (!record(result.data) || typeof result.data.savedJobId !== 'string' || !SAVED_JOB_ID.test(result.data.savedJobId)) throw new HttpError(503, 'Unable to save this capture')
        // A URL duplicate may already have an immutable provider snapshot. Always analyze
        // that authoritative saved record, never overwrite its analysis with incoming edits.
        await savedReanalysis(owner, result.data.savedJobId, evidence, db)
      }
      return json(200, result.data)
    }
    if (action === 'reanalyze') {
      if (typeof body.savedJobId !== 'string' || !SAVED_JOB_ID.test(body.savedJobId)) throw new HttpError(400, 'Saved job is invalid')
      const evidence = parseResumeEvidence(body.evidence)
      if (!evidence) throw new HttpError(400, 'Resume evidence is required')
      const matchAnalysis = await savedReanalysis(owner, body.savedJobId, evidence, db)
      return json(200, { refreshed: true, matchAnalysis })
    }
    if (action === 'remove') {
      if (typeof body.savedJobId !== 'string' || !SAVED_JOB_ID.test(body.savedJobId)) throw new HttpError(400, 'Saved job is invalid')
      const result = await db.rpc('jobs_remove', { p_owner: owner, p_saved_job: body.savedJobId })
      if (result.error) throw new HttpError(503, 'Unable to remove this saved job')
      return json(200, { removed: result.data === true })
    }
    if (action === 'preferences') {
      if (typeof body.autoRefresh !== 'boolean') throw new HttpError(400, 'Auto Refresh preference is invalid')
      let criteria: SearchCriteria | null = null
      if (body.criteria !== null && body.criteria !== undefined) criteria = parseSearchCriteria(body.criteria)
      const result = await db.rpc('jobs_set_preferences', { p_owner: owner, p_criteria: criteria, p_auto_refresh: body.autoRefresh })
      if (result.error) throw new HttpError(503, 'Unable to save job preferences')
      return json(200, { saved: true })
    }
    if (action === 'clarification') {
      if (typeof body.requirementId !== 'string' || !/^[0-9a-f]{16}$/.test(body.requirementId)
        || typeof body.value !== 'string' || !['demonstrated', 'not_have', 'unsure'].includes(body.value)) {
        throw new HttpError(400, 'Match clarification is invalid')
      }
      const evidence = body.evidence === undefined ? null : parseResumeEvidence(body.evidence)
      if (body.evidence !== undefined && !evidence) throw new HttpError(400, 'Resume evidence is required')
      if (body.savedJobId !== undefined && (typeof body.savedJobId !== 'string' || !SAVED_JOB_ID.test(body.savedJobId))) throw new HttpError(400, 'Saved job is invalid')
      if (evidence && body.savedJobId === undefined) parseSavedJobSnapshot(body.job)
      const result = await db.rpc('jobs_set_match_clarification', { p_owner: owner, p_requirement_id: body.requirementId, p_value: body.value })
      if (result.error) throw new HttpError(503, 'Unable to save this clarification')
      if (!evidence) return json(200, { saved: true })
      if (typeof body.savedJobId === 'string') {
        const matchAnalysis = await savedReanalysis(owner, body.savedJobId, evidence, db)
        return json(200, { saved: true, matchAnalysis })
      }
      const job = parseSavedJobSnapshot(body.job)
      const criteria = body.criteria == null ? { title: job.title } : parseSearchCriteria(body.criteria)
      const context = await db.rpc('jobs_match_context', { p_owner: owner })
      const entitlement = await db.rpc('billing_get_entitlement', { p_owner: owner })
      if (context.error || entitlement.error) throw new HttpError(503, 'Unable to refresh this evidence analysis')
      let clarifications
      try { clarifications = parseClarifications(record(context.data) ? context.data.clarifications : null) }
      catch { throw new HttpError(503, 'Unable to refresh this evidence analysis') }
      const analysis = analyzeJob(evidence, normalizedJob(job), criteria, clarifications).analysis
      const isPro = Array.isArray(entitlement.data) && record(entitlement.data[0]) && entitlement.data[0].is_pro === true
      return json(200, { saved: true, matchAnalysis: analysisView(analysis, isPro) })
    }
    throw new HttpError(400, 'Unknown saved-job action')
  } catch (error) { return safeError(error) }
}
