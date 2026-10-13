import test from 'node:test'
import assert from 'node:assert/strict'
import { refreshJobsAutomatically } from '../../server/jobs/auto-refresh.ts'
import { example } from '../../src/model.ts'

const env = { CRON_SECRET:'c'.repeat(32), TECHMAP_API_KEY:'t'.repeat(20), SUPABASE_URL:'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'service', SUPABASE_PUBLISHABLE_KEY:'public' }
const owner = '11111111-1111-1111-1111-111111111111'

function request(secret=env.CRON_SECRET) { return new Request('https://apwico.com/api/refresh-jobs',{headers:{authorization:`Bearer ${secret}`}}) }

test('automatic refresh requires the cron secret before database or provider work',async()=>{
 let touched=false
 const response=await refreshJobsAutomatically(request('wrong'),env,{serviceDatabase:(()=>{touched=true;throw new Error()}) as never,techmapSearch:(async()=>{touched=true;throw new Error()}) as never,delay:async()=>{}})
 assert.equal(response.status,401);assert.equal(touched,false)
})

test('automatic refresh bypasses browser/cache and issues a fresh provider request before storing owner-scoped results',async()=>{
 const calls:Array<{name:string,args:Record<string,unknown>}>=[];let providerCalls=0
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{
  calls.push({name,args})
  if(name==='jobs_claim_auto_refresh')return{data:[{ownerId:owner,criteria:{title:'Software Engineer'},evidence:null,resume:{...example(),headline:'Software Engineer',skills:'TypeScript'}}],error:null}
  if(name==='jobs_reserve_provider_request')return{data:{allowed:true,used:1,remaining:499,resetsAt:'2026-11-01T00:00:00Z'},error:null}
  return{data:true,error:null}
 }}
 const response=await refreshJobsAutomatically(request(),env,{serviceDatabase:(()=>db) as never,techmapSearch:(async()=>{providerCalls++;return{jobs:[],page:1,hasMore:false}}) as never,delay:async()=>{}})
 assert.equal(response.status,200);assert.equal(providerCalls,1)
 assert.ok(calls.some(call=>call.name==='jobs_reserve_provider_request'&&call.args.p_kind==='automatic'))
 assert.ok(calls.some(call=>call.name==='jobs_finish_auto_refresh'&&call.args.p_status==='no_results'))
})

test('provider-cap exhaustion is stored honestly and never calls the provider',async()=>{
 let providerCalls=0;const calls:string[]=[]
 const db={rpc:async(name:string)=>{calls.push(name);if(name==='jobs_claim_auto_refresh')return{data:[{ownerId:owner,criteria:{title:'Engineer'},evidence:{headline:'Engineer',skills:'TypeScript',roles:[]},resume:null}],error:null};if(name==='jobs_reserve_provider_request')return{data:{allowed:false,reason:'cap',remaining:0},error:null};return{data:true,error:null}}}
 const response=await refreshJobsAutomatically(request(),env,{serviceDatabase:(()=>db) as never,techmapSearch:(async()=>{providerCalls++;return{jobs:[],page:1,hasMore:false}}) as never,delay:async()=>{}})
 assert.equal(response.status,200);assert.equal(providerCalls,0);assert.ok(calls.includes('jobs_finish_auto_refresh'))
 assert.equal((await response.json()).capped,1)
})
