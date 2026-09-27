import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import Stripe from 'stripe'
import { recordBridgeDelivery } from '../../apps/extension/src/lib/diagnostics.ts'
import { billingError } from '../../server/billing/stripe.ts'
import { runObservedRequest, emitDiagnostic, observeOperation, diagnosticFetch, type Diagnostic } from '../../server/observability.ts'
import { authenticate, HttpError, json, safeError } from '../../server/http/security.ts'
import { techmapSearch } from '../../server/jobs/techmap.ts'
import { captureFirstTouchAttribution, safeAnalyticsEvent, safeSpeedInsight, sanitizeProductProperties } from '../../src/services/analytics.ts'
import { clearBrowserDiagnostics, readBrowserDiagnostics, recordBrowserDiagnostic, observeBrowserOperation } from '../../src/services/diagnostics.ts'

const secret = 'PRIVATE resume job suggestion password Bearer sk_key card@example.test'
const env = { DIAGNOSTICS_LEVEL: 'info', AI_ENABLED: 'true', OPENAI_API_KEY: secret }
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/

test('extension worker delivery diagnostics accept only outcome and bounded timing', context => {
 const output: string[] = []
 context.mock.method(console, 'info', (line: string) => { output.push(line) })
 recordBridgeDelivery(false, 8000)
 recordBridgeDelivery(true, Infinity)
 assert.deepEqual(output.map(line => JSON.parse(line)), [
  { schema: 1, event: 'bridge_delivery_completed', feature: 'extension', category: 'bridge_failed', durationMs: 8000 },
  { schema: 1, event: 'bridge_delivery_completed', feature: 'extension', category: 'ok', durationMs: 0 },
 ])
 context.mock.method(console, 'info', () => { throw new Error(secret) })
 assert.doesNotThrow(() => recordBridgeDelivery(false, 10))
})

test('Stripe connection errors are categorized without payment, SDK or credential data', async () => {
 const records: Diagnostic[] = []
 const response = await runObservedRequest('checkout', 'billing', async () => billingError(new Stripe.errors.StripeConnectionError({ message: secret })), env, record => records.push(record))
 assert.equal(response.status, 503)
 assert.equal(response.headers.get('x-error-category'), 'provider_failure')
 assert.equal(records[0].operation, 'billing_provider')
 assert.ok(!JSON.stringify(records).includes(secret))
 assert.ok(!(await response.text()).includes(secret))
})

test('concurrent requests isolate generated correlation IDs and never record content or incoming IDs', async () => {
 const records: Diagnostic[] = []
 let release!: () => void
 const barrier = new Promise<void>(resolve => { release = resolve })
 const first = runObservedRequest('tailor', 'ai', async () => {
  await barrier
  emitDiagnostic('ai_accounting', 'ai_reserve', 'ai_budget')
  return safeError(new HttpError(429, 'Please try later.', 'ai_budget'))
 }, env, record => records.push(record))
 const second = runObservedRequest('jobs-search', 'jobs', async () => {
  emitDiagnostic('jobs', 'provider_search', 'provider_rate_limit')
  release()
  return json(200, { job: secret })
 }, env, record => records.push(record))
 const [a, b] = await Promise.all([first, second])
 assert.match(a.headers.get('x-request-id')!, uuid)
 assert.notEqual(a.headers.get('x-request-id'), b.headers.get('x-request-id'))
 assert.equal(a.headers.get('x-error-category'), 'ai_budget')
 assert.equal(b.headers.get('x-error-category'), null)
 assert.deepEqual(await b.json(), { job: secret })
 for (const record of records) {
  assert.equal(record.requestId, (record.route === 'tailor' ? a : b).headers.get('x-request-id'))
  assert.ok(Number.isInteger(record.durationMs) && record.durationMs >= 0)
  assert.equal(record.aiEnabled, true)
 }
 assert.equal(records.find(r => r.route === 'jobs-search' && r.event === 'request_completed')?.health, 'degraded')
 assert.ok(!JSON.stringify(records).includes(secret))
})

