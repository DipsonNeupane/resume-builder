import { observeOperation, diagnosticFetch } from '../observability.js'
/** Techmap v2 (RapidAPI "daily-international-job-postings") job-postings adapter.
 * Server-only: the API key lives in TECHMAP_API_KEY (see config.ts) and is attached
 * only to the outbound provider request below via headers, never logged, never echoed
 * in an error message, and never reachable from browser code. No resume content or user
 * PII is ever part of this request — the only inputs are a free-text title, an optional
 * country/workplace/date-range filter, and pagination, exactly like
 * server/ai/tailoring.ts's boundary discipline for the AI provider. */
import { HttpError } from '../http/security.ts'
import type { JobProvider, JobSearchParams, JobSearchResult, NormalizedJob, Workplace } from './types.ts'
import type { TechmapConfig } from './config.ts'
import { normalizeJob } from './normalize.ts'
import { dedupeJobs } from './dedupe.ts'

const TIMEOUT_MS = 10000
const MAX_TITLE_CHARS = 200
const MAX_PAGE = 20
// Techmap v2 fixes the page size at 10; it is not a request parameter.
const PAGE_SIZE = 10
const MAX_RESPONSE_BYTES = 2_000_000
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const WORKPLACE_VALUES: Workplace[] = ['remote', 'hybrid', 'onsite', 'field']
// Provider searches must stay bounded: an explicit dateCreatedMin/dateCreatedMax range
// is capped to 31 days so a caller can never ask Techmap to scan an unbounded window.
const MAX_DATE_RANGE_DAYS = 31
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Parses a YYYY-MM-DD string to a UTC-midnight epoch, rejecting anything that is not a
 * real UTC calendar date (e.g. 2026-02-30 or 2026-13-01), not just pattern-shaped. */
function parseUtcDate(value: string): number | null {
  const match = DATE_PATTERN.exec(value)
  if (!match) return null
  const [, yearStr, monthStr, dayStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const epoch = Date.UTC(year, month - 1, day)
  const parsed = new Date(epoch)
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null
  }
  return epoch
}

function assertParams(params: JobSearchParams): void {
  if (typeof params.title !== 'string' || !params.title.trim() || params.title.length > MAX_TITLE_CHARS) {
    throw new HttpError(400, 'Job search title is invalid')
  }
  if (params.countryCode !== undefined && !COUNTRY_CODE_PATTERN.test(params.countryCode)) {
    throw new HttpError(400, 'Job search country code is invalid')
  }
  if (params.workPlace !== undefined && !WORKPLACE_VALUES.includes(params.workPlace)) {
    throw new HttpError(400, 'Job search workplace is invalid')
  }
  let minEpoch: number | null = null
  let maxEpoch: number | null = null
  if (params.dateCreatedMin !== undefined) {
    minEpoch = parseUtcDate(params.dateCreatedMin)
    if (minEpoch === null) throw new HttpError(400, 'Job search date range is invalid')
  }
  if (params.dateCreatedMax !== undefined) {
    maxEpoch = parseUtcDate(params.dateCreatedMax)
    if (maxEpoch === null) throw new HttpError(400, 'Job search date range is invalid')
  }
  if (minEpoch !== null && maxEpoch !== null) {
    if (minEpoch > maxEpoch) throw new HttpError(400, 'Job search date range is invalid')
    if ((maxEpoch - minEpoch) / MS_PER_DAY > MAX_DATE_RANGE_DAYS) {
      throw new HttpError(400, 'Job search date range is invalid')
    }
  }
  if (params.page !== undefined && (!Number.isInteger(params.page) || params.page < 1 || params.page > MAX_PAGE)) {
    throw new HttpError(400, 'Job search page is invalid')
  }
}

