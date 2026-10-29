import { observeSync } from '../observability.js'
/** Deterministic V1 evidence analysis. Numerical weights are internal ranking aids only;
 * the public contract is Strong / Good / Stretch and never a hiring probability. */
import { createHash } from 'node:crypto'
import type { SearchCriteria } from './criteria.ts'
import type { MatchLabel, NormalizedJob } from './types.ts'
import { assessRoleRelevance, normalizeRoleText } from './relevance.ts'
import { extractPostingRequirements } from '../../src/lib/postingRequirements.ts'

export const MATCH_ANALYSIS_VERSION = 2
export type RequirementCategory = 'required' | 'preferred' | 'nice_to_have'
export type EvidenceStatus = 'demonstrated' | 'partially_demonstrated' | 'not_demonstrated' | 'confirmed_incompatible'
export type ClarificationValue = 'demonstrated' | 'not_have' | 'unsure'
export type MatchClarifications = Record<string, ClarificationValue>
export type ResumeEvidence = { headline: string; summary?: string; skills: string; roles: { title: string; description: string; dates?: string }[]; qualifications?: { section: string; title: string; description: string }[] }
/** origin 'user' = added by the owner; originalCategory is set when the owner corrected the posting's classification. */
export type RequirementAnalysis = { id: string; text: string; category: RequirementCategory; status: EvidenceStatus; evidence: string[]; origin?: 'posting' | 'user'; originalCategory?: RequirementCategory }
/** Owner edits to the extracted requirements for one application (never to the posting snapshot). */
export type RequirementEdits = { removed: string[]; categories: Record<string, RequirementCategory>; added: { id: string; text: string; category: RequirementCategory }[] }
export const EMPTY_REQUIREMENT_EDITS: RequirementEdits = { removed: [], categories: {}, added: [] }
export type FullMatchAnalysis = {
  version: typeof MATCH_ANALYSIS_VERSION; label: MatchLabel; resumeHash: string; jobHash: string; contextHash: string
  whyPromising: string; observations: string[]; importantWarning: string | null; seniorityMessage: string | null
  requirements: RequirementAnalysis[]; strengths: string[]; buriedEvidence: string[]; areasWorthStrengthening: string[]; constraints: string[]; deeperExplanation: string
}
export type MatchAnalysisView = Omit<FullMatchAnalysis, 'requirements'|'strengths'|'buriedEvidence'|'areasWorthStrengthening'|'constraints'|'deeperExplanation'> & {
  additionalAreasAnalyzed: number
  clarification?: { requirementId: string; text: string }
  limitedAnalysis?: { requirements: RequirementAnalysis[] }
  fullAnalysis?: Pick<FullMatchAnalysis, 'requirements'|'strengths'|'buriedEvidence'|'areasWorthStrengthening'|'constraints'|'deeperExplanation'> & { tailoringAction: 'Tailor my resume for this job' }
}
export type MatchResult = { label: MatchLabel; reasons: string[]; analysis: FullMatchAnalysis; rank: number; confirmedIncompatibility: boolean; searchEligible: boolean }

