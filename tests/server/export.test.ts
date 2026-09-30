import { runObservedRequest, type Diagnostic } from '../../server/observability.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {exportPdf} from '../../server/export/handler.ts'
import {exportDocx} from '../../server/export/docx-handler.ts'
import {example} from '../../src/model.ts'
import {docxMimeType} from '../../src/services/docx.ts'
import {serviceDatabase} from '../../server/database.ts'

const owner='33333333-3333-3333-3333-333333333333'
const env={EXPORTS_ENABLED:'true',APP_ORIGIN:'https://resumestride.com',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture'}
const req=(format:'pdf'|'docx'='pdf',resume:ReturnType<typeof example> = example(),requestId=owner,jobResumeVersionId?:string)=>new Request(`${env.APP_ORIGIN}/api/export-${format}`,{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify({requestId,resume,...(jobResumeVersionId?{jobResumeVersionId}:{})})})

function fixtures(options:{quotaError?:boolean|'current';pdfRenderError?:boolean;docxRenderError?:boolean;finishError?:boolean;complete?:boolean}={}){
 const calls:string[]=[]
 const hashes:string[]=[]
 const deps={
  authenticate:async()=>owner,
  renderPdf:async()=>{calls.push('render:pdf');if(options.pdfRenderError)throw new Error('private data');return new TextEncoder().encode('%PDF-fixture')},
  renderDocx:async()=>{calls.push('render:docx');if(options.docxRenderError)throw new Error('private data');return new TextEncoder().encode('PK-docx-fixture')},
  serviceDatabase:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
   calls.push(name==='product_finish_document'?`finish:${args.p_success}`:name)
   if(name==='product_begin_document')hashes.push(String(args.p_hash))
   return name==='product_begin_document'?{data:[{lease:'fixture',already_complete:!!options.complete}],error:options.quotaError?{message:options.quotaError==='current'?'Free document allowance reached':'Free PDF allowance reached'}:null}:{data:null,error:options.finishError?{}:null}
  }}) as unknown as ReturnType<typeof serviceDatabase>,
 }
 return {calls,hashes,deps}
}

test('legacy and current exhausted shared-allowance errors never render PDF or DOCX',async()=>{
 for(const quotaError of [true,'current'] as const)for(const format of ['pdf','docx'] as const){
  const {calls,deps}=fixtures({quotaError})
  const response=format==='pdf'?await exportPdf(req(format),env,{...deps,renderDocument:deps.renderPdf}):await exportDocx(req(format),env,{...deps,renderDocument:deps.renderDocx})
  assert.equal(response.status,403)
  assert.deepEqual(await response.json(),{error:'Your Free document download allowance is used for this period.'})
  assert.deepEqual(calls,['product_begin_document'])
 }
})

test('renderer failure releases a reservation and does not disclose internals',async()=>{
 for(const format of ['pdf','docx'] as const){
  const {calls,deps}=fixtures(format==='pdf'?{pdfRenderError:true}:{docxRenderError:true})
  const response=format==='pdf'?await exportPdf(req(format),env,{...deps,renderDocument:deps.renderPdf}):await exportDocx(req(format),env,{...deps,renderDocument:deps.renderDocx})
  assert.equal(response.status,503)
  assert.deepEqual(calls,['product_begin_document',`render:${format}`,'finish:false'])
  assert.ok(!(await response.text()).includes('private data'))
 }
})

test('successful documents are counted before bytes return; completed retries are not debited',async()=>{
 for(const format of ['pdf','docx'] as const)for(const complete of [false,true]){
  const {calls,deps}=fixtures({complete})
  const response=format==='pdf'?await exportPdf(req(format),env,{...deps,renderDocument:deps.renderPdf}):await exportDocx(req(format),env,{...deps,renderDocument:deps.renderDocx})
  assert.equal(response.status,200)
  assert.equal(response.headers.get('content-type'),format==='pdf'?'application/pdf':docxMimeType)
  assert.equal(response.headers.get('content-disposition'),`attachment; filename="ResumeStride.${format}"`)
  assert.deepEqual(calls,complete?['product_begin_document',`render:${format}`]:['product_begin_document',`render:${format}`,'finish:true'])
 }
})

