/** Deterministic support checks for one AI tailoring suggestion, shared by the server
 * (server/ai/tailoring.ts) and the review panel so both reach the same verdict.
 *
 * A valid requirement id and a quote found in the source field make a suggestion
 * traceable; they do not show that the proposed wording is supported. These checks look
 * for specific, common ways a rewrite claims more than the source says: added numbers,
 * added responsibility, seniority, outcomes or credentials, a dropped negation, wording
 * taken from the job rather than the resume, and quotes that are negated or unrelated to
 * the rewrite. They are heuristics over words, not a fact checker: passing them does not
 * prove a suggestion is true, and the person reviewing it remains responsible for that.
 *
 * Pure and dependency-free so it runs unchanged in the browser and on the server. */

export type SupportIssue =
  | { kind: 'no_requirement' }
  | { kind: 'incompatible_requirement'; requirement: string }
  | { kind: 'no_support' }
  | { kind: 'negated_quote'; quote: string }
  | { kind: 'irrelevant_quote'; quote: string }
  | { kind: 'new_number'; term: string }
  | { kind: 'added_claim'; term: string }
  | { kind: 'dropped_negation'; term: string }
  | { kind: 'job_wording'; term: string }

export type SupportInput = {
  originalText: string
  suggestedText: string
  /** Quotes already verified to occur in originalText. */
  quotes: string[]
  requirements: { text: string; status?: string }[]
  /** Posting text; wording from it that the resume field does not contain is flagged. */
  jobText?: string
  /** Facts the person wrote themselves to support the suggestion. */
  userFacts?: string
}

export type SupportAssessment = {
  /** Every check passed: at least one relevant requirement, at least one relevant
   * supporting quote or user fact, and no added or contradicted claim. */
  supported: boolean
  /** Quotes that survived the negation and relevance checks. */
  quotes: string[]
  /** Whether a user-written fact counted as support. */
  userFactUsed: boolean
  issues: SupportIssue[]
}

const MAX_TERMS_PER_KIND = 3

const fold = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
const words = (text: string): string[] => fold(text).match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? []

/** Deliberately crude suffix folding: the same function is applied to both sides, so
 * "resolve", "resolved", "resolves" and "resolving" compare equal. */
