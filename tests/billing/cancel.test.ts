import test from 'node:test'
import assert from 'node:assert/strict'
import { cancelSubscription, cancellationDependencies } from '../../server/billing/cancel.ts'
const env = { BILLING_ENABLED:'true', STRIPE_MODE:'test', STRIPE_SECRET_KEY:'sk_test_fixture', STRIPE_WEBHOOK_SECRET:'whsec_fixture', STRIPE_ACCOUNT_ID:'acct_fixture', STRIPE_PASS_PRICE_ID:'price_fixture', APP_ORIGIN:'https://resumestride.com', SUPABASE_URL:'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY:'public', SUPABASE_SERVICE_ROLE_KEY:'fixture' }
function fixture(owner='owner', stopped=false, persistenceError=false) {
 const calls: string[]=[]
 const subscription={ id:'sub_fixture', livemode:false, status:'active', cancel_at_period_end:stopped }
 const deps={ authenticate:async()=> 'owner', serviceDatabase:()=>({rpc:async(name:string)=>{
  calls.push(name)
  return {data:name==='billing_lookup_subscription'?{owner_id:owner,live:false}:null,error:persistenceError&&name==='billing_update_subscription_status'?{}:null}
 }}), stripeClient:()=>({subscriptions:{retrieve:async()=>{calls.push('retrieve');return subscription},update:async(_id:string,body:unknown)=>{calls.push('update');assert.deepEqual(body,{cancel_at_period_end:true});return {...subscription,cancel_at_period_end:true}}}})} as unknown as typeof cancellationDependencies
 return {deps,calls}
}
function request(origin=env.APP_ORIGIN) {return new Request(env.APP_ORIGIN+'/api/cancel-subscription',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({subscriptionId:'sub_fixture'})})}
test('cancellation checks owner before contacting Stripe',async()=>{const {deps,calls}=fixture('other');assert.equal((await cancelSubscription(request(),env,deps)).status,404);assert.deepEqual(calls,['billing_lookup_subscription'])})
test('cancel at period end works with recurring sales off and never changes paid entitlement',async()=>{const {deps,calls}=fixture();assert.equal((await cancelSubscription(request(),env,deps)).status,200);assert.deepEqual(calls,['billing_lookup_subscription','billing_throttle_checkout_attempt','retrieve','update','billing_update_subscription_status'])})
test('retry after provider success avoids a second mutation',async()=>{const {deps,calls}=fixture('owner',true);assert.equal((await cancelSubscription(request(),env,deps)).status,200);assert.ok(!calls.includes('update'))})
test('database failure is retryable rather than falsely reporting completion',async()=>{const {deps}=fixture('owner',false,true);assert.equal((await cancelSubscription(request(),env,deps)).status,503)})
test('cross-origin cancellation is rejected before lookup',async()=>{const {deps,calls}=fixture();assert.equal((await cancelSubscription(request('https://attacker.example'),env,deps)).status,403);assert.deepEqual(calls,[])})


test('stopping all new sales does not prevent an existing owner cancelling renewal',async()=>{
 const {deps,calls}=fixture()
 const response=await cancelSubscription(request(),{...env,BILLING_ENABLED:'false',BILLING_RECURRING_ENABLED:'false'},deps)
 assert.equal(response.status,200)
 assert.ok(calls.includes('update'))
})
test('sales-off cancellation still rejects another owner',async()=>{
 const {deps,calls}=fixture('other')
 assert.equal((await cancelSubscription(request(),{...env,BILLING_ENABLED:'false'},deps)).status,404)
 assert.deepEqual(calls,['billing_lookup_subscription'])
})
