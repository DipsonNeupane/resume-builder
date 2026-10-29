/** Provenance of accepted tailoring changes, stored with a saved job-specific version and
 * copied into kept (exported) documents. Shared by the server (validation on save) and the
 * browser (recording and display).
 *
 * It records how the kept wording came to be and what it was checked against. It is the
 * person's own review record, submitted by their signed-in browser: it is not a
 * tamper-proof audit, and it never shows that any wording is true. */
import type { Resume } from '../model';

export type ProvenanceField = 'headline' | 'summary' | 'skills' | 'title' | 'description';
/** ai: the AI wording as proposed. user: wording the person wrote or edited.
 * ai_with_user_fact: the AI wording, accepted after a fact the person added resolved the checks. */
export type ProvenanceOrigin = 'ai' | 'user' | 'ai_with_user_fact';
export type ProvenanceEntry = {
  id: string;
  field: ProvenanceField;
  sectionId: string | null;
  entryId: string | null;
  origin: ProvenanceOrigin;
  originalText: string;
  aiText: string;
  keptText: string;
  userFact: string | null;
  requirements: { id: string; text: string }[];
  resumeQuotes: { location: string; quote: string }[];
  acceptedAt: string;
};
/** current: the kept wording is still there. edited: the person changed it afterwards.
 * removed: the field or entry no longer exists. */
export type ProvenanceState = 'current' | 'edited' | 'removed';

export const MAX_PROVENANCE_ENTRIES = 60;
/** Below the database bound of 200,000 bytes, leaving room for JSONB formatting. */
export const MAX_PROVENANCE_BYTES = 180000;
const FIELDS: readonly ProvenanceField[] = ['headline', 'summary', 'skills', 'title', 'description'];
const ORIGINS: readonly ProvenanceOrigin[] = ['ai', 'user', 'ai_with_user_fact'];
const KEYS = ['id', 'field', 'sectionId', 'entryId', 'origin', 'originalText', 'aiText', 'keptText', 'userFact', 'requirements', 'resumeQuotes', 'acceptedAt'];
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export const ORIGIN_LABEL: Record<ProvenanceOrigin, string> = {
  ai: 'AI wording',
  user: 'Your wording',
  ai_with_user_fact: 'AI wording, supported by a fact you added',
};
export const STATE_LABEL: Record<ProvenanceState, string> = {
  current: 'In this version',
  edited: 'Edited by you since',
  removed: 'No longer in this version',
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
const str = (value: unknown, max: number, allowEmpty = false): value is string => typeof value === 'string' && value.length <= max && (allowEmpty || value.trim() !== '');
const id = (value: unknown): value is string | null => value === null || str(value, 200);

function entry(value: unknown): ProvenanceEntry | null {
  if (!record(value) || Object.keys(value).some(key => !KEYS.includes(key))) return null;
  const { requirements, resumeQuotes } = value;
  if (!str(value.id, 36) || !UUID.test(value.id) || !FIELDS.includes(value.field as ProvenanceField) || !id(value.sectionId) || !id(value.entryId)
    || !ORIGINS.includes(value.origin as ProvenanceOrigin) || !str(value.originalText, 4000, true) || !str(value.aiText, 2000) || !str(value.keptText, 2000)
    || !(value.userFact === null || str(value.userFact, 600)) || (value.origin === 'ai_with_user_fact') !== (value.userFact !== null)
    || !str(value.acceptedAt, 40) || Number.isNaN(Date.parse(value.acceptedAt))
    || !Array.isArray(requirements) || requirements.length > 3 || !requirements.every(item => record(item) && Object.keys(item).length === 2 && str(item.id, 80) && str(item.text, 1000))
    || !Array.isArray(resumeQuotes) || resumeQuotes.length > 3 || !resumeQuotes.every(item => record(item) && Object.keys(item).length === 2 && str(item.location, 300) && str(item.quote, 300))) return null;
  const topLevel = value.field === 'headline' || value.field === 'summary' || value.field === 'skills';
  if (topLevel !== (value.sectionId === null && value.entryId === null) || (!topLevel && (value.sectionId === null || value.entryId === null))) return null;
  return value as unknown as ProvenanceEntry;
}

/** Strict: throws on anything malformed, so an invalid record is refused rather than trimmed. */
export function parseProvenance(value: unknown): ProvenanceEntry[] {
  if (!Array.isArray(value) || value.length > MAX_PROVENANCE_ENTRIES) throw new Error('Tailoring record is invalid.');
  const entries = value.map(entry);
  if (entries.some(item => item === null)) throw new Error('Tailoring record is invalid.');
  if (new Set(entries.map(item => item!.id)).size !== entries.length) throw new Error('Tailoring record is invalid.');
  return entries as ProvenanceEntry[];
}

/** For reading stored records: an unreadable record is shown as absent, never guessed. */
export function readProvenance(value: unknown): ProvenanceEntry[] | null {
  try { return parseProvenance(value); } catch { return null; }
}

export function fieldText(resume: Resume, item: Pick<ProvenanceEntry, 'field' | 'sectionId' | 'entryId'>): string | null {
  if (item.field === 'headline' || item.field === 'summary' || item.field === 'skills') return resume[item.field];
  const target = resume.sections.find(section => section.id === item.sectionId)?.entries.find(candidate => candidate.id === item.entryId);
  return target ? target[item.field] : null;
}

export function provenanceState(item: ProvenanceEntry, resume: Resume): ProvenanceState {
  const text = fieldText(resume, item);
  return text === null ? 'removed' : text === item.keptText ? 'current' : 'edited';
}

/** Appends an accepted change, keeping the most recent entries. Earlier changes to the same
 * field stay in the record and show as edited, because their wording was replaced. */
export function withAccepted(list: ProvenanceEntry[], item: ProvenanceEntry): ProvenanceEntry[] {
  const next = [...list.filter(other => other.id !== item.id), item].slice(-MAX_PROVENANCE_ENTRIES);
  // Stay inside the stored size bound, so a long record can never block saving the resume.
  while (next.length > 1 && new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_PROVENANCE_BYTES) next.shift();
  return next;
}
