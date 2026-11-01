import { createHash } from 'node:crypto'
import { isJobCapture, type JobCapture } from '../../apps/extension/src/lib/capture.ts'
import { HttpError } from '../http/security.ts'
import { dedupeKey } from './dedupe.ts'
import type { NormalizedJob } from './types.ts'

export function normalizeCapture(value: unknown): NormalizedJob & { capture: JobCapture } {
  if (!isJobCapture(value)) throw new HttpError(400, 'This job link could not be saved.')
  const url = new URL(value.sourceUrl || 'http://invalid')
  if (url.protocol !== 'https:') throw new HttpError(400, 'Saving a captured job requires its public HTTPS source URL.')
  // Tracking/query/fragment data is rejected by the shared contract. A stable page URL
  // keeps retries and edits attached to the same identity; never pretend to be Techmap.
  const sourceUrl = url.origin + (url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, ''))
    + url.search
  const providerJobId = createHash('sha256').update(sourceUrl).digest('hex')
  const portalName = value.site === 'linkedin' ? 'LinkedIn'
    : value.site === 'indeed' ? 'Indeed'
      : value.site === 'ziprecruiter' ? 'ZipRecruiter'
        : url.hostname.replace(/^www\./, '')
  const job: NormalizedJob & { capture: JobCapture } = {
    id: `extension:${providerJobId}`, provider: 'extension', providerJobId,
    title: value.title.trim() || 'Job details pending', company: value.company.trim() || portalName, descriptionText: value.description,
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

export function captureHasDetails(capture: JobCapture): boolean {
  return Boolean(capture.title.trim() && capture.company.trim() && capture.description.trim())
}
