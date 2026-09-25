import test from 'node:test'
import assert from 'node:assert/strict'
import { billingConfig, stripeClient, verifyEvent } from '../../server/billing/stripe.ts'
const env={BILLING_ENABLED:'true',STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_PASS_PRICE_ID:'price_fixture',APP_ORIGIN:'https://resumestride.com'}
test('billing fails closed when gated, incomplete or key mode mismatches',()=>{
  assert.throws(()=>billingConfig({}))
  for (const change of [{BILLING_ENABLED:'false'},{STRIPE_MODE:'live'},{STRIPE_WEBHOOK_SECRET:''},{APP_ORIGIN:'https://resumestride.com/path'},{APP_ORIGIN:'http://resumestride.com'}]) assert.throws(()=>billingConfig({...env,...change}))
  assert.equal(billingConfig(env).live,false)
})
test('webhook requires fresh genuine signature and correct account environment',()=>{
  const config=billingConfig(env), stripe=stripeClient(config)
  const payload=JSON.stringify({id:'evt_fixture',type:'checkout.session.completed',livemode:false,data:{object:{}}})
  const signature=stripe.webhooks.generateTestHeaderString({payload,secret:config.webhookSecret})
  assert.equal(verifyEvent(stripe,config,payload,signature).id,'evt_fixture')
  assert.throws(()=>verifyEvent(stripe,config,payload+' ',signature))
  assert.throws(()=>verifyEvent(stripe,config,payload,null))
  const expired=stripe.webhooks.generateTestHeaderString({payload,secret:config.webhookSecret,timestamp:Math.floor(Date.now()/1000)-600})
  assert.throws(()=>verifyEvent(stripe,config,payload,expired))
  for(const change of [{livemode:true},{account:'acct_other'}]){
    const body=JSON.stringify({...JSON.parse(payload),...change})
    assert.throws(()=>verifyEvent(stripe,config,body,stripe.webhooks.generateTestHeaderString({payload:body,secret:config.webhookSecret})))
  }
})

test('development checkout return origin permits HTTP localhost only, never FTP or WebSocket',()=>{
 for(const origin of ['ftp://localhost','ws://localhost','http://localhost.evil.test']) {
  assert.throws(()=>billingConfig({...env,NODE_ENV:'development',APP_ORIGIN:origin}))
 }
 assert.equal(billingConfig({...env,NODE_ENV:'development',APP_ORIGIN:'http://localhost:5173'}).origin,'http://localhost:5173')
 assert.throws(()=>billingConfig({...env,NODE_ENV:'production',APP_ORIGIN:'http://localhost:5173'}))
})
