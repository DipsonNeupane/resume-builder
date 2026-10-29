import type { SearchCriteria } from './criteria.ts'
import type { ResumeEvidence } from './match.ts'
import type { NormalizedJob } from './types.ts'

export type RoleRelevance = {
  eligible: boolean
  score: number
  titleSource: string | null
  matchedSkills: string[]
  sharedTitleTerms: string[]
  sharedFamilies: string[]
}

const WORD_NOISE = new Set([
  'a','an','and','at','be','by','for','from','in','into','is','of','on','or','the','to','with',
  'full','part','time','remote','hybrid','onsite','position','role','job','opening','opportunity',
])
const TITLE_MODIFIERS = new Set([
  'senior','sr','junior','jr','lead','principal','staff','director','head','chief','vp','vice',
  'president','entry','level','associate','intern','trainee','graduate','i','ii','iii','iv',
])
const GENERIC_TITLES = new Set([
  'engineer','developer','manager','specialist','analyst','coordinator','consultant','officer',
  'technician','assistant','administrator','supervisor','professional','member','representative',
])

const FAMILY_TERMS: Record<string, Set<string>> = {
  software: new Set(['software','java','javascript','typescript','python','golang','ruby','php','dotnet','net','backend','frontend','fullstack','web','mobile','android','ios','devops','sre','programmer','coding','cloud','api']),
  data: new Set(['data','analytics','bi','sql','database','machine','learning','scientist','statistician']),
  healthcare: new Set(['nurse','nursing','rn','clinical','clinician','medical','healthcare','physician','pharmacy','pharmacist','therapist','patient']),
  education: new Set(['teacher','teaching','educator','education','school','curriculum','instructor','professor','tutor']),
  culinary: new Set(['chef','cook','culinary','kitchen','baker','pastry','restaurant','catering']),
  retail: new Set(['retail','keyholder','cashier','merchandising','store','salesfloor']),
  facilities: new Set(['maintenance','facilities','facility','hvac','electrician','plumber','mechanic','repair','custodian']),
  finance: new Set(['finance','financial','accountant','accounting','audit','auditor','banking','investment','securitized','trading','underwriter']),
  operations: new Set(['operations','logistics','supply','warehouse','procurement','inventory','distribution']),
  marketing: new Set(['marketing','brand','seo','content','copywriter','advertising','campaign']),
  creative: new Set(['designer','design','creative','illustrator','animation','photographer','videographer','ux','ui']),
  research: new Set(['research','researcher','laboratory','scientist','science','academic']),
  support: new Set(['support','service','helpdesk','customer','success','callcenter']),
  legal: new Set(['legal','lawyer','attorney','paralegal','counsel','compliance']),
  people: new Set(['recruiter','recruiting','human','resources','hr','talent','people']),
  commercial: new Set(['sales','selling','business','development','account','executive','revenue']),
  construction: new Set(['construction','carpenter','welder','mason','foreman','site']),
}
const DOMAIN_ONLY_FAMILIES = new Set(['software', 'data'])
const CONFLICTING_FUNCTION_FAMILIES = new Set(['commercial', 'people', 'retail', 'culinary', 'facilities'])

const SKILL_ALIASES: Record<string, string[]> = {
  'node.js': ['nodejs', 'node'],
  'node js': ['nodejs', 'node'],
  'javascript': ['javascript', 'js'],
  'typescript': ['typescript'],
  '.net': ['dotnet', 'net'],
  'c#': ['c#', 'csharp'],
  'full stack': ['fullstack'],
  'full-stack': ['fullstack'],
  'registered nurse': ['registered', 'nurse', 'rn'],
}