export function stem(word: string): string {
  let w = word.toLocaleLowerCase().replace(/['’]s$/, '')
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  if (w.length > 5 && w.endsWith('ly')) w = w.slice(0, -2)
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1)
  return w
}

const STOP = new Set(`a an and or but the to of in on at by for from with without into onto via per as is are was were be been being
this that these those it its their his her our my your you we they them i me us who whom whose which what where when while
across including include includes using use used through throughout within over under about around between among after before
during than then also both each other such so very more most less least can could will would should may might must do does did
done has have had having not no nor never none any some all every own same new etc`.split(/\s+/).map(stem))

/** Neutral wording a rewrite may swap freely: these words do not change what was done,
 * how much, or at what level. Anything outside these groups that comes from the job and
 * not from the resume is still flagged. Kept short on purpose. */
const SYNONYMS = [
  'help support assist serve aid', 'answer respond reply address', 'customer client guest patron user shopper',
  'work collaborate partner', 'use utilize apply', 'document record log note', 'phone telephone call',
  'chat message messaging', 'email e-mail', 'colleague coworker teammate staff', 'shop store retailer',
  'role position job', 'weekly week', 'daily day', 'monthly month', 'channel medium', 'across over', 'provide offer give',
].map(group => group.split(' ').map(stem))
const SYNONYM_GROUP = new Map(SYNONYMS.flatMap((group, i) => group.map(word => [word, i] as const)))
const covered = (s: string, stems: Set<string>) => stems.has(s) || (SYNONYM_GROUP.has(s) && SYNONYMS[SYNONYM_GROUP.get(s)!].some(other => stems.has(other)))

const contentStems = (text: string): Set<string> => new Set(words(text).filter(w => w.length >= 3 && !/^\p{N}+$/u.test(w)).map(stem).filter(s => s.length >= 3 && !STOP.has(s)))

/** Responsibility, seniority, outcome, credential and exclusivity wording. Each pattern
 * matches every inflection, so "manage", "managed", "manager" and "management" are one
 * claim. A rewrite may keep such a word only if the source (or the user's fact) has it. */
const CLAIMS: { key: string; pattern: RegExp }[] = [
  ['lead', /\b(?:lead|leads|leading|leader|leaders|leadership|led)\b/],
  ['manage', /\bmanag(?:e|es|ed|ing|er|ers|ement)\b/],
  ['supervise', /\bsupervis(?:e|es|ed|ing|or|ors|ion)\b/],
  ['direct', /\b(?:directed|directing|director|directors|direction)\b/],
  ['head', /\b(?:headed|heading up|head of)\b/],
  ['oversee', /\b(?:oversee|oversees|overseeing|oversaw|oversight)\b/],
  ['spearhead', /\bspearhead(?:s|ed|ing)?\b/],
  ['own', /\b(?:owned|owning|ownership|owner)\b/],
  ['mentor', /\b(?:mentor|mentors|mentored|mentoring|coached|coaching)\b/],
  ['train', /\b(?:trained|training|trainer|trains)\b/],
  ['hire', /\b(?:hired|hiring|recruited|recruiting)\b/],
  ['budget', /\bbudgets?\b/],
  ['senior', /\b(?:senior|principal|chief|expert|experts|expertise|veteran|seasoned)\b/],
  ['increase', /\b(?:increas(?:e|es|ed|ing)|improv(?:e|es|ed|ing|ement|ements)|reduc(?:e|es|ed|ing|tion)|boost(?:s|ed|ing)?|grew|grow(?:s|ing|th)?|cut|cuts|cutting|faster|quicker|lower(?:ed|ing))\b/],
  ['achieve', /\b(?:achiev(?:e|es|ed|ing|ement|ements)|exceed(?:s|ed|ing)?|surpass(?:es|ed|ing)?|award(?:s|ed)?|record-breaking)\b/],
  ['ensure', /\b(?:ensur(?:e|es|ed|ing)|guarantee(?:s|d)?)\b/],
  ['effective', /\b(?:efficient(?:ly)?|effective(?:ly)?|successful(?:ly)?|significant(?:ly)?|consistently|exceptional(?:ly)?|outstanding|proven)\b/],
  ['certified', /\b(?:certified|certification|certifications|certificate|licensed|license|licence|accredited|qualified|registered|degree)\b/],
  ['sole', /\b(?:sole|solely|single-handedly|independently|entire|entirely)\b/],
].map(([key, pattern]) => ({ key: key as string, pattern: new RegExp((pattern as RegExp).source, 'iu') }))

const NUMBER_WORDS = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|fifty|hundred|hundreds|thousand|thousands|million|millions|dozen|dozens|double|doubled|triple|tripled|half|percent|multiple|several|numerous)\b/giu
const DIGITS = /(?<![\p{Nd}])\p{Nd}[\p{Nd},.:]*%?(?![\p{Nd}])/gu
const NEGATION = /\b(?:not|no|never|without|none|nor|neither|cannot)\b|n['’]t\b/giu

function counts(values: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1)
  return map
}

function numbers(text: string): string[] {
  const folded = fold(text)
  return [...(folded.match(DIGITS) ?? []), ...(folded.match(NUMBER_WORDS) ?? [])]
}

/** True when the quote's first occurrence in the source sits inside a negation: a negation
 * word in the quote itself, or within the four words before it in the same sentence. */
function negatedInSource(quote: string, source: string): boolean {
  const q = fold(quote)
  const s = fold(source)
  if (new RegExp(NEGATION.source, 'iu').test(q)) return true
  const at = s.indexOf(q)
  if (at < 0) return false
  const before = s.slice(0, at).split(/[.;!?]/).pop() ?? ''
  return new RegExp(NEGATION.source, 'iu').test(before.trim().split(' ').slice(-4).join(' '))
}

