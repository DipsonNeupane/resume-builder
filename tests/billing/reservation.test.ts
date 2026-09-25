import test from 'node:test'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
import { HttpError } from '../../server/http/security.ts'
import { acquireOwnerCheckoutLock, isOwnLock, releaseOwnerCheckoutBySession, tryRecoverStuckLock, type OwnerCheckoutLock } from '../../server/billing/reservation.ts'

const owner='22222222-2222-2222-2222-222222222222'
const requestId='11111111-1111-1111-1111-111111111111'
const otherRequestId='33333333-3333-3333-3333-333333333333'
const baseLock=(overrides: Partial<OwnerCheckoutLock> = {}): OwnerCheckoutLock => ({
 owner_id:owner, kind:'manual', request_id:requestId, session_id:null, price_id:'price_fixture', live:false, created_at:new Date().toISOString(), ...overrides,
})

function dbFixture(handlers: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }>) {
 const calls: { name: string; args: Record<string, unknown> }[] = []
 const rpc = async (name: string, args: Record<string, unknown> = {}) => {
  calls.push({ name, args })
  const handler = handlers[name]
  if (!handler) throw new Error(`unexpected rpc ${name}`)
  return handler(args)
 }
 return { db: { rpc } as unknown as Parameters<typeof acquireOwnerCheckoutLock>[0], calls }
}

test('isOwnLock matches kind, request id, price and live mode exactly',()=>{
 assert.equal(isOwnLock(baseLock(),'manual',requestId,'price_fixture',false),true)
 assert.equal(isOwnLock(baseLock({kind:'subscription'}),'manual',requestId,'price_fixture',false),false)
 assert.equal(isOwnLock(baseLock({request_id:otherRequestId}),'manual',requestId,'price_fixture',false),false)
 assert.equal(isOwnLock(baseLock({price_id:'price_other'}),'manual',requestId,'price_fixture',false),false)
 assert.equal(isOwnLock(baseLock({live:true}),'manual',requestId,'price_fixture',false),false)
})

test('acquireOwnerCheckoutLock returns immediately when the reservation is already this exact request',async()=>{
 const {db,calls}=dbFixture({billing_reserve_owner_checkout:()=>({data:baseLock(),error:null})})
 const recover=async()=>{throw new Error('must not be called')}
 const lock=await acquireOwnerCheckoutLock(db,'manual',requestId,owner,'price_fixture',false,recover)
 assert.equal(lock.request_id,requestId)
 assert.equal(calls.length,1)
})

test('acquireOwnerCheckoutLock retries once after recovery frees a stuck reservation',async()=>{
 let attempt=0
 const {db,calls}=dbFixture({billing_reserve_owner_checkout:()=>{
  attempt++
  return {data: attempt===1 ? baseLock({request_id:otherRequestId}) : baseLock(), error:null}
 }})
 let recoverCalls=0
 const recover=async(stuck:OwnerCheckoutLock)=>{recoverCalls++;assert.equal(stuck.request_id,otherRequestId);return true}
 const lock=await acquireOwnerCheckoutLock(db,'manual',requestId,owner,'price_fixture',false,recover)
 assert.equal(lock.request_id,requestId)
 assert.equal(recoverCalls,1)
 assert.equal(calls.length,2)
})

test('acquireOwnerCheckoutLock rejects with 409 when recovery cannot free the slot',async()=>{
 const {db}=dbFixture({billing_reserve_owner_checkout:()=>({data:baseLock({request_id:otherRequestId}),error:null})})
 const recover=async()=>false
 await assert.rejects(
  acquireOwnerCheckoutLock(db,'manual',requestId,owner,'price_fixture',false,recover),
  (error: unknown)=>error instanceof HttpError && error.status===409,
 )
})

test('acquireOwnerCheckoutLock rejects with 409 even after a freed slot is won by someone else before the retry',async()=>{
 const {db}=dbFixture({billing_reserve_owner_checkout:()=>({data:baseLock({request_id:'44444444-4444-4444-4444-444444444444'}),error:null})})
 const recover=async()=>true
 await assert.rejects(
  acquireOwnerCheckoutLock(db,'manual',requestId,owner,'price_fixture',false,recover),
  (error: unknown)=>error instanceof HttpError && error.status===409,
 )
})

