/** Validates and normalizes the search criteria a browser client may submit —
 * distinct from JobSearchParams (techmap.ts), which is the bounded subset actually
 * forwarded to Techmap. Employment type, salary preference, and the free-text location
 * field are never sent upstream; they are applied as a server-side filter over
 * already-retrieved, normalized jobs (see filter.ts). */
import { HttpError } from '../http/security.ts'
import type { EmploymentType, SalaryPeriod, Workplace } from './types.ts'

const MAX_TITLE_CHARS = 200
const MAX_LOCATION_CHARS = 200
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/
const WORKPLACE_VALUES: Workplace[] = ['remote', 'hybrid', 'onsite', 'field']
const EMPLOYMENT_TYPE_VALUES: EmploymentType[] = ['full_time', 'part_time', 'contract', 'temporary', 'internship']
const PERIOD_VALUES: SalaryPeriod[] = ['hour', 'year']
const MAX_SALARY: Record<SalaryPeriod, number> = { hour: 1000, year: 5000000 }

/** An actual optional range: at least one of min/max must be present, and when both are
 * present min must not exceed max. `period`+`currency` are always required together so a
 * comparison against a job's own salary (see filter.ts) is never done across mismatched
 * units. */
export type SalaryPreference = { period: SalaryPeriod; currency: string; min: number | null; max: number | null }
export type SearchCriteria = {
  title: string
  countryCode?: string
  /** Free-text, human-readable location (city/region/country name), distinct from
   * `countryCode`. Never forwarded to Techmap — see filter.ts's bounded local filter. */
  location?: string
  workplace?: Workplace
  employmentType?: EmploymentType
  salary?: SalaryPreference
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

/** Throws HttpError(400,...) for any malformed field. `no preference` is expressed by
 * simply omitting the corresponding key — there is no explicit sentinel value. */
export function parseSearchCriteria(value: unknown): SearchCriteria {
  if (!record(value)) throw new HttpError(400, 'Job search criteria are invalid')
  const title = value.title
  if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE_CHARS) {
    throw new HttpError(400, 'A job title or role is required')
  }
  const criteria: SearchCriteria = { title: title.trim() }

  if (value.countryCode !== undefined) {
    if (typeof value.countryCode !== 'string' || !COUNTRY_CODE_PATTERN.test(value.countryCode)) {
      throw new HttpError(400, 'Country is invalid')
    }
    criteria.countryCode = value.countryCode.toUpperCase()
  }
  if (value.location !== undefined) {
    if (typeof value.location !== 'string' || !value.location.trim() || value.location.length > MAX_LOCATION_CHARS) {
      throw new HttpError(400, 'Location is invalid')
    }
    criteria.location = value.location.trim()
  }
  if (value.workplace !== undefined) {
    if (typeof value.workplace !== 'string' || !WORKPLACE_VALUES.includes(value.workplace as Workplace)) {
      throw new HttpError(400, 'Workplace is invalid')
    }
    criteria.workplace = value.workplace as Workplace
  }
  if (value.employmentType !== undefined) {
    if (typeof value.employmentType !== 'string' || !EMPLOYMENT_TYPE_VALUES.includes(value.employmentType as EmploymentType)) {
      throw new HttpError(400, 'Employment type is invalid')
    }
    criteria.employmentType = value.employmentType as EmploymentType
  }
  if (value.salary !== undefined) {
    if (!record(value.salary)) throw new HttpError(400, 'Salary preference is invalid')
    const { period, currency, min, max } = value.salary
    if (typeof period !== 'string' || !PERIOD_VALUES.includes(period as SalaryPeriod)) throw new HttpError(400, 'Salary period is invalid')
    if (typeof currency !== 'string' || !CURRENCY_PATTERN.test(currency)) throw new HttpError(400, 'Salary currency is invalid')
    const bound = MAX_SALARY[period as SalaryPeriod]
    const validAmount = (amount: unknown): amount is number =>
      typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && amount <= bound
    const hasMin = min !== undefined && min !== null
    const hasMax = max !== undefined && max !== null
    if (!hasMin && !hasMax) throw new HttpError(400, 'A minimum or maximum salary amount is required')
    if (hasMin && !validAmount(min)) throw new HttpError(400, 'Salary amount is invalid')
    if (hasMax && !validAmount(max)) throw new HttpError(400, 'Salary amount is invalid')
    if (hasMin && hasMax && (min as number) > (max as number)) throw new HttpError(400, 'Minimum salary cannot exceed maximum salary')
    criteria.salary = {
      period: period as SalaryPeriod,
      currency: currency.toUpperCase(),
      min: hasMin ? (min as number) : null,
      max: hasMax ? (max as number) : null,
    }
  }
  return criteria
}