test('format-bound hashes prevent a PDF request UUID from being replayed as DOCX',async()=>{
 const fixture=fixtures()
 assert.equal((await exportPdf(req('pdf'),env,{...fixture.deps,renderDocument:fixture.deps.renderPdf})).status,200)
 assert.equal((await exportDocx(req('docx'),env,{...fixture.deps,renderDocument:fixture.deps.renderDocx})).status,200)
 assert.equal(fixture.hashes.length,2)
 assert.match(fixture.hashes[0],/^[a-f0-9]{64}$/)
 assert.match(fixture.hashes[1],/^[a-f0-9]{64}$/)
 assert.notEqual(fixture.hashes[0],fixture.hashes[1])
})

test('three mixed-format successes consume one shared Free allowance and the next request cannot render',async()=>{
 let completed=0
 let renders=0
 const baseDeps={
  authenticate:async()=>owner,
  renderPdf:async()=>{renders++;return new TextEncoder().encode('%PDF-fixture')},
  renderDocx:async()=>{renders++;return new TextEncoder().encode('PK-docx-fixture')},
  serviceDatabase:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
   if(name==='product_begin_document')return completed>=3?{data:null,error:{message:'Free PDF allowance reached'}}:{data:[{lease:`lease-${String(args.p_id)}`,already_complete:false}],error:null}
   if(name==='product_finish_document'&&args.p_success===true)completed++
   return {data:null,error:null}
  }}) as unknown as ReturnType<typeof serviceDatabase>,
 }
 const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004']
 const first=await exportPdf(req('pdf',example(),ids[0]),env,{...baseDeps,renderDocument:baseDeps.renderPdf})
 const second=await exportDocx(req('docx',example(),ids[1]),env,{...baseDeps,renderDocument:baseDeps.renderDocx})
 const third=await exportPdf(req('pdf',example(),ids[2]),env,{...baseDeps,renderDocument:baseDeps.renderPdf})
 const fourth=await exportDocx(req('docx',example(),ids[3]),env,{...baseDeps,renderDocument:baseDeps.renderDocx})
 assert.deepEqual([first.status,second.status,third.status,fourth.status],[200,200,200,403])
 assert.equal(completed,3)
 assert.equal(renders,3)
})

test('ambiguous accounting result leaks neither format and does not refund an uncertain commit',async()=>{
 for(const format of ['pdf','docx'] as const){
  const {calls,deps}=fixtures({finishError:true})
  const response=format==='pdf'?await exportPdf(req(format),env,{...deps,renderDocument:deps.renderPdf}):await exportDocx(req(format),env,{...deps,renderDocument:deps.renderDocx})
  assert.equal(response.status,503)
  assert.deepEqual(calls,['product_begin_document',`render:${format}`,'finish:true'])
 }
})

test('qualified job-specific export records a bounded durable conversion after commit',async()=>{
 const versionId='44444444-4444-4444-4444-444444444444'
 const calls:{name:string;args:Record<string,unknown>}[]=[]
 const storedResume=Object.fromEntries(Object.entries(example()).reverse())
 const deps={
  authenticate:async()=>owner,
  renderDocument:async()=>new TextEncoder().encode('%PDF-fixture'),
  serviceDatabase:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
   calls.push({name,args})
   if(name==='product_begin_document')return{data:[{lease:'fixture',already_complete:false}],error:null}
   if(name==='job_resume_version_get')return{data:{data:storedResume},error:null}
   if(name==='product_finish_document')return{data:'limited',error:null}
   return{data:null,error:null}
  }}) as unknown as ReturnType<typeof serviceDatabase>,
 }
 const response=await exportPdf(req('pdf',example(),owner,versionId),env,deps)
 assert.equal(response.status,200)
 assert.equal(response.headers.get('x-resumestride-qualified-conversion'),'limited')
 assert.deepEqual(calls.map(call=>call.name),['job_resume_version_get','product_begin_document','product_finish_document'])
 assert.equal(calls.find(call=>call.name==='product_begin_document')?.args.p_job_resume_version,versionId)
 assert.deepEqual(calls.at(-1)?.args,{p_id:owner,p_owner:owner,p_lease:'fixture',p_success:true,p_format:'pdf',p_job_resume_version:versionId})
})

