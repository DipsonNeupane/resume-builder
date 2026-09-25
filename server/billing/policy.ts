import { PRO_PASS_AMOUNT_CENTS, PRO_PASS_CURRENCY } from './constants.js'

/** Server-only policy. Callers must supply authenticated identities, verified payment
 * facts and database time inside a locked transaction. This module does not verify
 * Stripe signatures, persist grants, or authorize requests by itself. */
export const PASS_MS = 30 * 24 * 60 * 60 * 1000
export const FREE_PDF_ALLOWANCE = 3

function timestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) {
    throw new Error('Invalid authoritative timestamp')
  }
  return value
}

export function freeWindow(signupAt: number, now: number) {
  timestamp(signupAt); timestamp(now)
  if (now < signupAt) throw new Error('Server time precedes signup')
  const cycle = Math.floor((now - signupAt) / PASS_MS)
  const startsAt = signupAt + cycle * PASS_MS
  return { cycle, startsAt, endsAt: timestamp(startsAt + PASS_MS), allowance: FREE_PDF_ALLOWANCE }
}

export function isPro(paidThrough: number | null, now: number): boolean {
  timestamp(now)
  return paidThrough !== null && timestamp(paidThrough) > now
}

/** Appends a verified one-time purchase to existing prepaid time. The database
 * must deduplicate the payment identity and serialize this calculation per user. */
export function manualPassWindow(paidThrough: number | null, verifiedPaidAt: number) {
  timestamp(verifiedPaidAt)
  const startsAt = Math.max(paidThrough === null ? 0 : timestamp(paidThrough), verifiedPaidAt)
  return { startsAt, endsAt: timestamp(startsAt + PASS_MS) }
}

export type VerifiedPayment = {
  accountId: string
  live: boolean
  mode: string
  status: string
  currency: string
  amountTotal: number
  priceId: string
  quantity: number
  paymentId: string
  ownerId: string
}

/** Defense in depth AFTER provider verification and lookup of the server-created
 * checkout record. expected.ownerId must never come from webhook metadata alone.
 * Initial flow permits no discounts/tax additions until explicitly implemented. */
export function assertManualPayment(payment: VerifiedPayment, expected: {
  accountId: string; live: boolean; priceId: string; ownerId: string
}) {
  if (!expected.accountId || !expected.priceId || !expected.ownerId ||
      payment.accountId !== expected.accountId || payment.live !== expected.live ||
      payment.priceId !== expected.priceId || payment.ownerId !== expected.ownerId ||
      payment.mode !== 'payment' || payment.status !== 'paid' ||
      payment.currency !== PRO_PASS_CURRENCY || payment.amountTotal !== PRO_PASS_AMOUNT_CENTS ||
      payment.quantity !== 1 || !payment.paymentId?.trim()) {
    throw new Error('Payment does not match the authorized one-time checkout')
  }
}