test('unexpected exceptions and sensitive error properties cannot reach logs or customer response', async () => {
 const records: Diagnostic[] = []
 const failure = Object.assign(new Error(secret), { cause: { resume: secret }, request: secret, token: secret, category: secret })
 const response = await runObservedRequest('checkout', 'billing', async () => {
  await observeOperation('billing', 'request', async () => { throw failure })
  return json(200, {})
 }, env, record => records.push(record))
 assert.equal(response.status, 503)
 assert.equal(response.headers.get('cache-control'), 'no-store')
 assert.equal(response.headers.get('x-error-category'), 'unexpected')
 assert.ok(!(await response.text()).includes(secret))
 assert.ok(!JSON.stringify(records).includes(secret))
 assert.deepEqual(records.map(r => r.category), ['unexpected', 'unexpected'])
 assert.deepEqual(Object.keys(records[0]).sort(), ['schema', 'event', 'time', 'requestId', 'route', 'feature', 'operation', 'category', 'level', 'health', 'durationMs', 'aiEnabled', 'exportsEnabled', 'billingEnabled'].sort())
})

test('sink failure cannot change a binary response, cache policy or reservation flow', async () => {
 let settled = false
 const bytes = new Uint8Array([0, 1, 2, 255])
 const response = await runObservedRequest('export-pdf', 'export', async () => {
  await observeOperation('export', 'export_render', async () => { settled = true })
  return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment', 'Cache-Control': 'no-store' } })
 }, env, () => { throw new Error(secret) })
 assert.equal(settled, true)
 assert.equal(response.status, 200)
 assert.equal(response.headers.get('content-type'), 'application/pdf')
 assert.equal(response.headers.get('content-disposition'), 'attachment')
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes)
})

test('level filters and runtime enum validation exclude injected strings and bound timing', async () => {
 for (const level of ['off', 'error', 'warn', 'info']) {
  const records: Diagnostic[] = []
  await runObservedRequest('jobs-search', 'jobs', async () => {
   emitDiagnostic(secret as 'jobs', 'request', 'unexpected')
   emitDiagnostic('jobs', secret as 'request', 'unexpected')
   emitDiagnostic('jobs', 'request', secret as 'unexpected')
   emitDiagnostic('jobs', 'provider_search', 'provider_failure', Infinity)
   emitDiagnostic('jobs', 'provider_search', 'provider_rate_limit', -10)
   return json(200, {})
  }, { DIAGNOSTICS_LEVEL: level }, record => records.push(record))
  assert.equal(records.length, { off: 0, error: 1, warn: 2, info: 3 }[level])
  assert.ok(records.every(r => r.durationMs >= 0 && r.durationMs <= 3_600_000))
  assert.ok(!JSON.stringify(records).includes(secret))
 }
})

test('database transport records failed best-effort writes without reading request or response bodies', async () => {
 const records: Diagnostic[] = []
 const response = await runObservedRequest('jobs-search', 'jobs', async () => {
  const fetcher = diagnosticFetch('database', 'database', async () => Response.json({ message: secret, details: secret }, { status: 409 }))
  const database = await fetcher(`https://db.invalid/rest/v1/resumes?owner=${encodeURIComponent(secret)}`, { method: 'POST', headers: { authorization: secret }, body: secret })
  assert.equal(database.bodyUsed, false)
  assert.equal((await database.json()).message, secret)
  return json(200, {}) // Deliberately ignored best-effort DB error.
 }, env, record => records.push(record))
 assert.equal(response.status, 200)
 assert.equal(records[0].category, 'database_conflict')
 // Conflicts are expected/recoverable; do not raise an availability alarm.
 assert.ok(!JSON.stringify(records).includes(secret))
})

test('auth verification failures carry correlation but no bearer token or provider error body', async () => {
 const records: Diagnostic[] = []
 const response = await runObservedRequest('billing-status', 'entitlement', async () => {
  try {
   await authenticate(new Request('https://resumestride.com', { headers: { authorization: 'Bearer private-token' } }), { url: 'https://db.invalid', publicKey: secret }, async () => Response.json({ message: secret }, { status: 401 }))
   return json(200, {})
  } catch (error) { return safeError(error) }
 }, env, record => records.push(record))
 assert.equal(response.status, 401)
 assert.equal(records[0].feature, 'auth')
 assert.equal(records[0].category, 'authentication')
 assert.ok(!JSON.stringify(records).includes('private-token'))
 assert.ok(!JSON.stringify(records).includes(secret))
})

test('provider 429s remain diagnosable even when an optional page failure is swallowed', async () => {
 const records: Diagnostic[] = []
 await runObservedRequest('jobs-search', 'jobs', async () => {
  try { await techmapSearch({ url: 'https://provider.invalid', apiKey: secret, host: 'provider.invalid' }, { title: secret }, async () => Response.json({ error: secret }, { status: 429 })) }
  catch { /* Equivalent to optional second-page fallback. */ }
  return json(200, {})
 }, env, record => records.push(record))
 assert.ok(records.some(r => r.category === 'provider_rate_limit' && r.status === 429))
 assert.equal(records.at(-1)?.health, 'degraded')
 assert.ok(!JSON.stringify(records).includes(secret))
})

