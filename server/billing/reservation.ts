import { HttpError } from '../http/security.js'
import { serviceDatabase } from '../database.js'

/** A single, durable, per-owner checkout reservation shared by the manual
 * pass and the OPTIONAL recurring subscription checkout flows. See
 * supabase/migrations/20260920050000_owner_checkout_reservation.sql for the
 * full design and why a fixed local TTL can never safely stand in for the
 * provider-confirmed release this module implements. */

export type ReservationKind = 'manual' | 'subscription'

export type OwnerCheckoutLock = {
  owner_id: string
  kind: ReservationKind
  request_id: string
  session_id: string | null
  price_id: string
  live: boolean
  created_at: string
}

type Database = ReturnType<typeof serviceDatabase>

/** True only when the returned reservation is this exact request's own —
 * whether just created or reused from an earlier call for the identical
 * request id (the ordinary retry-the-same-request-id path). False means a
 * DIFFERENT checkout (any kind, any request id) currently holds the
 * owner's one slot. */
export function isOwnLock(lock: OwnerCheckoutLock, kind: ReservationKind, requestId: string, priceId: string, live: boolean): boolean {
  return lock.kind === kind && lock.request_id === requestId && lock.price_id === priceId && lock.live === live
}

async function reserveOwnerCheckout(db: Database, kind: ReservationKind, requestId: string, owner: string, priceId: string, live: boolean): Promise<OwnerCheckoutLock> {
  const { data, error } = await db.rpc('billing_reserve_owner_checkout', { p_kind: kind, p_id: requestId, p_owner: owner, p_price: priceId, p_live: live })
  if (error || !data) throw new Error('Checkout reservation unavailable')
  return data as OwnerCheckoutLock
}

/** Acquires the owner's shared checkout slot for this exact request. If a
 * DIFFERENT checkout is already holding it, `recover` gets one attempt to
 * resolve (never force-free) that OTHER reservation before this request is
 * rejected — see tryRecoverStuckLock below. Never blocks past a genuinely
 * still-open other checkout: recovery only ever frees the slot when it can
 * prove, via Stripe's own definite response, that nothing was created for
 * it. */
export async function acquireOwnerCheckoutLock(
  db: Database, kind: ReservationKind, requestId: string, owner: string, priceId: string, live: boolean,
  recover: (stuck: OwnerCheckoutLock) => Promise<boolean>,
): Promise<OwnerCheckoutLock> {
  let lock = await reserveOwnerCheckout(db, kind, requestId, owner, priceId, live)
  if (!isOwnLock(lock, kind, requestId, priceId, live)) {
    const freed = await recover(lock)
    if (!freed) throw new HttpError(409, 'You already have a checkout in progress. Finish it or wait for it to expire, then try again.')
    lock = await reserveOwnerCheckout(db, kind, requestId, owner, priceId, live)
    if (!isOwnLock(lock, kind, requestId, priceId, live)) throw new HttpError(409, 'You already have a checkout in progress. Finish it or wait for it to expire, then try again.')
  }
  return lock
}

/** Provider-confirmed release, called from the webhook after Stripe itself
 * has told us a session reached a terminal state: completed and reconciled
 * (payment applied / subscription recorded), or Stripe's own
 * checkout.session.expired event for an abandoned session. Owner+kind+exact
 * session id scoped, so it can never release a different, newer reservation
 * for the same owner, and safely idempotent against webhook redelivery. */
export async function releaseOwnerCheckoutBySession(db: Database, owner: string, kind: ReservationKind, sessionId: string): Promise<void> {
  const { error } = await db.rpc('billing_release_owner_checkout', { p_owner: owner, p_kind: kind, p_session: sessionId, p_request_id: null })
  if (error) throw new Error('Checkout reservation release unavailable')
}

/** Attempts to resolve a DIFFERENT, stuck reservation currently blocking a
 * new checkout request for the same owner. This NEVER frees the slot for
 * the new request directly — it only ever does one of two things to the
 * STUCK reservation itself:
 *   - if it already has a session bound, it is left completely untouched:
 *     only a provider-confirmed terminal webhook may ever release a bound
 *     reservation, never this recovery path;
 *   - if it is unbound, `create` retries the stuck request's own Stripe
 *     call using ITS OWN recorded idempotency key (server/billing/stripe.ts
 *     derives it from owner+requestId), which either discovers/creates the
 *     real session and binds it (the "lost bind" case resolved — the slot
 *     is now legitimately, verifiably occupied and the caller must still
 *     wait) or fails and retains the lock for explicit provider reconciliation.
 * Returns true only when the slot was actually freed for a fresh reserve. */
export async function tryRecoverStuckLock(
  lock: OwnerCheckoutLock,
  create: () => Promise<{ id: string }>,
  db: Database,
  bindIntent: (sessionId: string) => Promise<void>,
): Promise<boolean> {
  if (lock.session_id) return false
  const age = Date.now() - Date.parse(lock.created_at)
  if (!Number.isFinite(age) || age < 0 || age >= 23 * 60 * 60 * 1000) return false
  try {
    const session = await create()
    await bindIntent(session.id)
    const { error } = await db.rpc('billing_bind_owner_checkout', { p_owner: lock.owner_id, p_kind: lock.kind, p_id: lock.request_id, p_session: session.id })
    if (error) throw new Error('Unable to persist checkout reservation')
    return false
  } catch {
    // A rejection of this retry cannot disprove an earlier successful create.
    // Preserve the lock until the original provider outcome is reconciled.
    return false
  }
}
