/** Server-only, LOCAL, pure entitlement recomputation for reversed one-time
 * purchases (full refunds and chargebacks, including a later-restored
 * chargeback). See docs/BILLING_REVERSAL_DESIGN.md for the full policy
 * rationale, the design defects earlier versions of this file had (event-time
 * chain reflow; relying on opaque event-id ordering as if it were provider
 * lifecycle authority for cross-payment stacking; and, most recently, relying
 * on a same-payment (occurredAt, eventId) tiebreak to decide which of two
 * OPPOSING facts about the very same dispute was true) and how this version
 * avoids all three.
 *
 * A dispute's own identity (`disputeId`, Stripe's dispute object id) is now a
 * required, carried fact on every chargeback/chargeback_reversed event. A
 * dispute's terminal "won" fact (`chargeback_reversed`) always takes
 * precedence over its own non-terminal "created" fact, by construction —
 * never by comparing timestamps or event ids — so two opposing events for the
 * SAME dispute delivered in either order, or with an identical `occurredAt`,
 * converge to the same correct result. See `foldPaymentEvents` below.
 *
 * This file does not call Stripe, does not touch a database, and does not
 * mutate its inputs. It encodes the SAME policy `billing_apply_reversal_event`
 * (`supabase/migrations/*_billing_reversals.sql`) implements durably in SQL;
 * that RPC is the one actually wired into `server/billing/handlers.ts`'s
 * webhook(). This module exists so the policy is independently testable in
 * plain TypeScript and documented in one place, not because anything here
 * runs in production directly. Every exported function takes plain,
 * already-validated-at-the-boundary facts and returns a new plain value. */

export const MAX_TIMESTAMP = 8_640_000_000_000_000

function timestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TIMESTAMP) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function positiveAmount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function nonBlank(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 255) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

/** One immutable, already-verified one-time purchase grant, carrying the
 * EXACT pass window this payment was durably recorded with at the time it
 * was applied (`billing_payments.pass_started_at`/`pass_ended_at`, computed
 * once by `billing_apply_verified_payment` under a per-owner row lock, in
 * true serialized application order). `passStartedAt`/`passEndedAt` are read
 * here as fixed historical facts, never recomputed or reflowed by this
 * module — see the "no reflow" note on `recomputeEntitlement` below for why.
 * `amountTotal` is the original minor-unit charge amount, used only to
 * recognize a *full* reversal of that same payment. */
export type PurchaseGrant = {
  paymentId: string
  passStartedAt: number
  passEndedAt: number
  amountTotal: number
}

/** One immutable, already-verified reversal-lifecycle event for a payment
 * above. `kind: 'chargeback_reversed'` models a dispute the provider later
 * decided in the merchant's favor, restoring a previously voided
 * chargeback. `amountTotal` is the amount reversed (refund/chargeback) or
 * restored (chargeback_reversed); it is compared against the grant's own
 * `amountTotal` to distinguish a full reversal from a partial one.
 *
 * `disputeId` is Stripe's own dispute object id (`Dispute.id`), REQUIRED and
 * non-blank for `chargeback`/`chargeback_reversed`, and REQUIRED to be `null`
 * for `refund` (a refund is not a dispute). It is the only fact this module
 * uses to decide which "created"/"reversed" events describe the SAME
 * dispute — never a payment-wide sequential state machine, and never a
 * timestamp/event-id ordering. A charge can accumulate more than one dispute
 * over its lifetime (rare, but not impossible); each is tracked and resolved
 * independently by its own `disputeId`, and the payment is only restored to
 * `active` once EVERY dispute raised against it has resolved `won` (see
 * `foldPaymentEvents`). */
export type ReversalEvent = {
  eventId: string
  paymentId: string
  kind: 'refund' | 'chargeback' | 'chargeback_reversed'
  disputeId: string | null
  occurredAt: number
  amountTotal: number
}

/** A well-formed event this module deliberately did not act on, because
 * doing so would require guessing a policy nobody has specified (see
 * docs/BILLING_REVERSAL_DESIGN.md). The referenced payment is left in its
 * last unambiguous state instead of being voided, partially adjusted, or
 * restored. */
export type ReconciliationAnomaly = {
  paymentId: string
  eventId: string
  reason: string
}

export type ReconciliationResult = {
  /** The recomputed entitlement expiry, directly comparable with
   * server/billing/policy.ts's isPro(paidThrough, now). null means no
   * surviving grant contributes any paid time at all. */
  paidThrough: number | null
  /** Payment ids currently fully voided by an un-restored full refund or
   * chargeback, sorted by paymentId for a deterministic, permutation-
   * invariant result (there is no longer a "grant order" to sort by — see
   * the module header). */
  voidedPaymentIds: string[]
  anomalies: ReconciliationAnomaly[]
}

