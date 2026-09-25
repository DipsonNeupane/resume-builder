import test from 'node:test'
import assert from 'node:assert/strict'
import { example, maxContentChars, contentLength, type Resume } from '../../src/model.ts'
import { applySuggestion, InvalidSuggestionError, type Suggestion } from '../../src/features/tailoring/applySuggestion.ts'

function headlineSuggestion(resume: Resume, suggestedText = 'Tailored Customer Experience Specialist'): Suggestion {
 return { sectionId: null, entryId: null, field: 'headline', originalText: resume.headline, suggestedText }
}
function descriptionSuggestion(resume: Resume, suggestedText = 'Rewrote the description to fit the role.'): Suggestion {
 const section = resume.sections[0]
 const entry = section.entries[0]
 return { sectionId: section.id, entryId: entry.id, field: 'description', originalText: entry.description, suggestedText }
}

test('applies a valid top-level suggestion without mutating the source', () => {
 const source = example()
 const before = structuredClone(source)
 const next = applySuggestion(source, headlineSuggestion(source))
 assert.equal(next.headline, 'Tailored Customer Experience Specialist')
 assert.notEqual(next, source)
 assert.deepEqual(source, before) // source is byte-for-byte unchanged
 // Everything else on the result is preserved from the source.
 assert.equal(next.name, source.name)
 assert.deepEqual(next.sections, source.sections)
})

test('applies a valid entry-level suggestion, touching only that entry', () => {
 const source = example()
 const before = structuredClone(source)
 const next = applySuggestion(source, descriptionSuggestion(source))
 assert.equal(next.sections[0].entries[0].description, 'Rewrote the description to fit the role.')
 assert.deepEqual(source, before)
 // The sibling entry and section are untouched (same content, not required to be same reference).
 assert.deepEqual(next.sections[0].entries[1], source.sections[0].entries[1])
 assert.deepEqual(next.sections[1], source.sections[1])
 assert.equal(next.headline, source.headline)
})

test('rejects a stale suggestion whose originalText no longer matches the live resume', () => {
 const source = example()
 const suggestion = headlineSuggestion(source)
 const edited = { ...source, headline: 'A brand new title the user typed after the suggestion was generated' }
 assert.throws(() => applySuggestion(edited, suggestion), InvalidSuggestionError)
 // Same check for an entry-level field.
 const entrySuggestion = descriptionSuggestion(source)
 const editedEntry = { ...source, sections: source.sections.map((s, i) => i === 0 ? { ...s, entries: s.entries.map((e, j) => j === 0 ? { ...e, description: 'Something else now' } : e) } : s) }
 assert.throws(() => applySuggestion(editedEntry, entrySuggestion), InvalidSuggestionError)
})

test('rejects an entryId that exists only in a different section', () => {
 const source = example()
 const otherSectionEntry = source.sections[1].entries[0]
 const suggestion: Suggestion = { sectionId: source.sections[0].id, entryId: otherSectionEntry.id, field: 'title', originalText: otherSectionEntry.title, suggestedText: 'Forged title' }
 assert.throws(() => applySuggestion(source, suggestion), InvalidSuggestionError)
})

test('rejects an unknown/malicious field name', () => {
 const source = example()
 const suggestion = { sectionId: null, entryId: null, field: '__proto__', originalText: source.headline, suggestedText: 'x' } as unknown as Suggestion
 assert.throws(() => applySuggestion(source, suggestion), InvalidSuggestionError)
})

test('rejects a top-level field carrying a non-null sectionId/entryId', () => {
 const source = example()
 const suggestion: Suggestion = { sectionId: source.sections[0].id, entryId: null, field: 'headline', originalText: source.headline, suggestedText: 'New headline' }
 assert.throws(() => applySuggestion(source, suggestion), InvalidSuggestionError)
})

test('rejects an entry field missing its sectionId/entryId', () => {
 const source = example()
 const entry = source.sections[0].entries[0]
 const suggestion: Suggestion = { sectionId: null, entryId: null, field: 'title', originalText: entry.title, suggestedText: 'New title' }
 assert.throws(() => applySuggestion(source, suggestion), InvalidSuggestionError)
})

test('rejects a suggestion pointing at a section/entry id that does not exist', () => {
 const source = example()
 const missingSection: Suggestion = { sectionId: 'does-not-exist', entryId: 'also-missing', field: 'title', originalText: 'x', suggestedText: 'y' }
 assert.throws(() => applySuggestion(source, missingSection), InvalidSuggestionError)
})

