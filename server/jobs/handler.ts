/** POST /api/jobs-search handler. Method/origin validation and authentication run first,
 * strictly ahead of any provider-config, database, or provider work — an invalid origin
 * or method, or a failed sign-in, must never cause Techmap config to be read, the
 * database to be touched, or a provider request to be issued. Bounded to at most two
 * Techmap pages per request (see techmap.ts's fixed page size), with an injectable delay
 * before the optional second page so a Basic-plan one-request-per-second limit is
 * respected. Resume evidence and criteria are accepted here for ranking, but only
 * `criteria.title`/`countryCode`/`workplace` are ever forwarded to Techmap
 * (techmapSearch's own params) — employment type, salary preference, free-text location,
 * and every resume field stay server-side only. A Free account's response is truncated
 * to FREE_JOB_LIMIT real jobs before it ever leaves this handler; no hidden full payload
 * for the remaining jobs is ever sent to a Free browser client. */
import { authenticate, HttpError, json, jsonBody, requirePost, safeError } from '../http/security.ts'
import { databaseConfig, serviceDatabase } from '../database.ts'
import { techmapConfig } from './config.ts'
import { techmapSearch } from './techmap.ts'
import { dedupeJobs } from './dedupe.ts'
import { applyDiversity } from './diversity.ts'
import { analysisView, analyzeJob, jobMatchHash, parseClarifications, parseResumeEvidence, type MatchResult } from './match.ts'
import { parseSearchCriteria } from './criteria.ts'
import { matchesEmploymentType, matchesLocation, matchesSalaryPreference } from './filter.ts'
import { cacheKey, getOrFetchJobs } from './cache.ts'
import type { EmploymentType, MatchLabel, NormalizedJob, SalaryNormalized, Workplace } from './types.ts'
import { savedJobSnapshot } from './account.ts'

function defaultDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const dependencies = { authenticate, serviceDatabase, techmapSearch, delay: defaultDelay }
type Dependencies = typeof dependencies

export const FREE_JOB_LIMIT = 5
export const PRO_JOB_LIMIT = 20
const MAX_BODY_BYTES = 200000
const LABEL_ORDER: Record<MatchLabel, number> = { strong: 0, good: 1, stretch: 2 }
// The known Basic-plan Techmap rate limit is one request per second; this pads past that
// boundary before the optional, non-essential second page so back-to-back requests never
// trip it.
const SECOND_PAGE_DELAY_MS = 1100

export type JobCardView = {
  id: string
  title: string
  company: string
  location: { city: string | null; region: string | null; country: string | null }
  workplace: Workplace
  employmentType: EmploymentType
  salary: SalaryNormalized
  postedAt: string | null
  portal: string | null
  matchLabel: MatchLabel
  matchReasons: string[]
  matchAnalysis: ReturnType<typeof analysisView>
  sourceUrl: string
  savedSnapshot: ReturnType<typeof savedJobSnapshot>
}

function toCardView(job: NormalizedJob, match: MatchResult, isPro: boolean): JobCardView {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location.value,
    workplace: job.workplace.value,
    employmentType: job.employmentType.value,
    salary: job.salary,
    postedAt: job.postedAt,
    portal: job.portal,
    matchLabel: match.label,
    matchReasons: match.reasons,
    matchAnalysis: analysisView(match.analysis, isPro),
    sourceUrl: job.sourceUrl,
    savedSnapshot: savedJobSnapshot(job, match),
  }
}

