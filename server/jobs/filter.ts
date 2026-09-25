/** Post-retrieval filtering by criteria that are never sent to Techmap (employment type,
 * salary preference, free-text location). All three filters are deliberately permissive
 * toward unknown data: a job whose employment type, salary, or location Techmap never
 * reported stays eligible rather than being dropped for a gap in provider data. */
import type { NormalizedJob } from './types.ts'
import type { SalaryPreference } from './criteria.ts'

const MAX_LOCATION_CHARS = 200

export function matchesEmploymentType(job: NormalizedJob, employmentType: string | undefined): boolean {
  if (!employmentType) return true
  if (job.employmentType.value === 'unknown') return true
  return job.employmentType.value === employmentType
}

/** Never converts or compares across currency/period: a job whose salary is unknown, or
 * whose currency/period differs from the preference, always stays eligible. Only a job
 * with an explicit, matching currency+period salary can be excluded, and only when its
 * own range [min,max] fails to overlap the requested [min,max] range (an open end on
 * either side matches anything on that side). */
export function matchesSalaryPreference(job: NormalizedJob, salary: SalaryPreference | undefined): boolean {
  if (!salary) return true
  if (!job.salary) return true
  if (job.salary.currency !== salary.currency || job.salary.period !== salary.period) return true
  if (salary.min !== null && job.salary.max < salary.min) return false
  if (salary.max !== null && job.salary.min > salary.max) return false
  return true
}

/** Collapses whitespace/case/diacritics so trivially different renderings of the same
 * place name (extra spaces, differing case, accents) still compare equal. Bounded to a
 * fixed max length; anything longer is truncated rather than blowing up comparison cost. */
function normalizeLocationText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LOCATION_CHARS)
}

/** A job with no city/region/country reported at all stays eligible (unknown location is
 * never treated as a mismatch). Otherwise the query must appear in — or contain — at
 * least one of the job's own location parts, compared on normalized text only; this is a
 * bounded literal/substring match, never a geocoded or fuzzy distance comparison. */
export function matchesLocation(job: NormalizedJob, location: string | undefined): boolean {
  if (!location) return true
  const query = normalizeLocationText(location)
  if (!query) return true
  const { city, region, country } = job.location.value
  const parts = [city, region, country].filter((part): part is string => !!part)
  if (parts.length === 0) return true
  return parts.some(part => {
    const normalized = normalizeLocationText(part)
    return !!normalized && (normalized === query || normalized.includes(query) || query.includes(normalized))
  })
}
