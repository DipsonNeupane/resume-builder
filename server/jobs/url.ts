const MAX_URL_CHARS = 2048

/** Validates the untrusted external URL a caller will render as a "View job" link.
 * `directness` (see normalize.ts) is never consulted here and must never upgrade this
 * link's label to "Apply"/"Apply directly": a provider's self-reported `isDirect` flag
 * describes the *listing*, not a verified property of this specific URL, so on its own
 * it never proves the URL is a direct application destination. Only an absolute
 * https:// URL with no embedded credentials passes; anything else (javascript:, data:,
 * relative paths, a userinfo component, or an unreasonably long string) fails closed to
 * null so a caller never renders or forwards an unsafe link. */
export function safeJobUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX_URL_CHARS) return null
  let url: URL
  try { url = new URL(trimmed) } catch { return null }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!url.hostname) return null
  return url.toString()
}
