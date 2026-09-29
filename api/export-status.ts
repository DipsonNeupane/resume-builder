import { runObservedRequest } from '../server/observability.js'
import {authenticate,HttpError,json,safeError} from '../server/http/security.js'
import {databaseConfig,serviceDatabase} from '../server/database.js'
import {templateIds} from '../src/model.js'
async function exportStatus(request:Request){
 try{
  if(request.method!=='GET')throw new HttpError(405,'Method not allowed')
  if(process.env.EXPORTS_ENABLED!=='true')throw new HttpError(503, 'Generated document downloads are not available yet', 'configuration')
  const owner=await authenticate(request,databaseConfig(process.env))
  const template=new URL(request.url).searchParams.get('template')
  if(!template||!templateIds.includes(template as never))throw new HttpError(400,'Choose a valid template')
  const db=serviceDatabase(process.env)
  const [{data,error},access]=await Promise.all([db.rpc('pdf_status',{p_owner:owner}),db.rpc('billing_effective_access',{p_owner:owner,p_template:template})])
  if(error||!data?.[0])throw new Error('Allowance unavailable')
  if(access.error||!access.data?.[0])throw new Error('Template access unavailable')
  return json(200,{isPro:data[0].is_pro,hasPaidAccess:Boolean(access.data[0].is_pro||access.data[0].has_template),remaining:data[0].remaining,resetsAt:data[0].resets_at})
 }catch(error){return safeError(error)}
}
export default { fetch: (request: Request) => runObservedRequest('export-status', 'export', () => exportStatus(request)) }
