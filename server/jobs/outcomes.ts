import { HttpError } from '../http/security.ts'

export const OUTCOME_VALUES = ['application_prepared','application_submitted','interview_received','offer_received','declined','withdrawn'] as const
export const TIME_SAVED_BUCKETS = ['under_15_minutes','15_to_30_minutes','31_to_60_minutes','over_60_minutes','unsure'] as const
export const OUTCOME_CONSENT_VERSION = 'outcomes-v1' as const

export type ProductOutcome = typeof OUTCOME_VALUES[number]
export type TimeSavedBucket = typeof TIME_SAVED_BUCKETS[number]
export type OutcomeReport = {
  id: string
  savedJobId: string
  outcome: ProductOutcome
  provenance: 'self_reported'
  occurredOn: string | null
  timeSavedBucket: TimeSavedBucket | null
  clarityRating: number | null
  confidenceRating: number | null
  consentVersion: typeof OUTCOME_CONSENT_VERSION
  consentedAt: string
  methodologyVersion: typeof OUTCOME_CONSENT_VERSION
  reportedAt: string
  updatedAt: string
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value))
const rating = (value: unknown): value is number | null => value === null || (Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 5)

export type OutcomeReportInput = Pick<OutcomeReport, 'outcome'|'occurredOn'|'timeSavedBucket'|'clarityRating'|'confidenceRating'> & { consent: true; consentVersion: typeof OUTCOME_CONSENT_VERSION }

export function parseOutcomeReportInput(value: unknown): OutcomeReportInput {
  if (!record(value)
    || typeof value.outcome !== 'string' || !(OUTCOME_VALUES as readonly string[]).includes(value.outcome)
    || !(value.occurredOn === null || date(value.occurredOn))
    || (typeof value.occurredOn === 'string' && Date.parse(`${value.occurredOn}T00:00:00Z`) > Date.now())
    || !(value.timeSavedBucket === null || (typeof value.timeSavedBucket === 'string' && (TIME_SAVED_BUCKETS as readonly string[]).includes(value.timeSavedBucket)))
    || !rating(value.clarityRating) || !rating(value.confidenceRating)
    || value.consent !== true || value.consentVersion !== OUTCOME_CONSENT_VERSION) {
    throw new HttpError(400, 'Outcome report is invalid')
  }
  return value as unknown as OutcomeReportInput
}

export function parseOutcomeReport(value: unknown): OutcomeReport {
  if (!record(value) || typeof value.id !== 'string' || !UUID.test(value.id)
    || typeof value.savedJobId !== 'string' || !UUID.test(value.savedJobId)
    || typeof value.outcome !== 'string' || !(OUTCOME_VALUES as readonly string[]).includes(value.outcome)
    || value.provenance !== 'self_reported'
    || !(value.occurredOn === null || date(value.occurredOn))
    || !(value.timeSavedBucket === null || (typeof value.timeSavedBucket === 'string' && (TIME_SAVED_BUCKETS as readonly string[]).includes(value.timeSavedBucket)))
    || !rating(value.clarityRating) || !rating(value.confidenceRating)
    || value.consentVersion !== OUTCOME_CONSENT_VERSION || value.methodologyVersion !== OUTCOME_CONSENT_VERSION
    || !timestamp(value.consentedAt) || !timestamp(value.reportedAt) || !timestamp(value.updatedAt)) {
    throw new HttpError(503, 'Outcome report returned an unusable response')
  }
  return value as unknown as OutcomeReport
}

