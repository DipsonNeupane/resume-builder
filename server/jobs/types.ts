/** Provider-neutral job-data foundation. Every module in server/jobs/ is server-only:
 * nothing here is imported from browser code, and no user resume/PII is ever sent to
 * a job-data provider (see server/jobs/techmap.ts's request builder). */

export type Workplace = 'remote' | 'hybrid' | 'onsite' | 'field' | 'unknown'
export type SalaryPeriod = 'hour' | 'year'
export type Confidence = 'high' | 'medium' | 'low'
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary' | 'internship' | 'unknown'
/** Deterministic, evidence-based only — never a percentage or a model-provider call. */
export type MatchLabel = 'strong' | 'good' | 'stretch'

/** Tags a normalized field with where it came from and how much to trust it, so a
 * caller never displays an inferred/unknown value with the same certainty as one the
 * provider stated explicitly. */
export type FieldProvenance<T> = {
  value: T
  source: 'provider' | 'inferred' | 'unknown'
  confidence: Confidence
}

export type SalaryNormalized = {
  min: number
  max: number
  currency: string
  period: SalaryPeriod
  confidence: Confidence
} | null

export type JobLocation = {
  city: string | null
  region: string | null
  country: string | null
}

/** Expiry/activity is never a plain boolean: a provider "active" date, or a window this
 * adapter infers from posting age, is corroborating evidence at best — never proof a
 * job is live — so every conclusion carries its own confidence and source. */
export type ExpiryInfo = {
  expiresAt: string | null
  isLikelyExpired: boolean
  confidence: Confidence
  source: 'provider' | 'inferred' | 'unknown'
}

export type NormalizedJob = {
  /** `${provider}:${providerJobId}`, stable across repeated fetches of the same posting. */
  id: string
  provider: string
  providerJobId: string
  title: string
  company: string
  location: FieldProvenance<JobLocation>
  workplace: FieldProvenance<Workplace>
  employmentType: FieldProvenance<EmploymentType>
  salary: SalaryNormalized
  descriptionText: string
  /** Provider-reported posting date, ISO 8601, or null when absent/unparseable. */
  postedAt: string | null
  expiry: ExpiryInfo
  /** null when the provider gave no direct/aggregator signal at all. */
  directness: FieldProvenance<boolean | null>
  /** Always an absolute https:// URL that has passed safeJobUrl(); see url.ts. A
   * caller must always label this "View job" unless a direct application destination
   * has been independently verified for this specific URL — `directness` below is a
   * provider-reported signal about the listing, never proof that this URL itself is a
   * direct application endpoint, so it must never be used alone to relabel this link
   * "Apply". */
  sourceUrl: string
  /** Provider-reported job board/portal name, e.g. "LinkedIn", or null when absent. */
  portal: string | null
  /** Provider-reported origin classification, e.g. "employer"/"aggregator", or null. */
  source: string | null
  /** Independent canonical fingerprint used for ResumeStride's own deduplication,
   * deliberately separate from any duplicate flag the provider itself reports. */
  dedupeKey: string
  /** ISO timestamp of when ResumeStride fetched this record from the provider. */
  retrievedAt: string
}

export type JobSearchParams = {
  title: string
  /** ISO 3166-1 alpha-2 country code, e.g. "US". */
  countryCode?: string
  workPlace?: Workplace
  /** ISO date (YYYY-MM-DD), inclusive lower bound on dateCreated. */
  dateCreatedMin?: string
  /** ISO date (YYYY-MM-DD), inclusive upper bound on dateCreated. */
  dateCreatedMax?: string
  page?: number
}

export type JobSearchResult = {
  jobs: NormalizedJob[]
  page: number
  hasMore: boolean
}

/** Any concrete provider adapter (Techmap today, others later) implements this and
 * nothing else is allowed to depend on provider-specific request/response shapes. */
export interface JobProvider {
  readonly name: string
  search(params: JobSearchParams): Promise<JobSearchResult>
}
