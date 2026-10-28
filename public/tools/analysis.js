import { extractPostingRequirements } from './posting-requirements.js';
export const TOOL_LIMITS = {
    job: 20_000,
    resume: 30_000,
    bullet: 600,
    requirements: 24,
    comparisonRequirements: 12,
};
const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'can', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'if', 'in', 'is', 'it', 'more', 'not', 'of', 'on', 'or', 'our', 'per', 'she', 'so', 'such', 'than', 'that', 'the', 'their', 'them', 'they', 'this', 'through', 'to', 'we', 'were', 'who', 'will', 'with', 'within', 'you', 'your',
    'abilities', 'ability', 'able', 'candidate', 'duties', 'excellent', 'experience', 'function', 'functions', 'good', 'including', 'job', 'knowledge', 'language', 'position', 'proficiency', 'proficient', 'responsibilities', 'responsible', 'role', 'skill', 'skills', 'strong', 'successful', 'work', 'working', 'years', 'year',
]);
const REQUIREMENT_MARKERS = new Set(['required', 'requirement', 'requirements', 'preferred', 'prefer', 'ideally', 'nice', 'must', 'mandatory', 'minimum', 'essential', 'need', 'needed']);
const ACTION_VERBS = new Set([
    'achieved', 'administered', 'analyzed', 'built', 'coached', 'collaborated', 'coordinated', 'created', 'delivered', 'designed', 'developed', 'directed', 'drove', 'established', 'evaluated', 'executed', 'facilitated', 'implemented', 'improved', 'increased', 'launched', 'led', 'managed', 'mentored', 'negotiated', 'operated', 'organized', 'owned', 'planned', 'prepared', 'produced', 'reduced', 'resolved', 'reviewed', 'scaled', 'simplified', 'supported', 'trained', 'transformed', 'wrote',
]);
const VAGUE = /\b(?:assisted with|helped(?: to)?|involved in|participated in|responsible for|various|multiple tasks|several duties|worked on|worked with|successfully|effectively|proactively)\b/gi;
const RESULT_LANGUAGE = /\b(?:achiev(?:ed|ing)|improv(?:ed|ing)|increas(?:ed|ing)|reduc(?:ed|ing)|result(?:ed|ing)|saved|grew|cut|accelerated|prevented|resolved|delivered|enabled|so that|leading to)\b/i;
const CONTEXT_LANGUAGE = /\b(?:across|alongside|among|for|in support of|serving|through|using|via|with|within)\b/i;
function clean(value) {
    return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}
