import { timingSafeEqual } from 'node:crypto'
import { HttpError, json, safeError } from '../http/security.ts'
import { serviceDatabase } from '../database.ts'
import { techmapConfig } from './config.ts'
import { techmapSearch } from './techmap.ts'
import { parseSearchCriteria } from './criteria.ts'
import { parseResumeEvidence, analyzeJob, analysisView } from './match.ts'
import { savedJobSnapshot } from './account.ts'
import { matchesEmploymentType, matchesLocation, matchesSalaryPreference } from './filter.ts'
import { applyDiversity } from './diversity.ts'
import { dedupeJobs } from './dedupe.ts'
import { reserveProviderRequest } from './provider-budget.ts'
import { buildResumeEvidence } from '../../src/features/jobs/evidence.ts'
import { isResume } from '../../src/model.ts'

function secretMatches(actual: string | null, expected: string | undefined): boolean {
  if (!actual?.startsWith('Bearer ') || !expected || expected.length < 24) return false
  const a = Buffer.from(actual.slice(7)); const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const dependencies = { serviceDatabase, techmapSearch, delay: (ms:number) => new Promise<void>(resolve=>setTimeout(resolve,ms)) }
type Dependencies = typeof dependencies

export async function refreshJobsAutomatically(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'POST') throw new HttpError(405, 'Method not allowed')
    if (!secretMatches(request.headers.get('authorization'), env.CRON_SECRET)) throw new HttpError(401, 'Not authorized')
    const db = deps.serviceDatabase(env)
    const claimed = await db.rpc('jobs_claim_auto_refresh', { p_limit: 5 })
    if (claimed.error || !Array.isArray(claimed.data)) throw new HttpError(503, 'Automatic refresh queue is unavailable')
    const config = techmapConfig(env)
    let completed = 0; let capped = 0; let failed = 0
    for (const raw of claimed.data) {
      const item = raw as Record<string, unknown>
      const owner = typeof item.ownerId === 'string' ? item.ownerId : ''
      try {
        const criteria = parseSearchCriteria(item.criteria)
        const evidence = parseResumeEvidence(item.evidence) ?? (isResume(item.resume) ? parseResumeEvidence(buildResumeEvidence(item.resume)) : null)
        if (!evidence) throw new Error('evidence_unavailable')
        // This direct provider call deliberately bypasses the shared query cache: an
        // automatic refresh is a genuinely fresh listing request, never a relabelled
        // cached result.
        await reserveProviderRequest(db, owner, 'automatic')
        const page = await deps.techmapSearch(config, { title: criteria.title, countryCode: criteria.countryCode, workPlace: criteria.workplace, page: 1 })
        const labelOrder = { strong:0, good:1, stretch:2 } as const
        const ranked = dedupeJobs(page.jobs)
          .filter(job => matchesEmploymentType(job, criteria.employmentType) && matchesSalaryPreference(job, criteria.salary) && matchesLocation(job, criteria.location))
          .map(job => ({ job, match: analyzeJob(evidence, job, criteria, {}) }))
          .filter(entry => entry.match.searchEligible)
          .sort((a,b) => labelOrder[a.match.label]-labelOrder[b.match.label] || b.match.rank-a.match.rank)
        const diverse = new Set(applyDiversity(ranked.map(entry=>entry.job), 10))
        const jobs = ranked.filter(entry=>diverse.has(entry.job)).slice(0,10).map(({job,match}) => ({
          id:job.id,title:job.title,company:job.company,location:job.location.value,workplace:job.workplace.value,
          employmentType:job.employmentType.value,salary:job.salary,postedAt:job.postedAt,portal:job.portal,
          matchLabel:match.label,matchReasons:match.reasons,matchAnalysis:analysisView(match.analysis,false),sourceUrl:job.sourceUrl,
          savedSnapshot:savedJobSnapshot(job,match),
        }))
        const result = { jobs, isPro:false, availableCount:ranked.length, proLimit:20, automatic:true }
        await db.rpc('jobs_finish_auto_refresh', { p_owner: owner, p_status: jobs.length ? 'ready' : 'no_results', p_result: result })
        completed++
      } catch (error) {
        const isCap = error instanceof HttpError && error.category === 'rate_limit'
        await db.rpc('jobs_finish_auto_refresh', { p_owner: owner, p_status: isCap ? 'provider_cap' : 'failed', p_result: null })
        if (isCap) capped++; else failed++
      }
      await deps.delay(1100)
    }
    return json(200,{ claimed:claimed.data.length,completed,capped,failed })
  } catch (error) { return safeError(error) }
}