function canonicalizeGrants(grants: readonly PurchaseGrant[]): Map<string, PurchaseGrant> {
  const byId = new Map<string, PurchaseGrant>()
  for (const raw of grants) {
    const paymentId = nonBlank(raw.paymentId, 'grant paymentId')
    const grant: PurchaseGrant = {
      paymentId,
      passStartedAt: timestamp(raw.passStartedAt, 'grant pass start'),
      passEndedAt: timestamp(raw.passEndedAt, 'grant pass end'),
      amountTotal: positiveAmount(raw.amountTotal, 'grant amount'),
    }
    if (grant.passEndedAt <= grant.passStartedAt) throw new Error('Grant pass window is not ordered')
    const existing = byId.get(paymentId)
    if (existing === undefined) {
      byId.set(paymentId, grant)
      continue
    }
    // Reading the same immutable ledger row twice (e.g. a retried fetch) is
    // a harmless no-op; the same payment id with different facts is either
    // a corrupt ledger or a forged duplicate and must never be blended.
    if (existing.passStartedAt !== grant.passStartedAt || existing.passEndedAt !== grant.passEndedAt ||
        existing.amountTotal !== grant.amountTotal) {
      throw new Error(`Conflicting duplicate grant for payment ${paymentId}`)
    }
  }
  return byId
}

/** A dispute id names exactly one dispute, which can only ever have been
 * raised against exactly one payment. Required non-blank for
 * `chargeback`/`chargeback_reversed`; required absent for `refund`, since a
 * refund is never itself a dispute and must never be folded into one by
 * accident. */
function canonicalDisputeId(raw: ReversalEvent, eventId: string): string | null {
  if (raw.kind === 'refund') {
    if (raw.disputeId !== null) {
      throw new Error(`Refund event ${eventId} must not carry a disputeId`)
    }
    return null
  }
  if (typeof raw.disputeId !== 'string' || raw.disputeId.trim().length === 0 || raw.disputeId.length > 255) {
    throw new Error(`Invalid disputeId for event ${eventId}`)
  }
  return raw.disputeId
}

function canonicalizeEvents(
  events: readonly ReversalEvent[],
  grantsById: ReadonlyMap<string, PurchaseGrant>,
): Map<string, ReversalEvent> {
  const byId = new Map<string, ReversalEvent>()
  const paymentIdByDisputeId = new Map<string, string>()
  for (const raw of events) {
    const eventId = nonBlank(raw.eventId, 'event id')
    const paymentId = nonBlank(raw.paymentId, 'event paymentId')
    if (raw.kind !== 'refund' && raw.kind !== 'chargeback' && raw.kind !== 'chargeback_reversed') {
      throw new Error(`Invalid reversal event kind for event ${eventId}`)
    }
    const disputeId = canonicalDisputeId(raw, eventId)
    if (!grantsById.has(paymentId)) {
      // An event cannot be attributed to a payment this recomputation was
      // not given as a fact; that is a caller bug (missing grant in the
      // ledger read) or a forged event, never something safe to guess at.
      throw new Error(`Reversal event ${eventId} references unknown payment ${paymentId}`)
    }
    if (disputeId !== null) {
      // A dispute belongs to exactly one payment for its entire lifetime; an
      // event claiming a disputeId already seen under a different paymentId
      // is a corrupt ledger or a forged event, never something to guess at.
      const owner = paymentIdByDisputeId.get(disputeId)
      if (owner === undefined) {
        paymentIdByDisputeId.set(disputeId, paymentId)
      } else if (owner !== paymentId) {
        throw new Error(`Dispute ${disputeId} is claimed by more than one payment`)
      }
    }
    const event: ReversalEvent = {
      eventId,
      paymentId,
      kind: raw.kind,
      disputeId,
      occurredAt: timestamp(raw.occurredAt, 'event occurredAt'),
      amountTotal: positiveAmount(raw.amountTotal, 'event amount'),
    }
    const existing = byId.get(eventId)
    if (existing === undefined) {
      byId.set(eventId, event)
      continue
    }
    if (existing.paymentId !== event.paymentId || existing.kind !== event.kind ||
        existing.disputeId !== event.disputeId || existing.occurredAt !== event.occurredAt ||
        existing.amountTotal !== event.amountTotal) {
      throw new Error(`Conflicting duplicate reversal event ${eventId}`)
    }
  }
  return byId
}

/** Orders one payment's OWN events into a single stable sequence, used ONLY
 * to make the `anomalies` array's contents deterministic/permutation-
 * invariant (see the test of that property). This ordering no longer decides
 * any part of the entitlement outcome itself — see `foldPaymentEvents` below,
 * which resolves each dispute from the SET of its own events, not by folding
 * them in this (or any) sequence. A same-payment (occurredAt, eventId) tie is
 * not expected from a real provider (Stripe timestamps lifecycle events for
 * the same object individually), but the tiebreak keeps this function total
 * regardless. */
