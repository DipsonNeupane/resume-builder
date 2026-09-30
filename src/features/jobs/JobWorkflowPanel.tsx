import { useEffect, useState } from 'react';

export type JobDecision = 'review' | 'pursue' | 'pass';
export type ApplicationStatus = 'not_applied' | 'preparing' | 'applied' | 'interviewing' | 'offer' | 'closed' | 'withdrawn';

export type JobWorkflow = {
  savedJobId: string;
  decision: JobDecision;
  applicationStatus: ApplicationStatus;
  notes: string;
  contactName: string;
  contactDetails: string;
  reminderEnabled: boolean;
  reminderAt: string | null;
  revision: number;
  updatedAt: string;
  history: { decision: JobDecision; applicationStatus: ApplicationStatus; changedAt: string }[];
};

export const emptyJobWorkflow = (savedJobId: string): JobWorkflow => ({
  savedJobId, decision: 'review', applicationStatus: 'not_applied', notes: '', contactName: '', contactDetails: '', reminderEnabled: false, reminderAt: null, revision: 0, updatedAt: '', history: [],
});

type Props = {
  value: JobWorkflow;
  busy: boolean;
  available?: boolean;
  conflict?: boolean;
  onReload?: () => void;
  onSave: (workflow: JobWorkflow) => Promise<void>;
};

function localDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function JobWorkflowPanel({ value, busy, available = true, conflict = false, onReload, onSave }: Props) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value.savedJobId, value.revision]);
  const update = <K extends keyof JobWorkflow>(key: K, next: JobWorkflow[K]) => setDraft(current => ({ ...current, [key]: next }));
  const reminderValue = localDateTime(draft.reminderAt);

  return <details className="job-workflow">
    <summary>My decision and application</summary>
    {!available && <p className="field-hint" role="alert">Decision and application updates are temporarily unavailable. Your saved job and resume remain available.</p>}
    {conflict && <p className="field-hint" role="alert">This update changed in another tab. Your entries here have not been overwritten. <button className="text-button" onClick={onReload}>Discard these entries and reload the saved update</button></p>}
    <p className="field-hint">You control these fields. ResumeStride does not submit an application or infer a status from visits, downloads, or job activity.</p>
    <div className="job-workflow-grid">
      <label className="field"><span>My decision</span><select value={draft.decision} onChange={event => update('decision', event.target.value as JobDecision)}>
        <option value="review">Reviewing — I have not decided</option><option value="pursue">Pursue — I want to continue</option><option value="pass">Pass — I am not pursuing this role</option>
      </select></label>
      <label className="field"><span>Application status</span><select value={draft.applicationStatus} onChange={event => update('applicationStatus', event.target.value as ApplicationStatus)}>
        <option value="not_applied">Not applied</option><option value="preparing">Preparing application</option><option value="applied">Applied — marked by me</option><option value="interviewing">Interviewing — marked by me</option><option value="offer">Offer — marked by me</option><option value="closed">Closed</option><option value="withdrawn">Withdrawn</option>
      </select></label>
      <label className="field"><span>Contact name (optional)</span><input value={draft.contactName} maxLength={200} autoComplete="off" onChange={event => update('contactName', event.target.value)} /></label>
      <label className="field"><span>Contact details (optional)</span><input value={draft.contactDetails} maxLength={500} autoComplete="off" onChange={event => update('contactDetails', event.target.value)} /></label>
      <label className="field full"><span>Private notes (optional)</span><textarea value={draft.notes} maxLength={4000} rows={3} onChange={event => update('notes', event.target.value)} /></label>
      <label className="checkbox-field full"><input type="checkbox" checked={draft.reminderEnabled} onChange={event => setDraft(current => ({ ...current, reminderEnabled: event.target.checked, reminderAt: event.target.checked ? current.reminderAt : null }))} />Add a follow-up date for this role</label>
      {draft.reminderEnabled && <label className="field full"><span>Follow-up date and time</span><input type="datetime-local" value={reminderValue} min={localDateTime(new Date().toISOString())} onChange={event => update('reminderAt', event.target.value ? new Date(event.target.value).toISOString() : null)} required /><small className="field-hint">This date appears in your workspace only. It does not send email, push, or calendar notifications. Times use {Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device time zone'}.</small></label>}
    </div>
    {draft.reminderEnabled && draft.reminderAt && <p className="field-hint" role="status">Follow-up date: {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.reminderAt))}. Turn it off and save to remove it.</p>}
    <button className="button outline" disabled={!available || conflict || busy || (draft.reminderEnabled && !draft.reminderAt)} onClick={() => void onSave(draft)}>{busy ? 'Saving…' : 'Save my update'}</button>
    {draft.history.length > 0 && <details><summary>Decision and status history</summary><ol>{draft.history.map((item, index) => <li key={`${item.changedAt}-${index}`}><span>{item.decision.replaceAll('_', ' ')} · {item.applicationStatus.replaceAll('_', ' ')}</span><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.changedAt))}</small></li>)}</ol></details>}
  </details>;
}
