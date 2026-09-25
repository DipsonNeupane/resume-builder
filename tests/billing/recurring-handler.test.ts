import test from 'node:test'
import assert from 'node:assert/strict'
import { webhook, subscribeCheckout, dependencies } from '../../server/billing/handlers.ts'
import { stripeClient, billingConfig } from '../../server/billing/stripe.ts'
const env={BILLING_ENABLED:'true',BILLING_RECURRING_ENABLED:'true',STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_PASS_PRICE_ID:'price_manual',STRIPE_RECURRING_PRICE_ID:'price_recurring',APP_ORIGIN:'https://resumestride.com',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'fixture'}
function fixture(extraLines=false) {
 const stripe=stripeClient(billingConfig(env));const calls: {name:string,args:Record<string,unknown>}[]=[]
 const line={quantity:1,pricing:{price_details:{price:'price_recurring'}},period:{start:1700000000,end:1702592000}}
 const payment={status:'paid',payment:{type:'payment_intent',payment_intent:'pi_fixture'}}
 stripe.invoices.retrieve=(async()=>({id:'in_fixture',parent:{subscription_details:{subscription:'sub_fixture'}},status:'paid',livemode:false,currency:'usd',amount_paid:1999,period_start:1699990000,period_end:1700000000,lines:{has_more:false,data:extraLines?[line,line]:[line]},payments:{has_more:false,data:[payment]}})) as unknown as typeof stripe.invoices.retrieve
 const deps={...dependencies,authenticate:async()=> 'owner',stripeClient:()=>stripe,serviceDatabase:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:name==='billing_lookup_subscription'?{owner_id:'owner',price_id:'price_recurring',live:false}:null,error:null}}}) as unknown as ReturnType<typeof dependencies.serviceDatabase>}
 const payload=JSON.stringify({id:'evt_fixture',created:1700000000,livemode:false,type:'invoice.paid',data:{object:{id:'in_fixture'}}})
 const request=()=>new Request(env.APP_ORIGIN+'/api/stripe-webhook',{method:'POST',body:payload,headers:{'stripe-signature':stripe.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_WEBHOOK_SECRET})}})
 return {deps,calls,request}
}
test('paid invoice grants the purchased line coverage, not invoice accounting period',async()=>{const {deps,calls,request}=fixture();assert.equal((await webhook(request(),env,deps)).status,200);const grant=calls.find(c=>c.name==='billing_apply_mapped_subscription_invoice');assert.equal(grant?.args.p_period_start,new Date(1700000000000).toISOString());assert.equal(grant?.args.p_period_end,new Date(1702592000000).toISOString())})
test('multiple invoice lines cannot sneak through first-line validation',async()=>{const {deps,calls,request}=fixture(true);assert.equal((await webhook(request(),env,deps)).status,503);assert.ok(!calls.some(c=>c.name==='billing_apply_mapped_subscription_invoice'))})

test('a paid invoice binds its settled payment_intent to the invoice for later reversal routing',async()=>{
 const {deps,calls,request}=fixture()
 assert.equal((await webhook(request(),env,deps)).status,200)
 const bind=calls.find(c=>c.name==='billing_apply_mapped_subscription_invoice')
 assert.equal(bind?.args.p_invoice_id,'in_fixture')
 assert.equal(bind?.args.p_payment_intent_id,'pi_fixture')
 assert.equal(calls.filter(c=>c.name.includes('apply_mapped')).length,1)
})

test('multiple or paginated invoice payments cannot sneak through single-payment validation',async()=>{
 const {deps,calls,request}=fixture()
 const stripe=deps.stripeClient()
 const payment={status:'paid',payment:{type:'payment_intent',payment_intent:'pi_fixture'}}
 stripe.invoices.retrieve=(async()=>({id:'in_fixture',parent:{subscription_details:{subscription:'sub_fixture'}},status:'paid',livemode:false,currency:'usd',amount_paid:1999,lines:{has_more:false,data:[{quantity:1,pricing:{price_details:{price:'price_recurring'}},period:{start:1700000000,end:1702592000}}]},payments:{has_more:true,data:[payment]}})) as unknown as typeof stripe.invoices.retrieve
 assert.equal((await webhook(request(),env,{...deps,stripeClient:()=>stripe})).status,503)
 assert.ok(!calls.some(c=>c.name==='billing_apply_mapped_subscription_invoice'))
})