function compareEvents(a: ReversalEvent, b: ReversalEvent): number {
  return a.occurredAt - b.occurredAt || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
}

/** Resolves one SINGLE dispute (all events sharing one `disputeId`) from the
 * set of its own events — never from their arrival order, their timestamps,
 * or their event ids. A dispute is `'won'` if and only if it has at least one
 * full-amount `chargeback_reversed` fact AND at least one full-amount
 * `chargeback` (created) fact; this makes "won" a terminal, order-independent
 * property of the SET rather than the outcome of a race between two events —
 * two opposing facts about the same dispute delivered in either order, or
 * with an identical `occurredAt` and no usable eventId tiebreak, converge to
 * the same result. A `chargeback_reversed` with no corresponding valid
 * `chargeback` fact is an orphan: it cannot restore anything (there is
 * nothing recorded as voided for it to undo) and is surfaced as an anomaly,
 * matching `docs/BILLING_REVERSAL_DESIGN.md`'s "refused, not guessed at"
 * policy for a restoration with no matching void. Returns whether this
 * dispute leaves the payment voided (`true`) or resolved in the merchant's
 * favor / not actually a fact at all (`false`). */
function resolveDispute(
  grant: PurchaseGrant,
  disputeId: string,
  events: readonly ReversalEvent[],
  anomalies: ReconciliationAnomaly[],
): boolean {
  const created = events.filter(e => e.kind === 'chargeback')
  const reversed = events.filter(e => e.kind === 'chargeback_reversed')
  for (const e of created) {
    if (e.amountTotal !== grant.amountTotal) {
      anomalies.push({
        paymentId: grant.paymentId,
        eventId: e.eventId,
        reason: `Partial chargeback of ${e.amountTotal} against a ${grant.amountTotal} payment (dispute ` +
          `${disputeId}) has no defined entitlement policy; left in its last unambiguous state`,
      })
    }
  }
  for (const e of reversed) {
    if (e.amountTotal !== grant.amountTotal) {
      anomalies.push({
        paymentId: grant.paymentId,
        eventId: e.eventId,
        reason: `chargeback_reversed amount ${e.amountTotal} for dispute ${disputeId} does not match the ` +
          `original payment amount ${grant.amountTotal}; ignored`,
      })
    }
  }
  const validCreated = created.some(e => e.amountTotal === grant.amountTotal)
  const validReversed = reversed.some(e => e.amountTotal === grant.amountTotal)
  if (!validCreated) {
    // Nothing was ever validly charged back for this dispute id, so it
    // contributes no voiding either way; any (valid-amount) reversed event
    // here is an orphan restoration with nothing to restore.
    if (validReversed) {
      for (const e of reversed) {
        if (e.amountTotal === grant.amountTotal) {
          anomalies.push({
            paymentId: grant.paymentId,
            eventId: e.eventId,
            reason: `chargeback_reversed with no matching chargeback for dispute ${disputeId}; ignored`,
          })
        }
      }
    }
    return false
  }
  // A valid chargeback fact exists: this dispute voids the payment UNLESS it
  // also carries a valid won-dispute fact, which is terminal and takes
  // precedence regardless of which event this ledger happened to receive
  // "first".
  return !validReversed
}

/** Folds one payment's own reversal-lifecycle events into a final voided/
 * active determination. This is the only place "what does a reversal event
 * mean" is decided; see docs/BILLING_REVERSAL_DESIGN.md for the policy this
 * encodes and the partial-amount case it deliberately refuses to interpret.
 *
 * A full refund is permanent even when it follows a disputed charge (winning
 * that dispute must never undo a separate refund) and is resolved
 * independently of every dispute below — a payment can be refunded and also
 * carry chargeback events (e.g. a duplicate notification of the same
 * underlying event); this never needs to be treated as a conflict.
 *
 * Every dispute ever raised against this payment (grouped by its own
 * `disputeId`) is resolved independently by `resolveDispute`; the payment
 * remains voided if ANY of them is not won — a charge that was legitimately
 * charged back more than once over its lifetime is not restored to `active`
 * just because ONE of those disputes was later won. */
