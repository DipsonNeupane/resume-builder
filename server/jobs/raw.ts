/** Defensive field access for provider payloads. Techmap's v2 schema is verified (see
 * HANDOFF.md), but individual records still vary in practice — a field can be absent,
 * differently typed, or (per workplace.ts) an array instead of a scalar — so every
 * accessor here tolerates that per-record variance and falls back to "absent" rather
 * than guessing a value, degrading to lower confidence instead of fabricating data. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function firstString(raw: Record<string, unknown>, keys: string[], maxLength: number): string | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed && trimmed.length <= maxLength) return trimmed
    }
  }
  return null
}

export function firstNumber(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

export function firstBoolean(raw: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'boolean') return value
  }
  return null
}

/** Parses to a valid Date, rejecting NaN and absurd out-of-range years that a garbage
 * or placeholder timestamp would otherwise pass through as. */
export function firstDate(raw: Record<string, unknown>, keys: string[]): Date | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) continue
    const year = date.getUTCFullYear()
    if (year < 1990 || year > 2100) continue
    return date
  }
  return null
}

export function firstRecord(raw: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    if (isRecord(raw[key])) return raw[key] as Record<string, unknown>
  }
  return null
}
