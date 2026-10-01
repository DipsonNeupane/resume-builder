import { observeOperation } from '../observability.js'
import {createHash} from 'node:crypto'
import {authenticate,HttpError,jsonBody,requirePost,safeError} from '../http/security.js'
import {databaseConfig,serviceDatabase} from '../database.js'
import {validateExport} from './validate.ts'
import {isPremiumTemplate,type Resume} from '../../src/model.js'

export type DocumentExportConfig={format:'pdf'|'docx';contentType:string;filename:string}
export type DocumentExportDependencies={
 authenticate:typeof authenticate
 serviceDatabase:typeof serviceDatabase
 renderDocument:(resume:Resume)=>Promise<Uint8Array>
}

function canonicalJson(value:unknown):string{
 if(Array.isArray(value))return`[${value.map(canonicalJson).join(',')}]`
 if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson((value as Record<string,unknown>)[key])}`).join(',')}}`
 return JSON.stringify(value)??'null'
}

export async function exportDocument(config:DocumentExportConfig,request:Request,env:NodeJS.ProcessEnv,deps:DocumentExportDependencies):Promise<Response>{
 try{
  if(env.EXPORTS_ENABLED!=='true')throw new HttpError(503, 'Generated document downloads are not available yet', 'configuration')
  const origin=env.APP_ORIGIN
  if(!origin)throw new HttpError(503, 'Downloads are not configured', 'configuration')
  requirePost(request,origin)
  const owner=await deps.authenticate(request,databaseConfig(env))
  const body=await jsonBody(request,1_000_000)
  if(Object.keys(body).some(k=>!['requestId','resume','jobResumeVersionId'].includes(k))||typeof body.requestId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.requestId)
   ||(body.jobResumeVersionId!==undefined&&(typeof body.jobResumeVersionId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.jobResumeVersionId))))throw new HttpError(400,'Invalid download request')
  validateExport(body.resume)
  const db=deps.serviceDatabase(env)
  let qualifiedVersionId:string|null=null
  if(typeof body.jobResumeVersionId==='string'){
   const version=await db.rpc('job_resume_version_get',{p_owner:owner,p_version:body.jobResumeVersionId})
   if(!version.error&&version.data&&typeof version.data==='object'&&canonicalJson(version.data.data)===canonicalJson(body.resume))qualifiedVersionId=body.jobResumeVersionId
  }
  // Bind idempotency to both content and format: a UUID safely retries the same
  // document, but can never be reused to turn a counted PDF into a free DOCX.
  const hash=createHash('sha256').update(`${config.format}\0${JSON.stringify(body.resume)}`).digest('hex')
  const {data,error}=await db.rpc('product_begin_document',{p_id:body.requestId,p_owner:owner,p_hash:hash,p_template:body.resume.template,p_premium_template:isPremiumTemplate(body.resume.template),p_format:config.format,p_job_resume_version:qualifiedVersionId})
  if(error?.message==='Premium template access required')throw new HttpError(403,'An active subscription for this Premium template or Pro is required.')
  if(error?.message==='Free PDF allowance reached'||error?.message==='Free document allowance reached')throw new HttpError(403,'Your Free document download allowance is used for this period.')
  if(error||!data?.[0])throw new HttpError(409,'Download unavailable: check your allowance or retry after the current download finishes.')
  const reservation=data[0]
  let bytes:Uint8Array
  try{bytes=await observeOperation('export', 'export_render', () => deps.renderDocument(body.resume as Resume), 'export_failure')}catch(error){
   if(!reservation.already_complete)await db.rpc('product_finish_document',{p_id:body.requestId,p_owner:owner,p_lease:reservation.lease,p_success:false,p_format:config.format,p_job_resume_version:null})
   throw error
  }
  let qualifiedScope:string|null=null
  if(!reservation.already_complete){
   const result=await db.rpc('product_finish_document',{p_id:body.requestId,p_owner:owner,p_lease:reservation.lease,p_success:true,p_format:config.format,p_job_resume_version:qualifiedVersionId})
   // Unknown commit outcome: do not undo. The same request ID safely recovers.
   if(result.error)throw new Error('Download accounting unavailable')
   if(result.data==='limited'||result.data==='full')qualifiedScope=result.data
  }else if(qualifiedVersionId){
    const outcome=await db.rpc('product_record_application_package',{p_owner:owner,p_export_request:body.requestId,p_job_resume_version:body.jobResumeVersionId,p_format:config.format})
    if(!outcome.error&&(outcome.data==='limited'||outcome.data==='full'))qualifiedScope=outcome.data
  }
  const headers:Record<string,string>={'Content-Type':config.contentType,'Content-Disposition':`attachment; filename="${config.filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  if(qualifiedScope){
   headers['X-APWICO-Qualified-Conversion']=qualifiedScope
   // Temporary response compatibility for clients shipped before the brand migration.
   headers['X-ResumeStride-Qualified-Conversion']=qualifiedScope
  }
  return new Response(new Uint8Array(bytes).buffer,{headers})
 }catch(error){return safeError(error)}
}
