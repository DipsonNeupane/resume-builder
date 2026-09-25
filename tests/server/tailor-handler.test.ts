import { runObservedRequest, type Diagnostic } from '../../server/observability.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { tailor, tailorDependencies } from '../../api/tailor.ts'
import { analyzeJob } from '../../server/jobs/match.ts'
import { savedJobSnapshot } from '../../server/jobs/account.ts'
import { HttpError } from '../../server/http/security.ts'
import type { NormalizedJob } from '../../server/jobs/types.ts'
import { example } from '../../src/model.ts'

const owner='11111111-1111-1111-1111-111111111111'
const savedJobId='22222222-2222-2222-2222-222222222222'
const versionId='33333333-3333-3333-3333-333333333333'
const env={APP_ORIGIN:'https://resumestride.com',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'secret',AI_ENABLED:'true',OPENAI_API_KEY:'sk-fixture'}
const job:NormalizedJob={
 id:'techmap:one',provider:'techmap',providerJobId:'one',title:'Customer Experience Specialist',company:'Example',
 location:{value:{city:'Nairobi',region:null,country:'KE'},source:'provider',confidence:'medium'},workplace:{value:'remote',source:'provider',confidence:'high'},
 employmentType:{value:'full_time',source:'provider',confidence:'high'},salary:null,
 descriptionText:'Required: customer support. Preferred: CRM systems.',postedAt:null,
 expiry:{expiresAt:null,isLikelyExpired:false,source:'unknown',confidence:'low'},directness:{value:null,source:'unknown',confidence:'low'},
 sourceUrl:'https://jobs.example/one',portal:'example',source:'employer',dedupeKey:'a'.repeat(64),retrievedAt:'2026-09-24T00:00:00.000Z',
}
const snapshot=savedJobSnapshot(job,{label:'good',reasons:['Relevant support evidence.']})
const evidence={headline:'Customer Experience Specialist',summary:'Supports customers',skills:'CRM systems',roles:[],qualifications:[]}
const analysis=analyzeJob(evidence,job,{title:job.title}).analysis
function request(body:unknown){return new Request('https://resumestride.com/api/tailor',{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json',authorization:'Bearer fixture'},body:JSON.stringify(body)})}

function fixture(input:unknown, failure?:{name:string;message:string;code?:string}){
 const calls:{name:string;args:Record<string,unknown>}[]=[]
 let generated:unknown[]=[]
 const deps={
  ...tailorDependencies,authenticate:async()=>owner,
  serviceDatabase:(()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
   calls.push({name,args})
   if(name===failure?.name)return{data:null,error:{message:failure.message,code:failure.code}}
   if(name==='job_tailoring_inputs')return{data:input,error:null}
   if(name==='begin_ai_request')return{data:'reserved',error:null}
   return{data:true,error:null}
  }})) as unknown as typeof tailorDependencies.serviceDatabase,
  generateTailoringSuggestions:(async(_config,prereqs,resume,description,_fetcher,match)=>{
   generated=[resume,description,match]
   const reservation=await prereqs.reserve(123);await reservation.start();await reservation.finish({status:'succeeded',inputTokens:1,outputTokens:1,actualMicroUsd:2})
   return[{sectionId:null,entryId:null,field:'summary' as const,originalText:resume.summary,suggestedText:'Clear customer support experience.',why:'This emphasizes existing support evidence for the role.'}]
  }) as typeof tailorDependencies.generateTailoringSuggestions,
 }
 return{deps,calls,generated:()=>generated}
}

test('derives owner-bound resume, normalized job text and bounded current match evidence server-side',async()=>{
 const resume=example()
 const {deps,calls,generated}=fixture({versionId,savedJobId,resume,job:snapshot,matchAnalysis:analysis,analysisCurrent:true,isPro:true})
 const response=await tailor(request({versionId,savedJobId,consent:true,requestId:'44444444-4444-4444-4444-444444444444'}),env,deps)
 assert.equal(response.status,200)
 const [sentResume,description,match]=generated() as [Record<string,unknown>,string,Record<string,unknown>]
 assert.equal(description,job.descriptionText)
 assert.equal(sentResume.name,undefined);assert.equal(sentResume.email,undefined);assert.equal(sentResume.phone,undefined);assert.equal(sentResume.website,undefined)
 assert.equal(sentResume.summary,resume.summary)
 assert.equal(match.label,analysis.label)
 assert.ok(Array.isArray(match.relevantRequirements));assert.ok((match.relevantRequirements as unknown[]).length<=8)
 assert.equal(match.resumeHash,undefined);assert.equal(match.contextHash,undefined);assert.equal(match.deeperExplanation,undefined)
 assert.deepEqual(calls[0],{name:'job_tailoring_inputs',args:{p_owner:owner,p_saved_job:savedJobId,p_version:versionId}})
 const reservation=calls.find(call=>call.name==='begin_ai_request')!
 assert.equal(reservation.args.p_owner,owner);assert.match(String(reservation.args.p_request_fingerprint),/^[0-9a-f]{64}$/)
 assert.equal(calls.filter(call=>call.name==='begin_ai_request').length,1)
})