const MAX_SKILLS=40, MAX_SKILL_CHARS=60, MAX_ROLES=20, MAX_ROLE_CHARS=4000, MAX_QUALIFICATIONS=40, MAX_REQUIREMENTS=30
const STOPWORDS = new Set([
 'a','an','and','the','for','with','from','this','that','your','you','our','are','was','were','will','have','has','had','not','but','all','any','can','per','role','job','work','team','new','who','about','into','more','than','other','years','year','experience',
 'to','of','in','on','at','as','by','or','be','been','being','it','its','we','they','their','them','he','she','his','her','if','so','such','through','within','across','including','include','includes','etc','ability','abilities','able','skill','skills','knowledge','responsible','responsibilities','duties','function','functions','candidate','successful','strong','excellent','good','language','fluency','proficiency','proficient',
])
const REQUIREMENT_WORDS = new Set(['required','requirement','requirements','preferred','prefer','ideally','nice','must','mandatory','minimum','essential','need','needed','hold','active'])
const SENIOR=/\b(senior|sr\.?|lead|principal|staff|director|head|manager|chief|vp|vice president)\b/i
const JUNIOR=/\b(junior|jr\.?|entry[- ]level|associate|intern|trainee|graduate)\b/i
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)}
function clean(value:unknown,max:number):string{return typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max).trim():''}
function boundedString(value:unknown,max:number):value is string{return typeof value==='string'&&value.length<=max}
function boundedStringArray(value:unknown,limit:number,max:number):value is string[]{return Array.isArray(value)&&value.length<=limit&&value.every(item=>boundedString(item,max))}
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(record(value))return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;return JSON.stringify(value)}
export function matchHash(value:unknown):string{return createHash('sha256').update(stable(value)).digest('hex')}
export function parseSkills(skills:string):string[]{const seen=new Set<string>(),out:string[]=[];for(const raw of skills.split(/[,;\n]/)){const v=raw.trim(),key=v.toLowerCase();if(!v||v.length>MAX_SKILL_CHARS||seen.has(key))continue;seen.add(key);out.push(v);if(out.length>=MAX_SKILLS)break}return out}
function parseItems(value:unknown,limit:number,parser:(item:Record<string,unknown>)=>Record<string,string>|null):Record<string,string>[]{if(!Array.isArray(value))return[];const out:Record<string,string>[]=[];for(const item of value.slice(0,limit))if(record(item)){const parsed=parser(item);if(parsed)out.push(parsed)}return out}
export function parseResumeEvidence(value:unknown):ResumeEvidence|null{
 if(!record(value))return null
 const roles=parseItems(value.roles,MAX_ROLES,r=>{const title=clean(r.title,300),description=clean(r.description,MAX_ROLE_CHARS),dates=clean(r.dates,200);return title||description?{title,description,...(r.dates===undefined?{}:{dates})}:null}) as ResumeEvidence['roles']
 const qualifications=parseItems(value.qualifications,MAX_QUALIFICATIONS,q=>{const section=clean(q.section,200),title=clean(q.title,300),description=clean(q.description,2000);return title||description?{section,title,description}:null}) as ResumeEvidence['qualifications']
 return{headline:clean(value.headline,300),...(value.summary===undefined?{}:{summary:clean(value.summary,4000)}),skills:clean(value.skills,5000),roles,...(value.qualifications===undefined?{}:{qualifications})}
}
export function parseClarifications(value:unknown):MatchClarifications{if(value==null)return{};if(!record(value)||Object.keys(value).length>100)throw new Error('Invalid match clarifications');const out:MatchClarifications={};for(const[k,v]of Object.entries(value)){if(!/^[0-9a-f]{16}$/.test(k)||!['demonstrated','not_have','unsure'].includes(String(v)))throw new Error('Invalid match clarifications');out[k]=v as ClarificationValue}return out}
/** Re-validates analysis loaded from persistence before entitlement shaping sends it to
 * a browser. Persisted JSON is server-authored, but is still treated as untrusted input
 * so an old or malformed row fails closed instead of reaching the client. */
