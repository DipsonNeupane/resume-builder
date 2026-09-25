import { authenticate, HttpError, json, jsonBody, requirePost } from '../http/security.js'
import { databaseConfig, serviceDatabase } from '../database.js'
import { billingError, billingServiceConfig, stripeClient } from './stripe.js'

export const cancellationDependencies = { authenticate, serviceDatabase, stripeClient }

/** Cancellation stays available when new purchases are disabled. */
export async function cancelSubscription(request: Request, env: NodeJS.ProcessEnv = process.env, deps = cancellationDependencies): Promise<Response> {
  try {
    const config = billingServiceConfig(env)
    requirePost(request, config.origin)
    const owner = await deps.authenticate(request, databaseConfig(env))
    const body = await jsonBody(request)
    if (Object.keys(body).some(key => key !== 'subscriptionId') || typeof body.subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]{1,240}$/.test(body.subscriptionId)) {
      throw new HttpError(400, 'A subscription ID is required')
    }
    const db = deps.serviceDatabase(env)
    const { data: record, error } = await db.rpc('billing_lookup_subscription', { p_subscription_id: body.subscriptionId })
    if (error) throw new Error('Subscription lookup unavailable')
    if (!record || record.owner_id !== owner || record.live !== config.live) throw new HttpError(404, 'Subscription not found')
    const throttle = await db.rpc('billing_throttle_checkout_attempt', { p_owner: owner })
    if (throttle.error?.code === '54000') throw new HttpError(429, 'Too many requests. Try again later.')
    if (throttle.error) throw new Error('Billing throttle unavailable')
    const stripe = deps.stripeClient(config)
    const current = await stripe.subscriptions.retrieve(body.subscriptionId)
    if (current.id !== body.subscriptionId || current.livemode !== config.live) throw new Error('Unexpected subscription')
    // Repeating this desired-state update is safe after a database/network failure.
    // Never cancel immediately or retract an already-paid entitlement.
    const ended = ['canceled', 'incomplete_expired'].includes(current.status)
    const updated = ended || current.cancel_at_period_end ? current : await stripe.subscriptions.update(current.id, { cancel_at_period_end: true })
    if (updated.id !== current.id || updated.livemode !== config.live || (!ended && !updated.cancel_at_period_end)) throw new Error('Cancellation not confirmed')
    const saved = await db.rpc('billing_update_subscription_status', { p_subscription_id: current.id, p_owner_id: owner, p_status: updated.status, p_cancel_at_period_end: updated.cancel_at_period_end })
    if (saved.error) throw new Error('Cancellation persistence unavailable')
    return json(200, { renewalStopped: true })
  } catch (error) { return billingError(error) }
}
