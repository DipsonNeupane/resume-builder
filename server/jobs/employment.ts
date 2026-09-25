import type { EmploymentType, FieldProvenance } from './types.ts'

// Verified v2 Techmap top-level fields: `contractType` (e.g. "Full-time", "Contract")
// and `workType` are the only fields this adapter trusts for employment type — no other
// alias (`employmentType`, `jobType`, `type`, etc.) is part of the verified schema, so
// none are read here. Like workplace.ts, a field can still be a plain string or an array
// of strings per record, so both shapes are accepted defensively, and this degrades to
// 'unknown' rather than guessing when neither field is present or recognizable.
const KEYS = ['contractType', 'workType']
const MAX_ARRAY_ITEMS = 10
const MAX_ITEM_CHARS = 100

function classify(text: string): EmploymentType | null {
  const lower = text.toLowerCase()
  if (lower.includes('intern')) return 'internship'
  if (lower.includes('temp')) return 'temporary'
  if (lower.includes('contract') || lower.includes('freelance')) return 'contract'
  if (lower.includes('part') && lower.includes('time')) return 'part_time'
  if (lower.includes('full') && lower.includes('time')) return 'full_time'
  return null
}

export function normalizeEmploymentType(raw: Record<string, unknown>): FieldProvenance<EmploymentType> {
  for (const key of KEYS) {
    const value = raw[key]
    let candidates: string[] = []
    if (typeof value === 'string') candidates = [value]
    else if (Array.isArray(value)) candidates = value.slice(0, MAX_ARRAY_ITEMS).filter((item): item is string => typeof item === 'string')
    if (!candidates.length) continue

    // Collect every distinct recognized classification among this field's candidates
    // rather than stopping at the first match: an array like ["Full-time", "Contract"]
    // states two conflicting employment types, and silently picking whichever came
    // first would assert a fact the provider itself never unambiguously stated.
    const classifications = new Set<EmploymentType>()
    for (const candidate of candidates) {
      const trimmed = candidate.trim()
      if (!trimmed || trimmed.length > MAX_ITEM_CHARS) continue
      const classified = classify(trimmed)
      if (classified) classifications.add(classified)
    }
    if (classifications.size === 1) {
      const [value] = classifications
      return { value, source: 'provider', confidence: 'high' }
    }
    // Either nothing recognizable, or genuinely conflicting values: degrade to
    // unknown/low rather than guessing. This field was present, so we don't fall
    // through to try the next key — an ambiguous/unrecognized value here is a
    // conclusion about this field, not an absence of one.
    return { value: 'unknown', source: 'unknown', confidence: 'low' }
  }
  return { value: 'unknown', source: 'unknown', confidence: 'low' }
}
