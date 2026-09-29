import type Stripe from 'stripe'
import { premiumTemplateIds, type PremiumTemplateId } from '../../src/model.js'
import { HttpError } from '../http/security.js'
import { billingServiceConfig, type BillingConfig } from './stripe.js'

export const PRO_MONTHLY_AMOUNT_CENTS = 1999
export const TEMPLATE_MONTHLY_AMOUNT_CENTS = 199
export const OFFER_CURRENCY = 'usd'

export type Offer = {
  key: `pro:monthly` | `template:${PremiumTemplateId}`
  kind: 'pro' | 'template'
  templateId: PremiumTemplateId | null
  priceId: string
  amount: number
}

export type OfferCatalogConfig = BillingConfig & { offers: ReadonlyMap<string, Offer> }

function priceMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new HttpError(503, 'Subscriptions are not configured', 'configuration') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(503, 'Subscriptions are not configured', 'configuration')
  const result: Record<string, string> = {}
  for (const [templateId, priceId] of Object.entries(value)) {
    if (!(premiumTemplateIds as readonly string[]).includes(templateId) || typeof priceId !== 'string' || !/^price_[A-Za-z0-9]+$/.test(priceId)) {
      throw new HttpError(503, 'Subscriptions are not configured', 'configuration')
    }
    result[templateId] = priceId
  }
  return result
}

export function offerCatalogConfig(env: NodeJS.ProcessEnv, requireSales = true): OfferCatalogConfig {
  if (requireSales && env.SUBSCRIPTION_OFFERS_ENABLED !== 'true') throw new HttpError(503, 'Subscriptions are not available yet', 'configuration')
  const base = billingServiceConfig(env)
  const proPriceId = env.STRIPE_PRO_MONTHLY_PRICE_ID || env.STRIPE_RECURRING_PRICE_ID
  if (!proPriceId || !/^price_[A-Za-z0-9]+$/.test(proPriceId)) throw new HttpError(503, 'Subscriptions are not configured', 'configuration')
  const templates = priceMap(env.STRIPE_TEMPLATE_PRICE_MAP)
  if (requireSales && premiumTemplateIds.some(templateId => !templates[templateId])) {
    throw new HttpError(503, 'Subscriptions are not configured', 'configuration')
  }
  const offers = new Map<string, Offer>()
  offers.set('pro:monthly', { key: 'pro:monthly', kind: 'pro', templateId: null, priceId: proPriceId, amount: PRO_MONTHLY_AMOUNT_CENTS })
  for (const templateId of premiumTemplateIds) {
    const priceId = templates[templateId]
    if (priceId) offers.set(`template:${templateId}`, { key: `template:${templateId}`, kind: 'template', templateId, priceId, amount: TEMPLATE_MONTHLY_AMOUNT_CENTS })
  }
  return { ...base, offers }
}

export function offerFor(config: OfferCatalogConfig, key: unknown): Offer {
  if (typeof key !== 'string') throw new HttpError(400, 'Choose a valid subscription')
  const offer = config.offers.get(key)
  if (!offer) throw new HttpError(400, 'That subscription is not available')
  return offer
}

export function assertPaidTerritory(request: Request, env: NodeJS.ProcessEnv): void {
  const trustedCountry = request.headers.get('x-vercel-ip-country')
  const localCountry = env.VERCEL_ENV ? null : request.headers.get('x-resumestride-country')
  const country = trustedCountry || localCountry || (!env.VERCEL_ENV ? 'US' : null)
  if (country !== 'US') throw new HttpError(403, 'New paid subscriptions are currently available only in the United States.')
}

export async function validateOffer(stripe: Stripe, config: OfferCatalogConfig, offer: Offer): Promise<void> {
  const [account, price] = await Promise.all([stripe.accounts.retrieve(config.accountId), stripe.prices.retrieve(offer.priceId, { expand: ['product'] })])
  const product = typeof price.product === 'string' ? null : price.product
  if (account.id !== config.accountId || !account.charges_enabled || !price.active || price.livemode !== config.live || price.currency !== OFFER_CURRENCY ||
    price.unit_amount !== offer.amount || price.type !== 'recurring' || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1 ||
    !product || product.deleted || !product.active || product.metadata.offer_key !== offer.key) {
    throw new HttpError(503, 'Subscriptions are not available yet', 'configuration')
  }
}