test('browser resume, job text, ownership and unrelated fields are rejected rather than ignored',async()=>{
 for(const extra of [{resume:example()},{jobDescription:'browser text'},{owner:'attacker'},{unrelated:true}]){
  const {deps,calls,generated}=fixture({versionId,savedJobId,resume:example(),job:snapshot,matchAnalysis:analysis,analysisCurrent:true,isPro:true})
  const response=await tailor(request({versionId,savedJobId,consent:true,...extra}),env,deps)
  assert.equal(response.status,400);assert.deepEqual(calls,[]);assert.deepEqual(generated(),[])
 }
})

test('mismatched or cross-account identities fail before accounting or generation',async()=>{
 let generated=false
 const calls:{name:string}[]=[]
 const deps={...tailorDependencies,authenticate:async()=>owner,
  serviceDatabase:(()=>({rpc:async(name:string)=>{calls.push({name});return{data:null,error:{message:'Tailoring source not found'}}}})) as unknown as typeof tailorDependencies.serviceDatabase,
  generateTailoringSuggestions:(async()=>{generated=true;return[]}) as typeof tailorDependencies.generateTailoringSuggestions}
 const response=await tailor(request({versionId,savedJobId,consent:true}),env,deps)
 assert.equal(response.status,404);assert.equal(generated,false);assert.deepEqual(calls,[{name:'job_tailoring_inputs'}])
})

test('a saved job without a normalized description never reserves or calls the provider',async()=>{
 const {deps,calls,generated}=fixture({versionId,savedJobId,resume:example(),job:{...snapshot,descriptionText:'   '},matchAnalysis:analysis,analysisCurrent:true,isPro:true})
 const response=await tailor(request({versionId,savedJobId,consent:true}),env,deps)
 assert.equal(response.status,409);assert.match((await response.json()).error,/no description/i)
 assert.deepEqual(generated(),[]);assert.equal(calls.some(call=>call.name==='begin_ai_request'),false)
})

test('Free entitlement remains a provider-call gate after trusted inputs load',async()=>{
 const {deps,calls}=fixture({versionId,savedJobId,resume:example(),job:snapshot,matchAnalysis:analysis,analysisCurrent:true,isPro:false})
 deps.generateTailoringSuggestions=(async(_config,prereqs)=>{if(!prereqs.pro)throw new HttpError(402,'AI tailoring requires an active Pro pass');return[]}) as typeof tailorDependencies.generateTailoringSuggestions
 const response=await tailor(request({versionId,savedJobId,consent:true}),env,deps)
 assert.equal(response.status,402);assert.equal(calls.some(call=>call.name==='begin_ai_request'),false)
})


test('AI reservation/accounting failures have stable correlated categories without database details',async()=>{
 for(const failure of [
  {name:'begin_ai_request',message:'AI monthly budget reached',code:'54000',category:'ai_budget'},
  {name:'begin_ai_request',message:'AI request limit reached',code:'54000',category:'ai_limit'},
  {name:'begin_ai_request',message:'private database token',code:'XX000',category:'ai_accounting'},
  {name:'start_ai_request',message:'private database token',code:'XX000',category:'ai_accounting'},
  {name:'finish_ai_request',message:'private database token',code:'XX000',category:'ai_accounting'},
 ]){
  const {deps}=fixture({versionId,savedJobId,resume:example(),job:snapshot,isPro:true},failure)
  const records:Diagnostic[]=[]
  const response=await runObservedRequest('tailor','ai',()=>tailor(request({versionId,savedJobId,consent:true}),env,deps),env,record=>records.push(record))
  assert.equal(response.headers.get('x-error-category'),failure.category)
  assert.ok(records.some(record=>record.feature==='ai_accounting'&&record.category===failure.category))
  assert.ok(records.every(record=>record.requestId===response.headers.get('x-request-id')))
  const serialized=JSON.stringify(records)
  for(const privateValue of ['private database token',owner,versionId,savedJobId,example().summary,job.descriptionText])assert.ok(!serialized.includes(privateValue))
  assert.ok(!(await response.text()).includes('private database token'))
 }
})

test('AI lifecycle success emits reserve/start/finish without logging content or accounting identifiers',async()=>{
 const {deps}=fixture({versionId,savedJobId,resume:example(),job:snapshot,isPro:true})
 const records:Diagnostic[]=[]
 const response=await runObservedRequest('tailor','ai',()=>tailor(request({versionId,savedJobId,consent:true}),env,deps),env,record=>records.push(record))
 assert.equal(response.status,200)
 assert.deepEqual(records.filter(record=>record.feature==='ai_accounting').map(record=>record.operation),['ai_reserve','ai_start','ai_finish'])
 assert.equal(records.at(-1)?.health,'healthy')
 assert.ok(!JSON.stringify(records).includes(versionId))
})