export function assessSupport(input: SupportInput): SupportAssessment {
  const issues: SupportIssue[] = []
  const suggested = fold(input.suggestedText)
  const userFacts = (input.userFacts ?? '').trim()
  const evidence = `${input.originalText}\n${userFacts}`
  const suggestedStems = contentStems(suggested)
  const evidenceStems = contentStems(evidence)

  // Requirements: at least one must relate to the rewrite and must not be one the
  // person said they do not have.
  const related = input.requirements.filter(requirement => [...contentStems(requirement.text)].some(s => covered(s, suggestedStems)))
  if (!related.length) issues.push({ kind: 'no_requirement' })
  const incompatible = input.requirements.find(requirement => requirement.status === 'confirmed_incompatible')
  if (incompatible) issues.push({ kind: 'incompatible_requirement', requirement: incompatible.text })

  // Quotes: a negated quote supports the opposite of a positive rewrite, and a quote that
  // shares no meaningful word with the rewrite does not support it.
  const quotes: string[] = []
  for (const quote of input.quotes) {
    if (negatedInSource(quote, input.originalText)) { issues.push({ kind: 'negated_quote', quote }); continue }
    if (![...contentStems(quote)].some(s => covered(s, suggestedStems))) { issues.push({ kind: 'irrelevant_quote', quote }); continue }
    quotes.push(quote)
  }
  const userFactUsed = userFacts.length >= 12 && [...contentStems(userFacts)].some(s => covered(s, suggestedStems))
  if (!quotes.length && !userFactUsed) issues.push({ kind: 'no_support' })

  // Numbers, including number words, must already be in the source or the user's fact.
  const have = counts(numbers(evidence))
  const added = new Set<string>()
  for (const [token, count] of counts(numbers(suggested))) if ((have.get(token) ?? 0) < count) added.add(token)
  for (const term of [...added].slice(0, MAX_TERMS_PER_KIND)) issues.push({ kind: 'new_number', term })

  // Responsibility, seniority, outcome, credential and exclusivity wording.
  const evidenceFolded = fold(evidence)
  let claims = 0
  for (const claim of CLAIMS) {
    const found = suggested.match(claim.pattern)
    if (found && !claim.pattern.test(evidenceFolded) && claims++ < MAX_TERMS_PER_KIND) issues.push({ kind: 'added_claim', term: found[0] })
  }

  // A negation in the source that the rewrite drops reverses or widens the claim.
  const originalNegations = fold(input.originalText).match(NEGATION) ?? []
  const suggestedNegations = suggested.match(NEGATION) ?? []
  if (originalNegations.length > suggestedNegations.length) issues.push({ kind: 'dropped_negation', term: originalNegations[0] ?? 'not' })

  // Wording taken from the job (requirements or posting) that the resume field and the
  // user's fact do not contain. A job requirement is not evidence the person has done it.
  const jobStems = contentStems(`${input.requirements.map(requirement => requirement.text).join('\n')}\n${input.jobText ?? ''}`)
  const imported: string[] = []
  for (const word of words(suggested)) {
    const s = stem(word)
    if (s.length < 3 || STOP.has(s) || covered(s, evidenceStems) || !jobStems.has(s) || imported.includes(word)) continue
    imported.push(word)
  }
  for (const term of imported.slice(0, MAX_TERMS_PER_KIND)) issues.push({ kind: 'job_wording', term })

  const blocking = issues.filter(issue => issue.kind !== 'negated_quote' && issue.kind !== 'irrelevant_quote')
  return { supported: blocking.length === 0, quotes, userFactUsed, issues }
}

/** Plain-language explanation for each issue, shared by the panel and tests. */
export function describeIssue(issue: SupportIssue): string {
  switch (issue.kind) {
    case 'no_requirement': return 'It is not clearly linked to a requirement in this job.'
    case 'incompatible_requirement': return `It targets “${issue.requirement}”, which you said you don’t have.`
    case 'no_support': return 'No fact in your resume was found to support the new wording.'
    case 'negated_quote': return `The quoted fact “${issue.quote}” is negated in your resume, so it cannot support this.`
    case 'irrelevant_quote': return `The quoted fact “${issue.quote}” does not relate to the new wording.`
    case 'new_number': return `It adds a number or amount (“${issue.term}”) your resume does not state.`
    case 'added_claim': return `It adds “${issue.term}”, which claims more responsibility, seniority, results or credentials than your resume states.`
    case 'dropped_negation': return `It drops “${issue.term}” from your original wording, which changes its meaning.`
    case 'job_wording': return `It uses “${issue.term}” from the job, which your resume does not say.`
  }
}
