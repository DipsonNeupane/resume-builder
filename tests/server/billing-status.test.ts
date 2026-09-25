import test from 'node:test'
import assert from 'node:assert/strict'
import { billingStatus, dependencies } from '../../server/billing/handlers.ts'
const env={BILLING_ENABLED:'true',BILLING_RECURRING_ENABLED:'true',STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_PASS_PRICE_ID:'price_fixture',STRIPE_RECURRING_PRICE_ID:'price_recurring',APP_ORIGIN:'https://resumestride.com',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'fixture'}
const owner='22222222-2222-2222-2222-222222222222'
const req=()=>new Request(env.APP_ORIGIN+'/api/billing-status',{headers:{authorization:'Bearer fixture'}})
function fixture(subscriptionRow:unknown){
 const deps={...dependencies,authenticate:async()=>owner,
  serviceDatabase:()=>({rpc:async(name:string)=>{
   if(name==='billing_get_entitlement') return {data:[{paid_through:null,is_pro:false}],error:null}
   if(name==='billing_lookup_owner_subscription') return {data:subscriptionRow,error:null}
   return {data:null,error:null}
  }}) as unknown as ReturnType<typeof dependencies.serviceDatabase>,
 }
 return deps
}
// billing_lookup_owner_subscription is declared `returns public.billing_subscriptions`
// with a scalar `select ... limit 1` body: a fresh owner with no subscription gets
// Postgres's SQL NULL of that composite type, which PostgREST wires as an object with
// every column null, never a bare JSON null — confirmed against a real PostgREST endpoint
// in a live Stripe-sandbox run. The frontend's own isSubscriptionState validation
// (src/features/billing/BillingPanel.tsx) already rejects that malformed-looking object,
// which is why this bug broke the purchase UI for every fresh signup, not just the 409
// checkout report.
test('a fresh owner with no subscription (the real all-null-column RPC shape) reports subscription: null, not a stub object',async()=>{
 const deps=fixture({subscription_id:null,owner_id:null,price_id:null,live:null,status:null,cancel_at_period_end:null,current_period_end:null,created_at:null,updated_at:null})
 const result=await billingStatus(req(),env,deps)
 assert.equal(result.status,200)
 assert.equal((await result.json()).subscription,null)
})
test('a bare null (defensive) is also reported as subscription: null',async()=>{
 const deps=fixture(null)
 const result=await billingStatus(req(),env,deps)
 assert.equal(result.status,200)
 assert.equal((await result.json()).subscription,null)
})
test('a real in-force subscription row is surfaced with its own fields',async()=>{
 const deps=fixture({subscription_id:'sub_fixture',owner_id:owner,price_id:'price_recurring',live:false,status:'active',cancel_at_period_end:false,current_period_end:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()})
 const result=await billingStatus(req(),env,deps)
 assert.equal(result.status,200)
 assert.deepEqual((await result.json()).subscription,{subscriptionId:'sub_fixture',status:'active',cancelAtPeriodEnd:false})
})
test('a subscription row belonging to a different owner (defense in depth) fails closed rather than being surfaced',async()=>{
 const deps=fixture({subscription_id:'sub_fixture',owner_id:'attacker',price_id:'price_recurring',live:false,status:'active',cancel_at_period_end:false,current_period_end:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()})
 const result=await billingStatus(req(),env,deps)
 assert.equal(result.status,503)
})
test('a malformed subscription row (partial nulls) fails closed instead of guessing',async()=>{
 for(const malformed of [
  {subscription_id:'sub_fixture',owner_id:null,price_id:null,live:null,status:null,cancel_at_period_end:null,current_period_end:null,created_at:null,updated_at:null},
  {subscription_id:'sub_fixture',owner_id:owner,price_id:'price_recurring',live:false,status:'not_a_real_status',cancel_at_period_end:false,current_period_end:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},
 ]) {
  const deps=fixture(malformed)
  const result=await billingStatus(req(),env,deps)
  assert.equal(result.status,503,JSON.stringify(malformed))
 }
})
test('non-GET is rejected',async()=>{
 const deps=fixture(null)
 const result=await billingStatus(new Request(env.APP_ORIGIN+'/api/billing-status',{method:'POST'}),env,deps)
 assert.equal(result.status,405)
})
