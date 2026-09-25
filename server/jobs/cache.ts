import { emitDiagnostic } from '../observability.js'
/** Short-lived, in-memory reuse of an identical Techmap search, scoped to one warm
 * server instance only — this is deliberately NOT durable/shared background
 * infrastructure (no database table, no cron), just a best-effort avoidance of
 * re-fetching the exact same provider query moments apart (e.g. an accidental
 * double-click, or an Auto Refresh tick that lands seconds after a manual refresh).
 * Keyed purely by the normalized *public* query (title/countryCode/workplace) — never by
 * account — because the cached value is only ever provider-retrieved job postings, which
 * carry no resume/account data; this lets two different accounts issuing the identical
 * normalized search reuse the same provider fetch. Concurrent identical misses (e.g. two
 * browser tabs) are coalesced onto one in-flight fetch rather than each issuing its own
 * provider request. A cold instance or a different query simply misses and fetches
 * normally. Never used to cache resume evidence or ranked match explanations — those are
 * computed fresh from the cached jobs on every request, after this cache is consulted. */
import type { NormalizedJob } from './types.ts'

const TTL_MS = 2 * 60 * 1000
const MAX_ENTRIES = 200

type Entry = { jobs: NormalizedJob[]; expiresAt: number }
const cache = new Map<string, Entry>()
const inFlight = new Map<string, Promise<NormalizedJob[]>>()

function evictExpired(now: number): void {
  for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key)
}

/** `criteriaSignature` must already be a normalized, public-only query fingerprint (see
 * handler.ts) — no owner/account id, no resume evidence. */
export function cacheKey(criteriaSignature: string): string {
  return criteriaSignature
}

export function getCachedJobs(key: string, now: number = Date.now()): NormalizedJob[] | null {
  const entry = cache.get(key)
  if (!entry || entry.expiresAt <= now) return null
  return entry.jobs
}

export function setCachedJobs(key: string, jobs: NormalizedJob[], now: number = Date.now()): void {
  evictExpired(now)
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
  cache.set(key, { jobs, expiresAt: now + TTL_MS })
}

/** Test-only seam: clears every cached/in-flight entry so test cases sharing a
 * process-wide module cache stay isolated from each other's fixtures. Never called from
 * production request-handling code. */
export function resetJobsCacheForTests(): void {
  cache.clear()
  inFlight.clear()
}

/** Returns the cached value when fresh; otherwise joins (or starts) the single in-flight
 * fetch for this exact key so simultaneous identical requests — from the same account's
 * other tab or a different account entirely — never trigger duplicate provider calls. A
 * failed fetch is never cached and never left registered as in-flight, so the next call
 * retries cleanly. */
export async function getOrFetchJobs(
  key: string,
  fetchJobs: () => Promise<NormalizedJob[]>,
  now: number = Date.now(),
): Promise<NormalizedJob[]> {
  const cached = getCachedJobs(key, now)
  if (cached) { emitDiagnostic('jobs', 'cache_hit', 'ok'); return cached }
  const existing = inFlight.get(key)
  if (existing) { emitDiagnostic('jobs', 'cache_join', 'ok'); return existing }
  emitDiagnostic('jobs', 'cache_miss', 'ok')
  const promise = (async () => {
    const jobs = await fetchJobs()
    setCachedJobs(key, jobs)
    return jobs
  })()
  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}