test('all deployed API entrypoints generate IDs and ignore attacker-controlled IDs/URLs', async () => {
 for (const file of (await readdir(new URL('../../api/', import.meta.url))).filter(file => file.endsWith('.ts'))) {
  const handler = (await import(`../../api/${file}`)).default
  const response = await handler.fetch(new Request(`https://resumestride.com/api/${file}?token=private-query`, { headers: { 'X-Request-ID': 'private-incoming-id' } }))
  assert.match(response.headers.get('x-request-id')!, uuid, file)
  assert.notEqual(response.headers.get('x-request-id'), 'private-incoming-id')
  assert.ok(response.status >= 400, file)
 }
})

test('analytics permits only sanitized public pageviews, closed product events and coarse properties', () => {
 const origin = 'https://resumestride.com'
 for (const path of ['/?account=1', '/?code=private-token', '/#access_token=private-token', '/resume/private-name', '/jobs', '/?job=private-description']) {
  assert.equal(safeAnalyticsEvent({ type: 'pageview', url: origin + path }), null)
 }
 for (const url of ['garbage', 'https://evil.test/', 'https://user:password@resumestride.com/']) assert.equal(safeAnalyticsEvent({ type: 'pageview', url }), null)
 assert.deepEqual(safeAnalyticsEvent({ type: 'event', url: origin + '/?code=private-token' }), { type: 'event', url: origin + '/' })
 assert.deepEqual(safeSpeedInsight({ type: 'vital', url: origin + '/?code=private-token', route: '/private' }), { type: 'vital', url: origin + '/', route: '/' })
 assert.equal(safeSpeedInsight({ type: 'vital', url: 'https://evil.test/?token=secret' }), null)
 assert.deepEqual(safeAnalyticsEvent({ type: 'pageview', url: origin + '/?utm_source=google&utm_campaign=launch' }), { type: 'pageview', url: origin + '/' })
 assert.deepEqual(safeAnalyticsEvent(Object.assign({ type: 'pageview' as const, url: origin + '/#pricing' }, { resume: secret, properties: { password: secret } })), { type: 'pageview', url: origin + '/' })
 assert.deepEqual(sanitizeProductProperties({ user_state: 'authenticated', plan: 'Pro', export_type: 'PDF', utm_source: 'google', utm_term: secret, referrer_host: 'Search.Google.com' }), { user_state: 'authenticated', plan: 'Pro', export_type: 'PDF', utm_source: 'google', referrer_host: 'search.google.com' })
 assert.deepEqual(sanitizeProductProperties({ surface: 'resources', article_slug: 'resume-keywords', cta_destination: 'match' }), { surface: 'resources', article_slug: 'resume-keywords', cta_destination: 'match' })
 const memory = new Map<string, string>()
 const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
 assert.deepEqual(captureFirstTouchAttribution(new URL(origin + '/?utm_source=google&utm_medium=organic&utm_term=product-manager'), 'https://www.google.com/search?q=private', storage), { utm_source: 'google', utm_medium: 'organic', utm_term: 'product-manager', referrer_host: 'www.google.com' })
 assert.deepEqual(captureFirstTouchAttribution(new URL(origin + '/?utm_source=changed'), 'https://example.com/private', storage), { utm_source: 'google', utm_medium: 'organic', utm_term: 'product-manager', referrer_host: 'www.google.com' })
})

test('browser diagnostics are bounded, content-free, clearable and preserve thrown errors', async () => {
 clearBrowserDiagnostics()
 for (let i = 0; i < 60; i++) recordBrowserDiagnostic('extension', 'bridge_receive', 'bridge_rejected')
 recordBrowserDiagnostic('extension', secret as 'bridge_receive', 'bridge_rejected')
 const failure = Object.assign(new Error(secret), { name: 'ResumeConflictError', server: { resume: secret } })
 await assert.rejects(observeBrowserOperation('cloud', 'cloud_save', async () => { throw failure }), error => error === failure)
 const records = readBrowserDiagnostics()
 assert.equal(records.length, 50)
 assert.equal(records.at(-1)?.category, 'database_conflict')
 assert.ok(!JSON.stringify(records).includes(secret))
 clearBrowserDiagnostics()
 assert.deepEqual(readBrowserDiagnostics(), [])
 assert.equal(records.length, 50)
})
