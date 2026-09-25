import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { boundedDuration, categories, features, operations, routes, statusCategory, type Category, type Feature, type Operation, type Route } from '../src/services/diagnosticSchema.js'

export type Diagnostic = Readonly<{
 schema: 1; event: 'request_completed' | 'operation_completed'; time: string
 requestId: string; route: Route; feature: Feature; operation: Operation
 category: Category; level: 'info' | 'warn' | 'error'; health: 'healthy' | 'rejected' | 'degraded'
 durationMs: number; status?: number
 aiEnabled: boolean; exportsEnabled: boolean; billingEnabled: boolean
}>
// The sole future monitoring integration boundary accepts ONLY this rebuilt record.
// Never pass an Error, Request, provider SDK object or AsyncLocalStorage context.
export type DiagnosticSink = (record: Diagnostic) => void
type Context = { requestId: string; route: Route; feature: Feature; env: NodeJS.ProcessEnv; sink: DiagnosticSink; degraded: boolean }
const context = new AsyncLocalStorage<Context>()
const responseCategories = new WeakMap<Response, Category>()
const stdout: DiagnosticSink = record => { console.log(JSON.stringify(record)) }
const severity = { info: 0, warn: 1, error: 2, off: 3 }

export function diagnosticCategory(value: unknown, fallback: Category = 'unexpected'): Category {
 if (value && typeof value === 'object' && 'category' in value && categories.includes(value.category as Category)) return value.category as Category
 return fallback
}
export function markResponse(response: Response, category: Category): Response {
 responseCategories.set(response, categories.includes(category) ? category : 'unexpected'); return response
}
export function setRequestFeature(feature: Feature): void {
 const ctx = context.getStore()
 if (ctx && features.includes(feature)) ctx.feature = feature
}
export function emitDiagnostic(feature: Feature, operation: Operation, category: Category, durationMs = 0, status?: number, event: Diagnostic['event'] = 'operation_completed'): void {
 const ctx = context.getStore()
 if (!ctx) return // No orphan records outside an explicitly observed request.
 // Validate even typed fields at runtime; do not spread arbitrary supplied objects.
 if (!features.includes(feature) || !operations.includes(operation) || !categories.includes(category) || !routes.includes(ctx.route) || !['request_completed', 'operation_completed'].includes(event)) return
 const degraded = ['unexpected', 'unavailable', 'database_error', 'provider_failure', 'provider_rate_limit', 'provider_timeout', 'provider_invalid', 'ai_accounting', 'ai_uncertain', 'export_failure'].includes(category)
 if (degraded) ctx.degraded = true
 const level = degraded && category !== 'provider_rate_limit' ? 'error' : category === 'ok' ? 'info' : 'warn'
 const configured = ctx.env.DIAGNOSTICS_LEVEL
 const threshold = configured && Object.hasOwn(severity, configured) ? severity[configured as keyof typeof severity] : severity.info
 if (severity[level] < threshold) return
 const record: Diagnostic = Object.freeze({
  schema: 1, event, time: new Date().toISOString(), requestId: ctx.requestId,
  route: ctx.route, feature, operation, category, level,
  health: degraded || (event === 'request_completed' && ctx.degraded) ? 'degraded' : category === 'ok' ? 'healthy' : 'rejected',
  durationMs: boundedDuration(durationMs),
  ...(Number.isInteger(status) && status! >= 100 && status! <= 599 ? { status } : {}),
  aiEnabled: ctx.env.AI_ENABLED === 'true', exportsEnabled: ctx.env.EXPORTS_ENABLED === 'true', billingEnabled: ctx.env.BILLING_ENABLED === 'true',
 })
 try { ctx.sink(record) } catch { /* Diagnostics must never break requests or accounting. */ }
}

export async function observeOperation<T>(feature: Feature, operation: Operation, work: () => Promise<T>, failure: Category = 'unexpected'): Promise<T> {
 const start = performance.now()
 try { const value = await work(); emitDiagnostic(feature, operation, 'ok', performance.now() - start); return value }
 catch (error) { emitDiagnostic(feature, operation, diagnosticCategory(error, failure), performance.now() - start); throw error }
}
export function observeSync<T>(feature: Feature, operation: Operation, work: () => T): T {
 const start = performance.now()
 try { const value = work(); emitDiagnostic(feature, operation, 'ok', performance.now() - start); return value }
 catch (error) { emitDiagnostic(feature, operation, diagnosticCategory(error), performance.now() - start); throw error }
}

/** Transport diagnostics consume only status and elapsed time, never URL/options/body.
 * Database errors (including best-effort RPCs ignored by callers) remain visible. */
export function diagnosticFetch(feature: Feature, operation: Operation, fetcher: typeof fetch = fetch): typeof fetch {
 return async (input, init) => {
  const start = performance.now()
  try {
   const response = await fetcher(input, init)
   const category: Category = response.ok ? 'ok' : feature === 'database'
    ? response.status === 409 ? 'database_conflict' : 'database_error'
    : response.status === 429 ? 'provider_rate_limit' : 'provider_failure'
   emitDiagnostic(feature, operation, category, performance.now() - start, response.status)
   return response
  } catch (error) {
   const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
   emitDiagnostic(feature, operation, feature === 'database' ? 'database_error' : timeout ? 'provider_timeout' : 'provider_failure', performance.now() - start)
   throw error
  }
 }
}

export async function runObservedRequest(route: Route, feature: Feature, handler: () => Promise<Response>, env: NodeJS.ProcessEnv = process.env, sink: DiagnosticSink = stdout): Promise<Response> {
 // Always generate locally. Browser request IDs and AI/export idempotency keys are
 // untrusted, can carry PII, and must not become cross-account tracking identifiers.
 const ctx: Context = { requestId: randomUUID(), route, feature, env, sink, degraded: false }
 return context.run(ctx, async () => {
  const start = performance.now()
  let response: Response
  try { response = await handler() }
  catch { response = markResponse(Response.json({ error: 'Service temporarily unavailable. Please retry.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }), 'unexpected') }
  const category = responseCategories.get(response) ?? statusCategory(response.status)
  emitDiagnostic(ctx.feature, 'request', category, performance.now() - start, response.status, 'request_completed')
  // Clone headers without consuming/serializing JSON, a PDF or a DOCX stream.
  const headers = new Headers(response.headers)
  headers.set('X-Request-ID', ctx.requestId)
  if (response.status >= 400) headers.set('X-Error-Category', category)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
 })
}
