export const TOOL_LIMITS = {
  job: 20_000,
  resume: 30_000,
  bullet: 600,
  requirements: 24,
  comparisonRequirements: 12,
} as const;

export type RequirementCategory = 'required' | 'preferred' | 'other';
export type RequirementKind = 'responsibility' | 'technology' | 'experience' | 'education' | 'location' | 'qualification';
export type ExtractedRequirement = {
  id: string;
  category: RequirementCategory;
  kind: RequirementKind;
  text: string;
  source: string;
};
export type EvidenceStatus = 'demonstrated' | 'partial' | 'not_demonstrated' | 'confirmed_incompatible';
export type EvidenceResult = ExtractedRequirement & { status: EvidenceStatus; resumeEvidence: string | null };
export type BulletDimension = { id: 'action' | 'specificity' | 'context' | 'result' | 'readability' | 'filler'; label: string; state: 'clear' | 'review' | 'missing'; explanation: string };
export type BulletAnalysis = { dimensions: BulletDimension[]; strongerStructure: string | null; prompts: string[] };

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','in','is','it','of','on','or','our','that','the','their','this','to','we','will','with','you','your',
  'ability','candidate','experience','including','job','knowledge','position','role','skills','strong','work','working','years','year',
]);
const REQUIREMENT_MARKERS = new Set(['required','requirement','requirements','preferred','prefer','ideally','nice','must','mandatory','minimum','essential','need','needed']);
const ACTION_VERBS = new Set([
  'achieved','administered','analyzed','built','coached','collaborated','coordinated','created','delivered','designed','developed','directed','drove','established','evaluated','executed','facilitated','implemented','improved','increased','launched','led','managed','mentored','negotiated','operated','organized','owned','planned','prepared','produced','reduced','resolved','reviewed','scaled','simplified','supported','trained','transformed','wrote',
]);
const VAGUE = /\b(?:assisted with|helped(?: to)?|involved in|participated in|responsible for|various|multiple tasks|several duties|worked on|worked with|successfully|effectively|proactively)\b/gi;
const RESULT_LANGUAGE = /\b(?:achiev(?:ed|ing)|improv(?:ed|ing)|increas(?:ed|ing)|reduc(?:ed|ing)|result(?:ed|ing)|saved|grew|cut|accelerated|prevented|resolved|delivered|enabled|so that|leading to)\b/i;
const CONTEXT_LANGUAGE = /\b(?:across|alongside|among|for|in support of|serving|through|using|via|with|within)\b/i;

function clean(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}

export function validateToolText(value: unknown, label: string, maximum: number, minimum: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  if (value.length > maximum) throw new Error(`${label} must be ${maximum.toLocaleString('en-US')} characters or fewer.`);
  const safe = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (clean(safe).length < minimum) throw new Error(`${label} needs a little more detail before it can be reviewed.`);
  return safe;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(16).padStart(8, '0');
}

