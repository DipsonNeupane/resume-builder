/** Shared, deterministic job-posting requirement extraction.
 *
 * Used by the browser-only public tools (src/tools/analysis.ts) and by server Match
 * (server/jobs/match.ts), so both read a posting the same way. Pure TypeScript with no
 * DOM, network or Node dependency: a public-tool posting never leaves the browser.
 *
 * Extraction is deliberately separate from evidence classification. It only answers
 * "which source sentences state a requirement, and is each one required, preferred or
 * nice to have?" — never whether a person meets it. Every result keeps its original
 * source wording plus a line/offset reference into the input. */
const BULLET = /^[\s•‣▪▫●◦⁃∙·*#_\-–—▪◦>]+|^\(?(?:\d{1,2}|[a-z])[.)]\s+/iu;
const INLINE_BULLET = /\s+[•▪●◦·▪◦]\s+/u;
// Abbreviations whose trailing period must not end a sentence.
const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|incl|approx|min|max|yrs?|no|dept|U\.S|U\.K|Ph\.D|B\.S|B\.A|M\.S|M\.A|Sr|Jr|Mr|Mrs|Ms|Dr|St)\.$/i;
/** Requirement-shaped wording: a stated qualification even when the posting has no heading. */
const QUALIFICATION_SIGNAL = /\b(?:experience[ds]?|ability to|able to|proficien(?:t|cy)|fluen(?:t|cy)|knowledge of|familiar(?:ity)? with|understanding of|background in|track record|demonstrated|skills? (?:in|with)|skilled in|comfortable (?:with|using)|degree|bachelor(?:'|’)?s|master(?:'|’)?s|diploma|certificat(?:e|ion)|certified|licen[cs](?:e|ed|ure)|clearance|work authori[sz]ation|eligible to work|\d+\+?\s+years?)\b/i;
const WORK_ARRANGEMENT = /\b(?:remote|hybrid|on[- ]?site|in[- ]?office|relocat\w*|travel|located|time ?zone)\b/i;
const RESPONSIBILITY_SIGNAL = /\b(?:you(?:'|’)ll|you will|responsib(?:le|ilities)|duties include|successful candidate|we are looking for)\b/i;
const NOT_A_REQUIREMENT = /\b(?:equal opportunity|we value (?:curiosity|diversity|inclusion)|welcome (?:all|many|diverse) backgrounds|company values?)\b/i;
const NEGATED = /\b(?:not required|no [^.]{0,50} required|do(?:es)? not (?:need|require)|do(?:es)?n['’]t require)\b/i;
const NICE = /\b(?:nice to have|nice-to-have|desirable|a bonus|bonus points?)\b/i;
const PREFERRED = /\b(?:preferred|ideally|preference|desired|would be a plus|is a plus|a plus)\b/i;
/** Inline label such as "Preferred: Spanish" or "Required - 2 years". */
const INLINE_LABEL = /^(required|requirements?|must[- ]have|minimum|preferred|nice[- ]to[- ]have|bonus|desired|desirable|plus)\s*[:\-–—]\s+(?=\S)/i;
function inlineLabelCategory(label) {
    const value = label.toLowerCase();
    if (/^(?:nice|bonus|desirable|plus)/.test(value))
        return 'nice_to_have';
    if (/^(?:preferred|desired)/.test(value))
        return 'preferred';
    return 'required';
}
function strip(value) {
    return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[\s\u00a0\u2028\u2029]+/g, ' ').trim();
}
export function cleanPostingChunk(value) {
    let next = strip(value);
    for (let index = 0; index < 3 && BULLET.test(next); index += 1)
        next = next.replace(BULLET, '').trim();
    return next.replace(/[\s*_#]+$/, '').trim();
}
/** Returns the scope a heading line opens, or undefined when the line is not a heading. */
export function headingScope(line) {
    const value = cleanPostingChunk(line).replace(/[:;.]+$/, '').trim();
    if (!value || value.length > 80)
        return undefined;
    const heading = value.toLowerCase();
    if (/^(?:required(?: qualifications?| skills?)?|requirements|minimum (?:qualifications?|requirements)|basic qualifications?|what (?:you|we) (?:need|bring|require|(?:are|’re|'re) looking for)|must[- ]haves?|essentials?)$/.test(heading))
        return 'required';
    if (/^(?:preferred(?: qualifications?| skills?)?|desired(?: qualifications?)?|additional qualifications?)$/.test(heading))
        return 'preferred';
    if (/^(?:nice[- ]to[- ]haves?|bonus(?: points| qualifications?)?|desirable)$/.test(heading))
        return 'nice_to_have';
    if (/^(?:essential functions?(?:\s*\/\s*duties)?|essential duties(?: and responsibilities)?|duties(?: and responsibilities)?|(?:key )?responsibilities|what you(?:'|’)ll do|the work|the role|about the role|day to day|in this role)$/.test(heading))
        return 'responsibilities';
    if (/^(?:tools|technologies|location|work arrangement|schedule)$/.test(heading))
        return 'other';
    if (/^(?:benefits|perks|what we offer|compensation|pay|salary|about us|about the company|who we are|our company|how to apply|equal opportunity.*)$/.test(heading))
        return 'ignored';
    if (/^(?:qualifications|who you are|about you|you have|skills)$/.test(heading))
        return 'neutral';
    // A short label ending in a colon with no sentence after it is an unknown heading.
    if (/[:]$/.test(cleanPostingChunk(line)) && value.split(/\s+/).length <= 6)
        return 'neutral';
    return undefined;
}
function explicitRequired(text) {
    return /\b(?:must|mandatory)\b/i.test(text)
        || /\b(?:licen[cs](?:e[ds]?|ure)|certification|certified|degree|diploma|security clearance|work authori[sz]ation|eligible to work)\b/i.test(text)
        || /\b\d+\+?\s+years?(?:\s+of)?\s+(?:relevant\s+)?(?:\w+\s+){0,3}experience\b/i.test(text)
        || /\b(?:experience|degree|licen[cs]e|licensure|certification|clearance|authori[sz]ation)\b[^.]{0,80}\b(?:is\s+)?required\b/i.test(text);
}
/** Splits one cleaned line into sentences without breaking common abbreviations. */
export function splitSentences(line) {
    const out = [];
    let start = 0;
    const boundary = /([.!?;])\s+(?=["“(]?[A-Z0-9\p{Lu}])/gu;
    let match;
    while ((match = boundary.exec(line))) {
        const end = match.index + 1;
        const candidate = line.slice(start, end);
        if (match[1] === '.' && ABBREVIATIONS.test(candidate))
            continue;
        out.push(candidate.trim());
        start = end;
    }
    out.push(line.slice(start).trim());
    return out.filter(Boolean);
}
function dedupeKey(text) {
    return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim();
}
function chunks(input) {
    const out = [];
    let offset = 0;
    const lines = input.replace(/\r\n?/g, '\n').split('\n');
    lines.forEach((rawLine, index) => {
        const lineOffset = offset;
        offset += rawLine.length + 1;
        // Text copied from web pages often flattens a bulleted list onto one line.
        for (const segment of rawLine.split(INLINE_BULLET)) {
            const line = cleanPostingChunk(segment);
            if (!line)
                continue;
            const heading = headingScope(line);
            if (heading !== undefined) {
                out.push({ text: line, line: index + 1, offset: lineOffset, heading });
                continue;
            }
            // "Requirements: A. B." opens a scope and continues on the same line. A single
            // labelled item ("Preferred: Spanish") labels only itself, so a later bullet in
            // the same list keeps the surrounding scope.
            const inlineHeading = line.match(/^([^:]{3,60}):\s+(.+)$/);
            if (inlineHeading) {
                const scope = headingScope(`${inlineHeading[1]}:`);
                const sentences = splitSentences(inlineHeading[2]);
                if (scope !== undefined && scope !== 'neutral' && sentences.length > 1) {
                    out.push({ text: inlineHeading[1], line: index + 1, offset: lineOffset, heading: scope });
                    for (const sentence of sentences)
                        out.push({ text: sentence, line: index + 1, offset: lineOffset, heading: undefined });
                    continue;
                }
            }
            for (const sentence of splitSentences(line))
                out.push({ text: sentence, line: index + 1, offset: lineOffset, heading: undefined });
        }
    });
    return out;
}
function categorize(text, scope, labelled) {
    if (NOT_A_REQUIREMENT.test(text) || NEGATED.test(text))
        return null;
    if (labelled)
        return labelled;
    if (NICE.test(text))
        return 'nice_to_have';
    if (PREFERRED.test(text))
        return 'preferred';
    if (scope === 'ignored')
        return null;
    if (scope === 'responsibilities')
        return 'other';
    if (scope === 'required' || scope === 'preferred' || scope === 'nice_to_have') {
        return scope === 'required' || !explicitRequired(text) ? scope : 'required';
    }
    if (explicitRequired(text) || QUALIFICATION_SIGNAL.test(text))
        return 'required';
    if (WORK_ARRANGEMENT.test(text))
        return 'other';
    if (scope === 'other' || RESPONSIBILITY_SIGNAL.test(text))
        return 'other';
    return null;
}
export function extractPostingRequirements(input, options = {}) {
    const limit = options.limit ?? 30, minLength = options.minLength ?? 8, maxLength = options.maxLength ?? 700;
    const results = [];
    const seen = new Set();
    let scope = 'neutral';
    for (const chunk of chunks(input)) {
        if (chunk.heading !== undefined) {
            scope = chunk.heading;
            continue;
        }
        const source = chunk.text;
        if (source.length < minLength || source.length > maxLength)
            continue;
        const label = source.match(INLINE_LABEL);
        const body = (label ? source.slice(label[0].length) : source).replace(/[.;:]$/, '').trim();
        if (body.length < Math.min(minLength, 4))
            continue;
        const category = categorize(body, scope, label ? inlineLabelCategory(label[1]) : null);
        if (!category)
            continue;
        const key = dedupeKey(body);
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        results.push({ text: body, source, category, line: chunk.line, offset: chunk.offset, scope });
        if (results.length >= limit)
            break;
    }
    return results;
}
