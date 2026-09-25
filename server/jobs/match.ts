import { observeSync } from '../observability.js'
/** Deterministic V1 evidence analysis. Numerical weights are internal ranking aids only;
 * the public contract is Strong / Good / Stretch and never a hiring probability. */
import { createHash } from 'node:crypto'
import type { SearchCriteria } from './criteria.ts'
import type { MatchLabel, NormalizedJob } from './types.ts'

export const MATCH_ANALYSIS_VERSION = 1
export type RequirementCategory = 'required' | 'preferred' | 'nice_to_have'
export type EvidenceStatus = 'demonstrated' | 'partially_demonstrated' | 'not_demonstrated' | 'confirmed_incompatible'
export type ClarificationValue = 'demonstrated' | 'not_have' | 'unsure'
export type MatchClarifications = Record<string, ClarificationValue>
export type ResumeEvidence = { headline: string; summary?: string; skills: string; roles: { title: string; description: string; dates?: string }[]; qualifications?: { section: string; title: string; description: string }[] }
export type RequirementAnalysis = { id: string; text: string; category: RequirementCategory; status: EvidenceStatus; evidence: string[] }
export type FullMatchAnalysis = {
  version: typeof MATCH_ANALYSIS_VERSION; label: MatchLabel; resumeHash: string; jobHash: string; contextHash: string
  whyPromising: string; observations: string[]; importantWarning: string | null; seniorityMessage: string | null
  requirements: RequirementAnalysis[]; strengths: string[]; buriedEvidence: string[]; areasWorthStrengthening: string[]; constraints: string[]; deeperExplanation: string
}
export type MatchAnalysisView = Omit<FullMatchAnalysis, 'requirements'|'strengths'|'buriedEvidence'|'areasWorthStrengthening'|'constraints'|'deeperExplanation'> & {
  additionalAreasAnalyzed: number
  clarification?: { requirementId: string; text: string }
  fullAnalysis?: Pick<FullMatchAnalysis, 'requirements'|'strengths'|'buriedEvidence'|'areasWorthStrengthening'|'constraints'|'deeperExplanation'> & { tailoringAction: 'Tailor my resume for this job' }
}
export type MatchResult = { label: MatchLabel; reasons: string[]; analysis: FullMatchAnalysis; rank: number; confirmedIncompatibility: boolean }