function headingCategory(line: string): RequirementCategory | null | undefined {
  const value = clean(line).replace(/:$/, '');
  if (value.length > 80) return undefined;
  if (/^(?:required|requirements|minimum qualifications?|what you (?:need|bring)|must have|essentials?)$/i.test(value)) return 'required';
  if (/^(?:preferred|preferred qualifications?|desired|nice to have|nice-to-have|bonus|additional qualifications?)$/i.test(value)) return 'preferred';
  if (/^(?:responsibilities|what you(?:'|’)ll do|the work|duties|about the role|tools|technologies|location|work arrangement)$/i.test(value)) return 'other';
  return undefined;
}

function categoryFor(text: string, heading: RequirementCategory | null): RequirementCategory | null {
  if (/\b(?:equal opportunity|we value (?:curiosity|diversity|inclusion)|welcome (?:all|many|diverse) backgrounds|company values?)\b/i.test(text)) return null;
  if (/\b(?:not required|no [^.]{0,45} required|do(?:es)? not require|do(?:es)?n['’]t require)\b/i.test(text)) return null;
  if (/\b(?:nice to have|nice-to-have|desirable|bonus points?|would be a plus|is a plus)\b/i.test(text)) return 'preferred';
  if (/\b(?:preferred|ideally|preference|desired)\b/i.test(text)) return 'preferred';
  if (/\b(?:required|must|mandatory|minimum|essential|need(?:ed)?|license[ds]?|certification|certified|work authori[sz]ation|eligible to work|\d+\+?\s+years?)\b/i.test(text)) return 'required';
  if (heading) return heading;
  if (/\b(?:you(?:'|’)ll|you will|responsib(?:le|ilities)|duties include|successful candidate|we are looking for)\b/i.test(text)) return 'other';
  return null;
}

function kindFor(text: string): RequirementKind {
  if (/\b(?:remote|hybrid|on[- ]?site|in[- ]?office|relocat|travel|located|location|time zone|timezone|work authori[sz]ation|eligible to work)\b/i.test(text)) return 'location';
  if (/\b(?:degree|bachelor|master|phd|doctorate|diploma|certificate|certification|license[ds]?)\b/i.test(text)) return 'education';
  if (/\b(?:\d+\+?\s+years?|senior|junior|lead|principal|entry[- ]level|management experience)\b/i.test(text)) return 'experience';
  if (/\b(?:software|platform|tooling|technology|technologies|programming|proficiency in|familiarity with|excel|salesforce|python|javascript|typescript|sql|aws|azure|figma|autocad|kubernetes|sap)\b/i.test(text)) return 'technology';
  if (/\b(?:you(?:'|’)ll|you will|responsib(?:le|ilities)|manage|build|create|deliver|develop|lead|maintain|support|coordinate|analy[sz]e|design|operate|prepare|review)\b/i.test(text)) return 'responsibility';
  return 'qualification';
}

function sourceChunks(input: string): string[] {
  const chunks: string[] = [];
  for (const rawLine of input.replace(/\r/g, '').split('\n')) {
    const line = rawLine.replace(/^[\s\u2022*\-–—▪◦]+/, '').trim();
    if (!line) continue;
    if (headingCategory(line) !== undefined) { chunks.push(line); continue; }
    const pieces = line.split(/(?<=[.!?;])\s+(?=[A-Z0-9])/u);
    for (const piece of pieces) {
      const value = clean(piece);
      if (value) chunks.push(value);
    }
  }
  return chunks;
}

export function extractJobRequirements(input: string): ExtractedRequirement[] {
  const description = validateToolText(input, 'Job description', TOOL_LIMITS.job, 40);
  const results: ExtractedRequirement[] = [];
  const seen = new Set<string>();
  let heading: RequirementCategory | null = null;
  for (const chunk of sourceChunks(description)) {
    const nextHeading = headingCategory(chunk);
    if (nextHeading !== undefined) { heading = nextHeading; continue; }
    if (chunk.length < 8 || chunk.length > 700) continue;
    const category = categoryFor(chunk, heading);
    if (!category) continue;
    const text = chunk.replace(/[.;:]$/, '').trim();
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ id: hash(key), category, kind: kindFor(text), text, source: chunk });
    if (results.length >= TOOL_LIMITS.requirements) break;
  }
  return results;
}

function tokens(input: string): string[] {
  return (input.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]*/gu) ?? [])
    .map(token => token.replace(/[.,]$/, ''))
    .filter(token => (token.length >= 3 || ['r','c#','c++'].includes(token)) && !STOPWORDS.has(token) && !REQUIREMENT_MARKERS.has(token));
}

function resumeChunks(input: string): string[] {
  return input.replace(/\r/g, '').split(/\n+|(?<=[.!?;])\s+/u).map(value => clean(value.replace(/^[\s\u2022*\-–—▪◦]+/, ''))).filter(value => value.length >= 3).slice(0, 160);
}

export function compareResumeToJob(resumeInput: string, jobInput: string): EvidenceResult[] {
  const resume = validateToolText(resumeInput, 'Resume', TOOL_LIMITS.resume, 40);
  const requirements = extractJobRequirements(jobInput).slice(0, TOOL_LIMITS.comparisonRequirements);
  const chunks = resumeChunks(resume);
  return requirements.map(requirement => {
    const wanted = [...new Set(tokens(requirement.text))];
    let best: { chunk: string; matched: number; coverage: number } | null = null;
    for (const chunk of chunks) {
      const available = new Set(tokens(chunk));
      const matched = wanted.filter(token => available.has(token)).length;
      const coverage = wanted.length ? matched / wanted.length : 0;
      if (!best || coverage > best.coverage || (coverage === best.coverage && matched > best.matched)) best = { chunk, matched, coverage };
    }
    if (best && best.matched >= 1 && ((wanted.length <= 2 && best.coverage === 1) || (best.matched >= 2 && best.coverage >= 0.55))) {
      return { ...requirement, status: 'demonstrated' as const, resumeEvidence: best.chunk };
    }
    if (best && best.matched >= 1 && best.coverage >= 0.2) return { ...requirement, status: 'partial' as const, resumeEvidence: best.chunk };
    return { ...requirement, status: 'not_demonstrated' as const, resumeEvidence: null };
  });
}

function startsWithAction(value: string): boolean {
  const first = tokens(value)[0] ?? '';
  return ACTION_VERBS.has(first) || /(?:ed|ized|ised|ated|ated|led|built|wrote|ran|drove|grew|cut|set)$/i.test(first);
}

function removeFiller(value: string): string {
  const trimmed = clean(value.replace(/^[-\u2022*\s]+/, '').replace(/^(?:was |were )?responsible for\s+/i, '').replace(/^helped(?: to)?\s+/i, '').replace(/\bsuccessfully\s+/gi, ''));
  return trimmed ? `${trimmed[0].toLocaleUpperCase()}${trimmed.slice(1)}` : trimmed;
}

export function analyzeResumeBullet(input: string): BulletAnalysis {
  const bullet = validateToolText(input, 'Resume bullet', TOOL_LIMITS.bullet, 8);
  const wordCount = bullet.split(/\s+/).length;
  const action = startsWithAction(bullet);
  const specific = /\b\d+(?:[.,]\d+)?%?\b/.test(bullet) || /\b[A-Z][A-Za-z0-9+#.-]{2,}\b/.test(bullet.slice(1)) || tokens(bullet).some(token => ['customers','clients','patients','students','projects','orders','reports','campaigns','systems','sites','regions','accounts','teams'].includes(token));
  const context = CONTEXT_LANGUAGE.test(bullet);
  const result = RESULT_LANGUAGE.test(bullet) || /\b\d+(?:[.,]\d+)?%?\b/.test(bullet);
  const fillerMatches = [...bullet.matchAll(VAGUE)].map(match => match[0]);
  const readable = wordCount >= 8 && wordCount <= 35 && !/[;:]{2,}|\.{2,}/.test(bullet);
  const dimensions: BulletDimension[] = [
    { id: 'action', label: 'Clear action', state: action ? 'clear' : 'missing', explanation: action ? 'The bullet opens with a concrete action.' : 'Start with what you did, using the most accurate verb you can support.' },
    { id: 'specificity', label: 'Specificity', state: specific ? 'clear' : 'review', explanation: specific ? 'The bullet names a concrete subject, scope, tool, audience or quantity.' : 'Name the work, audience, tool or scope if the source facts support it.' },
    { id: 'context', label: 'Scope or context', state: context ? 'clear' : 'review', explanation: context ? 'The reader gets some context for how or where the work happened.' : 'Add who, what, where or how if that context is known and useful.' },
    { id: 'result', label: 'Evidence or result', state: result ? 'clear' : 'missing', explanation: result ? 'The bullet includes an outcome or concrete evidence.' : 'Add the result if you can support it. A truthful qualitative outcome is useful when no verified number exists.' },
    { id: 'readability', label: 'Readability', state: readable ? 'clear' : 'review', explanation: readable ? 'The length and sentence shape are easy to scan.' : wordCount < 8 ? 'This is very short; add enough context to make the action meaningful.' : 'Trim or split the line so its central action is easy to find.' },
    { id: 'filler', label: 'Unnecessary filler', state: fillerMatches.length ? 'review' : 'clear', explanation: fillerMatches.length ? `Review vague wording such as “${fillerMatches.slice(0, 2).join('” and “')}.”` : 'No common filler phrase is obscuring the claim.' },
  ];
  const stronger = removeFiller(bullet);
  const prompts: string[] = [];
  if (!specific) prompts.push('What exactly did you work on, and for whom?');
  if (!context) prompts.push('What tool, process, team, audience or scale can you name truthfully?');
  if (!result) prompts.push('What changed because of the work? Add the result only if you can support it.');
  return { dimensions, strongerStructure: stronger !== clean(bullet) ? stronger : null, prompts };
}
