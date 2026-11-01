import type { Resume } from '../model';
import type { JobCapturePayload, JobSaveOutcome } from './extensionImport';
import { isJobCapturePayload } from './extensionImport';
import { supabase } from './supabase';
import { buildResumeEvidence } from '../features/jobs/evidence';

export async function saveExternalJob(capture: JobCapturePayload, resume: Resume, ownerId: string | null): Promise<JobSaveOutcome> {
  if (!ownerId || !supabase) return { status: 'signed_out' };
  if (!isJobCapturePayload(capture)) return { status: 'error', message: 'This job link could not be saved.' };
  const auth = await supabase.auth.getSession();
  if (auth.data.session?.user.id !== ownerId) return { status: 'signed_out' };
  const response = await fetch('/api/jobs-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.data.session.access_token}` },
    body: JSON.stringify({ action: 'capture_save', capture, evidence: buildResumeEvidence(resume) }),
  });
  let result: unknown;
  try { result = await response.json(); } catch { result = null; }
  if (!response.ok) {
    const message = result && typeof result === 'object' && typeof (result as Record<string, unknown>).error === 'string'
      ? String((result as Record<string, unknown>).error)
      : 'Could not save this job. Try again.';
    return { status: response.status === 401 ? 'signed_out' : 'error', message };
  }
  if (!result || typeof result !== 'object' || typeof (result as Record<string, unknown>).savedJobId !== 'string' || typeof (result as Record<string, unknown>).alreadySaved !== 'boolean') {
    return { status: 'error', message: 'ResumeStride returned an unexpected response. Try again.' };
  }
  return { status: (result as Record<string, unknown>).alreadySaved ? 'already_saved' : 'saved' };
}
