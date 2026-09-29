import test from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import { assertPaidTerritory, offerCatalogConfig, offerFor, validateOffer } from '../../server/billing/catalog.ts'
import { premiumTemplateIds } from '../../src/model.ts'
import { billingConfig, recurringConfig } from '../../server/billing/stripe.ts'

const templatePrices=Object.fromEntries(premiumTemplateIds.map(templateId=>[templateId,`price_${templateId}`]))
const env={BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_PASS_PRICE_ID:'price_pass',STRIPE_RECURRING_PRICE_ID:'price_legacy_recurring',STRIPE_MODE:'test',APP_ORIGIN:'https://resumestride.com',SUBSCRIPTION_OFFERS_ENABLED:'true',STRIPE_PRO_MONTHLY_PRICE_ID:'price_pro',STRIPE_TEMPLATE_PRICE_MAP:JSON.stringify(templatePrices)}

test('offer catalog is an explicit server allowlist with fixed prices',()=>{
 const config=offerCatalogConfig(env)
 assert.deepEqual(offerFor(config,'pro:monthly'),{key:'pro:monthly',kind:'pro',templateId:null,priceId:'price_pro',amount:1999})
 assert.deepEqual(offerFor(config,'template:boardroom'),{key:'template:boardroom',kind:'template',templateId:'boardroom',priceId:'price_boardroom',amount:199})
 assert.throws(()=>offerFor(config,'template:client-injected'))
})

test('sales stay closed until every Premium template has an authoritative price mapping',()=>{
 assert.throws(()=>offerCatalogConfig({...env,STRIPE_TEMPLATE_PRICE_MAP:JSON.stringify({boardroom:'price_boardroom'})}))
 assert.doesNotThrow(()=>offerCatalogConfig(env))
})

test('enabling the new catalog disables both historical checkout products',()=>{
 assert.throws(()=>billingConfig(env))
 assert.throws(()=>recurringConfig({...env,BILLING_RECURRING_ENABLED:'true'}))
})

test('paid territory accepts trusted US and rejects unsupported countries',()=>{
 assert.doesNotThrow(()=>assertPaidTerritory(new Request('https://resumestride.com',{headers:{'x-vercel-ip-country':'US'}}),{VERCEL_ENV:'preview'}))
 assert.throws(()=>assertPaidTerritory(new Request('https://resumestride.com',{headers:{'x-vercel-ip-country':'CA'}}),{VERCEL_ENV:'production'}))
})

test('Stripe offer validation requires active matching product metadata and monthly cadence',async()=>{
 const config=offerCatalogConfig(env),offer=offerFor(config,'template:boardroom')
 const valid={active:true,livemode:false,currency:'usd',unit_amount:199,type:'recurring',recurring:{interval:'month',interval_count:1},product:{id:'prod_fixture',object:'product',active:true,deleted:false,metadata:{offer_key:'template:boardroom'}}}
 const stripe=(price:Record<string,unknown>)=>({accounts:{retrieve:async()=>({id:'acct_fixture',charges_enabled:true})},prices:{retrieve:async()=>price}}) as unknown as Stripe
 await assert.doesNotReject(validateOffer(stripe(valid),config,offer))
 await assert.rejects(validateOffer(stripe({...valid,unit_amount:299}),config,offer))
 await assert.rejects(validateOffer(stripe({...valid,recurring:{interval:'day',interval_count:30}}),config,offer))
 await assert.rejects(validateOffer(stripe({...valid,product:{...valid.product,metadata:{offer_key:'template:kernel'}}}),config,offer))
})
