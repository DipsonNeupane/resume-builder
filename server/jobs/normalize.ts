import type { Confidence, FieldProvenance, JobLocation, NormalizedJob } from './types.ts'
import { firstBoolean, firstDate, firstRecord, firstString, isRecord } from './raw.ts'
import { safeJobUrl } from './url.ts'
import { normalizeWorkplace } from './workplace.ts'
import { normalizeEmploymentType } from './employment.ts'
import { normalizeSalary } from './salary.ts'
import { expiryStatus } from './expiry.ts'
import { dedupeKey } from './dedupe.ts'

const MAX_TITLE_CHARS = 300
const MAX_COMPANY_CHARS = 300
const MAX_LOCATION_CHARS = 200
const MAX_DESCRIPTION_CHARS = 20000
const MAX_ID_CHARS = 200
const MAX_META_CHARS = 200

// Verified v2 Techmap shape: title/company/countryCode/state/city/workPlace/contractType/
// workType/dateCreated/dateActive/dateExpired/isDirect/isRecruiter/portal/source live at
// the top level; the stable provider id, description, apply URL, salary and validThrough
// live under jsonLD.
function location(raw: Record<string, unknown>): FieldProvenance<JobLocation> {
  const city = firstString(raw, ['city'], MAX_LOCATION_CHARS)
  const region = firstString(raw, ['state'], MAX_LOCATION_CHARS)
  const country = firstString(raw, ['countryCode'], MAX_LOCATION_CHARS)
  const presentCount = [city, region, country].filter(Boolean).length
  const confidence: Confidence = presentCount === 3 ? 'high' : presentCount > 0 ? 'medium' : 'low'
  return {
    value: { city, region, country },
    source: presentCount > 0 ? 'provider' : 'unknown',
    confidence,
  }
}

// isDirect is only ever explicit when the provider states it; isRecruiter is used only
// as a low-confidence, clearly-labeled inference when isDirect itself is absent — never
// promoted to the same confidence as a stated flag. Neither value verifies that
// `sourceUrl` itself is a direct application destination — see sourceUrl's doc comment
// in types.ts and safeJobUrl's in url.ts: a caller must keep presenting that link as
// "View job" unless it independently verifies the destination.
function directness(raw: Record<string, unknown>): FieldProvenance<boolean | null> {
  const explicit = firstBoolean(raw, ['isDirect'])
  if (explicit !== null) return { value: explicit, source: 'provider', confidence: 'high' }
  const isRecruiter = firstBoolean(raw, ['isRecruiter'])
  if (isRecruiter === true) return { value: false, source: 'inferred', confidence: 'medium' }
  return { value: null, source: 'unknown', confidence: 'low' }
}

/** Maps one raw provider record to the normalized Job model. Returns null (dropping the
 * record entirely) when a field required for a safe, useful listing is missing: a
 * stable id (jsonLD.identifier), a title, a company, or a URL that passes safeJobUrl().
 * Every other field degrades to null/unknown rather than causing rejection. */
export function normalizeJob(raw: unknown, provider: string, retrievedAt: Date): NormalizedJob | null {
  if (!isRecord(raw)) return null

  const jsonLd = firstRecord(raw, ['jsonLD'])
  const providerJobId = jsonLd ? firstString(jsonLd, ['identifier'], MAX_ID_CHARS) : null
  const title = firstString(raw, ['title'], MAX_TITLE_CHARS)
  const company = firstString(raw, ['company'], MAX_COMPANY_CHARS)
  const sourceUrl = safeJobUrl(jsonLd ? jsonLd['url'] : undefined)
  if (!providerJobId || !title || !company || !sourceUrl) return null

  const descriptionText = (jsonLd ? firstString(jsonLd, ['description'], MAX_DESCRIPTION_CHARS) : null) ?? ''

  const job: NormalizedJob = {
    id: `${provider}:${providerJobId}`,
    provider,
    providerJobId,
    title,
    company,
    location: location(raw),
    workplace: normalizeWorkplace(raw),
    employmentType: normalizeEmploymentType(raw),
    salary: normalizeSalary(raw),
    descriptionText,
    postedAt: firstDate(raw, ['dateCreated'])?.toISOString() ?? null,
    expiry: expiryStatus(raw, retrievedAt),
    directness: directness(raw),
    sourceUrl,
    portal: firstString(raw, ['portal'], MAX_META_CHARS),
    source: firstString(raw, ['source'], MAX_META_CHARS),
    dedupeKey: '',
    retrievedAt: retrievedAt.toISOString(),
  }
  job.dedupeKey = dedupeKey(job)
  return job
}
