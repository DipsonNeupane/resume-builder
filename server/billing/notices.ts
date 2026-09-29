import { timingSafeEqual } from 'node:crypto'
import { HttpError, json, safeError } from '../http/security.js'
import { serviceDatabase } from '../database.js'

function secretMatches(actual: string | null, expected: string | undefined): boolean {
  if (!actual?.startsWith('Bearer ') || !expected || expected.length < 24) return false
  const a = Buffer.from(actual.slice(7)); const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!))
}

export function emailCopy(kind: string, payload: Record<string, unknown>) {
  const names: Record<string, string> = { 'pro:monthly':'ResumeStride Pro', purchase:'Purchase confirmed', renewal_reminder:'Subscription renewal reminder', renewal_receipt:'Renewal receipt', cancellation:'Cancellation confirmed', payment_failed:'Payment action required', expiration:'Subscription expired', material_change:'Important subscription update', price_change:'Subscription price change' }
  const offer = typeof payload.offerKey === 'string' ? (names[payload.offerKey] || payload.offerKey.replace('template:', '') + ' Premium template') : 'ResumeStride subscription'
  const date = typeof payload.accessEndsAt === 'string' ? new Date(payload.accessEndsAt).toLocaleDateString('en-US', { dateStyle:'long', timeZone:'UTC' }) : typeof payload.periodEnd === 'string' ? new Date(payload.periodEnd).toLocaleDateString('en-US', { dateStyle:'long', timeZone:'UTC' }) : ''
  const copy: Record<string, [string,string]> = {
    purchase: ['Purchase confirmed', `${offer} is active. It renews monthly until cancelled.`],
    renewal_reminder: ['Your subscription renews in 3 days', `${offer} is scheduled to renew in 3 days. You can manage or cancel it from your ResumeStride account.`],
    renewal_receipt: ['Subscription renewed', `${offer} renewed successfully${date ? ` through ${date}` : ''}.`],
    cancellation: ['Cancellation confirmed', `${offer} will not renew. Your access continues through the already-paid billing period${date ? ` ending ${date}` : ''}. Your resumes and account content will remain.`],
    payment_failed: ['Payment action required', `We could not renew ${offer}. Please update your payment method from your ResumeStride billing portal.`],
    expiration: ['Subscription expired', `${offer} has expired. Your account has returned to the applicable Free access. Your resumes and account content remain available.`],
    material_change: ['Important subscription update', String(payload.message || 'Review an important update to your ResumeStride subscription.')],
    price_change: ['Subscription price change', String(payload.message || 'Review an upcoming price change to your ResumeStride subscription.')],
  }
  return copy[kind] || ['ResumeStride billing update', 'There is an update to your ResumeStride subscription.']
}

const dependencies = { serviceDatabase, fetch: globalThis.fetch }
type Dependencies = typeof dependencies

export async function dispatchNotices(request: Request, env: NodeJS.ProcessEnv = process.env, deps: Dependencies = dependencies): Promise<Response> {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed')
    if (!secretMatches(request.headers.get('authorization'), env.NOTICE_DISPATCH_SECRET)) throw new HttpError(401, 'Not authorized')
    if (!env.RESEND_API_KEY?.startsWith('re_') || !env.BILLING_EMAIL_FROM || !env.APP_ORIGIN) throw new HttpError(503, 'Transactional email is not configured', 'configuration')
    const db = deps.serviceDatabase(env)
    const scheduled = await db.rpc('billing_schedule_renewal_notices', { p_now: new Date().toISOString() })
    if (scheduled.error) throw new Error('Notice scheduling unavailable')
    const claimed = await db.rpc('billing_claim_due_notices', { p_limit: 25 })
    if (claimed.error || !Array.isArray(claimed.data)) throw new Error('Notice queue unavailable')
    let sent = 0
    for (const notice of claimed.data) {
      const user = await db.auth.admin.getUserById(notice.owner_id)
      const email = user.data.user?.email
      if (!email) { await db.rpc('billing_finish_notice', { p_id: notice.id, p_success: false, p_provider_id: null, p_error_code: 'email_unavailable' }); continue }
      const payload = notice.payload && typeof notice.payload === 'object' && !Array.isArray(notice.payload) ? notice.payload as Record<string, unknown> : {}
      const [subject, body] = emailCopy(notice.kind, payload)
      let response: Response
      try {
        response = await deps.fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${env.RESEND_API_KEY}`, 'Content-Type':'application/json', 'Idempotency-Key':notice.dedupe_key }, body:JSON.stringify({ from:env.BILLING_EMAIL_FROM, to:[email], subject, text:`${body}\n\nManage billing: ${env.APP_ORIGIN}/?account=1`, html:`<p>${escape(body)}</p><p><a href="${escape(env.APP_ORIGIN)}/?account=1">Manage billing</a></p>` }), signal:AbortSignal.timeout(10_000) })
      } catch { await db.rpc('billing_finish_notice', { p_id: notice.id, p_success: false, p_provider_id: null, p_error_code: 'provider_unavailable' }); continue }
      let providerId = ''
      if (response.ok) { try { const parsed = await response.json() as {id?:unknown}; if (typeof parsed.id === 'string') providerId = parsed.id } catch { /* provider ID is optional */ } }
      await db.rpc('billing_finish_notice', { p_id: notice.id, p_success: response.ok, p_provider_id: providerId || null, p_error_code: response.ok ? null : `provider_${response.status}` })
      if (response.ok) sent++
    }
    return json(200, { scheduled: scheduled.data ?? 0, claimed: claimed.data.length, sent })
  } catch (error) { return safeError(error) }
}
