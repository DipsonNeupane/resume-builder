import { contentLength, isResume, maxContentChars, type Resume } from '../model';
import { supabase } from './supabase';

export type JobResumeVersion = {
  id: string;
  savedJobId: string;
  jobSnapshot: Record<string, unknown> & { title: string; company: string; descriptionText?: string };
  sourceMasterResumeId: string | null;
  sourceMasterRevision: number | null;
  sourceMasterFingerprint: string;
  resume: Resume;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type JobResumeVersionSummary = Omit<JobResumeVersion, 'resume'> & { savedJobExists: boolean };

export class JobResumeConflictError extends Error {
  constructor(readonly server: JobResumeVersion) {
    super('This job-specific resume was updated elsewhere. Choose which version to keep.');
    this.name = 'JobResumeConflictError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseJobResumeVersion(value: unknown): JobResumeVersion {
  if (!record(value) || typeof value.id !== 'string' || typeof value.savedJobId !== 'string'
    || !record(value.jobSnapshot) || typeof value.jobSnapshot.title !== 'string' || typeof value.jobSnapshot.company !== 'string'
    || (value.jobSnapshot.descriptionText !== undefined && (typeof value.jobSnapshot.descriptionText !== 'string' || value.jobSnapshot.descriptionText.length > 12000))
    || typeof value.sourceMasterFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(value.sourceMasterFingerprint)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
    || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string'
    || !isResume(value.resume) || contentLength(value.resume) > maxContentChars) {
    throw new Error('Job-specific resume returned an unusable response.');
  }
  if (value.sourceMasterResumeId !== null && typeof value.sourceMasterResumeId !== 'string') throw new Error('Job-specific resume returned an unusable response.');
  if (value.sourceMasterRevision !== null && (!Number.isSafeInteger(value.sourceMasterRevision) || Number(value.sourceMasterRevision) < 1)) throw new Error('Job-specific resume returned an unusable response.');
  return value as unknown as JobResumeVersion;
}

export function parseJobResumeSummaries(value: unknown): JobResumeVersionSummary[] {
  if (!Array.isArray(value)) throw new Error('Job-specific resumes returned an unusable response.');
  return value.flatMap(item => {
    if (!record(item) || typeof item.id !== 'string' || typeof item.savedJobId !== 'string'
      || !record(item.jobSnapshot) || typeof item.jobSnapshot.title !== 'string' || typeof item.jobSnapshot.company !== 'string'
      || (item.jobSnapshot.descriptionText !== undefined && (typeof item.jobSnapshot.descriptionText !== 'string' || item.jobSnapshot.descriptionText.length > 12000))
      || typeof item.sourceMasterFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(item.sourceMasterFingerprint)
      || !Number.isSafeInteger(item.revision) || Number(item.revision) < 1
      || typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string' || typeof item.savedJobExists !== 'boolean') return [];
    return [item as unknown as JobResumeVersionSummary];
  });
}

export async function jobResumeRequest(ownerId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('Account storage is not available.');
  const session = (await supabase.auth.getSession()).data.session;
  if (session?.user.id !== ownerId) throw new Error('Please sign in again and retry.');
  const response = await fetch('/api/jobs-account', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  let parsed: unknown;
  try { parsed = await response.json(); } catch { throw new Error('Job-specific resume returned an unusable response.'); }
  if (!response.ok) {
    if (response.status === 409 && record(parsed) && parsed.version !== undefined) {
      throw new JobResumeConflictError(parseJobResumeVersion(parsed.version));
    }
    throw new Error(record(parsed) && typeof parsed.error === 'string' ? parsed.error : 'Job-specific resume is temporarily unavailable.');
  }
  if (!record(parsed)) throw new Error('Job-specific resume returned an unusable response.');
  const current = (await supabase.auth.getSession()).data.session;
  if (current?.user.id !== ownerId) throw new Error('Please sign in again and retry.');
  return parsed;
}

export async function fingerprintResume(resume: Resume): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(resume));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
