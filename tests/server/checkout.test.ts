import test from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import { checkout, dependencies, webhook } from '../../server/billing/handlers.ts'
import { stripeClient, billingConfig } from '../../server/billing/stripe.ts'
const env={BILLING_ENABLED:'true',STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_PASS_PRICE_ID:'price_fixture',APP_ORIGIN:'https://resumestride.com',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'fixture'}
const id='11111111-1111-1111-1111-111111111111', owner='22222222-2222-2222-2222-222222222222'
const req=(body:unknown)=>new Request(env.APP_ORIGIN+'/api/checkout',{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify(body)})
const ownLock={owner_id:owner,kind:'manual',request_id:id,session_id:null,price_id:'price_fixture',live:false,created_at:new Date().toISOString()}
function fixture(bindFails=false){
 const calls: string[]=[]
 const deps={...dependencies,authenticate:async()=>owner,validateCatalog:async()=>{},
  serviceDatabase:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
   calls.push(name);assert.ok(!Object.values(args).includes('attacker'))
   if(name==='billing_reserve_owner_checkout') return {data:ownLock,error:null}
   return {data:name==='billing_begin_intent'?{session_id:null}:null,error:bindFails&&name==='billing_bind_intent'?{}:null}
  }}) as unknown as ReturnType<typeof dependencies.serviceDatabase>,
  stripeClient:()=>({checkout:{sessions:{create:async(params:Stripe.Checkout.SessionCreateParams,options:Stripe.RequestOptions)=>{calls.push('stripe');assert.equal(params.line_items?.[0].price,'price_fixture');assert.equal(params.mode,'payment');assert.equal(options.idempotencyKey,`pass:${owner}:${id}`);return {id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/fixture',livemode:false}}}}}) as unknown as Stripe,
 }
 return {deps,calls}
}
test('checkout accepts no browser owner, price, amount or redirect overrides',async()=>{
 for(const extra of [{owner:'attacker'},{price:'price_cheaper'},{amount:1},{returnUrl:'https://evil.test'}]){
  const {deps,calls}=fixture();assert.equal((await checkout(req({requestId:id,...extra}),env,deps)).status,400);assert.deepEqual(calls,[])
 }
})
test('durable intent and binding bracket Stripe call before redirect is returned',async()=>{
 const {deps,calls}=fixture();const result=await checkout(req({requestId:id}),env,deps)
 assert.equal(result.status,200);assert.deepEqual(calls,['billing_reserve_owner_checkout','billing_lookup_owner_subscription','billing_begin_intent','billing_throttle_checkout_attempt','stripe','billing_bind_intent','billing_bind_owner_checkout'])
 assert.equal((await result.json()).url,'https://checkout.stripe.com/c/pay/fixture')
})
test('failed durable binding does not return a payable URL',async()=>{
 const {deps}=fixture(true);const result=await checkout(req({requestId:id}),env,deps)
 assert.equal(result.status,503);assert.ok(!(await result.text()).includes('checkout.stripe.com'))
})
// billing_lookup_owner_subscription returns `public.billing_subscriptions` from a scalar
// `select ... limit 1`; a fresh owner with no subscription gets Postgres's SQL NULL of that
// composite type, which PostgREST wires as an object with every column null, never a bare
// JSON null (confirmed against a real PostgREST endpoint in a live Stripe-sandbox run). A
// naive `if (data)` truthiness check is always true for that shape too, so it must never
// falsely 409 a fresh owner as "already subscribed".
function withSubscriptionLookup(data:unknown){
 const {deps,calls}=fixture();const original=deps.serviceDatabase
 deps.serviceDatabase=()=>{
  const db=original()
  return {rpc:async(name:string,args:Record<string,unknown>)=>{
   if(name==='billing_lookup_owner_subscription'){calls.push(name);return {data,error:null}}
   return db.rpc(name,args)
  }} as unknown as ReturnType<typeof dependencies.serviceDatabase>
 }
 return {deps,calls}
}
const REAL_ABSENT_SUBSCRIPTION_ROW={subscription_id:null,owner_id:null,price_id:null,live:null,status:null,cancel_at_period_end:null,current_period_end:null,created_at:null,updated_at:null}
test('a fresh owner with no subscription (the real all-null-column RPC shape) is never blocked as already-subscribed',async()=>{
 const {deps}=withSubscriptionLookup(REAL_ABSENT_SUBSCRIPTION_ROW)
 const result=await checkout(req({requestId:id}),env,deps)
 assert.equal(result.status,200)
})
test('a real in-force subscription row (not a bare null) still blocks a manual pass purchase',async()=>{
 const {deps,calls}=withSubscriptionLookup({subscription_id:'sub_fixture',owner_id:owner,price_id:'price_recurring',live:false,status:'active',cancel_at_period_end:false,current_period_end:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()})
 const result=await checkout(req({requestId:id}),env,deps)
 assert.equal(result.status,409)
 assert.deepEqual(calls,['billing_reserve_owner_checkout','billing_lookup_owner_subscription'])
})
test('a subscription row belonging to a different owner (defense in depth) fails closed rather than trusting it',async()=>{
 const {deps}=withSubscriptionLookup({subscription_id:'sub_fixture',owner_id:'attacker',price_id:'price_recurring',live:false,status:'active',cancel_at_period_end:false,current_period_end:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()})
 const result=await checkout(req({requestId:id}),env,deps)
 assert.equal(result.status,503)
})
test('a malformed subscription row (partial nulls, neither the absent nor the present shape) fails closed instead of silently allowing or blocking checkout',async()=>{
 for(const malformed of [
  {subscription_id:'sub_fixture',owner_id:null,price_id:null,live:null,status:null,cancel_at_period_end:null,current_period_end:null,created_at:null,updated_at:null},
  {subscription_id:null,owner_id:owner,price_id:null,live:null,status:null,cancel_at_period_end:null,current_period_end:null,created_at:null,updated_at:null},
  {subscription_id:'sub_fixture',owner_id:owner,price_id:'price_recurring',live:false,status:'not_a_real_status',cancel_at_period_end:false,current_period_end:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},
 ]) {
  const {deps}=withSubscriptionLookup(malformed)
  const result=await checkout(req({requestId:id}),env,deps)
  assert.equal(result.status,503,JSON.stringify(malformed))
 }
})
test('reusing an already-bound checkout skips catalog re-validation; a new one still validates',async()=>{
 function depsWith(sessionId:string|null){
  let validateCalls=0
  const deps={...dependencies,authenticate:async()=>owner,validateCatalog:async()=>{validateCalls++},
   serviceDatabase:()=>({rpc:async(name:string)=>{
    if(name==='billing_reserve_owner_checkout') return {data:{...ownLock,session_id:sessionId},error:null}
    return {data:name==='billing_begin_intent'?{session_id:sessionId}:null,error:null}
   }}) as unknown as ReturnType<typeof dependencies.serviceDatabase>,
   stripeClient:()=>({checkout:{sessions:{
    retrieve:async()=>({id:'cs_bound',url:'https://checkout.stripe.com/c/pay/bound',livemode:false}),
    create:async()=>({id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/fixture',livemode:false}),
   }}}) as unknown as Stripe,
  }
  return {deps,validateCalls:()=>validateCalls}
 }
 const bound=depsWith('cs_bound')
 const boundResult=await checkout(req({requestId:id}),env,bound.deps)
 assert.equal(boundResult.status,200)
 assert.equal((await boundResult.json()).url,'https://checkout.stripe.com/c/pay/bound')
 // A single authenticated account could otherwise replay a bound requestId to force
 // unbounded Stripe API calls, bypassing billing_begin_intent's per-hour creation limit.
 assert.equal(bound.validateCalls(),0,'reusing a bound session must not re-run catalog validation')

 const fresh=depsWith(null)
 const freshResult=await checkout(req({requestId:id}),env,fresh.deps)
 assert.equal(freshResult.status,200)
 assert.equal((await freshResult.json()).url,'https://checkout.stripe.com/c/pay/fixture')
 assert.equal(fresh.validateCalls(),1,'creating a new session still validates the catalog before calling Stripe')
})
test('checkout-attempt throttle runs before any Stripe call, for bound, unbound and new intents alike',async()=>{
 for(const sessionId of [null,'cs_bound']){
  const stripeCalls: string[]=[]
  const deps={...dependencies,authenticate:async()=>owner,validateCatalog:async()=>{},
   serviceDatabase:()=>({rpc:async(name:string)=>{
    if(name==='billing_reserve_owner_checkout') return {data:{...ownLock,session_id:sessionId},error:null}
    return {
     data:name==='billing_begin_intent'?{session_id:sessionId}:null,
     error:name==='billing_throttle_checkout_attempt'?{code:'54000',message:'Checkout attempt limit reached'}:null,
    }
   }}) as unknown as ReturnType<typeof dependencies.serviceDatabase>,
   stripeClient:()=>({checkout:{sessions:{
    retrieve:async()=>{stripeCalls.push('retrieve');return {id:'cs_bound',url:'https://checkout.stripe.com/c/pay/bound',livemode:false}},
    create:async()=>{stripeCalls.push('create');return {id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/fixture',livemode:false}},
   }}}) as unknown as Stripe,
  }
  const result=await checkout(req({requestId:id}),env,deps)
  assert.equal(result.status,429,`sessionId=${sessionId}`)
  assert.deepEqual(stripeCalls,[],`sessionId=${sessionId}: throttled attempt must reach no Stripe call`)
  assert.ok(!(await result.text()).toLowerCase().includes('stripe'),'rejection message stays generic and safe to show the user')
 }
})
test('a concurrent, still-open subscription checkout for the same owner blocks a manual checkout before any business-rule check runs',async()=>{
 const stuckSubscriptionLock={owner_id:owner,kind:'subscription',request_id:'55555555-5555-5555-5555-555555555555',session_id:'cs_already_open',price_id:'price_recurring',live:false,created_at:new Date().toISOString()}
 const calls: string[]=[]
 const deps={...dependencies,authenticate:async()=>owner,validateCatalog:async()=>{},
  serviceDatabase:()=>({rpc:async(name:string)=>{
   calls.push(name)
   if(name==='billing_reserve_owner_checkout') return {data:stuckSubscriptionLock,error:null}
   throw new Error(`must not reach ${name}: the reservation must block before any other check`)
  }}) as unknown as ReturnType<typeof dependencies.serviceDatabase>,
  stripeClient:()=>({checkout:{sessions:{}}}) as unknown as Stripe,
 }
 const result=await checkout(req({requestId:id}),env,deps)
 assert.equal(result.status,409)
 assert.deepEqual(calls,['billing_reserve_owner_checkout'])
})

test('invalid webhook signature never queries provider or database',async()=>{
 let calls=0
 const stripe=stripeClient(billingConfig(env))
 const deps={...dependencies,stripeClient:()=>stripe,serviceDatabase:()=>{calls++;throw new Error('must not run')}}
 const result=await webhook(new Request(env.APP_ORIGIN+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':'forged'},body:'{}'}),env,deps)
 assert.equal(result.status,400);assert.equal(calls,0)
})

function signedPaymentFixture(change:Record<string,unknown>={}, options:{missingOwner?:boolean;persistFails?:boolean}={}) {
 const stripe=stripeClient(billingConfig(env))
 const calls:{name:string;args:Record<string,unknown>}[]=[]
 const session={id:'cs_fixture',livemode:false,mode:'payment',payment_status:'paid',currency:'usd',amount_total:1999,
  metadata:{owner_id:'attacker'},line_items:{has_more:false,data:[{price:{id:'price_fixture'},quantity:1}]},
  payment_intent:{id:'pi_fixture',status:'succeeded',amount_received:1999,currency:'usd'},...change}
 stripe.checkout.sessions.retrieve=(async()=>session) as unknown as typeof stripe.checkout.sessions.retrieve
 const deps={...dependencies,stripeClient:()=>stripe,serviceDatabase:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
  calls.push({name,args})
  return {data:name==='billing_lookup_checkout'&&!options.missingOwner?{owner_id:owner}:null,error:options.persistFails&&name==='billing_apply_verified_payment'?{}:null}
 }}) as unknown as ReturnType<typeof dependencies.serviceDatabase>}
 const payload=JSON.stringify({id:'evt_fixture',type:'checkout.session.completed',livemode:false,created:1700000000,data:{object:{id:'cs_fixture',metadata:{owner_id:'attacker'}}}})
 const request=()=>new Request(env.APP_ORIGIN+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':stripe.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_WEBHOOK_SECRET})},body:payload})
 return {deps,calls,request}
}

test('signed payment uses provider facts and trusted owner, never event or session metadata',async()=>{
 const {deps,calls,request}=signedPaymentFixture()
 assert.equal((await webhook(request(),env,deps)).status,200)
 assert.deepEqual(calls,[
  {name:'billing_lookup_checkout',args:{p_session:'cs_fixture'}},
  {name:'billing_apply_verified_payment',args:{p_owner_id:owner,p_session_id:'cs_fixture',p_event_id:'evt_fixture',p_payment_id:'pi_fixture',p_price_id:'price_fixture',p_live:false,p_amount_total:1999,p_currency:'usd',p_verified_at:'2023-11-14T22:13:20.000Z'}},
  {name:'billing_release_owner_checkout',args:{p_owner:owner,p_kind:'manual',p_session:'cs_fixture',p_request_id:null}},
 ])
})

test('signed but unreconciled payment never grants access',async()=>{
 for(const change of [
  {payment_status:'unpaid'}, {amount_total:1}, {currency:'eur'}, {livemode:true}, {mode:'subscription'},
  {line_items:{has_more:true,data:[]}},
  {line_items:{has_more:false,data:[{price:{id:'price_other'},quantity:1}]}},
  {line_items:{has_more:false,data:[{price:{id:'price_fixture'},quantity:2}]}},
  {payment_intent:'pi_unexpanded'},
  {payment_intent:{id:'pi_fixture',status:'processing',amount_received:1999,currency:'usd'}},
  {payment_intent:{id:'pi_fixture',status:'succeeded',amount_received:1,currency:'usd'}},
 ]) {
  const {deps,calls,request}=signedPaymentFixture(change)
  const result=await webhook(request(),env,deps)
  assert.equal(result.status,change.payment_status==='unpaid'?200:503,JSON.stringify(change))
  assert.ok(!calls.some(call=>call.name==='billing_apply_verified_payment'))
 }
 const missing=signedPaymentFixture({}, {missingOwner:true})
 assert.equal((await webhook(missing.request(),env,missing.deps)).status,503)
 assert.ok(!missing.calls.some(call=>call.name==='billing_apply_verified_payment'))
})

test('persistence failure requests webhook retry without acknowledging successful processing',async()=>{
 const {deps,calls,request}=signedPaymentFixture({}, {persistFails:true})
 const response=await webhook(request(),env,deps)
 assert.equal(response.status,503)
 assert.ok(calls.some(call=>call.name==='billing_apply_verified_payment'))
 assert.equal(response.headers.get('cache-control'),'no-store')
 assert.ok(!(await response.text()).includes('pi_fixture'))
})

 test('checkout throttle outage fails closed with service error, not a false rate-limit claim',async()=>{
 const {deps,calls}=fixture()
 const original=deps.serviceDatabase
 deps.serviceDatabase=()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
  if(name==='billing_throttle_checkout_attempt')return {data:null,error:{code:'XX000',message:'internal database details'}}
  return original().rpc(name,args)
 }}) as unknown as ReturnType<typeof dependencies.serviceDatabase>
 const response=await checkout(req({requestId:id}),env,deps)
 assert.equal(response.status,503)
 assert.ok(!calls.includes('stripe'))
 assert.ok(!(await response.text()).includes('internal database details'))
})

function expiredSessionFixture(mode:'payment'|'subscription',statusOverride:string|undefined=undefined) {
 const stripe=stripeClient(billingConfig(env))
 const calls:{name:string;args:Record<string,unknown>}[]=[]
 const session={id:'cs_expired',mode,status:statusOverride??'expired'}
 stripe.checkout.sessions.retrieve=(async()=>session) as unknown as typeof stripe.checkout.sessions.retrieve
 const deps={...dependencies,stripeClient:()=>stripe,serviceDatabase:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
  calls.push({name,args})
  if(name==='billing_lookup_checkout') return {data:{owner_id:owner},error:null}
  if(name==='billing_lookup_subscription_checkout') return {data:{owner_id:owner},error:null}
  return {data:null,error:null}
 }}) as unknown as ReturnType<typeof dependencies.serviceDatabase>}
 const payload=JSON.stringify({id:'evt_expired',type:'checkout.session.expired',livemode:false,created:1700000000,data:{object:{id:'cs_expired'}}})
 const request=()=>new Request(env.APP_ORIGIN+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':stripe.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_WEBHOOK_SECRET})},body:payload})
 return {deps,calls,request}
}

test('checkout.session.expired releases the manual reservation by its own re-retrieved provider status, never the event payload alone',async()=>{
 const {deps,calls,request}=expiredSessionFixture('payment')
 assert.equal((await webhook(request(),env,deps)).status,200)
 assert.deepEqual(calls,[
  {name:'billing_lookup_checkout',args:{p_session:'cs_expired'}},
  {name:'billing_release_owner_checkout',args:{p_owner:owner,p_kind:'manual',p_session:'cs_expired',p_request_id:null}},
 ])
})

test('checkout.session.expired releases the subscription reservation for a subscription-mode session',async()=>{
 const {deps,calls,request}=expiredSessionFixture('subscription')
 assert.equal((await webhook(request(),env,deps)).status,200)
 assert.deepEqual(calls,[
  {name:'billing_lookup_subscription_checkout',args:{p_session:'cs_expired'}},
  {name:'billing_release_owner_checkout',args:{p_owner:owner,p_kind:'subscription',p_session:'cs_expired',p_request_id:null}},
 ])
})

test('a session re-retrieved as still open never releases anything, regardless of the expired event type',async()=>{
 const {deps,calls,request}=expiredSessionFixture('payment','open')
 assert.equal((await webhook(request(),env,deps)).status,200)
 assert.deepEqual(calls,[])
})

test('an expired session with no trusted checkout record on file releases nothing',async()=>{
 const {deps,calls,request}=expiredSessionFixture('payment')
 deps.serviceDatabase=()=>({rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:null,error:null}}}) as unknown as ReturnType<typeof dependencies.serviceDatabase>
 assert.equal((await webhook(request(),env,deps)).status,200)
 assert.deepEqual(calls,[{name:'billing_lookup_checkout',args:{p_session:'cs_expired'}}])
})


test('expiry lookup outage requests retry instead of acknowledging a stranded reservation',async()=>{
 for(const mode of ['payment','subscription'] as const){
  const {deps,request}=expiredSessionFixture(mode)
  let lookups=0
  deps.serviceDatabase=(()=>({rpc:async()=>{lookups++;return {data:null,error:{message:'unavailable'}}}})) as unknown as typeof deps.serviceDatabase
  assert.equal((await webhook(request(),env,deps)).status,503)
  assert.equal(lookups,1)
 }
})
