import type { FieldProvenance, Workplace } from './types.ts'

// Verified v2 Techmap field: the top-level `workPlace` value. In practice this is
// commonly a string but is also commonly returned as an array of strings (e.g. a
// posting tagged both "Remote" and "Hybrid" across regions), so both shapes are
// accepted. The September 24 benchmark found usable workplace classification on only
// 36/80 sampled postings and no reliable signal in free text, so this deliberately
// never infers remote/hybrid/onsite from title or description — a missing or
// unrecognized value stays 'unknown'.
const WORKPLACE_KEY = 'workPlace'
const MAX_ARRAY_ITEMS = 10
const MAX_ITEM_CHARS = 100

function classify(text: string): Workplace | null {
  const lower = text.toLowerCase()
  if (lower.includes('remote')) return 'remote'
  if (lower.includes('hybrid')) return 'hybrid'
  if (lower.includes('field')) return 'field'
  if (lower.includes('onsite') || lower.includes('on-site') || lower.includes('on site')) return 'onsite'
  return null
}

export function normalizeWorkplace(raw: Record<string, unknown>): FieldProvenance<Workplace> {
  const rawValue = raw[WORKPLACE_KEY]
  const candidates: string[] = typeof rawValue === 'string'
    ? [rawValue]
    : Array.isArray(rawValue)
      ? rawValue.slice(0, MAX_ARRAY_ITEMS).filter((item): item is string => typeof item === 'string')
      : []

  const distinct: Workplace[] = []
  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (!trimmed || trimmed.length > MAX_ITEM_CHARS) continue
    const classified = classify(trimmed)
    if (classified && !distinct.includes(classified)) distinct.push(classified)
  }

  if (distinct.length === 0) return { value: 'unknown', source: 'unknown', confidence: 'low' }
  if (distinct.length === 1) return { value: distinct[0], source: 'provider', confidence: 'high' }

  // "Remote" combined with "Onsite" or "Hybrid" in the same array is a genuine
  // contradiction (a posting can't simultaneously be fully remote and require onsite
  // presence), so this deliberately does not pick whichever value happened to appear
  // first: it lands on 'hybrid' as the honest middle ground, but only at medium
  // confidence, since it's this adapter's inference rather than a provider-stated fact.
  if (distinct.includes('remote') && (distinct.includes('onsite') || distinct.includes('hybrid'))) {
    return { value: 'hybrid', source: 'inferred', confidence: 'medium' }
  }

  // Other multi-value combinations (e.g. "Hybrid" + "Onsite", commonly used for
  // postings spanning several regional offices) are not contradictory, so the first
  // recognized value is trusted as a provider-stated fact.
  return { value: distinct[0], source: 'provider', confidence: 'high' }
}
