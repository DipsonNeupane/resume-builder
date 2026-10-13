import test from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import { assertPaidTerritory, offerCatalogConfig, offerFor, paidCheckoutTaxOptions, paidTerritoryMode, validateOffer } from '../../server/billing/catalog.ts'
import { premiumTemplateIds } from '../../src/model.ts'
import { billingConfig, recurringConfig } from '../../server/billing/stripe.ts'
import { offerCheckout } from '../../server/billing/offer-handlers.ts'

const templatePrices=Object.fromEntries(premiumTemplateIds.map(templateId=>[templateId,`price_${templateId}`]))
const env={BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_PASS_PRICE_ID:'price_pass',STRIPE_RECURRING_PRICE_ID:'price_legacy_recurring',STRIPE_MODE:'test',APP_ORIGIN:'https://apwico.com',SUBSCRIPTION_OFFERS_ENABLED:'true',STRIPE_PRO_MONTHLY_PRICE_ID:'price_pro',STRIPE_TEMPLATE_PRICE_MAP:JSON.stringify(templatePrices)}

test('offer catalog is an explicit server allowlist with fixed prices',()=>{
 const config=offerCatalogConfig(env)
 assert.deepEqual(offerFor(config,'pro:monthly'),{key:'pro:monthly',kind:'pro',templateId:null,priceId:'price_pro',amount:1499})
 assert.deepEqual(offerFor(config,'template:boardroom'),{key:'template:boardroom',kind:'template',templateId:'boardroom',priceId:'price_boardroom',amount:199})
 assert.throws(()=>offerFor(config,'template:client-injected'))
})

test('new Pro sales do not require legacy template price mappings',()=>{
 const config=offerCatalogConfig({...env,STRIPE_TEMPLATE_PRICE_MAP:'{}'})
 assert.deepEqual(offerFor(config,'pro:monthly').amount,1499)
 assert.throws(()=>offerFor(config,'template:boardroom'))
})

test('new checkout rejects an individual-template offer before touching Stripe or the database',async()=>{
 let touched=false
 const request=new Request('https://apwico.com/api/subscription-checkout',{method:'POST',headers:{origin:'https://apwico.com','content-type':'application/json','x-vercel-ip-country':'US'},body:JSON.stringify({requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',offerKey:'template:boardroom',renewalConsent:true})})
 const response=await offerCheckout(request,env,{
  authenticate:async()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  serviceDatabase:(()=>{touched=true;throw new Error('database must not be touched')}) as never,
  stripeClient:(()=>{touched=true;throw new Error('Stripe must not be touched')}) as never,
  validateOffer:(async()=>{touched=true}) as never,
 })
 assert.equal(response.status,400)
 assert.equal(touched,false)
 assert.match(await response.text(),/no longer available/)
})

test('enabling the new catalog disables both historical checkout products',()=>{
 assert.throws(()=>billingConfig(env))
 assert.throws(()=>recurringConfig({...env,BILLING_RECURRING_ENABLED:'true'}))
})

test('paid territory accepts trusted US and rejects unsupported countries',()=>{
 assert.doesNotThrow(()=>assertPaidTerritory(new Request('https://apwico.com',{headers:{'x-vercel-ip-country':'US'}}),{VERCEL_ENV:'preview'}))
 assert.throws(()=>assertPaidTerritory(new Request('https://apwico.com',{headers:{'x-vercel-ip-country':'CA'}}),{VERCEL_ENV:'production'}))
})

test('international selling is fail-closed until tax handling is explicitly enabled',()=>{
 assert.equal(paidTerritoryMode({}), 'us')
 assert.throws(()=>paidTerritoryMode({PAID_TERRITORY_MODE:'international'}))
 assert.throws(()=>paidTerritoryMode({PAID_TERRITORY_MODE:'worldwide'}))
 assert.doesNotThrow(()=>assertPaidTerritory(new Request('https://apwico.com',{headers:{'x-vercel-ip-country':'CA'}}),{PAID_TERRITORY_MODE:'international',STRIPE_AUTOMATIC_TAX_ENABLED:'true',VERCEL_ENV:'production'}))
 assert.deepEqual(paidCheckoutTaxOptions({}), {})
 assert.deepEqual(paidCheckoutTaxOptions({PAID_TERRITORY_MODE:'international',STRIPE_AUTOMATIC_TAX_ENABLED:'true'}),{
  automatic_tax:{enabled:true},billing_address_collection:'required',customer_update:{address:'auto',name:'auto'},tax_id_collection:{enabled:true},
 })
})

test('Stripe offer validation requires the new active Pro price and monthly cadence',async()=>{
 const config=offerCatalogConfig(env),offer=offerFor(config,'pro:monthly')
 const valid={active:true,livemode:false,currency:'usd',unit_amount:1499,type:'recurring',recurring:{interval:'month',interval_count:1},product:{id:'prod_fixture',object:'product',active:true,deleted:false,metadata:{offer_key:'pro:monthly'}}}
 const stripe=(price:Record<string,unknown>)=>({accounts:{retrieve:async()=>({id:'acct_fixture',charges_enabled:true})},prices:{retrieve:async()=>price}}) as unknown as Stripe
 await assert.doesNotReject(validateOffer(stripe(valid),config,offer))
 await assert.rejects(validateOffer(stripe({...valid,unit_amount:1999}),config,offer))
 await assert.rejects(validateOffer(stripe({...valid,recurring:{interval:'day',interval_count:30}}),config,offer))
 await assert.rejects(validateOffer(stripe({...valid,product:{...valid.product,metadata:{offer_key:'template:kernel'}}}),config,offer))
})
