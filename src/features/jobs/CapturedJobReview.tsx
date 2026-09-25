import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';
import { isJobCapturePayload, type JobCapturePayload } from '../../services/extensionImport';
import { buildResumeEvidence } from './evidence';
import type { Resume } from '../../model';

type Props = { capture: JobCapturePayload; resume: Resume; ownerId: string | null; loading: boolean; onSignIn: () => void; onSaved: (alreadySaved: boolean) => void };
export function CapturedJobReview({ capture, resume, ownerId, loading, onSignIn, onSaved }: Props) {
  const [review, setReview] = useState(capture);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const owner = useRef(ownerId); owner.current = ownerId;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setBusy(false);
    setMessage('');
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [ownerId]);
  async function save() {
    if (!ownerId || !supabase || loading || controller.current) return;
    const requestedOwner = ownerId;
    const { sourceUrl: _url, capturedAt: _time, site: _site, original, originalSourceUrl: _originalUrl, ...fields } = capture;
    const payload = { ...review, originalSourceUrl: capture.originalSourceUrl ?? capture.sourceUrl, original: original || fields };
    if (!isJobCapturePayload(payload)) { setMessage('Review the captured fields and source URL before saving.'); return; }
    const request = new AbortController();
    controller.current = request;
    // Identity as well as cancellation protects against late completions, including
    // switching away and back to the same account while an old request settles.
    const isCurrent = () => controller.current === request && !request.signal.aborted && owner.current === requestedOwner;
    setBusy(true); setMessage('');
    try {
      const auth = await supabase.auth.getSession();
      if (!isCurrent() || auth.data.session?.user.id !== requestedOwner) return;
      const response = await fetch('/api/jobs-account', {
        signal: request.signal,
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.data.session.access_token}` },
        body: JSON.stringify({ action: 'capture_save', capture: payload, evidence: buildResumeEvidence(resume) }),
      });
      const result = await response.json();
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Unable to save this capture. Retry when the connection is restored.');
      if (!result || typeof result.savedJobId !== 'string' || typeof result.alreadySaved !== 'boolean') throw new Error('Job saving returned an unusable response. Please retry.');
      onSaved(result.alreadySaved);
    } catch (error) { if (isCurrent()) setMessage(error instanceof Error ? error.message : 'Unable to save this capture.'); }
    finally {
      if (isCurrent()) { controller.current = null; setBusy(false); }
    }
  }
  return <details className="job-description-details" open>
    <summary>Review and save captured job</summary>
    <div className="field captured-job-review">
      <p>Save to your signed-in account to see how you match, then use the normal saved-job resume and tailoring workflow. The original capture and your edits are retained. Saving does not call an AI or job-search provider.</p>
      <label>Captured job title<input name="captured-title" autoComplete="off" value={review.title} maxLength={300} onChange={event => setReview({ ...review, title: event.target.value })} /></label>
      <label>Captured company<input name="captured-company" autoComplete="off" value={review.company} maxLength={300} onChange={event => setReview({ ...review, company: event.target.value })} /></label>
      <label>Captured location<input name="captured-location" autoComplete="off" value={review.location || ''} maxLength={300} onChange={event => setReview({ ...review, location: event.target.value })} /></label>
      <label>Captured source URL<input name="captured-sourceUrl" autoComplete="off" type="url" spellCheck={false} value={review.sourceUrl} maxLength={2000} onChange={event => setReview({ ...review, sourceUrl: event.target.value })} /></label>
      <label>Captured description<textarea name="captured-description" autoComplete="off" value={review.description} maxLength={12000} rows={6} onChange={event => setReview({ ...review, description: event.target.value })} /></label>
      {ownerId ? <button className="button" disabled={busy || loading} onClick={() => void save()}>{busy ? 'Saving captured job…' : 'Save job and see how I match'}</button>
        : <button className="button" disabled={loading} onClick={onSignIn}>Sign in to save captured job</button>}
      {message && <p role="status">{message}</p>}
    </div>
  </details>;
}