export function validateToolText(value, label, maximum, minimum) {
    if (typeof value !== 'string')
        throw new Error(`${label} must be text.`);
    if (value.length > maximum)
        throw new Error(`${label} must be ${maximum.toLocaleString('en-US')} characters or fewer.`);
    const safe = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (clean(safe).length < minimum) {
        const message = label === 'Job description' ? 'Paste more of the job description to continue.'
            : label === 'Resume' ? 'Paste more of your resume to continue.'
                : label === 'Resume bullet' ? 'Add more detail to the bullet to continue.'
                    : `${label} needs a little more detail before it can be reviewed.`;
        throw new Error(message);
    }
    return safe;
}
function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1)
        result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    return (result >>> 0).toString(16).padStart(8, '0');
}
function kindFor(text) {
    if (/\b(?:remote|hybrid|on[- ]?site|in[- ]?office|relocat|travel|located|location|time zone|timezone|work authori[sz]ation|eligible to work)\b/i.test(text))
        return 'location';
    if (/\b(?:degree|bachelor|master|phd|doctorate|diploma|certificate|certification|license[ds]?)\b/i.test(text))
        return 'education';
    if (/\b(?:\d+\+?\s+years?|senior|junior|lead|principal|entry[- ]level|management experience)\b/i.test(text))
        return 'experience';
    if (/\b(?:software|platform|tooling|technology|technologies|programming|proficiency in|familiarity with|excel|salesforce|python|javascript|typescript|sql|aws|azure|figma|autocad|kubernetes|sap)\b/i.test(text))
        return 'technology';
    if (/\b(?:you(?:'|’)ll|you will|responsib(?:le|ilities)|manage|build|create|deliver|develop|lead|maintain|support|coordinate|analy[sz]e|design|operate|prepare|review)\b/i.test(text))
        return 'responsibility';
    return 'qualification';
}
/** Browser-only wrapper over the shared extractor (src/lib/postingRequirements.ts). The
 * public tools have no nice-to-have tier, so nice-to-have signals are shown as preferred. */
export function extractJobRequirements(input) {
    const description = validateToolText(input, 'Job description', TOOL_LIMITS.job, 40);
    return extractPostingRequirements(description, { limit: TOOL_LIMITS.requirements }).map(item => {
        const category = item.category === 'nice_to_have' ? 'preferred' : item.category;
        return { id: hash(item.text.toLocaleLowerCase()), category, kind: kindFor(item.text), text: item.text, source: item.source };
    });
}
function tokens(input) {
    return (input.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]*/gu) ?? [])
        .map(token => token.replace(/[.,]$/, ''))
        .filter(token => (token.length >= 3 || ['r', 'c#', 'c++'].includes(token)) && !STOPWORDS.has(token) && !REQUIREMENT_MARKERS.has(token));
}
function resumeChunks(input) {
    return input.replace(/\r/g, '').split(/\n+|(?<=[.!?;])\s+/u).map(value => clean(value.replace(/^[\s\u2022*\-–—▪◦]+/, ''))).filter(value => value.length >= 3).slice(0, 160);
}
export function compareResumeToJob(resumeInput, jobInput) {
    const resume = validateToolText(resumeInput, 'Resume', TOOL_LIMITS.resume, 40);
    const requirements = extractJobRequirements(jobInput).slice(0, TOOL_LIMITS.comparisonRequirements);
    const chunks = resumeChunks(resume);
    return requirements.map(requirement => {
        if (/\bsecurity clearance\b/i.test(requirement.text)) {
            const explicitClearance = chunks.find(chunk => /\b(?:active\s+)?(?:top secret|secret|ts\/?sci)?\s*security clearance\b|\b(?:top secret|secret|ts\/?sci)\s+clearance\b|\bcleared\s+(?:professional|engineer|candidate|worker)\b/i.test(chunk));
            if (!explicitClearance)
                return { ...requirement, status: 'not_demonstrated', resumeEvidence: null };
            const confirmedLevel = /\b(?:active|top secret|secret|ts\/?sci)\b/i.test(explicitClearance);
            return { ...requirement, status: confirmedLevel ? 'demonstrated' : 'partial', resumeEvidence: explicitClearance };
        }
        const wanted = [...new Set(tokens(requirement.text))];
        let best = null;
        for (const chunk of chunks) {
            const available = new Set(tokens(chunk));
            const matched = wanted.filter(token => available.has(token)).length;
            const coverage = wanted.length ? matched / wanted.length : 0;
            if (!best || coverage > best.coverage || (coverage === best.coverage && matched > best.matched))
                best = { chunk, matched, coverage };
        }
        if (best && ((wanted.length === 1 && best.matched === 1) || (best.matched >= 3 && best.coverage >= 0.6) || (best.matched >= 2 && best.coverage >= 0.65))) {
            return { ...requirement, status: 'demonstrated', resumeEvidence: best.chunk };
        }
        if (best && best.matched >= 2 && best.coverage >= 0.35)
            return { ...requirement, status: 'partial', resumeEvidence: best.chunk };
        return { ...requirement, status: 'not_demonstrated', resumeEvidence: null };
    });
}
function startsWithAction(value) {
    const first = tokens(value)[0] ?? '';
    const gerundAsPast = first.endsWith('ing') ? `${first.slice(0, -3)}ed` : '';
    return ACTION_VERBS.has(first) || ACTION_VERBS.has(gerundAsPast) || /(?:ed|ized|ised|ated|led|built|wrote|ran|drove|grew|cut|set)$/i.test(first);
}
function removeFiller(value) {
    const trimmed = clean(value.replace(/^[-\u2022*\s]+/, '').replace(/^(?:was |were )?responsible for\s+/i, '').replace(/^helped(?: to)?\s+/i, '').replace(/\bsuccessfully\s+/gi, ''));
    return trimmed ? `${trimmed[0].toLocaleUpperCase()}${trimmed.slice(1)}` : trimmed;
}
export function analyzeResumeBullet(input) {
    const bullet = validateToolText(input, 'Resume bullet', TOOL_LIMITS.bullet, 8);
    const wordCount = bullet.split(/\s+/).length;
    const action = startsWithAction(bullet);
    const vagueAudienceOnly = /^(?:helped|assisted|supported)\s+(?:customers|clients|patients|students|users|teams)\.?$/i.test(clean(bullet));
    const specific = !vagueAudienceOnly && (/\b\d+(?:[.,]\d+)?%?\b/.test(bullet) || /\b[A-Z][A-Za-z0-9+#.-]{2,}\b/.test(bullet.slice(1)) || tokens(bullet).some(token => ['projects', 'orders', 'reports', 'campaigns', 'systems', 'sites', 'regions', 'accounts'].includes(token)));
    const context = CONTEXT_LANGUAGE.test(bullet);
    const result = RESULT_LANGUAGE.test(bullet) || /\b\d+(?:[.,]\d+)?%?\b/.test(bullet);
    const fillerMatches = [...bullet.matchAll(VAGUE)].map(match => match[0]);
    const readable = wordCount >= 8 && wordCount <= 35 && !/[;:]{2,}|\.{2,}/.test(bullet);
    const dimensions = [
        { id: 'action', label: 'Clear action', state: action ? 'clear' : 'missing', explanation: action ? 'The bullet opens with a concrete action.' : 'Start with what you did, using the most accurate verb you can support.' },
        { id: 'specificity', label: 'Specificity', state: specific ? 'clear' : 'review', explanation: specific ? 'The bullet names a concrete subject, scope, tool, audience or quantity.' : 'Name the customer type, channel, product, process, or scope if you can.' },
        { id: 'context', label: 'Scope or context', state: context ? 'clear' : 'review', explanation: context ? 'The reader gets some context for how or where the work happened.' : 'Add who, what, where or how if that context is known and useful.' },
        { id: 'result', label: 'Evidence or result', state: result ? 'clear' : 'missing', explanation: result ? 'The bullet includes an outcome or concrete evidence.' : 'Add the result if you can support it. A truthful qualitative outcome is useful when no verified number exists.' },
        { id: 'readability', label: 'Readability', state: readable ? 'clear' : 'review', explanation: readable ? 'The length and sentence shape are easy to scan.' : wordCount < 8 ? 'This is very short; add enough context to make the action meaningful.' : 'Trim or split the line so its central action is easy to find.' },
        { id: 'filler', label: 'Unnecessary filler', state: fillerMatches.length ? 'review' : 'clear', explanation: fillerMatches.length ? `Review vague wording such as “${fillerMatches.slice(0, 2).join('” and “')}.”` : 'No common filler phrase is obscuring the claim.' },
    ];
    const stronger = removeFiller(bullet);
    // Removing a vague lead-in must never leave a noun fragment that looks like
    // a recommended resume bullet (for example, “Customers with billing
    // requests”). When a truthful action cannot be preserved, ask for it rather
    // than manufacturing one.
    const enoughForRewrite = !vagueAudienceOnly && startsWithAction(stronger) && stronger.split(/\s+/).length >= 4;
    const prompts = [];
    if (!specific)
        prompts.push('What exactly did you work on, and for whom?');
    if (!context)
        prompts.push('What tool, process, team, audience or scale can you name truthfully?');
    if (!result)
        prompts.push('What changed because of the work? Add the result only if you can support it.');
    return { dimensions, strongerStructure: stronger !== clean(bullet) && enoughForRewrite ? stronger : null, prompts };
}