function foldPaymentEvents(
  grant: PurchaseGrant,
  events: readonly ReversalEvent[],
  anomalies: ReconciliationAnomaly[],
): boolean {
  let voidedByRefund = false
  for (const event of events) {
    if (event.kind !== 'refund') continue
    if (event.amountTotal !== grant.amountTotal) {
      anomalies.push({
        paymentId: grant.paymentId,
        eventId: event.eventId,
        reason: `Partial refund of ${event.amountTotal} against a ${grant.amountTotal} payment has no defined ` +
          'entitlement policy; left in its last unambiguous state',
      })
      continue
    }
    // A second full refund once already voided (a duplicate notification
    // with a new event id) is an idempotent no-op, not a new fact.
    voidedByRefund = true
  }

  const disputeEvents = new Map<string, ReversalEvent[]>()
  for (const event of events) {
    if (event.kind === 'refund') continue
    const disputeId = event.disputeId as string // validated non-null for these kinds in canonicalizeEvents
    const list = disputeEvents.get(disputeId)
    if (list === undefined) disputeEvents.set(disputeId, [event])
    else list.push(event)
  }

  let unresolvedDispute = false
  for (const [disputeId, disputeEventList] of disputeEvents) {
    if (resolveDispute(grant, disputeId, disputeEventList, anomalies)) {
      unresolvedDispute = true
    }
  }

  return voidedByRefund || unresolvedDispute
}

/** Recomputes the one-time-pass entitlement from immutable purchase and
 * reversal facts only, WITHOUT ever reflowing a surviving grant's own
 * recorded pass window.
 *
 * An earlier version of this function rebuilt the entire stacking chain from
 * scratch on every call — sorting all grants by `grantOrder` and restacking
 * each survivor at `max(previous survivor's end, its own grantOrder)`, the
 * same rule `server/billing/policy.ts`'s `manualPassWindow` uses when a
 * payment is first applied. That is wrong for reconciliation specifically:
 * `docs/BILLING_REVERSAL_DESIGN.md` documents the concrete failure — refund
 * an EARLIER grant in a stack after real time has already elapsed, and the
 * reflow moves a LATER, completely unrelated, never-reversed grant's start
 * time earlier, which can retroactively SHORTEN prepaid time a customer
 * already validly holds (or already exercised access under). This function
 * must never do that.
 *
 * Instead, each grant's `passStartedAt`/`passEndedAt` is treated as a fixed
 * historical fact — exactly what was durably recorded, once, at the moment
 * that specific payment was applied, already in true serialized application
 * order (see `billing_apply_verified_payment`'s per-owner row lock). Voiding
 * a grant removes ONLY that grant's own recorded interval from
 * consideration; every other, unaffected grant keeps the exact window it
 * was already committed with. Restoring a grant (a won dispute) adds its
 * original recorded interval back. The recomputed `paidThrough` is simply
 * the latest recorded `passEndedAt` among currently-active (non-voided)
 * grants — which is always well-defined and monotonic because each grant
 * was itself stacked on top of the then-current entitlement at the time it
 * was applied, so active grants' own recorded end times are already in the
 * correct relative order without this function re-deriving anything.
 *
 * This also removes the other flagged defect: this function no longer sorts
 * or replays grants by a provider-supplied timestamp at all, so it can never
 * diverge from the database ledger's own serialized arrival-order stacking
 * (`grantOrder` sorting was never guaranteed equivalent to that order in the
 * first place). The only ordering this function still performs is sorting a
 * SINGLE payment's own reversal events for deterministic `anomalies` output
 * — never comparing events or grants across different payments, and no
 * longer used to decide any dispute's outcome either (see `compareEvents`
 * and `resolveDispute`).
 *
 * Pure: never mutates `grants` or `events`, performs no I/O, and returns a
 * fresh value every call. Callers must still verify payment/event facts
 * against an authenticated provider and persist the result durably and
 * atomically — see docs/BILLING_REVERSAL_DESIGN.md. */
export function recomputeEntitlement(
  grants: readonly PurchaseGrant[],
  events: readonly ReversalEvent[],
): ReconciliationResult {
  if (!Array.isArray(grants) || !Array.isArray(events) || grants.length > 10000 || events.length > 50000) {
    throw new Error('Reconciliation input exceeds supported ledger size')
  }
  const grantsById = canonicalizeGrants(grants)
  const eventsById = canonicalizeEvents(events, grantsById)

  const eventsByPayment = new Map<string, ReversalEvent[]>()
  for (const event of eventsById.values()) {
    const list = eventsByPayment.get(event.paymentId)
    if (list === undefined) {
      eventsByPayment.set(event.paymentId, [event])
    } else {
      list.push(event)
    }
  }
  for (const list of eventsByPayment.values()) {
    list.sort(compareEvents)
  }

  const anomalies: ReconciliationAnomaly[] = []
  const voidedPaymentIds: string[] = []
  let paidThrough: number | null = null

  for (const grant of grantsById.values()) {
    const paymentEvents = eventsByPayment.get(grant.paymentId) ?? []
    const voided = foldPaymentEvents(grant, paymentEvents, anomalies)
    if (voided) {
      voidedPaymentIds.push(grant.paymentId)
    } else if (paidThrough === null || grant.passEndedAt > paidThrough) {
      paidThrough = grant.passEndedAt
    }
  }

  voidedPaymentIds.sort()
  return { paidThrough, voidedPaymentIds, anomalies }
}