const MAX_SKILLS=40, MAX_SKILL_CHARS=60, MAX_ROLES=20, MAX_ROLE_CHARS=4000, MAX_QUALIFICATIONS=40, MAX_REQUIREMENTS=30
const STOPWORDS = new Set(['and','the','for','with','from','this','that','your','you','our','are','was','were','will','have','has','had','not','but','all','any','can','per','role','job','work','team','new','who','about','into','more','than','other','years','year','experience'])
const REQUIREMENT_WORDS = new Set(['required','requirement','requirements','preferred','prefer','ideally','nice','must','mandatory','minimum','essential','need','needed','hold','active'])
const TITLE_MODIFIERS = new Set(['senior','sr','junior','jr','lead','principal','staff','director','head','chief','vp','vice','president','entry-level','associate','intern','trainee','graduate'])
const GENERIC_TITLE_WORDS = new Set(['engineer','developer','manager','specialist','analyst','coordinator','consultant','officer'])
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
   &&boundedStringArray(req.evidence,5,1000))
  ||!boundedStringArray(value.strengths,10,1000)||!boundedStringArray(value.buriedEvidence,10,1000)
  ||!boundedStringArray(value.areasWorthStrengthening,10,1000)||!boundedStringArray(value.constraints,10,1000)
  ||!boundedString(value.deeperExplanation,2000))return null
 return value as unknown as FullMatchAnalysis
}
function tokens(text:string):string[]{return(text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+.#-]*/gu)??[]).map(token=>token.replace(/\.+$/,'')).filter(x=>x.length>=2&&!STOPWORDS.has(x))}
function requirementTokens(text:string):string[]{return tokens(text).filter(token=>!REQUIREMENT_WORDS.has(token))}
function evidenceText(e:ResumeEvidence):string{return[e.headline,e.summary??'',e.skills,...e.roles.flatMap(r=>[r.title,r.description]),...(e.qualifications??[]).flatMap(q=>[q.section,q.title,q.description])].join(' ').toLowerCase()}
function phraseAppears(text:string,phrase:string):boolean{const wanted=tokens(phrase),available=tokens(text);if(!wanted.length)return false;return available.some((_,start)=>wanted.every((token,index)=>available[start+index]===token))}
function titlesRelate(left:string,right:string):boolean{const a=tokens(left).filter(token=>!TITLE_MODIFIERS.has(token)),b=tokens(right).filter(token=>!TITLE_MODIFIERS.has(token));if(!a.length||!b.length)return false;if(a.join(' ')===b.join(' '))return true;const distinctiveA=a.filter(token=>!GENERIC_TITLE_WORDS.has(token)),distinctiveB=b.filter(token=>!GENERIC_TITLE_WORDS.has(token));return distinctiveA.length>0&&distinctiveB.length>0&&distinctiveA.some(token=>distinctiveB.includes(token))}
function requirementId(text:string):string{return matchHash(text.toLowerCase().replace(/\s+/g,' ').trim()).slice(0,16)}
export function jobMatchHash(job:NormalizedJob):string{return matchHash({id:job.id,title:job.title,description:job.descriptionText.slice(0,12000),location:job.location,workplace:job.workplace,employmentType:job.employmentType,salary:job.salary})}
function categoryFor(text:string,heading:RequirementCategory|null):RequirementCategory|null{if(/\b(not required|no [^.]{0,50} required|do(?:es)? not need|does not require)\b/i.test(text))return null;if(/\b(nice to have|nice-to-have|desirable|a bonus|bonus points)\b/i.test(text))return'nice_to_have';if(/\b(preferred|ideally|preference|would be a plus|is a plus|plus:)\b/i.test(text))return'preferred';if(/\b(required|requirements?|must|minimum|need(?:ed)?|mandatory|essential|license[ds]?|certification|certified|work authorization|eligible to work|\d+\+?\s+years?)\b/i.test(text))return'required';return heading}
function extractRequirements(description:string):RequirementAnalysis[]{
 const chunks=description.slice(0,12000).split(/\n+|(?<=[.!?;])\s+/).map(x=>x.replace(/^[\s•*\-–—]+/,'').trim()).filter(Boolean),out:RequirementAnalysis[]=[];const seen=new Set<string>();let heading:RequirementCategory|null=null
 for(const chunk of chunks){if(chunk.length<=80&&/^(required|requirements|minimum qualifications?)\s*:?$/i.test(chunk)){heading='required';continue}if(chunk.length<=80&&/^(preferred|preferred qualifications?)\s*:?$/i.test(chunk)){heading='preferred';continue}if(chunk.length<=80&&/^(nice to have|nice-to-have|desirable)\s*:?$/i.test(chunk)){heading='nice_to_have';continue}if(chunk.length<=80&&/:$/.test(chunk)){heading=null;continue}const category=categoryFor(chunk,heading);if(!category||chunk.length<8||chunk.length>500)continue;const text=chunk.replace(/\s+/g,' ').slice(0,400),key=text.toLowerCase();if(seen.has(key))continue;seen.add(key);out.push({id:requirementId(text),text,category,status:'not_demonstrated',evidence:[]});if(out.length>=MAX_REQUIREMENTS)break}return out
}
function analyzeRequirement(req:RequirementAnalysis,evidence:ResumeEvidence,clarifications:MatchClarifications):RequirementAnalysis{
 const explicit=clarifications[req.id];if(explicit==='demonstrated')return{...req,status:'demonstrated',evidence:['Confirmed by you.']};if(explicit==='not_have')return{...req,status:req.category==='required'?'confirmed_incompatible':'not_demonstrated',evidence:['You confirmed this is not part of your current profile.']}
 const haystack=evidenceText(evidence),meaningful=[...new Set(requirementTokens(req.text))],evidenceTokens=new Set(tokens(haystack)),matched=meaningful.filter(t=>evidenceTokens.has(t));const exactSkill=parseSkills(evidence.skills).find(s=>phraseAppears(req.text,s))
 if(exactSkill||(meaningful.length>0&&matched.length/meaningful.length>=.6)){const found=exactSkill??matched.slice(0,4).join(', ');return{...req,status:'demonstrated',evidence:[`Resume evidence: ${found}.`]}}
 if(matched.length>=2||(meaningful.length>0&&matched.length/meaningful.length>=.3))return{...req,status:'partially_demonstrated',evidence:[`Related resume wording: ${matched.slice(0,4).join(', ')}.`]};return req
}
function constraintObservations(job:NormalizedJob,criteria:SearchCriteria):string[]{const out:string[]=[];if(criteria.workplace&&job.workplace.value===criteria.workplace)out.push(`The listed ${job.workplace.value} arrangement matches your workplace preference.`);if(criteria.location&&Object.values(job.location.value).filter(Boolean).join(' ').toLowerCase().includes(criteria.location.toLowerCase()))out.push(`The listed location aligns with “${criteria.location}.”`);if(criteria.salary&&job.salary&&job.salary.currency===criteria.salary.currency&&job.salary.period===criteria.salary.period&&(criteria.salary.min==null||job.salary.max>=criteria.salary.min)&&(criteria.salary.max==null||job.salary.min<=criteria.salary.max))out.push(`The listed salary overlaps your stated ${criteria.salary.currency} ${criteria.salary.period==='year'?'annual':'hourly'} range.`);if(criteria.employmentType&&job.employmentType.value===criteria.employmentType)out.push('The listed employment type matches your preference.');return out}
function seniorityMessage(e:ResumeEvidence,j:NormalizedJob):string|null{const senior=SENIOR.test([e.headline,...e.roles.map(r=>r.title)].join(' '));if(SENIOR.test(j.title)&&!senior)return'This role appears more senior than the experience currently demonstrated in your resume.';if(JUNIOR.test(j.title)&&senior)return'This role appears less senior than the experience currently demonstrated in your resume.';return null}
function analyzeJobInternal(evidence:ResumeEvidence,job:NormalizedJob,criteria:SearchCriteria={title:job.title},clarifications:MatchClarifications={}):MatchResult{
 const requirements=extractRequirements(job.descriptionText).map(r=>analyzeRequirement(r,evidence,clarifications)),titleSource=[evidence.headline,...evidence.roles.map(r=>r.title)].find(title=>titlesRelate(title,job.title))??null,matchedSkills=parseSkills(evidence.skills).filter(s=>phraseAppears(job.descriptionText,s))
 const demonstrated=requirements.filter(r=>r.status==='demonstrated'),partial=requirements.filter(r=>r.status==='partially_demonstrated'),unknownRequired=requirements.filter(r=>r.category==='required'&&r.status==='not_demonstrated'),incompatible=requirements.filter(r=>r.status==='confirmed_incompatible'),constraints=constraintObservations(job,criteria)
 const rank=(titleSource?35:0)+Math.min(30,matchedSkills.length*8)+demonstrated.length*5+partial.length*2+constraints.length*3-unknownRequired.length*4-incompatible.length*100
 const label:MatchLabel=incompatible.length?'stretch':(titleSource&&matchedSkills.length>=2)||rank>=55?'strong':titleSource||matchedSkills.length>=1||rank>=25?'good':'stretch',observations:string[]=[]
 if(titleSource)observations.push(`Your “${titleSource}” title relates directly to this “${job.title}” role.`);if(matchedSkills.length)observations.push(`Resume evidence also named in the posting: ${matchedSkills.slice(0,5).join(', ')}.`);observations.push(...constraints);if(!observations.length)observations.push('The role’s main focus is not demonstrated in your current resume — a stretch, not a role that is off-limits to you.')
 const importantWarning=incompatible[0]?`Confirmed incompatibility: ${incompatible[0].text}`:unknownRequired[0]?`Important required qualification not demonstrated: ${unknownRequired[0].text}`:null,seniority=seniorityMessage(evidence,job),whyPromising=label==='strong'?'Several important parts of the role are clearly supported by your resume.':label==='good'?'Your resume shows relevant evidence, with some areas still worth reviewing.':'The role has limited demonstrated alignment or an important constraint to review.'
 const analysis:FullMatchAnalysis={version:MATCH_ANALYSIS_VERSION,label,resumeHash:matchHash(evidence),jobHash:jobMatchHash(job),contextHash:matchHash({criteria,clarifications}),whyPromising,observations:observations.slice(0,3),importantWarning,seniorityMessage:seniority,requirements,strengths:[...observations,...demonstrated.slice(0,5).map(r=>`Demonstrated: ${r.text}`)].slice(0,8),buriedEvidence:partial.map(r=>`Related evidence exists, but could be clearer: ${r.text}`).slice(0,8),areasWorthStrengthening:requirements.filter(r=>r.status==='not_demonstrated').map(r=>`${r.category==='required'?'Required':r.category==='preferred'?'Preferred':'Nice to have'} — not demonstrated: ${r.text}`).slice(0,10),constraints,deeperExplanation:`${whyPromising} ${unknownRequired.length?`${unknownRequired.length} required ${unknownRequired.length===1?'area is':'areas are'} not demonstrated, which is unknown rather than proof you lack them.`:'No required qualification extracted from the posting is currently unresolved.'}`}
 return{label,reasons:analysis.observations,analysis,rank,confirmedIncompatibility:incompatible.length>0}
}
export function matchJob(evidence:ResumeEvidence,job:NormalizedJob):MatchResult{return analyzeJob(evidence,job)}
export function analysisView(analysis:FullMatchAnalysis,isPro:boolean):MatchAnalysisView{const{requirements,strengths,buriedEvidence,areasWorthStrengthening,constraints,deeperExplanation,...preview}=analysis,unknown=requirements.find(r=>r.category==='required'&&(r.status==='not_demonstrated'||r.status==='confirmed_incompatible'));return{...preview,observations:preview.observations.slice(0,3),additionalAreasAnalyzed:requirements.length,...(unknown?{clarification:{requirementId:unknown.id,text:unknown.text}}:{}),...(isPro?{fullAnalysis:{requirements,strengths,buriedEvidence,areasWorthStrengthening,constraints,deeperExplanation,tailoringAction:'Tailor my resume for this job' as const}}:{})}}

export const analyzeJob: typeof analyzeJobInternal = (...args) => observeSync('match', 'match_analyze', () => analyzeJobInternal(...args))
