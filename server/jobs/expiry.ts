import type { ExpiryInfo } from './types.ts'
import { firstDate, firstRecord } from './raw.ts'

// Verified v2 Techmap fields: `dateCreated` and a hard `dateExpired`, plus a mirrored
// `jsonLD.validThrough`. `dateActive` is deliberately never read here: the September 24
// benchmark found 76/80 "active" postings had a dateActive exactly 30 days after
// creation — an inferred provider default, not an observed liveness signal — so neither
// a raw active flag/date nor that 30-day window is ever treated as proof a job is live.
const CREATED_KEYS = ['dateCreated']
const EXPIRED_KEYS = ['dateExpired']

// A posting older than this without a corroborating hard expiry date is treated as
// likely stale, deliberately more conservative than the provider's own inferred 30-day
// default window.
const MAX_TRUSTED_AGE_DAYS = 45
const DAY_MS = 24 * 60 * 60 * 1000

/** Deliberately does not trust a lone provider "active" signal: expiry is corroborated
 * (or overridden) with an independent posting-age cutoff so a job feed is conservative
 * about calling something "still open", and every conclusion carries its own
 * source/confidence rather than being asserted as fact. */
export function expiryStatus(raw: Record<string, unknown>, retrievedAt: Date): ExpiryInfo {
  const explicitExpiry = firstDate(raw, EXPIRED_KEYS)
  const jsonLd = firstRecord(raw, ['jsonLD'])
  const validThrough = jsonLd ? firstDate(jsonLd, ['validThrough']) : null
  const hardExpiry = explicitExpiry ?? validThrough
  const dateCreated = firstDate(raw, CREATED_KEYS)

  if (hardExpiry && hardExpiry.getTime() <= retrievedAt.getTime()) {
    return { expiresAt: hardExpiry.toISOString(), isLikelyExpired: true, confidence: 'high', source: 'provider' }
  }

  if (dateCreated) {
    const ageDays = (retrievedAt.getTime() - dateCreated.getTime()) / DAY_MS
    if (ageDays > MAX_TRUSTED_AGE_DAYS) {
      return {
        expiresAt: hardExpiry ? hardExpiry.toISOString() : null,
        isLikelyExpired: true,
        confidence: 'medium',
        source: 'inferred',
      }
    }
    return {
      expiresAt: hardExpiry ? hardExpiry.toISOString() : null,
      isLikelyExpired: false,
      confidence: hardExpiry ? 'high' : 'medium',
      source: hardExpiry ? 'provider' : 'inferred',
    }
  }

  if (hardExpiry) {
    return { expiresAt: hardExpiry.toISOString(), isLikelyExpired: false, confidence: 'medium', source: 'provider' }
  }
  return { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' }
}