export async function searchJobs(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
  try {
    if (!env.APP_ORIGIN) throw new HttpError(503, 'Job search is not configured', 'configuration')
    requirePost(request, env.APP_ORIGIN)
    const owner = await deps.authenticate(request, databaseConfig(env))

    // Only past this point may provider configuration, the database, or the provider
    // itself be touched — the origin/method check and authentication above are complete.
    const config = techmapConfig(env)
    const body = await jsonBody(request, MAX_BODY_BYTES)
    const criteria = parseSearchCriteria(body.criteria)
    const evidence = parseResumeEvidence(body.evidence)
    if (!evidence) throw new HttpError(400, 'Resume evidence is required')

    const db = deps.serviceDatabase(env)
    // Durable per-owner throttle, checked before any provider call: the cache above is
    // keyed by exact search signature, so varying the title bypasses it, and this is
    // the only remaining bound on how often Techmap may be hit under this app's key.
    const throttled = await db.rpc('jobs_throttle_search_attempt', { p_owner: owner })
    if (throttled.error?.code === '54000') throw new HttpError(429, 'Too many job searches. Wait a few minutes and try again.')
    if (throttled.error) throw new HttpError(503, 'Job search throttle unavailable')
    const entitlement = await db.rpc('billing_get_entitlement', { p_owner: owner })
    if (entitlement.error) throw new HttpError(503, 'Unable to verify Pro access')
    const isPro = entitlement.data?.[0]?.is_pro === true
    const matchContext = await db.rpc('jobs_match_context', { p_owner: owner })
    if (matchContext.error) throw new HttpError(503, 'Unable to load match preferences')
    let clarifications = {}
    try { clarifications = parseClarifications(matchContext.data?.clarifications) }
    catch { throw new HttpError(503, 'Unable to load match preferences') }

    // Deliberately excludes employmentType/salary/location from the cache signature and
    // the Techmap request itself: they are applied as a local filter below, never sent
    // upstream, so requests differing only in those fields can still share one provider
    // fetch. Also deliberately excludes the owner: cached jobs carry no resume/account
    // data, so an identical normalized public query is reused across accounts, and
    // getOrFetchJobs coalesces simultaneous identical misses onto one provider fetch.
    const signature = JSON.stringify({ title: criteria.title.toLowerCase(), countryCode: criteria.countryCode ?? null, workplace: criteria.workplace ?? null })
    const key = cacheKey(signature)
    const searchParams = { title: criteria.title, countryCode: criteria.countryCode, workPlace: criteria.workplace }
    const jobs = await getOrFetchJobs(key, async () => {
      const page1 = await deps.techmapSearch(config, { ...searchParams, page: 1 })
      let combined = page1.jobs
      if (page1.hasMore) {
        await deps.delay(SECOND_PAGE_DELAY_MS)
        try {
          const page2 = await deps.techmapSearch(config, { ...searchParams, page: 2 })
          combined = combined.concat(page2.jobs)
        } catch (error) {
          // A 429 on the second, optional page still leaves page one's results
          // usable; never retried automatically either way.
          if (!(error instanceof HttpError && error.status === 429)) throw error
        }
      }
      return dedupeJobs(combined)
    })

    const filtered = jobs.filter(job =>
      matchesEmploymentType(job, criteria.employmentType)
      && matchesSalaryPreference(job, criteria.salary)
      && matchesLocation(job, criteria.location),
    )
    const ranked = filtered
      .map(job => ({ job, match: analyzeJob(evidence, job, criteria, clarifications) }))
      .sort((a, b) => LABEL_ORDER[a.match.label] - LABEL_ORDER[b.match.label] || b.match.rank - a.match.rank)
    const diverseJobs = new Set(applyDiversity(ranked.map(entry => entry.job), PRO_JOB_LIMIT))
    const diverseRanked = ranked.filter(entry => diverseJobs.has(entry.job))

    const limit = isPro ? PRO_JOB_LIMIT : FREE_JOB_LIMIT
    const cards = diverseRanked.slice(0, limit).map(entry => toCardView(entry.job, entry.match, isPro))

    // Availability is refreshed separately from the immutable saved snapshot, using
    // only positive observations from this provider response. A missing item in these
    // bounded pages never marks a saved record unavailable, and this database update
    // consumes no additional provider request.
    const observations = jobs.slice(0, PRO_JOB_LIMIT)
    await db.rpc('jobs_mark_seen', {
      p_owner: owner,
      p_provider_ids: observations.map(job => job.id),
      p_expires_at: observations.map(job => job.expiry.expiresAt),
      p_expiry_sources: observations.map(job => job.expiry.source),
    })
    await db.rpc('jobs_invalidate_job_analyses', {
      p_owner: owner,
      // Invalidate from every positively observed provider record, even if a changed
      // salary/location/employment field made that job fail today's local filters.
      p_provider_ids: observations.map(job => job.id),
      p_job_hashes: observations.map(jobMatchHash),
    })

    return json(200, { jobs: cards, isPro, availableCount: diverseRanked.length, proLimit: PRO_JOB_LIMIT })
  } catch (error) { return safeError(error) }
}
