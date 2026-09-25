import { observeBrowserOperation } from './diagnostics';
import { supabase } from './supabase';
import { isResume, migrate, maxBackupBytes, type Resume } from '../model';

export type CloudResume = { resume: Resume; revision: number; updatedAt: string };

// Thrown whenever an update's expected revision no longer matches what's stored
// (someone/something else saved since this client last read it) or a first save
// races another insert for the same account. `server` is the current owned row,
// if one exists, so the caller can offer "use the other version" without a
// second round trip.
export class ResumeConflictError extends Error {
  readonly server: CloudResume | null;
  constructor(server: CloudResume | null) {
    super('Your account resume was saved elsewhere since you last loaded it.');
    this.name = 'ResumeConflictError';
    this.server = server;
  }
}

type Row = { data: unknown; revision: number; updated_at: string };

function fromRow(row: Row): CloudResume | null {
  // A revision is the optimistic-concurrency token, not optional metadata.
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1) return null;
  const migrated = migrate(row.data);
  if (!isResume(migrated)) return null;
  return { resume: migrated, revision: row.revision, updatedAt: row.updated_at };
}

function assertSize(resume: Resume) {
  if (JSON.stringify(resume).length > maxBackupBytes) {
    throw new Error(`This resume is too large to save to your account (over ${Math.round(maxBackupBytes / 1000000)} MB).`);
  }
}

async function loadCloudResumeInternal(ownerId: string): Promise<CloudResume | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('resumes').select('data,revision,updated_at').eq('owner_id', ownerId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const parsed = fromRow(data);
  if (!parsed) throw new Error('Your saved account resume could not be read by this version of the app.');
  return parsed;
}

async function createCloudResumeInternal(ownerId: string, resume: Resume): Promise<CloudResume> {
  if (!supabase) throw new Error('Account storage is not available.');
  assertSize(resume);
  const { data, error } = await supabase.from('resumes').insert({ owner_id: ownerId, data: resume }).select('data,revision,updated_at').single();
  if (error) {
    // 23505 = unique_violation on resumes_owner_unique: another request (often
    // another tab) already created this account's resume between our check and
    // this insert. Surface it as a conflict with the row that won the race,
    // rather than a generic failure.
    if (error.code === '23505') throw new ResumeConflictError(await loadCloudResume(ownerId));
    throw error;
  }
  const parsed = fromRow(data);
  if (!parsed) throw new Error('The resume just saved to your account could not be verified.');
  return parsed;
}

async function saveCloudResumeInternal(ownerId: string, resume: Resume, expectedRevision: number): Promise<CloudResume> {
  if (!supabase) throw new Error('Account storage is not available.');
  assertSize(resume);
  const { data, error } = await supabase.from('resumes').update({ data: resume }).eq('owner_id', ownerId).eq('revision', expectedRevision).select('data,revision,updated_at');
  if (error) throw error;
  if (!data || data.length === 0) throw new ResumeConflictError(await loadCloudResume(ownerId));
  const parsed = fromRow(data[0]);
  if (!parsed) throw new Error('The resume just saved to your account could not be verified.');
  return parsed;
}

export const loadCloudResume: typeof loadCloudResumeInternal = (...args) => observeBrowserOperation('cloud', 'cloud_load', () => loadCloudResumeInternal(...args));

export const createCloudResume: typeof createCloudResumeInternal = (...args) => observeBrowserOperation('cloud', 'cloud_create', () => createCloudResumeInternal(...args));

export const saveCloudResume: typeof saveCloudResumeInternal = (...args) => observeBrowserOperation('cloud', 'cloud_save', () => saveCloudResumeInternal(...args));
