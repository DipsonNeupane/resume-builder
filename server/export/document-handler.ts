import { observeOperation } from '../observability.js'
import {createHash} from 'node:crypto'
import {authenticate,HttpError,jsonBody,requirePost,safeError} from '../http/security.js'
import {databaseConfig,serviceDatabase} from '../database.js'
import {validateExport} from './validate.ts'
import type {Resume} from '../../src/model.js'

export type DocumentExportConfig={format:'pdf'|'docx';contentType:string;filename:string}
export type DocumentExportDependencies={
 authenticate:typeof authenticate
 serviceDatabase:typeof serviceDatabase
 renderDocument:(resume:Resume)=>Promise<Uint8Array>
}

export async function exportDocument(config:DocumentExportConfig,request:Request,env:NodeJS.ProcessEnv,deps:DocumentExportDependencies):Promise<Response>{
 try{
  if(env.EXPORTS_ENABLED!=='true')throw new HttpError(503, 'Generated document downloads are not available yet', 'configuration')
  const origin=env.APP_ORIGIN
  if(!origin)throw new HttpError(503, 'Downloads are not configured', 'configuration')
  requirePost(request,origin)
  const owner=await deps.authenticate(request,databaseConfig(env))
  const body=await jsonBody(request,1_000_000)
  if(Object.keys(body).some(k=>!['requestId','resume'].includes(k))||typeof body.requestId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.requestId))throw new HttpError(400,'Invalid download request')
  validateExport(body.resume)
  const db=deps.serviceDatabase(env)
  // Bind idempotency to both content and format: a UUID safely retries the same
  // document, but can never be reused to turn a counted PDF into a free DOCX.
  const hash=createHash('sha256').update(`${config.format}\0${JSON.stringify(body.resume)}`).digest('hex')
  const {data,error}=await db.rpc('pdf_begin',{p_id:body.requestId,p_owner:owner,p_hash:hash})
  if(error?.message==='Free PDF allowance reached')throw new HttpError(403,'Your Free document download allowance is used for this period.')
  if(error||!data?.[0])throw new HttpError(409,'Download unavailable: check your allowance or retry after the current download finishes.')
  const reservation=data[0]
  let bytes:Uint8Array
  try{bytes=await observeOperation('export', 'export_render', () => deps.renderDocument(body.resume as Resume), 'export_failure')}catch(error){
   if(!reservation.already_complete)await db.rpc('pdf_finish',{p_id:body.requestId,p_owner:owner,p_lease:reservation.lease,p_success:false})
   throw error
  }
  if(!reservation.already_complete){
   const result=await db.rpc('pdf_finish',{p_id:body.requestId,p_owner:owner,p_lease:reservation.lease,p_success:true})
   // Unknown commit outcome: do not undo. The same request ID safely recovers.
   if(result.error)throw new Error('Download accounting unavailable')
  }
  return new Response(new Uint8Array(bytes).buffer,{headers:{'Content-Type':config.contentType,'Content-Disposition':`attachment; filename="${config.filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
 }catch(error){return safeError(error)}
}
