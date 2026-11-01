import test from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import { assertPaidTerritory, offerCatalogConfig, offerFor, paidCheckoutTaxOptions, paidTerritoryMode, validateOffer } from '../../server/billing/catalog.ts'
import { premiumTemplateIds } from '../../src/model.ts'
import { billingConfig, recurringConfig } from '../../server/billing/stripe.ts'
import { offerCheckout, validatePilotCode } from '../../server/billing/offer-handlers.ts'

const templatePrices=Object.fromEntries(premiumTemplateIds.map(templateId=>[templateId,`price_${templateId}`]))
const env={BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_PASS_PRICE_ID:'price_pass',STRIPE_RECURRING_PRICE_ID:'price_legacy_recurring',STRIPE_MODE:'test',APP_ORIGIN:'https://apwico.com',SUBSCRIPTION_OFFERS_ENABLED:'true',STRIPE_PRO_MONTHLY_PRICE_ID:'price_pro',STRIPE_TEMPLATE_PRICE_MAP:JSON.stringify(templatePrices),SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture'}

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

test('Pro checkout accepts only the marked three-redemption forever code and pins it to the Stripe session',async()=>{
 const calls:Array<{name:string;args?:Record<string,unknown>}> = [],sessions:Array<Record<string,unknown>>=[]
 const coupon={id:'coupon_pilot',object:'coupon',livemode:false,valid:true,percent_off:100,amount_off:null,duration:'forever',metadata:{apwico_pilot_access:'three_friend_lifetime'}}
 const promo={id:'promo_pilot',object:'promotion_code',active:true,code:'FRIENDTEST',livemode:false,max_redemptions:3,expires_at:null,customer:null,metadata:{apwico_pilot_access:'three_friend_lifetime'},promotion:{type:'coupon',coupon},restrictions:{first_time_transaction:false,minimum_amount:null,minimum_amount_currency:null},times_redeemed:0}
 const stripe={
  promotionCodes:{list:async()=>({data:[promo]})},
  coupons:{retrieve:async()=>coupon},
  checkout:{sessions:{create:async(params:Record<string,unknown>,options?:{idempotencyKey?:string})=>{sessions.push({...params,idempotencyKey:options?.idempotencyKey});return{id:'cs_pilot',url:'https://checkout.stripe.com/c/pay/pilot',livemode:false}}}},
 } as unknown as Stripe
 const request=new Request('https://apwico.com/api/subscription-checkout',{method:'POST',headers:{origin:'https://apwico.com','content-type':'application/json','x-vercel-ip-country':'US'},body:JSON.stringify({requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',offerKey:'pro:monthly',renewalConsent:true,promotionCode:'FRIENDTEST'})})
 const response=await offerCheckout(request,env,{
  authenticate:async()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  serviceDatabase:(()=>({rpc:async(name:string,args?:Record<string,unknown>)=>{calls.push({name,args});if(name==='billing_effective_access')return{error:null,data:[{is_pro:false}]};if(name==='billing_owner_template_access')return{error:null,data:[]};if(name==='billing_begin_offer_checkout')return{error:null,data:{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',session_id:null,pilot_promotion_code_id:'promo_pilot'}};if(name==='billing_get_customer')return{error:null,data:{stripe_customer_id:'cus_pilot',live:false}};return{error:null,data:null}}})) as never,
  stripeClient:(()=>stripe) as never,
  validateOffer:(async()=>{}) as never,
 })
 assert.equal(response.status,200)
 assert.deepEqual(sessions[0].discounts,[{promotion_code:'promo_pilot'}])
 assert.equal(sessions[0].allow_promotion_codes,undefined)
 assert.deepEqual(sessions[0].subscription_data,{metadata:{offer_key:'pro:monthly'},trial_period_days:30,trial_settings:{end_behavior:{missing_payment_method:'cancel'}}})
 assert.equal(sessions[0].client_reference_id,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
 assert.equal(sessions[0].idempotencyKey,'offer:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:cccccccc-cccc-4ccc-8ccc-cccccccccccc')
 assert.ok(calls.some(call=>call.name==='billing_throttle_subscription_checkout_attempt'))
 assert.ok(calls.some(call=>call.name==='billing_begin_offer_checkout'&&call.args?.p_pilot_promotion_code_id==='promo_pilot'))
})

test('regular Pro checkout disables customer-entered promotions when no pilot code is applied',async()=>{
 const sessions:Array<Record<string,unknown>>=[]
 const stripe={checkout:{sessions:{create:async(params:Record<string,unknown>)=>{sessions.push(params);return{id:'cs_regular',url:'https://checkout.stripe.com/c/pay/regular',livemode:false}}}}} as unknown as Stripe
 const request=new Request('https://apwico.com/api/subscription-checkout',{method:'POST',headers:{origin:'https://apwico.com','content-type':'application/json','x-vercel-ip-country':'US'},body:JSON.stringify({requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',offerKey:'pro:monthly',renewalConsent:true})})
 const response=await offerCheckout(request,env,{
  authenticate:async()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  serviceDatabase:(()=>({rpc:async(name:string)=>{if(name==='billing_effective_access')return{error:null,data:[{is_pro:false}]};if(name==='billing_owner_template_access')return{error:null,data:[]};if(name==='billing_begin_offer_checkout')return{error:null,data:{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',session_id:null,pilot_promotion_code_id:null}};if(name==='billing_get_customer')return{error:null,data:{stripe_customer_id:'cus_pilot',live:false}};return{error:null,data:null}}})) as never,
  stripeClient:(()=>stripe) as never,
  validateOffer:(async()=>{}) as never,
 })
 assert.equal(response.status,200)
 assert.equal(sessions[0].allow_promotion_codes,false)
 assert.equal(sessions[0].discounts,undefined)
 assert.deepEqual(sessions[0].subscription_data,{metadata:{offer_key:'pro:monthly'},trial_period_days:30,trial_settings:{end_behavior:{missing_payment_method:'cancel'}}})
})

test('pilot code check confirms the verified discount without opening checkout',async()=>{
 const coupon={id:'coupon_pilot',object:'coupon',livemode:false,valid:true,percent_off:100,amount_off:null,duration:'forever',metadata:{apwico_pilot_access:'three_friend_lifetime'}}
 const promo={id:'promo_pilot',object:'promotion_code',active:true,code:'FRIENDTEST',livemode:false,max_redemptions:3,expires_at:null,customer:null,metadata:{apwico_pilot_access:'three_friend_lifetime'},promotion:{type:'coupon',coupon},restrictions:{first_time_transaction:false,minimum_amount:null,minimum_amount_currency:null},times_redeemed:1}
 const request=new Request('https://apwico.com/api/validate-pilot-code',{method:'POST',headers:{origin:'https://apwico.com','content-type':'application/json','x-vercel-ip-country':'US'},body:JSON.stringify({code:'friendtest'})})
 const response=await validatePilotCode(request,env,{
  authenticate:async()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  serviceDatabase:(()=>({rpc:async(name:string)=>name==='billing_throttle_subscription_checkout_attempt'?{error:null,data:null}:{error:{message:'unexpected database call'}}})) as never,
  stripeClient:(()=>({promotionCodes:{list:async()=>({data:[promo]})},coupons:{retrieve:async()=>coupon}})) as never,
  validateOffer:(async()=>{}) as never,
 })
 assert.equal(response.status,200)
 assert.deepEqual(await response.json(),{valid:true,code:'FRIENDTEST',discountPercent:100,duration:'forever',maxRedemptions:3,timesRedeemed:1})
})

test('pilot code check rejects an exhausted code',async()=>{
 const promo={id:'promo_pilot',object:'promotion_code',active:true,code:'FRIENDTEST',livemode:false,max_redemptions:3,expires_at:null,customer:null,metadata:{apwico_pilot_access:'three_friend_lifetime'},promotion:{type:'coupon',coupon:{id:'coupon_pilot',object:'coupon',livemode:false,valid:true,percent_off:100,amount_off:null,duration:'forever',metadata:{apwico_pilot_access:'three_friend_lifetime'}}},restrictions:{first_time_transaction:false,minimum_amount:null,minimum_amount_currency:null},times_redeemed:3}
 const request=new Request('https://apwico.com/api/validate-pilot-code',{method:'POST',headers:{origin:'https://apwico.com','content-type':'application/json','x-vercel-ip-country':'US'},body:JSON.stringify({code:'FRIENDTEST'})})
 const response=await validatePilotCode(request,env,{
  authenticate:async()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  serviceDatabase:(()=>({rpc:async()=>({error:null,data:null})})) as never,
  stripeClient:(()=>({promotionCodes:{list:async()=>({data:[promo]})}})) as never,
  validateOffer:(async()=>{}) as never,
 })
 assert.equal(response.status,400)
 assert.match(await response.text(),/invalid or no longer available/)
})

test('Pro checkout rejects a promotion that is not explicitly marked for the three-person pilot',async()=>{
 let created=false
 const coupon={id:'coupon_other',object:'coupon',livemode:false,valid:true,percent_off:100,amount_off:null,duration:'forever',metadata:{}}
 const promo={id:'promo_other',object:'promotion_code',active:true,code:'OTHER',livemode:false,max_redemptions:3,expires_at:null,customer:null,metadata:{},promotion:{type:'coupon',coupon},restrictions:{first_time_transaction:false,minimum_amount:null,minimum_amount_currency:null},times_redeemed:0}
 const request=new Request('https://apwico.com/api/subscription-checkout',{method:'POST',headers:{origin:'https://apwico.com','content-type':'application/json','x-vercel-ip-country':'US'},body:JSON.stringify({requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',offerKey:'pro:monthly',renewalConsent:true,promotionCode:'OTHER'})})
 const response=await offerCheckout(request,env,{
  authenticate:async()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  serviceDatabase:(()=>({rpc:async(name:string)=>name==='billing_effective_access'?{error:null,data:[{is_pro:false}]}:name==='billing_owner_template_access'?{error:null,data:[]}:{error:null,data:{session_id:null,pilot_promotion_code_id:null}}})) as never,
  stripeClient:(()=>({promotionCodes:{list:async()=>({data:[promo]})},coupons:{retrieve:async()=>coupon},checkout:{sessions:{create:async()=>{created=true;return{}}}}})) as never,
  validateOffer:(async()=>{}) as never,
 })
 assert.equal(response.status,400,await response.text())
 assert.equal(created,false)
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
