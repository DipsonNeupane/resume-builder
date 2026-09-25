import { createHash } from 'node:crypto'
import type { NormalizedJob } from './types.ts'

// Collapses whitespace/case/punctuation variance so trivially different renderings of
// the same title, employer or location (extra spaces, differing case, a stray period)
// still collide on the same key.
function fold(value: string | null): string {
  return (value ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

function foldDescription(value: string): string {
  return fold(value).slice(0, 2000)
}

/** Canonical fingerprint for ResumeStride's own deduplication, independent of any
 * `isDuplicate`-style flag a provider reports (the September 24 Techmap benchmark could
 * not confirm that flag alone was authoritative). Requires the *full* location
 * (including country) plus a description fingerprint to agree — title/company alone is
 * not enough — so postings with the same title/company in different countries, or with
 * materially different descriptions, are never collapsed together. */
export function dedupeKey(job: Pick<NormalizedJob, 'title' | 'company' | 'location' | 'descriptionText'>): string {
  const parts = [
    fold(job.title),
    fold(job.company),
    fold(job.location.value.city),
    fold(job.location.value.region),
    fold(job.location.value.country),
    foldDescription(job.descriptionText),
  ]
  return createHash('sha256').update(parts.join('\u0000')).digest('hex')
}

/** Conservative: a job is only treated as a duplicate of one already kept when it
 * shares the namespaced stable id (`${provider}:${providerJobId}`), the exact source
 * URL, or the full composite fingerprint above — never on title/company/location
 * alone. The namespaced id is used rather than the raw `providerJobId` so that two
 * different providers whose own id spaces happen to collide (e.g. both assigning "42")
 * are never collapsed together. Input order is preserved for survivors. Bounded by the
 * caller's own page-size limits, so no size cap is needed here. */
export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seenIds = new Set<string>()
  const seenUrls = new Set<string>()
  const seenKeys = new Set<string>()
  const result: NormalizedJob[] = []
  for (const job of jobs) {
    if (seenIds.has(job.id) || seenUrls.has(job.sourceUrl) || seenKeys.has(job.dedupeKey)) continue
    seenIds.add(job.id)
    seenUrls.add(job.sourceUrl)
    seenKeys.add(job.dedupeKey)
    result.push(job)
  }
  return result
}