test('rejects blank, unchanged, or oversized suggested text', () => {
 const source = example()
 assert.throws(() => applySuggestion(source, headlineSuggestion(source, '   ')), InvalidSuggestionError)
 assert.throws(() => applySuggestion(source, headlineSuggestion(source, source.headline)), InvalidSuggestionError)
 assert.throws(() => applySuggestion(source, headlineSuggestion(source, 'x'.repeat(1001))), InvalidSuggestionError)
 // Exactly at the bound is fine.
 const next = applySuggestion(source, headlineSuggestion(source, 'y'.repeat(1000)))
 assert.equal(next.headline.length, 1000)
})

test('rejects malformed suggestion shapes, including array/object injection attempts', () => {
 const source = example()
 const cases: unknown[] = [
  null,
  { sectionId: [], entryId: null, field: 'headline', originalText: source.headline, suggestedText: 'x' },
  { sectionId: null, entryId: { toString: () => 'x' }, field: 'headline', originalText: source.headline, suggestedText: 'x' },
  { sectionId: null, entryId: null, field: 'headline', originalText: 123, suggestedText: 'x' },
  { sectionId: null, entryId: null, field: 'headline', originalText: source.headline, suggestedText: null },
 ]
 for (const bad of cases) assert.throws(() => applySuggestion(source, bad as Suggestion), InvalidSuggestionError)
})

test('enforces the shared maxContentChars size cap after applying', () => {
 const base = example()
 // Fill three separate fields to their own 50,000-char cap (staying inside
 // isResume's per-field bound) to get close to the aggregate 200,000 cap
 // without needing any single field to exceed its own limit.
 const padded: Resume = {
  ...base,
  summary: 'a'.repeat(50000),
  skills: 'a'.repeat(50000),
  sections: base.sections.map((section, i) => i === 0
   // Also clear `organization` here (rather than leaving example()'s
   // existing text) so the next step's headroom arithmetic starts from a
   // known-empty field instead of having to account for its prior length.
   ? { ...section, entries: section.entries.map((entry, j) => j === 0 ? { ...entry, description: 'a'.repeat(50000), organization: '' } : entry) }
   : section),
 }
 const remaining = maxContentChars - contentLength(padded)
 assert.ok(remaining > 100 && remaining < 50000)
 // Consume all but 10 characters of headroom using a fourth bounded field.
 const filled: Resume = {
  ...padded,
  sections: padded.sections.map((section, i) => i === 0
   ? { ...section, entries: section.entries.map((entry, j) => j === 0 ? { ...entry, organization: 'a'.repeat(remaining - 10) } : entry) }
   : section),
 }
 assert.equal(maxContentChars - contentLength(filled), 10)
 // A suggestion that would add more than the remaining 10-character headroom is rejected...
 const overflowing = headlineSuggestion(filled, filled.headline + 'b'.repeat(200))
 assert.throws(() => applySuggestion(filled, overflowing), InvalidSuggestionError)
 // ...but a change that fits inside the remaining headroom still succeeds.
 const fitting = applySuggestion(filled, headlineSuggestion(filled, filled.headline + 'b'))
 assert.equal(contentLength(fitting), contentLength(filled) + 1)
})

test('handles global, non-Latin, multi-script content exactly', () => {
 const source = example()
 const withUnicode: Resume = { ...source, headline: 'ग्राहक अनुभव विशेषज्ञ · مختص تجربة العملاء · 顧客体験スペシャリスト' }
 const before = structuredClone(withUnicode)
 const suggestion: Suggestion = { sectionId: null, entryId: null, field: 'headline', originalText: withUnicode.headline, suggestedText: 'तयार गरिएको ग्राहक अनुभव विशेषज्ञ · مختص محسّن لتجربة العملاء' }
 const next = applySuggestion(withUnicode, suggestion)
 assert.equal(next.headline, suggestion.suggestedText)
 assert.deepEqual(withUnicode, before) // source object itself untouched
 // A differently-normalized but visually similar original text must not match.
 const decomposed = withUnicode.headline.normalize('NFD')
 if (decomposed !== withUnicode.headline) {
  assert.throws(() => applySuggestion(withUnicode, { ...suggestion, originalText: decomposed }), InvalidSuggestionError)
 }
})
