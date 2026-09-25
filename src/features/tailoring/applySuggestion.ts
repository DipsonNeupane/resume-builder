/** Pure, side-effect-free helper that applies one AI tailoring suggestion to a
 * resume, producing a new resume object. Never mutates its `source` argument.
 *
 * `Suggestion`/`SuggestionField` intentionally duplicate the shape returned by
 * `server/ai/tailoring.ts` (via `POST /api/tailor`) rather than importing that
 * server module into client code — this file is bundled into the browser, and
 * the server module pulls in server-only concerns (provider requests, budget
 * reservation) that have no place in a client bundle. Keep this shape in sync
 * with `server/ai/tailoring.ts`'s `Suggestion` type by hand.
 *
 * This function is the ONLY place that turns a suggestion into an edited
 * resume; the caller (TailoringPanel) must never apply a suggestion by
 * directly mutating its own draft state.
 */
import { isResume, contentLength, maxContentChars, type Resume } from '../../model';

export type SuggestionField = 'headline' | 'summary' | 'skills' | 'title' | 'description';
export type Suggestion = {
 sectionId: string | null;
 entryId: string | null;
 field: SuggestionField;
 originalText: string;
 suggestedText: string;
};

const KNOWN_FIELDS: readonly SuggestionField[] = ['headline', 'summary', 'skills', 'title', 'description'];
const TOP_LEVEL_FIELDS: readonly SuggestionField[] = ['headline', 'summary', 'skills'];
// Mirrors server/ai/tailoring.ts's MAX_SUGGESTED_CHARS boundary (not exported
// from that server-only module, so restated here rather than imported).
const MAX_SUGGESTED_CHARS = 1000;

export class InvalidSuggestionError extends Error {}

function fail(message: string): never {
 throw new InvalidSuggestionError(message);
}

/** Applies `suggestion` to `source`, returning a brand-new Resume with only
 * the targeted field changed and every other field/entry/section preserved
 * by reference. Throws InvalidSuggestionError (never returns a partially
 * applied or invalid result) when:
 * - the suggestion is malformed or names an unknown field,
 * - sectionId/entryId don't name entries that actually exist in `source`
 *   (or a top-level field carries a non-null sectionId/entryId),
 * - `originalText` no longer matches the CURRENT text at that exact target
 *   in `source` (the resume changed since the suggestion was generated —
 *   this is what makes stale suggestions safe to reject rather than
 *   silently mis-apply),
 * - `suggestedText` is blank, unchanged from the original, or exceeds the
 *   bounded suggestion length,
 * - applying it would make the resulting resume fail `isResume` or exceed
 *   the shared `maxContentChars` size cap.
 */
export function applySuggestion(source: Resume, suggestion: Suggestion): Resume {
 if (!suggestion || typeof suggestion !== 'object') fail('Invalid suggestion.');
 const { sectionId, entryId, field, originalText, suggestedText } = suggestion;
 if (typeof field !== 'string' || !KNOWN_FIELDS.includes(field as SuggestionField)) fail('Unknown suggestion field.');
 if (sectionId !== null && typeof sectionId !== 'string') fail('Invalid suggestion.');
 if (entryId !== null && typeof entryId !== 'string') fail('Invalid suggestion.');
 if (typeof originalText !== 'string' || typeof suggestedText !== 'string') fail('Invalid suggestion.');
 const trimmed = suggestedText.trim();
 if (!trimmed || suggestedText.length > MAX_SUGGESTED_CHARS) fail('Suggestion text is empty or too long.');
 if (suggestedText === originalText) fail('Suggestion does not change the text.');

 let next: Resume;
 if (TOP_LEVEL_FIELDS.includes(field as SuggestionField)) {
  if (sectionId !== null || entryId !== null) fail('Suggestion target does not match a resume field.');
  const key = field as 'headline' | 'summary' | 'skills';
  if (source[key] !== originalText) fail('This suggestion no longer matches your resume text.');
  next = { ...source, [key]: suggestedText };
 } else {
  if (sectionId === null || entryId === null) fail('Suggestion target does not match a resume field.');
  const section = source.sections.find(candidate => candidate.id === sectionId);
  if (!section) fail('This suggestion no longer matches your resume.');
  // Looked up strictly within the named section, not across the whole
  // document — an entryId that is valid elsewhere but not inside THIS
  // section must never be treated as a match.
  const entry = section.entries.find(candidate => candidate.id === entryId);
  if (!entry) fail('This suggestion no longer matches your resume.');
  const key = field as 'title' | 'description';
  if (entry[key] !== originalText) fail('This suggestion no longer matches your resume text.');
  next = {
   ...source,
   sections: source.sections.map(candidate => candidate.id === sectionId
    ? { ...candidate, entries: candidate.entries.map(item => item.id === entryId ? { ...item, [key]: suggestedText } : item) }
    : candidate),
  };
 }

 if (!isResume(next)) fail('Applying this suggestion would produce an invalid resume.');
 if (contentLength(next) > maxContentChars) fail('Applying this suggestion would exceed the resume content limit.');
 return next;
}
