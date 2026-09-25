import test from 'node:test'
import assert from 'node:assert/strict'
import { authenticate, boundedBody, jsonBody, requirePost, safeError } from '../../server/http/security.ts'
const origin = 'https://resumestride.com'
const request = (body: string, headers: Record<string,string> = {}) => new Request(origin, {method:'POST',body,headers:{origin,'content-type':'application/json',...headers}})
test('mutation boundary rejects foreign or missing origin, wrong methods and media types', () => {
  requirePost(request('{}'),origin)
  for (const r of [request('{}',{origin:'https://evil.test'}),request('{}',{origin:''}),request('{}',{'content-type':'text/plain'}),new Request(origin)]) assert.throws(()=>requirePost(r,origin))
})
test('body bounded by actual bytes regardless of content length', async () => {
  await assert.rejects(boundedBody(request('éé'),3))
  await assert.rejects(boundedBody(request('x',{'content-length':'99999'}),20))
  assert.equal(await boundedBody(request('abc'),3),'abc')
  await assert.rejects(jsonBody(request('[]')))
  await assert.rejects(jsonBody(request('{')))
})
test('forged bearer and anonymous users cannot authenticate; provider failures stay unavailable', async () => {
  const config={url:'https://fixture.supabase.co',publicKey:'public-fixture'}
  const r=request('{}',{authorization:'Bearer forged'})
  await assert.rejects(authenticate(r,config,async()=>new Response('',{status:401})),{status:401})
  await assert.rejects(authenticate(r,config,async()=>Response.json({id:'11111111-1111-1111-1111-111111111111',is_anonymous:true})),{status:401})
  await assert.rejects(authenticate(r,config,async()=>new Response('',{status:500})),{status:503})
  let calls=0
  await assert.rejects(authenticate(request('{}'),config,async()=>{calls++;return Response.json({})}),{status:401})
  assert.equal(calls,0)
})
test('identity comes exclusively from verified auth response', async () => {
  const id='11111111-1111-1111-1111-111111111111'
  assert.equal(await authenticate(request('{"owner":"other"}',{authorization:'Bearer token'}),{url:'https://fixture.supabase.co',publicKey:'public'},async(url,init)=>{
    assert.equal(String(url),'https://fixture.supabase.co/auth/v1/user'); assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer token')
    return Response.json({id})
  }),id)
})
test('unexpected provider details and secrets never reach client errors', async()=>{
  const response=safeError(new Error('sk_secret database internals'))
  assert.equal(response.status,503); assert.equal(response.headers.get('cache-control'),'no-store')
  assert.ok(!(await response.text()).includes('sk_secret'))
})
