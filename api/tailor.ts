import { runObservedRequest, observeOperation, emitDiagnostic } from '../server/observability.js'
import {createHash,randomUUID} from 'node:crypto'
import {authenticate,HttpError,json,jsonBody,requirePost,safeError} from '../server/http/security.js'
import {databaseConfig,serviceDatabase} from '../server/database.js'
import {isResume,contentLength,maxContentChars,type Resume} from '../src/model.js'
import {buildTailoringRequestBody,generateTailoringSuggestions,tailoringConfig,type TailoringMatchContext,type TailoringResume} from '../server/ai/tailoring.js'
import {AI_MODEL} from '../server/ai/cost.js'
import {parseFullMatchAnalysis} from '../server/jobs/match.js'
import {parseSavedJobSnapshot} from '../server/jobs/account.js'

export const maxDuration=60
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)}

function providerResume(resume:Resume):TailoringResume{
 return {
  headline:resume.headline,summary:resume.summary,skills:resume.skills,
  sections:resume.sections.map(section=>({id:section.id,title:section.title,entries:section.entries.map(entry=>({
   id:entry.id,title:entry.title,organization:entry.organization,location:entry.location,dates:entry.dates,description:entry.description,
  }))})),
 }
}

/** Omits hashes, clarification ids, full explanations and unrelated requirements.
 * Only evidence useful to faithful rewriting reaches the provider. */
export function tailoringMatchContext(value:unknown):TailoringMatchContext|undefined{
 const analysis=parseFullMatchAnalysis(value)
 if(!analysis)return undefined
 return {
  label:analysis.label,whyPromising:analysis.whyPromising.slice(0,1000),
  observations:analysis.observations.slice(0,3).map(item=>item.slice(0,1000)),
  relevantRequirements:analysis.requirements
   .filter(item=>item.status==='demonstrated'||item.status==='partially_demonstrated'||item.category==='required')
   .slice(0,8).map(item=>({id:item.id,text:item.text,category:item.category,status:item.status,evidence:item.evidence.slice(0,3).map(e=>e.slice(0,1000))})),
  areasWorthStrengthening:analysis.areasWorthStrengthening.slice(0,5).map(item=>item.slice(0,1000)),
 }
}

const monthDay=new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',timeZone:'UTC'})
/** Budget and allowance refusals happen before any provider call, so nothing is used. */
export function reservationError(error:{message:string;code?:string},now=new Date()):HttpError{
 if(error.code!=='54000')return new HttpError(503,'AI accounting unavailable. Please try later.','ai_accounting')
 if(error.message==='AI monthly budget reached'){
  const reset=monthDay.format(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)))
  return new HttpError(503,`AI suggestions are paused for all accounts until the monthly AI budget resets on ${reset} (UTC). This request did not use your trial or hourly AI allowance. You can still edit this resume yourself.`,'ai_budget')
 }
 if(error.message==='AI attempt limit reached')return new HttpError(429,'Too many AI suggestion attempts in the last hour. Try again later. This request did not use your trial.','ai_limit')
 return new HttpError(429,'You have reached the limit of 20 AI suggestion requests in an hour. Failed requests are not counted. Try again later. This request did not use your trial.','ai_limit')
}

export const tailorDependencies={authenticate,serviceDatabase,generateTailoringSuggestions}
type Dependencies=typeof tailorDependencies

