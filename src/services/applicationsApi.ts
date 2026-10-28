import { supabase } from './supabase';
import { parseApplicationRecord, type ApplicationInput, type ApplicationPatch, type ApplicationRecord } from '../lib/applications';

export class ApplicationRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApplicationRequestError'; }
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

/** Owner-checked request: the session must still belong to `ownerId` before and after
 * the call, so a sign-out or account switch never shows another account's records. */
async function request(ownerId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (!supabase) throw new ApplicationRequestError('Account features are not configured here.', 503);
  const session = (await supabase.auth.getSession()).data.session;
  if (session?.user.id !== ownerId) throw new ApplicationRequestError('Please sign in again and retry.', 401);
  let response: Response;
  try {
    response = await fetch('/api/jobs-account', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApplicationRequestError('You appear to be offline. Nothing was saved; try again when you are connected.', 0);
  }
  let data: unknown;
  try { data = await response.json(); } catch { throw new ApplicationRequestError('Applications returned an unusable response.', response.status); }
  if (!response.ok) throw new ApplicationRequestError(record(data) && typeof data.error === 'string' ? data.error : 'Applications are temporarily unavailable.', response.status);
  const current = (await supabase.auth.getSession()).data.session;
  if (current?.user.id !== ownerId) throw new ApplicationRequestError('Your account changed. Reload to continue.', 401);
  if (!record(data)) throw new ApplicationRequestError('Applications returned an unusable response.', response.status);
  return data;
}

export type TrackedJob = {
  id: string; title: string; company: string; sourceUrl: string | null; location: string; provider: string;
  providerAvailable: boolean; savedAt: string; salary: { min: number; max: number; currency: string; period: 'hour' | 'year' } | null;
  descriptionAvailable: boolean;
};
export type StoredPreferences = { criteria: Record<string, unknown> | null; autoRefresh: boolean };
export type ApplicationsSnapshot = { isPro: boolean; saveLimit: number; savedCount: number; jobs: TrackedJob[]; applications: ApplicationRecord[]; preferences: StoredPreferences };

function trackedJob(value: unknown): TrackedJob | null {
  if (!record(value) || typeof value.id !== 'string' || !record(value.snapshot)) return null;
  const snap = value.snapshot;
  if (typeof snap.title !== 'string' || typeof snap.company !== 'string' || typeof snap.provider !== 'string') return null;
  const loc = record(snap.location) && record(snap.location.value) ? snap.location.value : {};
  const location = [loc.city, loc.region, loc.country].filter(part => typeof part === 'string' && part).join(', ');
  const salary = record(snap.salary) && typeof snap.salary.min === 'number' && typeof snap.salary.max === 'number' && typeof snap.salary.currency === 'string'
    && (snap.salary.period === 'hour' || snap.salary.period === 'year') ? { min: snap.salary.min, max: snap.salary.max, currency: snap.salary.currency, period: snap.salary.period as 'hour' | 'year' } : null;
  return {
    id: value.id, title: snap.title, company: snap.company, provider: snap.provider,
    sourceUrl: typeof snap.sourceUrl === 'string' && /^https:\/\//.test(snap.sourceUrl) ? snap.sourceUrl : null,
    location, providerAvailable: value.providerAvailable !== false, savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
    salary, descriptionAvailable: typeof snap.descriptionText === 'string' && snap.descriptionText.trim().length > 0,
  };
}

export async function loadApplications(ownerId: string, signal?: AbortSignal): Promise<ApplicationsSnapshot> {
  const data = await request(ownerId, { action: 'applications' }, signal);
  if (typeof data.isPro !== 'boolean' || typeof data.saveLimit !== 'number' || !Array.isArray(data.savedJobs) || !Array.isArray(data.applications)) {
    throw new ApplicationRequestError('Applications returned an unusable response.', 503);
  }
  const jobs = data.savedJobs.map(trackedJob).filter((job): job is TrackedJob => job !== null);
  const applications = data.applications.map(parseApplicationRecord).filter((item): item is ApplicationRecord => item !== null);
  const prefs = record(data.preferences) ? data.preferences : {};
  const preferences = { criteria: record(prefs.criteria) ? prefs.criteria : null, autoRefresh: prefs.autoRefresh === true };
  return { isPro: data.isPro, saveLimit: data.saveLimit, savedCount: typeof data.savedCount === 'number' ? data.savedCount : jobs.length, jobs, applications, preferences };
}

export async function createApplication(ownerId: string, application: Partial<ApplicationInput>): Promise<{ savedJobId: string; alreadySaved: boolean }> {
  const data = await request(ownerId, { action: 'application_create', application });
  if (typeof data.savedJobId !== 'string') throw new ApplicationRequestError('Applications returned an unusable response.', 503);
  return { savedJobId: data.savedJobId, alreadySaved: data.alreadySaved === true };
}

export async function updateApplication(ownerId: string, savedJobId: string, expectedRevision: number, patch: ApplicationPatch): Promise<ApplicationRecord> {
  const data = await request(ownerId, { action: 'application_update', savedJobId, expectedRevision, patch });
  const parsed = parseApplicationRecord(data.application);
  if (!parsed) throw new ApplicationRequestError('Applications returned an unusable response.', 503);
  return parsed;
}

export async function confirmSubmitted(ownerId: string, savedJobId: string, expectedRevision: number, appliedOn: string, documentId: string | null): Promise<ApplicationRecord> {
  const data = await request(ownerId, { action: 'application_confirm_submitted', savedJobId, expectedRevision, appliedOn, documentId });
  const parsed = parseApplicationRecord(data.application);
  if (!parsed) throw new ApplicationRequestError('Applications returned an unusable response.', 503);
  return parsed;
}

export type ImportRowResult = { row: number; status: 'ready' | 'invalid' | 'duplicate' | 'possible_duplicate' | 'created' | 'skipped' | 'failed'; message?: string; savedJobId?: string };

export async function importApplications(ownerId: string, rows: Record<string, unknown>[], commit: boolean, keepPossibleDuplicates: number[] = []): Promise<ImportRowResult[]> {
  const data = await request(ownerId, commit ? { action: 'application_import', rows, keepPossibleDuplicates } : { action: 'application_import_preview', rows });
  if (!Array.isArray(data.rows)) throw new ApplicationRequestError('Import returned an unusable response.', 503);
  return data.rows as ImportRowResult[];
}

export type StoredDocument = { id: string; format: 'pdf' | 'docx'; template: string; exportedAt: string; submittedAt: string | null; resume: unknown; provenance?: unknown };
export async function loadApplicationDocument(ownerId: string, documentId: string): Promise<StoredDocument> {
  const data = await request(ownerId, { action: 'application_document', documentId });
  if (!record(data.document)) throw new ApplicationRequestError('This document is unavailable.', 404);
  return data.document as StoredDocument;
}

/** Saves discovery preferences while keeping the owner's existing Auto Refresh choice.
 * Turning Auto Refresh on still happens only from Discover, where its evidence use is explained. */
export async function savePreferences(ownerId: string, criteria: Record<string, unknown>, autoRefresh: boolean, evidence?: unknown): Promise<void> {
  await request(ownerId, { action: 'preferences', criteria, autoRefresh, ...(autoRefresh ? { evidence } : {}) });
}
