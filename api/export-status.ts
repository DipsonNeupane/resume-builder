import { runObservedRequest } from '../server/observability.js'
import {authenticate,HttpError,json,safeError} from '../server/http/security.js'
import {databaseConfig,serviceDatabase} from '../server/database.js'
async function exportStatus(request:Request){
 try{
  if(request.method!=='GET')throw new HttpError(405,'Method not allowed')
  if(process.env.EXPORTS_ENABLED!=='true')throw new HttpError(503, 'Generated document downloads are not available yet', 'configuration')
  const owner=await authenticate(request,databaseConfig(process.env))
  const {data,error}=await serviceDatabase(process.env).rpc('pdf_status',{p_owner:owner})
  if(error||!data?.[0])throw new Error('Allowance unavailable')
  return json(200,{isPro:data[0].is_pro,remaining:data[0].remaining,resetsAt:data[0].resets_at})
 }catch(error){return safeError(error)}
}
export default { fetch: (request: Request) => runObservedRequest('export-status', 'export', () => exportStatus(request)) }