export async function tailor(request:Request,env:NodeJS.ProcessEnv=process.env,deps:Dependencies=tailorDependencies):Promise<Response>{
 try{
  if(!env.APP_ORIGIN)throw new HttpError(503, 'AI tailoring is not configured', 'configuration')
  requirePost(request,env.APP_ORIGIN)
  const owner=await deps.authenticate(request,databaseConfig(env))
  const body=await jsonBody(request,160000)
  if(Object.keys(body).some(key=>!['consent','savedJobId','versionId','requestId'].includes(key)))throw new HttpError(400,'Tailoring request contains unsupported fields')
  if(body.consent!==true)throw new HttpError(400,'Consent is required')
  if(typeof body.savedJobId!=='string'||!UUID.test(body.savedJobId)||typeof body.versionId!=='string'||!UUID.test(body.versionId))throw new HttpError(400,'A saved job-specific resume is required')
  if(body.requestId!==undefined&&(typeof body.requestId!=='string'||!UUID.test(body.requestId)))throw new HttpError(400,'AI request identifier is invalid')
  const db=deps.serviceDatabase(env)
  const inputs=await db.rpc('job_tailoring_inputs',{p_owner:owner,p_saved_job:body.savedJobId,p_version:body.versionId})
  if(inputs.error){
   if(inputs.error.message.includes('not found'))throw new HttpError(404,'This saved job-specific resume is not available for tailoring.')
   throw new HttpError(503,'Unable to load tailoring inputs')
  }
  if(!record(inputs.data)||inputs.data.versionId!==body.versionId||inputs.data.savedJobId!==body.savedJobId
   ||typeof inputs.data.isPro!=='boolean'||!isResume(inputs.data.resume)||contentLength(inputs.data.resume)>maxContentChars)throw new HttpError(503,'Unable to load tailoring inputs')
  let job
  try{job=parseSavedJobSnapshot(inputs.data.job)}catch{throw new HttpError(503,'Unable to load tailoring inputs')}
  const jobDescription=job.descriptionText.trim()
  if(!jobDescription)throw new HttpError(409,'This saved job has no description available for tailoring.')
  const resume=providerResume(inputs.data.resume)
  const matchAnalysis=inputs.data.analysisCurrent===true?tailoringMatchContext(inputs.data.matchAnalysis):undefined
  const config=tailoringConfig(env)
  const id=typeof body.requestId==='string'?body.requestId:randomUUID()
  const fingerprint=createHash('sha256').update(JSON.stringify(buildTailoringRequestBody(resume,jobDescription,matchAnalysis))).digest('hex')
  // A Free trial run is reserved before the provider call, so simultaneous requests cannot
  // together exceed the trial, and released if the request fails, so a failure costs none.
  const trialRun=!inputs.data.isPro&&inputs.data.trial===true
  if(trialRun){
   const reserved=await db.rpc('product_reserve_trial_run',{p_owner:owner,p_saved_job:body.savedJobId,p_request:id})
   if(reserved.error)throw new HttpError(503,'Unable to check your Free trial. Nothing was used. Please try again.','ai_accounting')
   if(reserved.data==='exhausted'||reserved.data==='unavailable')throw new HttpError(402,'Your Free tailoring trial has no AI suggestion runs left for this application. Upgrade to Pro for more, or keep editing this resume yourself.')
  }
  let suggestions:Awaited<ReturnType<Dependencies['generateTailoringSuggestions']>>
  try{suggestions=await deps.generateTailoringSuggestions(config,{
   // The one Free trial substitutes for Pro only for its bound application.
   consent:true,pro:inputs.data.isPro||inputs.data.trial===true,
   reserve:async(maximum)=>observeOperation('ai_accounting', 'ai_reserve', async()=>{
    const reservation=await db.rpc('begin_ai_request',{p_request:id,p_owner:owner,p_max_micro_usd:maximum,p_feature:'tailoring',p_model:AI_MODEL,p_request_fingerprint:fingerprint})
    if(reservation.error)throw reservationError(reservation.error)
    if(reservation.data==='cooldown')throw new HttpError(409,'Your last request for this resume did not finish and may still have been processed. To avoid paying for it twice, try again in 10 minutes. It did not use your trial or hourly AI allowance.','ai_limit')
    if(reservation.data!=='reserved')throw new HttpError(409,'This tailoring request is already running or was recently completed.')
    return {
     start:async()=>observeOperation('ai_accounting','ai_start',async()=>{const result=await db.rpc('start_ai_request',{p_request:id});if(result.error)throw new HttpError(503,'AI accounting unavailable. Please try later.','ai_accounting')},'ai_accounting'),
     finish:async(outcome)=>observeOperation('ai_accounting','ai_finish',async()=>{
      emitDiagnostic('ai','provider_tailor',outcome.status==='succeeded'?'ok':outcome.status==='timed_out'?'provider_timeout':outcome.status==='invalid'?'provider_invalid':outcome.status==='failed'?'provider_failure':'ai_uncertain')
      const result=await db.rpc('finish_ai_request',{
      p_request:id,p_status:outcome.status,p_input_tokens:outcome.inputTokens??null,p_output_tokens:outcome.outputTokens??null,
      p_actual_cost_micro_usd:outcome.actualMicroUsd??null,p_provider_model:outcome.providerModel??null,
      p_provider_response_id:outcome.providerResponseId??null,p_provider_request_id:outcome.providerRequestId??null,
     });if(result.error)throw new HttpError(503,'AI accounting unavailable. Please try later.','ai_accounting')},'ai_accounting'),
    }
   },'ai_accounting')
  },resume,jobDescription,fetch,matchAnalysis)
  }catch(error){
   if(trialRun)await db.rpc('product_release_trial_run',{p_owner:owner,p_request:id})
   // No substitute output is ever returned: a failure is reported as a failure.
   if(error instanceof HttpError&&error.status>=500&&error.category!=='ai_accounting'&&error.category!=='ai_budget')
    throw new HttpError(error.status,`${error.message.replace(/\.$/,'')}. This failed request did not use your trial or hourly AI allowance.`,error.category)
   throw error
  }
  // A trial run counts only after a successful response, keyed by the AI request id so
  // a retried request is never counted twice. Accounting failure never hides results.
  let trialRunsRemaining:number|undefined
  if(trialRun){
   await db.rpc('product_record_trial_run',{p_owner:owner,p_saved_job:body.savedJobId,p_request:id})
   const status=await db.rpc('product_trial_status',{p_owner:owner,p_saved_job:body.savedJobId})
   if(!status.error&&record(status.data)&&typeof status.data.runsRemaining==='number')trialRunsRemaining=status.data.runsRemaining
  }
  return json(200,{suggestions,reviewRequired:true,...(trialRunsRemaining===undefined?{}:{trial:{runsRemaining:trialRunsRemaining}})})
 }catch(error){return safeError(error)}
}

export default {fetch:(request:Request)=>runObservedRequest('tailor', 'ai', () => tailor(request))}
