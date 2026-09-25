import type { SalaryNormalized, SalaryPeriod } from './types.ts'
import { firstNumber, firstRecord, firstString } from './raw.ts'

// Verified v2 Techmap field: salary lives under jsonLD.baseSalary, a schema.org
// MonetaryAmount (`{ currency, value: { minValue, maxValue, unitText } }`). Some records
// only carry a single `value` number instead of a min/max pair. When `baseSalary`
// itself omits `currency`, the sibling `jsonLD.salaryCurrency` (also part of the
// schema.org JobPosting shape) is trusted as a fallback — but only as a currency code;
// it never substitutes for a missing amount or period.
const MIN_KEYS = ['minValue', 'min', 'value']
const MAX_KEYS = ['maxValue', 'max', 'value']
const CURRENCY_KEYS = ['currency']
const FALLBACK_CURRENCY_KEYS = ['salaryCurrency']
const UNIT_KEYS = ['unitText', 'period']

const CURRENCY_PATTERN = /^[A-Za-z]{3}$/

// Techmap's benchmark data reported the unit as inconsistent free text (`YEAR`, `HOUR`,
// `1 year`, `1 hour`, etc). Only these two normalized buckets are trusted; anything else
// (week/month/day, or unrecognized text) is treated as unknown rather than guessed.
function normalizePeriod(raw: string | null): SalaryPeriod | null {
  if (!raw) return null
  const text = raw.toLowerCase()
  if (text.includes('hour')) return 'hour'
  if (text.includes('year') || text.includes('annual')) return 'year'
  return null
}

// Sanity bounds reject obviously garbage or placeholder amounts (e.g. a "0-0" range,
// or a monthly figure mislabeled as annual) rather than surfacing a misleading number.
const BOUNDS: Record<SalaryPeriod, { min: number; max: number }> = {
  hour: { min: 1, max: 1000 },
  year: { min: 1000, max: 5000000 },
}

/** Only ever produces a value when amount, currency and period are ALL explicit and
 * internally consistent; per the Techmap benchmark's data-quality findings, a job with
 * unknown salary must remain eligible rather than being filtered out or having a
 * fabricated figure attached — so this returns null instead of a best-effort guess. */
export function normalizeSalary(raw: Record<string, unknown>): SalaryNormalized {
  const jsonLd = firstRecord(raw, ['jsonLD'])
  const baseSalary = jsonLd ? firstRecord(jsonLd, ['baseSalary']) : null
  if (!baseSalary) return null

  const valueContainer = firstRecord(baseSalary, ['value']) ?? baseSalary
  const min = firstNumber(valueContainer, MIN_KEYS)
  const max = firstNumber(valueContainer, MAX_KEYS)
  const currencyRaw = firstString(baseSalary, CURRENCY_KEYS, 8)
    ?? (jsonLd ? firstString(jsonLd, FALLBACK_CURRENCY_KEYS, 8) : null)
  const periodRaw = firstString(valueContainer, UNIT_KEYS, 40) ?? firstString(baseSalary, UNIT_KEYS, 40)
  const period = normalizePeriod(periodRaw)

  if (min === null || max === null || !currencyRaw || !period) return null
  if (!CURRENCY_PATTERN.test(currencyRaw)) return null
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min > max) return null
  const bounds = BOUNDS[period]
  if (min < bounds.min || max > bounds.max) return null

  return {
    min, max,
    currency: currencyRaw.toUpperCase(),
    period,
    confidence: 'high',
  }
}
