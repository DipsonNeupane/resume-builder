import { createHash } from 'node:crypto'
import { captureSourceUrl, isJobCapture, type JobCapture } from '../../apps/extension/src/lib/capture.ts'
import { HttpError } from '../http/security.ts'
import { dedupeKey } from './dedupe.ts'
import type { NormalizedJob } from './types.ts'

export function normalizeCapture(value: unknown): NormalizedJob & { capture: JobCapture } {
  if (!isJobCapture(value) || !value.title.trim() || !value.company.trim() || !value.description.trim()) throw new HttpError(400, 'Review the captured title, company, and description before saving.')
  const url = new URL(value.sourceUrl || 'http://invalid')
  if (url.protocol !== 'https:') throw new HttpError(400, 'Saving a captured job requires its public HTTPS source URL.')
  // The shared canonicalizer preserves only public job identity (including Indeed's `jk`)
  // while rejecting tracking/private query state. Never collapse distinct query-identified jobs.
  const sourceUrl = captureSourceUrl(value.sourceUrl)
  if (!sourceUrl) throw new HttpError(400, 'Review the captured job source before saving.')
  const providerJobId = createHash('sha256').update(sourceUrl).digest('hex')
  const job: NormalizedJob & { capture: JobCapture } = {
    id: `extension:${providerJobId}`, provider: 'extension', providerJobId,
    title: value.title.trim(), company: value.company.trim(), descriptionText: value.description,
    location: { value: { city: null, region: value.location?.slice(0, 200) || null, country: null }, source: 'unknown', confidence: 'low' },
    workplace: { value: value.workplace || 'unknown', source: 'unknown', confidence: 'low' },
    employmentType: { value: value.employmentType || 'unknown', source: 'unknown', confidence: 'low' },
    salary: value.salary ? { ...value.salary, confidence: 'low' } : null,
    sourceUrl, portal: url.hostname, source: `extension:${value.site || 'manual'}`,
    retrievedAt: new Date().toISOString(), postedAt: null,
    expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
    directness: { value: null, confidence: 'low', source: 'unknown' }, dedupeKey: '',
    capture: structuredClone(value),
  }
  job.dedupeKey = dedupeKey(job)
  return job
}
