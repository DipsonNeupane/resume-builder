import test from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import { applyOfferInvoice, applyOfferSubscriptionStatus } from '../../server/billing/offer-handlers.ts'

const env={BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_PASS_PRICE_ID:'price_pass',STRIPE_MODE:'test',APP_ORIGIN:'https://resumestride.com',STRIPE_PRO_MONTHLY_PRICE_ID:'price_pro',STRIPE_TEMPLATE_PRICE_MAP:'{}'}
const trusted={owner_id:'abababab-abab-abab-abab-abababababab',subscription_id:'sub_pro',offer_key:'pro:monthly',cancel_at_period_end:false,current_period_end:'2026-11-01T00:00:00.000Z'}

function paidInvoice(): Stripe.Invoice {
 return {id:'in_pro',livemode:false,status:'paid',currency:'usd',amount_paid:1999,billing_reason:'subscription_create',parent:{subscription_details:{subscription:'sub_pro'}},lines:{has_more:false,data:[{pricing:{price_details:{price:'price_pro'}},quantity:1,amount:1999,period:{start:1790812800,end:1793491200}}]},payments:{has_more:false,data:[{status:'paid',payment:{type:'payment_intent',payment_intent:'pi_pro'}}]}} as unknown as Stripe.Invoice
}

test('verified first Pro invoice grants access before stopping individual-template renewals',async()=>{
 const calls:Array<{name:string;args:Record<string,unknown>}>=[]
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});if(name==='billing_owner_subscription_summary')return{error:null,data:[{subscription_id:'sub_template',offer_key:'template:boardroom',offer_kind:'template',status:'active',cancel_at_period_end:false}]};return{error:null,data:null}}} as never
 const stopped:string[]=[]
 const stripe={subscriptions:{update:async(id:string,body:Record<string,unknown>)=>{stopped.push(id);assert.deepEqual(body,{cancel_at_period_end:true});return{id,status:'active',cancel_at_period_end:true,items:{has_more:false,data:[{quantity:1,current_period_start:1790812800,current_period_end:1793491200}]}}}}} as unknown as Stripe
 const response=await applyOfferInvoice(paidInvoice(),1790812800,'invoice.paid',stripe,db,trusted,env)
 assert.equal(response.status,200)
 assert.deepEqual(stopped,['sub_template'])
 assert.ok(calls.findIndex(call=>call.name==='billing_apply_offer_invoice')<calls.findIndex(call=>call.name==='billing_owner_subscription_summary'))
 assert.ok(calls.some(call=>call.name==='billing_enqueue_notice'&&call.args.p_kind==='purchase'))
 assert.ok(calls.some(call=>call.name==='billing_update_offer_subscription'&&call.args.p_subscription==='sub_template'&&call.args.p_cancel_at_period_end===true))
 assert.ok(calls.some(call=>call.name==='billing_enqueue_notice'&&call.args.p_kind==='cancellation'&&String(call.args.p_dedupe_key).startsWith('pro-overlap:')))
})

test('failed monthly payment records an action-required notice without granting access',async()=>{
 const calls:Array<{name:string;args:Record<string,unknown>}>=[]
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{error:null,data:null}}} as never
 const invoice={...paidInvoice(),status:'open'} as Stripe.Invoice
 const response=await applyOfferInvoice(invoice,1790812800,'invoice.payment_failed',{} as Stripe,db,trusted,env)
 assert.equal(response.status,200)
 assert.equal(calls.some(call=>call.name==='billing_apply_offer_invoice'),false)
 assert.ok(calls.some(call=>call.name==='billing_enqueue_notice'&&call.args.p_kind==='payment_failed'))
})

test('terminal subscription status preserves the paid period and queues expiration',async()=>{
 const calls:Array<{name:string;args:Record<string,unknown>}>=[]
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{error:null,data:null}}} as never
 const subscription={id:'sub_pro',status:'canceled',cancel_at_period_end:true,items:{has_more:false,data:[{quantity:1,current_period_start:1790812800,current_period_end:1793491200}]}} as unknown as Stripe.Subscription
 const response=await applyOfferSubscriptionStatus(subscription,db,trusted)
 assert.equal(response.status,200)
 assert.ok(calls.some(call=>call.name==='billing_update_offer_subscription'&&call.args.p_period_end==='2026-11-01T00:00:00.000Z'))
 assert.ok(calls.some(call=>call.name==='billing_enqueue_notice'&&call.args.p_kind==='expiration'))
})

test('hosted-portal cancel_at at the period end stops renewal and queues cancellation',async()=>{
 const calls:Array<{name:string;args:Record<string,unknown>}>=[]
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{error:null,data:null}}} as never
 const subscription={id:'sub_pro',status:'active',cancel_at_period_end:false,cancel_at:1793491200,items:{has_more:false,data:[{quantity:1,current_period_start:1790812800,current_period_end:1793491200}]}} as unknown as Stripe.Subscription
 const response=await applyOfferSubscriptionStatus(subscription,db,trusted)
 assert.equal(response.status,200)
 assert.ok(calls.some(call=>call.name==='billing_update_offer_subscription'&&call.args.p_cancel_at_period_end===true))
 assert.ok(calls.some(call=>call.name==='billing_enqueue_notice'&&call.args.p_kind==='cancellation'))
})

test('a future cancel_at beyond the paid period does not masquerade as period-end cancellation',async()=>{
 const calls:Array<{name:string;args:Record<string,unknown>}>=[]
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{error:null,data:null}}} as never
 const subscription={id:'sub_pro',status:'active',cancel_at_period_end:false,cancel_at:1796083200,items:{has_more:false,data:[{quantity:1,current_period_start:1790812800,current_period_end:1793491200}]}} as unknown as Stripe.Subscription
 await applyOfferSubscriptionStatus(subscription,db,trusted)
 assert.ok(calls.some(call=>call.name==='billing_update_offer_subscription'&&call.args.p_cancel_at_period_end===false))
 assert.equal(calls.some(call=>call.name==='billing_enqueue_notice'&&call.args.p_kind==='cancellation'),false)
})