function buildRequestUrl(config: TechmapConfig, params: JobSearchParams): URL {
  const url = new URL(config.url)
  url.searchParams.set('title', params.title.trim())
  if (params.countryCode) url.searchParams.set('countryCode', params.countryCode.toUpperCase())
  if (params.workPlace) url.searchParams.set('workPlace', params.workPlace)
  if (params.dateCreatedMin) url.searchParams.set('dateCreatedMin', params.dateCreatedMin)
  if (params.dateCreatedMax) url.searchParams.set('dateCreatedMax', params.dateCreatedMax)
  url.searchParams.set('page', String(params.page ?? 1))
  // Bounded, active, non-duplicate by construction: every Techmap request this adapter
  // issues asks the provider to pre-filter to currently active, provider-flagged
  // non-duplicate postings. ResumeStride's own dedupeJobs() below still runs
  // independently, because the September 24 benchmark could not confirm the provider
  // flag alone was authoritative (see HANDOFF.md).
  url.searchParams.set('isActive', 'true')
  url.searchParams.set('isDuplicate', 'false')
  return url
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

/** Mirrors the bounded-read shape of boundedJson() in server/ai/tailoring.ts: reads the
 * provider response under a hard byte cap so a misbehaving or compromised upstream
 * cannot force unbounded memory use. */
async function boundedJson(response: Response, limit: number): Promise<unknown> {
  const bad = () => new HttpError(502, 'Job search returned an unusable response', 'provider_invalid')
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw bad()
  if (!response.body) throw bad()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw bad() }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw bad() }
  try { return JSON.parse(text) } catch { throw bad() }
}

// Verified v2 Techmap response shape: the job array lives under `result`.
function extractRawJobs(data: unknown): unknown[] {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (Array.isArray(record.result)) return record.result
  }
  return []
}

/** One bounded, non-retried Techmap search request. Rate-limit (429) and timeout are
 * distinguished from generic failure so a caller can decide whether/when to retry;
 * this function itself never retries automatically. */
async function techmapSearchInternal(
  config: TechmapConfig,
  params: JobSearchParams,
  fetcher: typeof fetch = fetch,
  retrievedAt: Date = new Date(),
): Promise<JobSearchResult> {
  assertParams(params)
  const requestUrl = buildRequestUrl(config, params)

  let response: Response
  try {
    response = await diagnosticFetch('jobs', 'provider_search', fetcher)(requestUrl, {
      method: 'GET',
      headers: { 'X-RapidAPI-Key': config.apiKey, 'X-RapidAPI-Host': config.host, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
    })
  } catch (error) {
    throw new HttpError(503, isTimeout(error) ? 'Job search timed out' : 'Job search is temporarily unavailable', isTimeout(error) ? 'provider_timeout' : 'provider_failure')
  }

  if (response.status === 429) throw new HttpError(429, 'Job search rate limit reached. Try again later.', 'provider_rate_limit')
  if (!response.ok) throw new HttpError(503, 'Job search is temporarily unavailable', 'provider_failure')

  const data = await boundedJson(response, MAX_RESPONSE_BYTES)
  // Bounded to the provider's own fixed page size, defensively, in case a compromised
  // or misbehaving upstream returns more than one page's worth of records.
  const rawJobs = extractRawJobs(data).slice(0, PAGE_SIZE)
  const normalized: NormalizedJob[] = []
  for (const raw of rawJobs) {
    const job = normalizeJob(raw, 'techmap', retrievedAt)
    if (job && !job.expiry.isLikelyExpired) normalized.push(job)
  }
  const jobs = dedupeJobs(normalized)

  return { jobs, page: params.page ?? 1, hasMore: rawJobs.length >= PAGE_SIZE }
}

export const techmapSearch: typeof techmapSearchInternal = (...args) => observeOperation('jobs', 'provider_search', () => techmapSearchInternal(...args), 'provider_failure')

export class TechmapProvider implements JobProvider {
  readonly name = 'techmap'
  private readonly config: TechmapConfig
  private readonly fetcher: typeof fetch

  constructor(config: TechmapConfig, fetcher: typeof fetch = fetch) {
    this.config = config
    this.fetcher = fetcher
  }

  search(params: JobSearchParams): Promise<JobSearchResult> {
    return techmapSearch(this.config, params, this.fetcher)
  }
}