export function normalizeRoleText(value: string): string {
  return value
    .replace(/([\p{Ll}\d])([\p{Lu}])/gu, '$1 $2')
    .replace(/\.net/gi, ' dotnet ')
    .replace(/full[\s-]*stack/gi, ' fullstack ')
    .replace(/front[\s-]*end/gi, ' frontend ')
    .replace(/back[\s-]*end/gi, ' backend ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function roleTokens(value: string): string[] {
  return normalizeRoleText(value).split(' ').map(token => token.replace(/^\.+|\.+$/g, '')).filter(token => token.length >= 2 && !WORD_NOISE.has(token))
}

function distinctiveTitleTokens(value: string): string[] {
  return roleTokens(value).filter(token => !TITLE_MODIFIERS.has(token) && !GENERIC_TITLES.has(token))
}

function families(value: string): Set<string> {
  const available = new Set(roleTokens(value))
  const found = new Set<string>()
  for (const [family, terms] of Object.entries(FAMILY_TERMS)) {
    if ([...terms].some(term => available.has(term))) found.add(family)
  }
  if (available.has('application') && available.has('developer')) found.add('software')
  return found
}

function intersection<T>(left: Set<T>, right: Set<T>): T[] {
  return [...left].filter(value => right.has(value))
}

function normalizedSkillTerms(skill: string): string[] {
  const normalized = normalizeRoleText(skill)
  return SKILL_ALIASES[normalized] ?? roleTokens(normalized)
}

function phraseTokensAppear(text: string, wanted: string[]): boolean {
  if (!wanted.length) return false
  const available = new Set(roleTokens(text))
  return wanted.every(term => available.has(term))
}

function titleRelationship(source: string, target: string): { related: boolean; shared: string[]; sharedFamilies: string[] } {
  const sourceTokens = new Set(roleTokens(source).filter(token => !TITLE_MODIFIERS.has(token)))
  const targetTokens = new Set(roleTokens(target).filter(token => !TITLE_MODIFIERS.has(token)))
  const sourceCore = new Set([...sourceTokens].filter(token => !GENERIC_TITLES.has(token)))
  const targetCore = new Set([...targetTokens].filter(token => !GENERIC_TITLES.has(token)))
  const shared = intersection(sourceCore, targetCore)
  const sourceFamilies = families(source)
  const targetFamilies = families(target)
  const sharedFamilies = intersection(sourceFamilies, targetFamilies)
  const sharedFunctions = intersection(new Set([...sourceTokens].filter(token => GENERIC_TITLES.has(token))), new Set([...targetTokens].filter(token => GENERIC_TITLES.has(token))))
  const targetHasConflictingFunction = [...targetFamilies].some(family => CONFLICTING_FUNCTION_FAMILIES.has(family) && !sourceFamilies.has(family))
  const familyRelated = sharedFamilies.some(family => !DOMAIN_ONLY_FAMILIES.has(family) || sharedFunctions.length > 0 || !targetHasConflictingFunction)
  const exact = normalizeRoleText(source) === normalizeRoleText(target)
  // Shared technology/domain words do not turn "Software Sales Manager" into an
  // engineering role. A conflicting occupational function defeats domain-only overlap.
  const concreteShared = shared.filter(term => ![...DOMAIN_ONLY_FAMILIES].some(family => FAMILY_TERMS[family]?.has(term)))
  return { related: exact || concreteShared.length > 0 || familyRelated, shared, sharedFamilies }
}

export function assessRoleRelevance(
  evidence: ResumeEvidence,
  job: NormalizedJob,
  criteria: SearchCriteria = { title: job.title },
): RoleRelevance {
  const resumeTitles = [evidence.headline, ...evidence.roles.map(role => role.title)].filter(Boolean)
  let titleSource: string | null = null
  const sharedTitleTerms = new Set<string>()
  const sharedFamilies = new Set<string>()
  for (const source of resumeTitles) {
    const relationship = titleRelationship(source, job.title)
    relationship.shared.forEach(term => sharedTitleTerms.add(term))
    relationship.sharedFamilies.forEach(family => sharedFamilies.add(family))
    if (!titleSource && relationship.related) titleSource = source
  }

  const searchableJob = `${job.title} ${job.descriptionText.slice(0, 6000)}`
  const matchedSkills = evidence.skills
    .split(/[,;\n]/)
    .map(skill => skill.trim())
    .filter(skill => skill.length >= 2 && skill.length <= 60)
    .filter(skill => phraseTokensAppear(searchableJob, normalizedSkillTerms(skill)))
    .slice(0, 8)

  const exactTitle = resumeTitles.some(title => normalizeRoleText(title) === normalizeRoleText(job.title))
  const queryRelationship = titleRelationship(criteria.title, job.title)
  const score = (exactTitle ? 60 : 0)
    + Math.min(35, sharedTitleTerms.size * 25)
    + Math.min(30, sharedFamilies.size * 20)
    + Math.min(24, matchedSkills.length * 8)

  // A provider candidate must have an occupational/title relationship to the explicit
  // search intent or a resume title. Skills affect ranking/evidence but cannot rescue an
  // unrelated title. Generic wording and quota pressure never create eligibility.
  const eligible = queryRelationship.related || exactTitle || titleSource !== null

  return {
    eligible,
    score,
    titleSource,
    matchedSkills,
    sharedTitleTerms: [...sharedTitleTerms],
    sharedFamilies: [...sharedFamilies],
  }
}