test('tryRecoverStuckLock never touches an already-bound reservation',async()=>{
 const stuck=baseLock({request_id:otherRequestId,session_id:'cs_existing'})
 const {db,calls}=dbFixture({})
 let createCalls=0,bindCalls=0
 const freed=await tryRecoverStuckLock(stuck,async()=>{createCalls++;return {id:'cs_new'}},db,async()=>{bindCalls++})
 assert.equal(freed,false)
 assert.equal(createCalls,0)
 assert.equal(bindCalls,0)
 assert.equal(calls.length,0)
})

test('tryRecoverStuckLock resolves a lost bind by re-creating with the same idempotency key and binding it, never freeing the slot for the new request',async()=>{
 const stuck=baseLock({request_id:otherRequestId,session_id:null})
 const {db,calls}=dbFixture({billing_bind_owner_checkout:(args)=>{assert.equal(args.p_session,'cs_recovered');return {data:null,error:null}}})
 let boundSessionId: string|undefined
 const freed=await tryRecoverStuckLock(stuck,async()=>({id:'cs_recovered'}),db,async(sessionId)=>{boundSessionId=sessionId})
 assert.equal(freed,false)
 assert.equal(boundSessionId,'cs_recovered')
 assert.deepEqual(calls.map(c=>c.name),['billing_bind_owner_checkout'])
})

test('tryRecoverStuckLock never releases on an ambiguous (non-Stripe, connection, or API) create failure',async()=>{
 const stuck=baseLock({request_id:otherRequestId,session_id:null})
 for(const error of [new Error('network hiccup'), new Stripe.errors.StripeConnectionError({message:'timeout'}), new Stripe.errors.StripeAPIError({message:'internal'})]) {
  const {db,calls}=dbFixture({})
  const freed=await tryRecoverStuckLock(stuck,async()=>{throw error},db,async()=>{})
  assert.equal(freed,false,String(error))
  assert.equal(calls.length,0,'ambiguous failures must never call the release RPC')
 }
})

test('tryRecoverStuckLock keeps reservation when retry rejection cannot disprove earlier creation',async()=>{
 const stuck=baseLock({request_id:otherRequestId,session_id:null})
 for(const ErrorType of [Stripe.errors.StripeInvalidRequestError, Stripe.errors.StripeAuthenticationError, Stripe.errors.StripePermissionError, Stripe.errors.StripeRateLimitError]) {
  const {db,calls}=dbFixture({billing_release_owner_checkout:(args)=>{
   assert.equal(args.p_owner,owner);assert.equal(args.p_kind,'manual');assert.equal(args.p_session,null);assert.equal(args.p_request_id,otherRequestId)
   return {data:true,error:null}
  }})
  const freed=await tryRecoverStuckLock(stuck,async()=>{throw new ErrorType({message:'rejected'})},db,async()=>{})
  assert.equal(freed,false,ErrorType.name)
  assert.deepEqual(calls,[])
 }
})

test('tryRecoverStuckLock treats a bindIntent failure after a real create as ambiguous, never releasing a possibly-live session',async()=>{
 const stuck=baseLock({request_id:otherRequestId,session_id:null})
 const {db,calls}=dbFixture({})
 const freed=await tryRecoverStuckLock(stuck,async()=>({id:'cs_recovered'}),db,async()=>{throw new Error('persist failed')})
 assert.equal(freed,false)
 assert.equal(calls.length,0,'a lost bind after a real create must never be treated as proof nothing was created')
})

test('releaseOwnerCheckoutBySession surfaces a database error rather than silently swallowing it',async()=>{
 const {db}=dbFixture({billing_release_owner_checkout:()=>({data:null,error:{message:'db down'}})})
 await assert.rejects(releaseOwnerCheckoutBySession(db,owner,'manual','cs_fixture'))
})

test('old or malformed unbound reservations cannot recreate after idempotency retention',async()=>{
 for(const created_at of ['invalid',new Date(Date.now()-24*60*60*1000).toISOString()]){
  const {db}=dbFixture({});let creates=0
  assert.equal(await tryRecoverStuckLock(baseLock({created_at}),async()=>{creates++;return {id:'cs_new'}},db,async()=>{}),false)
  assert.equal(creates,0)
 }
})