test('an ambiguous atomic conversion commit returns no document and remains retryable',async()=>{
 const versionId='44444444-4444-4444-4444-444444444444'
 const deps={
  authenticate:async()=>owner,
  renderDocument:async()=>new TextEncoder().encode('%PDF-fixture'),
  serviceDatabase:()=>({rpc:async(name:string)=>name==='product_begin_document'
   ?{data:[{lease:'fixture',already_complete:false}],error:null}
   :name==='job_resume_version_get'?{data:{data:example()},error:null}
   :name==='product_finish_document'?{data:null,error:{message:'unavailable'}}:{data:null,error:null}}) as unknown as ReturnType<typeof serviceDatabase>,
 }
 const response=await exportPdf(req('pdf',example(),owner,versionId),env,deps)
 assert.equal(response.status,503)
 assert.equal(response.headers.get('x-resumestride-qualified-conversion'),null)
})

test('an owned version id cannot qualify different exported content',async()=>{
 const versionId='44444444-4444-4444-4444-444444444444'
 const calls:string[]=[]
 const deps={
  authenticate:async()=>owner,
  renderDocument:async()=>new TextEncoder().encode('%PDF-fixture'),
  serviceDatabase:()=>({rpc:async(name:string)=>{
   calls.push(name)
   if(name==='product_begin_document')return{data:[{lease:'fixture',already_complete:false}],error:null}
   if(name==='job_resume_version_get')return{data:{data:{...example(),name:'Different stored version'}},error:null}
   return{data:null,error:null}
  }}) as unknown as ReturnType<typeof serviceDatabase>,
 }
 const response=await exportPdf(req('pdf',example(),owner,versionId),env,deps)
 assert.equal(response.status,200)
 assert.equal(response.headers.get('x-resumestride-qualified-conversion'),null)
 assert.deepEqual(calls,['job_resume_version_get','product_begin_document','product_finish_document'])
})

test('a completed master request cannot be replayed later as a job-specific conversion',async()=>{
 const versionId='44444444-4444-4444-4444-444444444444'
 let boundVersion:unknown='unset'
 const calls:string[]=[]
 const deps={
  authenticate:async()=>owner,
  renderDocument:async()=>new TextEncoder().encode('%PDF-fixture'),
  serviceDatabase:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
   calls.push(name)
   if(name==='job_resume_version_get')return{data:{data:example()},error:null}
   if(name==='product_begin_document'){
    if(boundVersion==='unset')boundVersion=args.p_job_resume_version
    else if(boundVersion!==args.p_job_resume_version)return{data:null,error:{message:'Document request context mismatch'}}
    return{data:[{lease:'fixture',already_complete:boundVersion!=='unset'&&calls.filter(item=>item==='product_begin_document').length>1}],error:null}
   }
   return{data:null,error:null}
  }}) as unknown as ReturnType<typeof serviceDatabase>,
 }
 assert.equal((await exportPdf(req('pdf'),env,deps)).status,200)
 assert.equal(boundVersion,null)
 const replay=await exportPdf(req('pdf',example(),owner,versionId),env,deps)
 assert.equal(replay.status,409)
 assert.equal(calls.includes('product_record_application_package'),false)
})

test('all seven Free templates remain available without a Premium template entitlement',async()=>{
 for(const template of ['modern','classic','minimal','compact','bold','executive','ledger'] as const){
  for(const format of ['pdf','docx'] as const){
   const {calls,deps}=fixtures()
   const request=req(format,{...example(),template})
   const response=format==='pdf'?await exportPdf(request,env,{...deps,renderDocument:deps.renderPdf}):await exportDocx(request,env,{...deps,renderDocument:deps.renderDocx})
   assert.equal(response.status,200,`${template} ${format} should render`)
   assert.deepEqual(calls,['product_begin_document',`render:${format}`,'finish:true'])
  }
 }
})


test('export render failures are correlated and categorized while reservation cleanup still runs',async()=>{
 const {deps,calls}=fixtures({pdfRenderError:true})
 const records:Diagnostic[]=[]
 const response=await runObservedRequest('export-pdf','export',()=>exportPdf(req(),env,{...deps,renderDocument:deps.renderPdf}),env,record=>records.push(record))
 assert.equal(response.status,503)
 assert.deepEqual(calls,['product_begin_document','render:pdf','finish:false'])
 assert.ok(records.some(record=>record.category==='export_failure'&&record.operation==='export_render'))
 assert.ok(records.every(record=>record.requestId===response.headers.get('x-request-id')))
 assert.ok(!JSON.stringify(records).includes('private data'))
 assert.equal(records.at(-1)?.health,'degraded')
})
