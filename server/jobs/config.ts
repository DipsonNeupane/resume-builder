import { HttpError } from '../http/security.ts'

export type TechmapConfig = {
  apiKey: string
  host: string
  url: string
}

// The verified v2 Techmap/RapidAPI contract: a fixed gateway host and search path, not
// an env-configured guess. Only the per-account API key is a secret, so only that comes
// from the environment.
const TECHMAP_HOST = 'daily-international-job-postings.p.rapidapi.com'
const TECHMAP_URL = 'https://daily-international-job-postings.p.rapidapi.com/api/v2/jobs/search'

/** Server-only. TECHMAP_API_KEY must never be read from a VITE_*-prefixed env var or
 * forwarded to browser code — this function is only ever called from server
 * modules/routes, matching tailoringConfig()'s pattern in server/ai/tailoring.ts. */
export function techmapConfig(env: NodeJS.ProcessEnv): TechmapConfig {
  const apiKey = env.TECHMAP_API_KEY
  if (!apiKey || apiKey.length < 8 || apiKey.length > 512) throw new HttpError(503, 'Job search is not configured', 'configuration')
  return { apiKey, host: TECHMAP_HOST, url: TECHMAP_URL }
}
