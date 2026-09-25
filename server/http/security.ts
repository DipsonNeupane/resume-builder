import { markResponse, observeOperation } from '../observability.js'
import { statusCategory, type Category } from '../../src/services/diagnosticSchema.js'
/** Server request boundaries. Never trust a decoded JWT or a browser-supplied owner. */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string, readonly category: Category = statusCategory(status)) { super(message); this.status = status }
}

export function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}

export function requirePost(request: Request, appOrigin: string): void {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  // Browser mutations must originate at the configured app, never forwarded Host.
  if (request.headers.get('origin') !== new URL(appOrigin).origin) throw new HttpError(403, 'Origin not allowed')
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'JSON required')
  }
}

export async function boundedBody(request: Request, limit: number): Promise<string> {
  const declared = request.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new HttpError(413, 'Request too large')
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Request too large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new HttpError(400, 'Invalid text encoding') }
}

export async function jsonBody(request: Request, limit = 4096): Promise<Record<string, unknown>> {
  let value: unknown
  try { value = JSON.parse(await boundedBody(request, limit)) }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'Invalid JSON') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'JSON object required')
  return value as Record<string, unknown>
}

async function authenticateInternal(request: Request, config: { url: string; publicKey: string }, fetcher: typeof fetch = fetch): Promise<string> {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer ([^\s]{1,8192})$/i.exec(header)
  if (!match) throw new HttpError(401, 'Sign in required')
  // Ask Supabase Auth to verify the token; do not merely decode JWT claims.
  let response: Response
  try {
    response = await fetcher(new URL('/auth/v1/user', config.url), {
      headers: { apikey: config.publicKey, Authorization: `Bearer ${match[1]}` },
      signal: AbortSignal.timeout(10000), redirect: 'error',
    })
  } catch { throw new HttpError(503, 'Account verification unavailable') }
  if (response.status === 401 || response.status === 403) throw new HttpError(401, 'Sign in again')
  if (!response.ok) throw new HttpError(503, 'Account verification unavailable')
  let user: { id?: unknown; is_anonymous?: unknown }
  try { user = await response.json() } catch { throw new HttpError(503, 'Account verification unavailable') }
  if (!user || typeof user.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(user.id) || user.is_anonymous === true) {
    throw new HttpError(401, 'Registered account required')
  }
  return user.id
}

export const authenticate: typeof authenticateInternal = (request, config, fetcher) => observeOperation('auth', 'auth_verify', () => authenticateInternal(request, config, fetcher), 'authentication')

export function safeError(error: unknown): Response {
  return error instanceof HttpError ? markResponse(json(error.status, { error: error.message }), error.category) : markResponse(json(503, { error: 'Service temporarily unavailable. Please retry.' }), 'unexpected')
}
