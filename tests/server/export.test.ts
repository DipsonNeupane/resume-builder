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
const req=(format:'pdf'|'docx'='pdf',resume:ReturnType<typeof example> = example(),requestId=owner)=>new Request(`${env.APP_ORIGIN}/api/export-${format}`,{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify({requestId,resume})})

function fixtures(options:{quotaError?:boolean;pdfRenderError?:boolean;docxRenderError?:boolean;finishError?:boolean;complete?:boolean}={}){
 const calls:string[]=[]
 const hashes:string[]=[]
 const deps={
  authenticate:async()=>owner,
  renderPdf:async()=>{calls.push('render:pdf');if(options.pdfRenderError)throw new Error('private data');return new TextEncoder().encode('%PDF-fixture')},
  renderDocx:async()=>{calls.push('render:docx');if(options.docxRenderError)throw new Error('private data');return new TextEncoder().encode('PK-docx-fixture')},
  serviceDatabase:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
   calls.push(name==='pdf_finish'?`finish:${args.p_success}`:name)
   if(name==='document_begin')hashes.push(String(args.p_hash))
   return name==='document_begin'?{data:[{lease:'fixture',already_complete:!!options.complete}],error:options.quotaError?{message:'Free PDF allowance reached'}:null}:{error:options.finishError?{}:null}
  }}) as unknown as ReturnType<typeof serviceDatabase>,
 }
 return {calls,hashes,deps}
}

test('exhausted shared allowance never renders PDF or DOCX',async()=>{
 for(const format of ['pdf','docx'] as const){
  const {calls,deps}=fixtures({quotaError:true})
  const response=format==='pdf'?await exportPdf(req(format),env,{...deps,renderDocument:deps.renderPdf}):await exportDocx(req(format),env,{...deps,renderDocument:deps.renderDocx})
  assert.equal(response.status,403)
  assert.deepEqual(await response.json(),{error:'Your Free document download allowance is used for this period.'})
  assert.deepEqual(calls,['document_begin'])
 }
})

test('renderer failure releases a reservation and does not disclose internals',async()=>{
 for(const format of ['pdf','docx'] as const){
  const {calls,deps}=fixtures(format==='pdf'?{pdfRenderError:true}:{docxRenderError:true})
  const response=format==='pdf'?await exportPdf(req(format),env,{...deps,renderDocument:deps.renderPdf}):await exportDocx(req(format),env,{...deps,renderDocument:deps.renderDocx})
  assert.equal(response.status,503)
  assert.deepEqual(calls,['document_begin',`render:${format}`,'finish:false'])
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
  assert.deepEqual(calls,complete?['document_begin',`render:${format}`]:['document_begin',`render:${format}`,'finish:true'])
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
   if(name==='document_begin')return completed>=3?{data:null,error:{message:'Free PDF allowance reached'}}:{data:[{lease:`lease-${String(args.p_id)}`,already_complete:false}],error:null}
   if(name==='pdf_finish'&&args.p_success===true)completed++
   return {error:null}
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
  assert.deepEqual(calls,['document_begin',`render:${format}`,'finish:true'])
 }
})

test('all seven Free templates remain available without a Premium template entitlement',async()=>{
 for(const template of ['modern','classic','minimal','compact','bold','executive','ledger'] as const){
  for(const format of ['pdf','docx'] as const){
   const {calls,deps}=fixtures()
   const request=req(format,{...example(),template})
   const response=format==='pdf'?await exportPdf(request,env,{...deps,renderDocument:deps.renderPdf}):await exportDocx(request,env,{...deps,renderDocument:deps.renderDocx})
   assert.equal(response.status,200,`${template} ${format} should render`)
   assert.deepEqual(calls,['document_begin',`render:${format}`,'finish:true'])
  }
 }
})


test('export render failures are correlated and categorized while reservation cleanup still runs',async()=>{
 const {deps,calls}=fixtures({pdfRenderError:true})
 const records:Diagnostic[]=[]
 const response=await runObservedRequest('export-pdf','export',()=>exportPdf(req(),env,{...deps,renderDocument:deps.renderPdf}),env,record=>records.push(record))
 assert.equal(response.status,503)
 assert.deepEqual(calls,['document_begin','render:pdf','finish:false'])
 assert.ok(records.some(record=>record.category==='export_failure'&&record.operation==='export_render'))
 assert.ok(records.every(record=>record.requestId===response.headers.get('x-request-id')))
 assert.ok(!JSON.stringify(records).includes('private data'))
 assert.equal(records.at(-1)?.health,'degraded')
})
