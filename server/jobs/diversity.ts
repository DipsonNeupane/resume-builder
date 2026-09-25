/** Source/employer diversity cap. Deterministic, order-preserving round-robin: jobs are
 * grouped by employer (company, folded) and taken one-per-group in turn, so a single
 * employer or a single source/portal flooding the retrieved page cannot dominate the
 * capped result the caller ultimately displays. Ranking order within each group is
 * preserved — this only decides which jobs make the cut, never re-sorts survivors.
 * Deliberately never backfills remaining seats past the per-source cap: when too few
 * distinct employers/sources exist to fill `cap` fairly, the result is simply shorter
 * than `cap` — returning fewer, genuinely diverse jobs is preferable to restoring the
 * exact domination this cap exists to prevent. The caps apply unconditionally — even
 * when fewer jobs than `cap` were retrieved in total — because a single employer or
 * source can dominate a small retrieved set just as easily as a large one; there is no
 * "too few jobs to bother" exemption. */
import type { NormalizedJob } from './types.ts'

const MAX_SOURCE_SHARE_FRACTION = 0.5
// Stricter than the source cap: a single employer flooding many distinct portals would
// otherwise never trip the source cap at all, so the employer share must be capped
// tighter to guarantee no single employer can dominate the result.
const MAX_EMPLOYER_SHARE_FRACTION = 0.3

function groupKey(job: NormalizedJob): string {
  return job.company.trim().toLowerCase()
}

function sourceKey(job: NormalizedJob): string {
  return (job.portal ?? job.source ?? 'unknown').trim().toLowerCase()
}

/** `jobs` must already be in the caller's preferred order (e.g. ranked best-first);
 * diversity selection stays stable within that order rather than re-ranking. */
export function applyDiversity(jobs: NormalizedJob[], cap: number): NormalizedJob[] {
  const groups = new Map<string, NormalizedJob[]>()
  for (const job of jobs) {
    const key = groupKey(job)
    const bucket = groups.get(key)
    if (bucket) bucket.push(job)
    else groups.set(key, [job])
  }
  const buckets = [...groups.values()]
  const maxPerSource = Math.max(1, Math.ceil(cap * MAX_SOURCE_SHARE_FRACTION))
  const maxPerEmployer = Math.max(1, Math.ceil(cap * MAX_EMPLOYER_SHARE_FRACTION))
  const sourceCounts = new Map<string, number>()
  const employerCounts = new Map<string, number>()
  const result: NormalizedJob[] = []

  // Pass 1: round-robin across employers, skipping a job whose source/portal — or whose
  // own employer — has already hit its fair-share cap, so neither dimension can
  // dominate. The employer cap matters even though the round-robin already spreads
  // across buckets: a single employer whose jobs span many distinct sources would
  // otherwise never trip the source cap and could still fill the entire result alone.
  let cursor = 0
  while (result.length < cap && buckets.some(bucket => cursor < bucket.length)) {
    for (const bucket of buckets) {
      if (result.length >= cap) break
      const job = bucket[cursor]
      if (!job) continue
      const employer = groupKey(job)
      const employerCount = employerCounts.get(employer) ?? 0
      if (employerCount >= maxPerEmployer) continue
      const source = sourceKey(job)
      const sourceCount = sourceCounts.get(source) ?? 0
      if (sourceCount >= maxPerSource) continue
      result.push(job)
      sourceCounts.set(source, sourceCount + 1)
      employerCounts.set(employer, employerCount + 1)
    }
    cursor += 1
  }

  // No backfill pass: any seats left empty by the source cap stay empty rather than
  // being refilled from the original ranked order, which would let a single dominant
  // source flood right back in.
  return result
}