test('an invoice payment that is not a paid payment_intent cannot sneak through mapping validation',async()=>{
 for(const payment of [{status:'open',payment:{type:'payment_intent',payment_intent:'pi_fixture'}},{status:'paid',payment:{type:'charge',charge:'ch_fixture'}},{status:'paid',payment:{type:'payment_intent',payment_intent:undefined}}]) {
  const {deps,calls,request}=fixture()
  const stripe=deps.stripeClient()
  stripe.invoices.retrieve=(async()=>({id:'in_fixture',parent:{subscription_details:{subscription:'sub_fixture'}},status:'paid',livemode:false,currency:'usd',amount_paid:1999,lines:{has_more:false,data:[{quantity:1,pricing:{price_details:{price:'price_recurring'}},period:{start:1700000000,end:1702592000}}]},payments:{has_more:false,data:[payment]}})) as unknown as typeof stripe.invoices.retrieve
  assert.equal((await webhook(request(),env,{...deps,stripeClient:()=>stripe})).status,503)
  assert.ok(!calls.some(c=>c.name==='billing_apply_mapped_subscription_invoice'))
 }
})
test('subscription checkout requires explicit renewal opt-in before database or Stripe',async()=>{for(const renewalOptIn of [undefined,false,'true']){const {deps,calls}=fixture();const request=new Request(env.APP_ORIGIN+'/api/subscribe',{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify({requestId:'11111111-1111-4111-8111-111111111111',renewalOptIn})});assert.equal((await subscribeCheckout(request,env,deps)).status,400);assert.deepEqual(calls,[])}})

test('subscription binding requires exactly one verified item and environment',async()=>{
 for(const variation of ['valid','quantity','extra','pagination','identity','environment']){
  const stripe=stripeClient(billingConfig(env));const writes:string[]=[]
  const item={quantity:variation==='quantity'?2:1,price:{id:'price_recurring'}}
  stripe.checkout.sessions.retrieve=(async()=>({id:'cs_fixture',mode:'subscription',status:'complete',livemode:false,subscription:'sub_fixture'})) as unknown as typeof stripe.checkout.sessions.retrieve
  stripe.subscriptions.retrieve=(async()=>({id:variation==='identity'?'sub_other':'sub_fixture',livemode:variation==='environment',status:'active',items:{has_more:variation==='pagination',data:variation==='extra'?[item,item]:[item]}})) as unknown as typeof stripe.subscriptions.retrieve
  const deps={...dependencies,stripeClient:()=>stripe,serviceDatabase:()=>({rpc:async(name:string)=>{writes.push(name);return {data:name==='billing_lookup_subscription_checkout'?{owner_id:'owner',price_id:'price_recurring',live:false}:null,error:null}}}) as unknown as ReturnType<typeof dependencies.serviceDatabase>}
  const payload=JSON.stringify({id:'evt_binding',created:1700000000,livemode:false,type:'checkout.session.completed',data:{object:{id:'cs_fixture'}}})
  const req=new Request(env.APP_ORIGIN+'/api/stripe-webhook',{method:'POST',body:payload,headers:{'stripe-signature':stripe.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_WEBHOOK_SECRET})}})
  assert.equal((await webhook(req,env,deps)).status,variation==='valid'?200:503,variation)
  assert.equal(writes.includes('billing_record_subscription'),variation==='valid',variation)
 }
})

test('subscription preflight reads the real table-returning RPC shape and fails closed on malformed data',async()=>{
 const requestId='11111111-1111-4111-8111-111111111111'
 const ownLock={owner_id:'owner',kind:'subscription',request_id:requestId,session_id:null,price_id:'price_recurring',live:false,created_at:new Date().toISOString()}
 for(const data of [[{is_pro:true}],null,[],{is_pro:false},[{is_pro:'false'}]]){
  const {deps}=fixture();const calls:string[]=[]
  deps.serviceDatabase=(()=>({rpc:async(name:string)=>{
   calls.push(name)
   if(name==='billing_reserve_owner_checkout') return {data:ownLock,error:null}
   return {data:name==='billing_get_entitlement'?data:null,error:null}
  }})) as unknown as typeof deps.serviceDatabase
  const req=new Request(env.APP_ORIGIN+'/api/subscribe',{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify({requestId,renewalOptIn:true})})
  assert.equal((await subscribeCheckout(req,env,deps)).status,Array.isArray(data)&&data[0]?.is_pro===true?409:503)
  assert.deepEqual(calls,['billing_reserve_owner_checkout','billing_lookup_owner_subscription','billing_get_entitlement'])
 }
})

