import test from 'node:test'
import assert from 'node:assert/strict'
import { checkout, webhook } from '../../server/billing/handlers.ts'
test('payment routes cannot run merely because production secret exists',async()=>{
 const r=new Request('https://resumestride.com/api/checkout',{method:'POST',body:'{}'})
 assert.equal((await checkout(r,{STRIPE_SECRET_KEY:'sk_live_fixture'})).status,503)
 assert.equal((await webhook(new Request('https://resumestride.com/api/stripe-webhook',{method:'POST'}),{})).status,503)
})
test('webhook rejects unsupported methods before configuration',async()=>{
 assert.equal((await webhook(new Request('https://resumestride.com/api/stripe-webhook'),{})).status,405)
})