export function parseFullMatchAnalysis(value:unknown):FullMatchAnalysis|null{
 if(!record(value)||value.version!==MATCH_ANALYSIS_VERSION||!['strong','good','stretch'].includes(String(value.label))
  ||typeof value.resumeHash!=='string'||!/^[0-9a-f]{64}$/.test(value.resumeHash)
  ||typeof value.jobHash!=='string'||!/^[0-9a-f]{64}$/.test(value.jobHash)
  ||typeof value.contextHash!=='string'||!/^[0-9a-f]{64}$/.test(value.contextHash)
  ||!boundedString(value.whyPromising,1000)||!boundedStringArray(value.observations,3,1000)
  ||!(value.importantWarning===null||boundedString(value.importantWarning,1000))
  ||!(value.seniorityMessage===null||boundedString(value.seniorityMessage,1000))
  ||!Array.isArray(value.requirements)||value.requirements.length>MAX_REQUIREMENTS
  ||!value.requirements.every(req=>record(req)&&typeof req.id==='string'&&/^[0-9a-f]{16}$/.test(req.id)
   &&boundedString(req.text,400)&&['required','preferred','nice_to_have'].includes(String(req.category))
   &&['demonstrated','partially_demonstrated','not_demonstrated','confirmed_incompatible'].includes(String(req.status))
   &&boundedStringArray(req.evidence,5,1000)
   &&(req.origin===undefined||req.origin==='posting'||req.origin==='user')
   &&(req.originalCategory===undefined||['required','preferred','nice_to_have'].includes(String(req.originalCategory))))
  ||!boundedStringArray(value.strengths,10,1000)||!boundedStringArray(value.buriedEvidence,10,1000)
  ||!boundedStringArray(value.areasWorthStrengthening,10,1000)||!boundedStringArray(value.constraints,10,1000)
  ||!boundedString(value.deeperExplanation,2000))return null
 return value as unknown as FullMatchAnalysis
}
function tokens(text:string):string[]{return(normalizeRoleText(text).match(/[\p{L}\p{N}][\p{L}\p{N}+.#-]*/gu)??[]).map(token=>token.replace(/\.+$/,'')).filter(x=>x.length>=2&&!STOPWORDS.has(x))}
function requirementTokens(text:string):string[]{return tokens(text).filter(token=>!REQUIREMENT_WORDS.has(token))}
function evidenceText(e:ResumeEvidence):string{return[e.headline,e.summary??'',e.skills,...e.roles.flatMap(r=>[r.title,r.description]),...(e.qualifications??[]).flatMap(q=>[q.section,q.title,q.description])].join(' ').toLowerCase()}
function phraseAppears(text:string,phrase:string):boolean{const wanted=tokens(phrase),available=tokens(text);if(!wanted.length)return false;return available.some((_,start)=>wanted.every((token,index)=>available[start+index]===token))}
function requirementId(text:string):string{return matchHash(text.toLowerCase().replace(/\s+/g,' ').trim()).slice(0,16)}
export function jobMatchHash(job:NormalizedJob):string{return matchHash({id:job.id,title:job.title,description:job.descriptionText.slice(0,12000),location:job.location,workplace:job.workplace,employmentType:job.employmentType,salary:job.salary})}
// Extraction is shared with the browser-only public tools; duties and work-arrangement
// context ('other') are not qualifications and are excluded from Match requirements.
function extractRequirements(description:string):RequirementAnalysis[]{
 return extractPostingRequirements(description.slice(0,12000),{limit:MAX_REQUIREMENTS*2,maxLength:500})
  .filter((item):item is typeof item&{category:RequirementCategory}=>item.category!=='other')
  .slice(0,MAX_REQUIREMENTS)
  .map(item=>{const text=item.text.slice(0,400);return{id:requirementId(text),text,category:item.category,status:'not_demonstrated' as const,evidence:[]}})
}
/** Removes, reclassifies and adds requirements as the owner chose; evidence is then
 * classified the same way for every item, so an added requirement is never assumed met. */
export function applyRequirementEdits(requirements:RequirementAnalysis[],edits:RequirementEdits):RequirementAnalysis[]{
 const removed=new Set(edits.removed)
 const kept=requirements.filter(req=>!removed.has(req.id)).map(req=>{const category=edits.categories[req.id];return category&&category!==req.category?{...req,category,originalCategory:req.category,origin:'posting' as const}:{...req,origin:'posting' as const}})
 const added=edits.added.filter(item=>!kept.some(req=>req.text.toLowerCase()===item.text.toLowerCase())).map(item=>({id:item.id,text:item.text,category:item.category,status:'not_demonstrated' as const,evidence:[],origin:'user' as const}))
 return [...kept,...added].slice(0,MAX_REQUIREMENTS)
}
export function parseRequirementEdits(value:unknown):RequirementEdits{
 // A record with no edits is stored as the column default `{}`.
 if(value==null||(record(value)&&!Object.keys(value).length))return EMPTY_REQUIREMENT_EDITS
 const categories=['required','preferred','nice_to_have']
 if(!record(value)||!Array.isArray(value.removed)||value.removed.length>MAX_REQUIREMENTS||!value.removed.every(id=>typeof id==='string'&&/^[0-9a-f]{16}$/.test(id))
  ||!record(value.categories)||Object.keys(value.categories).length>MAX_REQUIREMENTS||!Object.entries(value.categories).every(([id,c])=>/^[0-9a-f]{16}$/.test(id)&&categories.includes(String(c)))
  ||!Array.isArray(value.added)||value.added.length>10||!value.added.every(item=>record(item)&&typeof item.text==='string'&&item.text.trim().length>=3&&item.text.length<=300&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item.text)&&categories.includes(String(item.category))))throw new Error('Invalid requirement edits')
 if(!value.removed.length&&!Object.keys(value.categories).length&&!value.added.length)return EMPTY_REQUIREMENT_EDITS
 return{removed:value.removed as string[],categories:value.categories as Record<string,RequirementCategory>,
  added:(value.added as {text:string;category:RequirementCategory}[]).map(item=>{const text=item.text.trim();return{id:requirementId(`user:${text}`),text,category:item.category}})}
}
function analyzeRequirement(req:RequirementAnalysis,evidence:ResumeEvidence,clarifications:MatchClarifications):RequirementAnalysis{
 const explicit=clarifications[req.id];if(explicit==='demonstrated')return{...req,status:'demonstrated',evidence:['Confirmed by you.']};if(explicit==='not_have')return{...req,status:req.category==='required'?'confirmed_incompatible':'not_demonstrated',evidence:['You confirmed this is not part of your current profile.']}
 const haystack=evidenceText(evidence),meaningful=[...new Set(requirementTokens(req.text))],evidenceTokens=new Set(tokens(haystack)),matched=meaningful.filter(t=>evidenceTokens.has(t));const exactSkill=parseSkills(evidence.skills).find(s=>phraseAppears(req.text,s));const ratio=meaningful.length?matched.length/meaningful.length:0
 // "Security" alone is not evidence of a security clearance. A clearance requirement
 // needs explicit clearance wording (or a recognized clearance level) in the resume.
 if(/\bsecurity clearance\b/i.test(req.text)){
  const clearanceEvidence=haystack.match(/\b(?:active\s+)?(?:top secret|secret|ts\/?sci)?\s*security clearance\b|\b(?:top secret|secret|ts\/?sci)\s+clearance\b|\bcleared\s+(?:professional|engineer|candidate|worker)\b/i)?.[0]
  if(!clearanceEvidence)return req
  return{...req,status:/\b(?:active|top secret|secret|ts\/?sci)\b/i.test(clearanceEvidence)?'demonstrated':'partially_demonstrated',evidence:[`Resume evidence: ${clearanceEvidence}.`]}
 }
 const exactSkillCoverage=exactSkill?requirementTokens(exactSkill).filter(token=>meaningful.includes(token)).length:0
 if((meaningful.length===1&&matched.length===1)||(matched.length>=2&&ratio>=.65)||(exactSkillCoverage>=2&&ratio>=.5)){const found=matched.slice(0,4).join(', ');return{...req,status:'demonstrated',evidence:[`Resume evidence: ${found}.`]}}
 if((matched.length>=2&&ratio>=.35)||(exactSkillCoverage>=1&&meaningful.length<=2))return{...req,status:'partially_demonstrated',evidence:[`Related resume wording: ${matched.slice(0,4).join(', ')}.`]};return req
}
function constraintObservations(job:NormalizedJob,criteria:SearchCriteria):string[]{const out:string[]=[];if(criteria.workplace&&job.workplace.value===criteria.workplace)out.push(`The listed ${job.workplace.value} arrangement matches your workplace preference.`);if(criteria.location&&Object.values(job.location.value).filter(Boolean).join(' ').toLowerCase().includes(criteria.location.toLowerCase()))out.push(`The listed location aligns with “${criteria.location}.”`);if(criteria.salary&&job.salary&&job.salary.currency===criteria.salary.currency&&job.salary.period===criteria.salary.period&&(criteria.salary.min==null||job.salary.max>=criteria.salary.min)&&(criteria.salary.max==null||job.salary.min<=criteria.salary.max))out.push(`The listed salary overlaps your stated ${criteria.salary.currency} ${criteria.salary.period==='year'?'annual':'hourly'} range.`);if(criteria.employmentType&&job.employmentType.value===criteria.employmentType)out.push('The listed employment type matches your preference.');return out}
function seniorityMessage(e:ResumeEvidence,j:NormalizedJob,occupationallyRelated:boolean):string|null{if(!occupationallyRelated)return null;const senior=SENIOR.test([e.headline,...e.roles.map(r=>r.title)].join(' '));if(SENIOR.test(j.title)&&!senior)return'This role appears more senior than the experience currently demonstrated in your resume.';if(JUNIOR.test(j.title)&&senior)return'This role appears less senior than the experience currently demonstrated in your resume.';return null}
function analyzeJobInternal(evidence:ResumeEvidence,job:NormalizedJob,criteria:SearchCriteria={title:job.title},clarifications:MatchClarifications={},edits:RequirementEdits=EMPTY_REQUIREMENT_EDITS):MatchResult{
 const relevance=assessRoleRelevance(evidence,job,criteria),requirements=applyRequirementEdits(extractRequirements(job.descriptionText),edits).map(r=>analyzeRequirement(r,evidence,clarifications)),titleSource=relevance.titleSource,matchedSkills=relevance.matchedSkills
 const demonstrated=requirements.filter(r=>r.status==='demonstrated'),partial=requirements.filter(r=>r.status==='partially_demonstrated'),unknownRequired=requirements.filter(r=>r.category==='required'&&r.status==='not_demonstrated'),incompatible=requirements.filter(r=>r.status==='confirmed_incompatible'),constraints=constraintObservations(job,criteria)
 const rank=relevance.score+(titleSource?15:0)+Math.min(24,matchedSkills.length*6)+demonstrated.length*5+partial.length*2+constraints.length*3-unknownRequired.length*4-incompatible.length*100
 const label:MatchLabel=incompatible.length?'stretch':(titleSource&&matchedSkills.length>=2)||(titleSource&&demonstrated.length>=2)?'strong':titleSource||matchedSkills.length>=1||rank>=25?'good':'stretch',observations:string[]=[]
 if(titleSource)observations.push(`Your “${titleSource}” title relates directly to this “${job.title}” role.`);if(matchedSkills.length)observations.push(`Resume evidence also named in the posting: ${matchedSkills.slice(0,5).join(', ')}.`);observations.push(...constraints);if(!observations.length)observations.push('The role’s main focus is not demonstrated in your current resume — a stretch, not a role that is off-limits to you.')
 const importantWarning=incompatible[0]?`Confirmed incompatibility: ${incompatible[0].text}`:unknownRequired[0]?`Important required qualification not demonstrated: ${unknownRequired[0].text}`:null,seniority=seniorityMessage(evidence,job,relevance.eligible),whyPromising=label==='strong'?'Several important parts of the role are clearly supported by your resume.':label==='good'?'Your resume shows relevant evidence, with some areas still worth reviewing.':'The role has limited demonstrated alignment or an important constraint to review.'
 const analysis:FullMatchAnalysis={version:MATCH_ANALYSIS_VERSION,label,resumeHash:matchHash(evidence),jobHash:jobMatchHash(job),contextHash:matchHash(edits===EMPTY_REQUIREMENT_EDITS?{criteria,clarifications}:{criteria,clarifications,edits}),whyPromising,observations:observations.slice(0,3),importantWarning,seniorityMessage:seniority,requirements,strengths:[...observations,...demonstrated.slice(0,5).map(r=>`Demonstrated: ${r.text}`)].slice(0,8),buriedEvidence:partial.map(r=>`Related evidence exists, but could be clearer: ${r.text}`).slice(0,8),areasWorthStrengthening:requirements.filter(r=>r.status==='not_demonstrated').map(r=>`${r.category==='required'?'Required':r.category==='preferred'?'Preferred':'Nice to have'} — not demonstrated: ${r.text}`).slice(0,10),constraints,deeperExplanation:`${whyPromising} ${unknownRequired.length?`${unknownRequired.length} required ${unknownRequired.length===1?'area is':'areas are'} not demonstrated, which is unknown rather than proof you lack them.`:'No required qualification extracted from the posting is currently unresolved.'}`}
 if (!job.descriptionText.trim()) {
   const missing = 'Add the job description before reviewing alignment. There is not enough posting information to assess this role.';
   analysis.whyPromising = missing;
   analysis.observations = [missing];
   analysis.importantWarning = null;
   analysis.seniorityMessage = null;
   analysis.strengths = [];
   analysis.deeperExplanation = missing;
 }
 return{label,reasons:analysis.observations,analysis,rank,confirmedIncompatibility:incompatible.length>0,searchEligible:relevance.eligible}
}
export function matchJob(evidence:ResumeEvidence,job:NormalizedJob):MatchResult{return analyzeJob(evidence,job)}
export function analysisView(analysis:FullMatchAnalysis,isPro:boolean):MatchAnalysisView{const{requirements,strengths,buriedEvidence,areasWorthStrengthening,constraints,deeperExplanation,...preview}=analysis,unknown=requirements.find(r=>r.category==='required'&&(r.status==='not_demonstrated'||r.status==='confirmed_incompatible')),limited=requirements.slice().sort((a,b)=>['required','preferred','nice_to_have'].indexOf(a.category)-['required','preferred','nice_to_have'].indexOf(b.category)).slice(0,1);return{...preview,observations:preview.observations.slice(0,3),additionalAreasAnalyzed:Math.max(0,requirements.length-(isPro?0:limited.length)),...(unknown?{clarification:{requirementId:unknown.id,text:unknown.text}}:{}),...(!isPro&&limited.length?{limitedAnalysis:{requirements:limited}}:{}),...(isPro?{fullAnalysis:{requirements,strengths,buriedEvidence,areasWorthStrengthening,constraints,deeperExplanation,tailoringAction:'Tailor my resume for this job' as const}}:{})}}

export const analyzeJob: typeof analyzeJobInternal = (...args) => observeSync('match', 'match_analyze', () => analyzeJobInternal(...args))