// billing_lookup_owner_subscription's own composite-return quirk: a fresh owner with no
// subscription gets Postgres's SQL NULL of `public.billing_subscriptions`, which PostgREST
// wires as an object with every column null, never a bare JSON null (the real shape a
// parent-reported live Stripe-sandbox run observed). Mirrors the checkout() coverage in
// tests/server/checkout.test.ts for the OPTIONAL recurring subscribe path.
test('subscribeCheckout: a fresh owner (the real all-null-column RPC shape) is never blocked as already-subscribed',async()=>{
 const requestId='11111111-1111-4111-8111-111111111111'
 const ownLock={owner_id:'owner',kind:'subscription',request_id:requestId,session_id:null,price_id:'price_recurring',live:false,created_at:new Date().toISOString()}
 const {deps}=fixture();const calls:string[]=[]
 deps.serviceDatabase=(()=>({rpc:async(name:string)=>{
  calls.push(name)
  if(name==='billing_reserve_owner_checkout') return {data:ownLock,error:null}
  if(name==='billing_lookup_owner_subscription') return {data:{subscription_id:null,owner_id:null,price_id:null,live:null,status:null,cancel_at_period_end:null,current_period_end:null,created_at:null,updated_at:null},error:null}
  if(name==='billing_get_entitlement') return {data:[{is_pro:false}],error:null}
  return {data:null,error:null}
 }})) as unknown as typeof deps.serviceDatabase
 const req=new Request(env.APP_ORIGIN+'/api/subscribe',{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify({requestId,renewalOptIn:true})})
 const result=await subscribeCheckout(req,env,deps)
 // Proves the mixed-mode subscription gate let this request through to the entitlement
 // check instead of 409-ing it as "already subscribed" — the bug this regresses would
 // have thrown before ever reaching billing_get_entitlement.
 assert.ok(calls.includes('billing_get_entitlement'))
 assert.ok(!(await result.text()).includes('already have an active subscription'))
})
test('subscribeCheckout: a real in-force subscription row (not a bare null) still blocks a second subscription',async()=>{
 const requestId='11111111-1111-4111-8111-111111111111'
 const ownLock={owner_id:'owner',kind:'subscription',request_id:requestId,session_id:null,price_id:'price_recurring',live:false,created_at:new Date().toISOString()}
 const {deps}=fixture();const calls:string[]=[]
 deps.serviceDatabase=(()=>({rpc:async(name:string)=>{
  calls.push(name)
  if(name==='billing_reserve_owner_checkout') return {data:ownLock,error:null}
  if(name==='billing_lookup_owner_subscription') return {data:{subscription_id:'sub_fixture',owner_id:'owner',price_id:'price_recurring',live:false,status:'active',cancel_at_period_end:false,current_period_end:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},error:null}
  return {data:null,error:null}
 }})) as unknown as typeof deps.serviceDatabase
 const req=new Request(env.APP_ORIGIN+'/api/subscribe',{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify({requestId,renewalOptIn:true})})
 assert.equal((await subscribeCheckout(req,env,deps)).status,409)
 assert.deepEqual(calls,['billing_reserve_owner_checkout','billing_lookup_owner_subscription'])
})
test('subscribeCheckout: a malformed subscription row fails closed instead of silently allowing or blocking',async()=>{
 const requestId='11111111-1111-4111-8111-111111111111'
 const ownLock={owner_id:'owner',kind:'subscription',request_id:requestId,session_id:null,price_id:'price_recurring',live:false,created_at:new Date().toISOString()}
 for(const malformed of [
  {subscription_id:'sub_fixture',owner_id:null,price_id:null,live:null,status:null,cancel_at_period_end:null,current_period_end:null,created_at:null,updated_at:null},
  {subscription_id:'sub_fixture',owner_id:'attacker',price_id:'price_recurring',live:false,status:'active',cancel_at_period_end:false,current_period_end:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},
 ]) {
  const {deps}=fixture()
  deps.serviceDatabase=(()=>({rpc:async(name:string)=>{
   if(name==='billing_reserve_owner_checkout') return {data:ownLock,error:null}
   if(name==='billing_lookup_owner_subscription') return {data:malformed,error:null}
   return {data:null,error:null}
  }})) as unknown as typeof deps.serviceDatabase
  const req=new Request(env.APP_ORIGIN+'/api/subscribe',{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify({requestId,renewalOptIn:true})})
  assert.equal((await subscribeCheckout(req,env,deps)).status,503,JSON.stringify(malformed))
 }
})
