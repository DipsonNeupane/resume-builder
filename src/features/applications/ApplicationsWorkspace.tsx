import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import {
  APPLICATION_LIMITS, CLOSED_REASON_LABELS, ORIGIN_LABELS, STAGES, STAGE_LABELS, localDay, publicJobUrl,
  type ApplicationEvent, type ApplicationPatch, type ApplicationRecord, type Stage,
} from '../../lib/applications';
import { CsvError, IMPORT_FIELDS, IMPORT_FIELD_LABELS, applicationsToCsv, guessMapping, mapRows, parseCsv, type ColumnMapping } from '../../lib/applicationCsv';
import { fillMissingPosting, confirmSubmitted, importApplications, loadApplicationDocument, type ImportRowResult, type StoredDocument, type TrackedJob } from '../../services/applicationsApi';
import { isResume, type Resume } from '../../model';
import { trackProductEvent } from '../../services/analytics';
import { launchFacts } from '../../content/launchFacts';
import { StageControl } from './StageControl';
import { ProvenanceList } from '../tailoring/ProvenanceList';
import { readProvenance } from '../../lib/tailoringProvenance';
import { useApplications, type SaveStatus } from './useApplications';
import './applications.css';

export type ApplicationsView = { kind: 'today' } | { kind: 'list' } | { kind: 'detail'; savedJobId: string };

type Props = {
  ownerId: string | null;
  sessionLoading: boolean;
  view: ApplicationsView;
  onOpenList: () => void;
  onOpenDetail: (savedJobId: string) => void;
  onOpenToday: () => void;
  onDiscover: () => void;
  onPrepare: (savedJobId: string) => void;
  onSignIn: () => void;
  onViewPro: () => void;
};

type Row = { job: TrackedJob; application: ApplicationRecord };
const StoredPreview = lazy(() => import('../../components/ResumePreview').then(module => ({ default: module.PaginatedResumePreview })));

/** Read-only view of a kept document: the exact resume content stored when it was
 * exported. Later edits to the master or the job-specific version never change it. */
function StoredDocumentView({ ownerId, documentId }: { ownerId: string; documentId: string }) {
  const [state, setState] = useState<{ document: StoredDocument; resume: Resume } | 'loading' | 'error'>('loading');
  useEffect(() => {
    let live = true;
    loadApplicationDocument(ownerId, documentId).then(document => { if (live) setState(isResume(document.resume) ? { document, resume: document.resume } : 'error'); }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [ownerId, documentId]);
  if (state === 'loading') return <p className="field-hint" role="status">Loading the kept version…</p>;
  if (state === 'error') return <p className="field-error" role="alert">This kept version could not be loaded. Try again.</p>;
  // Read against the kept snapshot itself, so it shows what was true when exported.
  const provenance = readProvenance(state.document.provenance);
  return <div className="stored-document" role="region" aria-label="Kept version, read-only">
    <p className="field-hint">Exactly as exported {dateTimeFormat.format(new Date(state.document.exportedAt))}{state.document.submittedAt ? ' and confirmed as submitted' : ''}. Read-only: later edits never change it.</p>
    {provenance && provenance.length > 0 ? <ProvenanceList entries={provenance} resume={state.resume} heading="Tailoring record kept with this version" />
      : <p className="field-hint">{provenance ? 'No AI suggestions were accepted in this version.' : 'No tailoring record was kept with this version.'}</p>}
    <Suspense fallback={<p className="field-hint" role="status">Loading preview…</p>}><div className="paper-container"><StoredPreview resume={state.resume} /></div></Suspense>
  </div>;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device time zone';
const formatDay = (day: string) => dateFormat.format(new Date(`${day}T12:00:00`));
const endOfToday = () => { const date = new Date(); date.setHours(23, 59, 59, 999); return date.getTime(); };

function dueState(application: ApplicationRecord): 'overdue' | 'today' | 'soon' | null {
  if (!application.nextActionDue || application.stage === 'closed') return null;
  const due = Date.parse(application.nextActionDue);
  const end = endOfToday();
  if (due < Date.now()) return 'overdue';
  if (due <= end) return 'today';
  if (due <= end + 7 * 86_400_000) return 'soon';
  return null;
}
const needsAttention = (application: ApplicationRecord) => {
  const due = dueState(application);
  return due === 'overdue' || due === 'today' || application.stage === 'preparing';
};

function StatusLine({ status, savedJobId, onUndo, onRetry, onReload, onDismiss }: { status: SaveStatus; savedJobId?: string; onUndo: (patch: ApplicationPatch, id: string) => void; onRetry: (patch: ApplicationPatch, id: string) => void; onReload: () => void; onDismiss: () => void }) {
  if (status.kind === 'idle' || (savedJobId && status.savedJobId !== savedJobId)) return <p className="tracker-status" role="status" aria-live="polite" />;
  if (status.kind === 'saving') return <p className="tracker-status" role="status" aria-live="polite">Saving…</p>;
  if (status.kind === 'saved') return <p className="tracker-status is-saved" role="status" aria-live="polite">{status.message}{status.undo && <> <button className="text-button" onClick={() => onUndo(status.undo!, status.savedJobId)}>Undo</button></>} <button className="text-button" aria-label="Dismiss message" onClick={onDismiss}>Dismiss</button></p>;
  return <p className="tracker-status is-error" role="alert">Not saved: {status.message} {status.conflict
    ? <button className="text-button" onClick={onReload}>Reload latest</button>
    : <button className="text-button" onClick={() => onRetry(status.retry, status.savedJobId)}>Try again</button>}</p>;
}

function QuickAdd({ onCreate, atLimit, limit }: { onCreate: (input: Record<string, unknown>) => Promise<string | null>; atLimit: boolean; limit: number }) {
  const [descriptionText, setDescriptionText] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<Stage>('saved');
  const [url, setUrl] = useState('');
  const [more, setMore] = useState(false);
  const [location, setLocation] = useState('');
  const [appliedOn, setAppliedOn] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlProblem = url.trim() && !publicJobUrl(url) ? 'Use a public https job link, or leave it empty.' : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (urlProblem) return;
    setBusy(true); setError(null);
    const message = await onCreate({
      company, title, stage, sourceUrl: url.trim() || null, location, notes, descriptionText,
      appliedOn: stage === 'applied' ? (appliedOn || localDay()) : appliedOn || null,
      closedReason: stage === 'closed' ? 'other' : null,
      nextAction: nextAction.trim(), nextActionDue: nextDue ? new Date(nextDue).toISOString() : null,
    });
    setBusy(false);
    if (message) { setError(message); return; }
    setDescriptionText(''); setCompany(''); setTitle(''); setStage('saved'); setUrl(''); setLocation(''); setAppliedOn(''); setNextAction(''); setNextDue(''); setNotes(''); setMore(false);
  };

  if (atLimit) return <div className="tracker-card" role="note"><h2>Add application</h2><p>You are tracking {limit} applications, the Free limit. Every existing record stays available to view, update and export. Pro adds more.</p></div>;
  return <form className="tracker-card quick-add" onSubmit={submit} aria-labelledby="quick-add-title">
    <h2 id="quick-add-title">Add application</h2>
    <p className="field-hint">Only company, role and stage are needed. No resume required.</p>
    <div className="quick-add-grid">
      <label className="field compact"><span>Company</span><input required maxLength={APPLICATION_LIMITS.company} value={company} onChange={event => setCompany(event.target.value)} autoComplete="organization" /></label>
      <label className="field compact"><span>Role</span><input required maxLength={APPLICATION_LIMITS.title} value={title} onChange={event => setTitle(event.target.value)} autoComplete="off" /></label>
      <label className="field compact"><span>Stage</span><select value={stage} onChange={event => setStage(event.target.value as Stage)}>{STAGES.map(item => <option key={item} value={item}>{STAGE_LABELS[item]}</option>)}</select></label>
    </div>
    <label className="field compact"><span>Job link (optional)</span><input type="url" inputMode="url" placeholder="https://" maxLength={APPLICATION_LIMITS.url} value={url} onChange={event => setUrl(event.target.value)} aria-invalid={Boolean(urlProblem)} aria-describedby="quick-add-url-hint" /></label>
    <small id="quick-add-url-hint" className={urlProblem ? 'field-error' : 'field-hint'}>{urlProblem ?? 'APWICO keeps the link for you and does not fetch the page. Add any details yourself.'}</small>
    <label className="field compact"><span>Job description (optional for tracking)</span><textarea rows={3} maxLength={12000} value={descriptionText} onChange={event => setDescriptionText(event.target.value)} placeholder="Paste the responsibilities and qualifications to enable matching and tailoring." /><small className="field-hint">A description is needed before starting your tailoring trial. Tracking needs no resume or posting.</small></label>
    <button type="button" className="text-button" aria-expanded={more} onClick={() => setMore(value => !value)}>{more ? 'Fewer details' : 'More details (optional)'}</button>
    {more && <div className="quick-add-grid">
      <label className="field compact"><span>Location</span><input maxLength={APPLICATION_LIMITS.location} value={location} onChange={event => setLocation(event.target.value)} /></label>
      {(stage === 'applied' || stage === 'interviewing' || stage === 'offer') && <label className="field compact"><span>Date applied</span><input type="date" max={localDay(new Date(Date.now() + 86_400_000))} value={appliedOn} onChange={event => setAppliedOn(event.target.value)} /></label>}
      <label className="field compact"><span>Next action</span><input maxLength={APPLICATION_LIMITS.nextAction} value={nextAction} onChange={event => setNextAction(event.target.value)} placeholder="e.g. Follow up with recruiter" /></label>
      <label className="field compact"><span>Due</span><input type="datetime-local" value={nextDue} onChange={event => setNextDue(event.target.value)} disabled={!nextAction.trim()} /></label>
      <label className="field compact full"><span>Notes</span><textarea rows={2} maxLength={APPLICATION_LIMITS.notes} value={notes} onChange={event => setNotes(event.target.value)} /></label>
    </div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={busy || !company.trim() || !title.trim() || Boolean(urlProblem)}>{busy ? 'Adding…' : 'Add application'}</button>
  </form>;
}

function ImportPanel({ ownerId, onDone }: { ownerId: string; onDone: () => void }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportRowResult[] | null>(null);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportRowResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mapped = useMemo(() => rows ? mapRows(rows, mapping) : [], [rows, mapping]);

  const readFile = async (file: File | undefined) => {
    setError(null); setPreview(null); setResult(null); setRows(null);
    if (!file) return;
    if (file.size > 1_000_000) { setError('This file is larger than 1 MB. Split it into smaller files.'); return; }
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) { setError('The file needs a header row and at least one application.'); return; }
      setRows(parsed); setMapping(guessMapping(parsed[0]));
    } catch (problem) { setError(problem instanceof CsvError ? problem.message : 'This file could not be read as CSV.'); }
  };
  const run = async (commit: boolean) => {
    setBusy(true); setError(null);
    try {
      const outcome = await importApplications(ownerId, mapped, commit, [...keep]);
      if (commit) {
        setResult(outcome);
        trackProductEvent('applications_imported', { surface: 'applications', user_state: 'authenticated', result_bucket: outcome.some(item => item.status === 'created') ? 'some' : 'none' });
        onDone();
      } else setPreview(outcome);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Import is temporarily unavailable.'); }
    setBusy(false);
  };
  const statusText: Record<ImportRowResult['status'], string> = { ready: 'Ready', invalid: 'Needs a fix', duplicate: 'Already tracked', possible_duplicate: 'Possible duplicate', created: 'Imported', skipped: 'Skipped', failed: 'Not imported' };

  return <section className="tracker-card" aria-labelledby="import-title">
    <h2 id="import-title">Import from a spreadsheet</h2>
    <p className="field-hint">Export your sheet as CSV (up to {APPLICATION_LIMITS.importRows} rows, 1 MB). Columns are matched for you; adjust them before previewing. The file is read in this browser and only the mapped fields are sent.</p>
    <label className="field compact"><span>CSV file</span><input type="file" accept=".csv,text/csv" onChange={event => void readFile(event.target.files?.[0])} /></label>
    {error && <p className="field-error" role="alert">{error}</p>}
    {rows && !result && <>
      <fieldset className="import-mapping"><legend>Match your columns</legend>
        {IMPORT_FIELDS.map(field => <label key={field} className="field compact"><span>{IMPORT_FIELD_LABELS[field]}</span>
          <select value={mapping[field] ?? ''} onChange={event => { setPreview(null); setMapping(current => ({ ...current, [field]: event.target.value === '' ? undefined : Number(event.target.value) })); }}>
            <option value="">Not in file</option>{rows[0].map((name, index) => <option key={index} value={index}>{name || `Column ${index + 1}`}</option>)}
          </select></label>)}
      </fieldset>
      <button className="button outline" disabled={busy || mapping.company === undefined || mapping.title === undefined} onClick={() => void run(false)}>{busy && !preview ? 'Checking…' : `Preview ${rows.length - 1} rows`}</button>
    </>}
    {preview && !result && <>
      <div className="import-table" role="region" aria-label="Import preview" tabIndex={0}><table><thead><tr><th scope="col">Row</th><th scope="col">Company</th><th scope="col">Role</th><th scope="col">Result</th></tr></thead><tbody>
        {preview.map(item => <tr key={item.row} className={`is-${item.status}`}><td>{item.row}</td><td>{String(mapped[item.row - 1]?.company ?? '')}</td><td>{String(mapped[item.row - 1]?.title ?? '')}</td>
          <td><strong>{statusText[item.status]}</strong>{item.message && <span> — {item.message}</span>}
            {item.status === 'possible_duplicate' && <label className="checkbox-field"><input type="checkbox" checked={keep.has(item.row)} onChange={event => setKeep(current => { const next = new Set(current); if (event.target.checked) next.add(item.row); else next.delete(item.row); return next; })} />Import anyway (different opening)</label>}</td></tr>)}
      </tbody></table></div>
      <p className="field-hint">{preview.filter(item => item.status === 'ready').length + keep.size} will be imported. Rows that need a fix, already-tracked links and unticked possible duplicates are skipped.</p>
      <button className="button" disabled={busy || preview.filter(item => item.status === 'ready').length + keep.size === 0} onClick={() => void run(true)}>{busy ? 'Importing…' : 'Import applications'}</button>
    </>}
    {result && <div role="status"><p><strong>{result.filter(item => item.status === 'created').length} imported.</strong> {result.filter(item => item.status === 'failed').length > 0 && `${result.filter(item => item.status === 'failed').length} could not be imported.`}</p>
      <ul className="import-results">{result.filter(item => item.status !== 'created').map(item => <li key={item.row}>Row {item.row}: {statusText[item.status]}{item.message ? ` — ${item.message}` : ''}</li>)}</ul></div>}
  </section>;
}

function JobLink({ job }: { job: TrackedJob }) {
  if (!job.sourceUrl) return null;
  return <a className="text-link" href={job.sourceUrl} target="_blank" rel="noopener noreferrer">View posting on {new URL(job.sourceUrl).hostname}<span className="visually-hidden"> (opens the employer or job site; does not mark this applied)</span></a>;
}

function SubmitPrompt({ ownerId, row, onSaved }: { ownerId: string; row: Row; onSaved: (next: ApplicationRecord) => void }) {
  const latest = row.application.documents[0];
  const [day, setDay] = useState(localDay());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!latest || row.application.stage !== 'preparing') return null;
  return <div className="tracker-card submit-prompt" role="region" aria-label="Submission check">
    <h3>Did you submit this application?</h3>
    <p className="field-hint">You exported a {latest.format.toUpperCase()} on {dateTimeFormat.format(new Date(latest.exportedAt))}. APWICO records Applied only when you confirm it; opening the job page or downloading never does.</p>
    <label className="field compact"><span>Date submitted</span><input type="date" value={day} max={localDay(new Date(Date.now() + 86_400_000))} onChange={event => setDay(event.target.value)} /></label>
    {error && <p className="field-error" role="alert">{error}</p>}
    <button className="button" disabled={busy || !day} onClick={async () => {
      setBusy(true); setError(null);
      try {
        const next = await confirmSubmitted(ownerId, row.application.savedJobId, row.application.revision, day, latest.id);
        trackProductEvent('application_submitted_confirmed', { surface: 'applications', user_state: 'authenticated' });
        onSaved(next);
      } catch (problem) { setError(problem instanceof Error ? problem.message : 'Not saved. Try again.'); }
      setBusy(false);
    }}>Yes, record as applied with this document</button>
  </div>;
}

export function ApplicationsWorkspace(props: Props) {
  const { ownerId, view } = props;
  const data = useApplications(ownerId);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'active' | 'all' | Stage>('active');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showImport, setShowImport] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [view.kind]);

  const rows: Row[] = useMemo(() => {
    if (!data.snapshot) return [];
    const jobs = new Map(data.snapshot.jobs.map(job => [job.id, job]));
    return data.snapshot.applications.flatMap(application => { const job = jobs.get(application.savedJobId); return job ? [{ job, application }] : []; });
  }, [data.snapshot]);
  const counts = useMemo(() => Object.fromEntries(STAGES.map(stage => [stage, rows.filter(row => row.application.stage === stage).length])) as Record<Stage, number>, [rows]);
  const update = (savedJobId: string, patch: ApplicationPatch) => void data.update(savedJobId, patch);
  const statusLine = (savedJobId?: string) => <StatusLine status={data.status} savedJobId={savedJobId} onDismiss={data.dismissStatus} onReload={data.reload}
    onUndo={(patch, id) => void data.update(id, patch, { isUndo: true })} onRetry={(patch, id) => void data.update(id, patch)} />;

  const create = async (input: Record<string, unknown>) => {
    try {
      const result = await data.create(input);
      if (result.alreadySaved) return 'This job link is already in your applications. Open it from the list to update it.';
      return null;
    } catch (error) { return error instanceof Error ? error.message : 'Not added. Try again.'; }
  };

  const header = (title: string, intro: string) => <div className="tracker-heading">
    <div><span className="section-label">Private workspace</span><h1 ref={headingRef} tabIndex={-1}>{title}</h1><p>{intro}</p></div>
  </div>;

  if (props.sessionLoading) return <section className="tracker" aria-busy="true"><h1 className="visually-hidden">Loading</h1><p className="route-loading" role="status">Loading your workspace…</p></section>;
  if (!ownerId) return <section className="tracker">{header(view.kind === 'today' ? 'Today' : 'My applications', 'Keep every application, stage and next step in one private list.')}
    <div className="empty-state"><strong>Sign in to track applications.</strong><p>Applications are stored in your account so they are available after reload and on other devices. No resume is needed to start.</p><button className="button" onClick={props.onSignIn}>Sign in or create a free account</button></div></section>;
  if (data.loading && !data.snapshot) return <section className="tracker" aria-busy="true">{header(view.kind === 'today' ? 'Today' : 'My applications', '')}<p className="route-loading" role="status">Loading your applications…</p></section>;
  if (data.loadError || !data.snapshot) return <section className="tracker">{header(view.kind === 'today' ? 'Today' : 'My applications', '')}
    <div className="empty-state" role="alert"><strong>Your applications could not be loaded.</strong><p>{data.loadError ?? 'Please try again.'} Nothing was changed.</p><button className="button" onClick={data.reload}>Try again</button></div></section>;

  const { saveLimit, savedCount, isPro } = data.snapshot;
  const atLimit = !isPro && savedCount >= saveLimit;

  if (view.kind === 'detail') {
    const row = rows.find(item => item.application.savedJobId === view.savedJobId);
    if (!row) return <section className="tracker">{header('Application', '')}<div className="empty-state" role="status"><strong>This application is unavailable.</strong><p>It may have been removed or belong to another account. No application content was loaded.</p><button className="button" onClick={props.onOpenList}>Back to My applications</button></div></section>;
    return <ApplicationDetail row={row} ownerId={ownerId} busy={data.status.kind === 'saving'} statusLine={statusLine(row.application.savedJobId)} headingRef={headingRef}
      onUpdate={patch => update(row.application.savedJobId, patch)} onBack={props.onOpenList} onPrepare={() => props.onPrepare(row.application.savedJobId)} onReplaced={data.reload} />;
  }

  const pipeline = <ul className="pipeline-counts" aria-label="Applications by stage">{STAGES.map(stage => <li key={stage}><button className="pipeline-count" onClick={() => { setStageFilter(stage); props.onOpenList(); }}><strong>{counts[stage]}</strong><span>{STAGE_LABELS[stage]}</span></button></li>)}</ul>;

  if (view.kind === 'today') {
    const due = rows.filter(row => { const state = dueState(row.application); return state === 'overdue' || state === 'today'; })
      .sort((a, b) => Date.parse(a.application.nextActionDue!) - Date.parse(b.application.nextActionDue!));
    const soon = rows.filter(row => dueState(row.application) === 'soon').sort((a, b) => Date.parse(a.application.nextActionDue!) - Date.parse(b.application.nextActionDue!));
    const preparing = rows.filter(row => row.application.stage === 'preparing');
    const interviewing = rows.filter(row => row.application.stage === 'interviewing' && !row.application.nextActionDue);
    const item = (row: Row, detail: string) => <li key={row.application.savedJobId}><button className="today-item" onClick={() => props.onOpenDetail(row.application.savedJobId)}><strong>{row.job.title}</strong><span>{row.job.company} · {STAGE_LABELS[row.application.stage]}</span><small>{detail}</small></button></li>;
    return <section className="tracker" aria-labelledby="today-title">
      <div className="tracker-heading"><div><span className="section-label">Private workspace</span><h1 id="today-title" ref={headingRef} tabIndex={-1}>Today</h1><p>What needs your attention, from what you have recorded. Times use {timeZone}.</p></div>
        <div className="tracker-heading-actions"><button className="button" onClick={props.onOpenList}>Add application</button><button className="button outline" onClick={props.onDiscover}>Discover jobs</button></div></div>
      {pipeline}
      {rows.length === 0 ? <div className="empty-state"><strong>Nothing to do yet.</strong><p>Add an application you are already working on, or find roles to save. You do not need a resume or quiz to start.</p>
        <div className="job-card-actions"><button className="button" onClick={props.onOpenList}>Add your first application</button><button className="button outline" onClick={props.onDiscover}>Find jobs</button></div></div>
        : <div className="today-grid">
          <section aria-labelledby="today-due"><h2 id="today-due">Due today or overdue</h2>{due.length ? <ul className="today-list">{due.map(row => item(row, `${dueState(row.application) === 'overdue' ? 'Suggested — was due' : 'Due'} ${dateTimeFormat.format(new Date(row.application.nextActionDue!))}: ${row.application.nextAction}`))}</ul> : <p className="field-hint">No next actions are due. Add one to any application to see it here.</p>}</section>
          <section aria-labelledby="today-soon"><h2 id="today-soon">Coming up this week</h2>{soon.length ? <ul className="today-list">{soon.map(row => item(row, `${dateTimeFormat.format(new Date(row.application.nextActionDue!))}: ${row.application.nextAction}`))}</ul> : <p className="field-hint">Nothing scheduled in the next seven days.</p>}</section>
          <section aria-labelledby="today-preparing"><h2 id="today-preparing">Preparing</h2>{preparing.length ? <ul className="today-list">{preparing.map(row => item(row, row.application.documents.length ? 'Document exported — confirm when you submit' : 'Materials in progress'))}</ul> : <p className="field-hint">No applications are being prepared.</p>}</section>
          {interviewing.length > 0 && <section aria-labelledby="today-interviewing"><h2 id="today-interviewing">Interviewing without a next step</h2><ul className="today-list">{interviewing.map(row => item(row, 'Add the next interview or follow-up date'))}</ul></section>}
        </div>}
      <p className="field-hint">Reminders appear here in APWICO only. No email, push or calendar notifications are sent. An overdue item is a suggestion, not an instruction to send a message.</p>
    </section>;
  }

  const lowered = query.trim().toLocaleLowerCase();
  const visible = rows.filter(({ job, application }) => {
    if (stageFilter === 'active' ? application.stage === 'closed' : stageFilter !== 'all' && application.stage !== stageFilter) return false;
    if (attentionOnly && !needsAttention(application)) return false;
    if (lowered && !`${job.company} ${job.title}`.toLocaleLowerCase().includes(lowered)) return false;
    const day = application.updatedAt.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
  const exportCsv = () => {
    const csv = applicationsToCsv(rows.map(row => ({ company: row.job.company, title: row.job.title, sourceUrl: row.job.sourceUrl, location: row.job.location, application: row.application })));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `apwico-applications-${localDay()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return <section className="tracker" aria-labelledby="applications-title">
    <div className="tracker-heading"><div><span className="section-label">Private workspace</span><h1 id="applications-title" ref={headingRef} tabIndex={-1}>My applications</h1>
      <p>{isPro ? `${savedCount} tracked.` : `${savedCount} of ${saveLimit} Free applications used. Status updates never use AI or your allowance.`}</p></div>
      <div className="tracker-heading-actions"><button className="button outline" onClick={() => setShowImport(value => !value)} aria-expanded={showImport}>Import CSV</button><button className="button outline" onClick={exportCsv} disabled={!rows.length}>Export CSV</button></div></div>
    {pipeline}
    <div className="tracker-columns">
      <div className="tracker-side">
        <QuickAdd onCreate={create} atLimit={atLimit} limit={saveLimit} />
        {showImport && (atLimit ? <p className="field-hint" role="note">Import is unavailable at the Free limit of {launchFacts.freeApplications}. Existing records are unchanged.</p> : <ImportPanel ownerId={ownerId} onDone={data.reload} />)}
      </div>
      <div className="tracker-main">
        <form className="tracker-filters" role="search" aria-label="Filter applications" onSubmit={event => event.preventDefault()}>
          <label className="field compact"><span>Search company or role</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <label className="field compact"><span>Stage</span><select value={stageFilter} onChange={event => setStageFilter(event.target.value as typeof stageFilter)}><option value="active">All open</option><option value="all">All, including closed</option>{STAGES.map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}</select></label>
          <label className="field compact"><span>Updated from</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label className="field compact"><span>Updated to</span><input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
          <label className="checkbox-field"><input type="checkbox" checked={attentionOnly} onChange={event => setAttentionOnly(event.target.checked)} />Needs attention</label>
        </form>
        {statusLine()}
        <p className="visually-hidden" role="status" aria-live="polite">{visible.length} {visible.length === 1 ? 'application' : 'applications'} shown</p>
        {rows.length === 0 ? <div className="empty-state"><strong>No applications yet.</strong><p>Add one with the form, import a spreadsheet, or save a job from Discover.</p></div>
          : visible.length === 0 ? <div className="empty-state" role="status"><strong>No applications match these filters.</strong><button className="text-button" onClick={() => { setQuery(''); setStageFilter('all'); setAttentionOnly(false); setFrom(''); setTo(''); }}>Clear filters</button></div>
            : <ul className="application-list">{visible.map(({ job, application }) => {
              const state = dueState(application);
              return <li key={application.savedJobId} className="application-row">
                <div className="application-row-main">
                  <button className="application-open" onClick={() => props.onOpenDetail(application.savedJobId)}><strong>{job.title}</strong><span>{job.company}{job.location ? ` · ${job.location}` : ''}</span></button>
                  <p className="application-meta">
                    {application.stage === 'closed' && application.closedReason && <span className="stage-chip is-closed">Closed · {CLOSED_REASON_LABELS[application.closedReason]}</span>}
                    {application.appliedOn && <span>Applied {formatDay(application.appliedOn)}</span>}
                    {application.nextAction && <span className={state === 'overdue' ? 'is-overdue' : ''}>{state === 'overdue' ? 'Suggested follow-up: ' : 'Next: '}{application.nextAction}{application.nextActionDue ? ` · ${dateTimeFormat.format(new Date(application.nextActionDue))}` : ''}</span>}
                    {!job.providerAvailable && <span>Listing no longer available</span>}
                  </p>
                </div>
                <StageControl application={application} busy={data.status.kind === 'saving' && data.status.savedJobId === application.savedJobId} onChange={patch => update(application.savedJobId, patch)} label={`Stage for ${job.title}`} />
              </li>;
            })}</ul>}
      </div>
    </div>
  </section>;
}

type DetailProps = {
  row: Row; ownerId: string; busy: boolean; statusLine: ReactNode; headingRef: RefObject<HTMLHeadingElement | null>;
  onUpdate: (patch: ApplicationPatch) => void; onBack: () => void; onPrepare: () => void; onReplaced: () => void;
};

function ApplicationDetail({ row, ownerId, busy, statusLine, headingRef, onUpdate, onBack, onPrepare, onReplaced }: DetailProps) {
  const { job, application } = row;
  const [posting, setPosting] = useState('');
  const [postingBusy, setPostingBusy] = useState(false);
  const [postingError, setPostingError] = useState('');
  async function savePosting() {
    setPostingBusy(true); setPostingError('');
    try { await fillMissingPosting(ownerId, application.savedJobId, posting); onReplaced(); }
    catch (error) { setPostingError(error instanceof Error ? error.message : 'Unable to save posting.'); }
    finally { setPostingBusy(false); }
  }
  const [notes, setNotes] = useState(application.notes);
  const [contactName, setContactName] = useState(application.contactName);
  const [contactDetails, setContactDetails] = useState(application.contactDetails);
  const [nextAction, setNextAction] = useState(application.nextAction);
  const [nextDue, setNextDue] = useState(application.nextActionDue ? localDateTime(application.nextActionDue) : '');
  const [viewing, setViewing] = useState<string | null>(null);
  useEffect(() => {
    setNotes(application.notes); setContactName(application.contactName); setContactDetails(application.contactDetails);
    setNextAction(application.nextAction); setNextDue(application.nextActionDue ? localDateTime(application.nextActionDue) : '');
  }, [application.savedJobId, application.revision]);
  const dirtyNotes = notes !== application.notes || contactName !== application.contactName || contactDetails !== application.contactDetails;
  const dueIso = nextDue ? new Date(nextDue).toISOString() : null;
  const dirtyNext = nextAction.trim() !== application.nextAction || dueIso !== (application.nextActionDue ? new Date(application.nextActionDue).toISOString() : null);
  const salary = job.salary ? `${job.salary.currency} ${job.salary.min.toLocaleString()}–${job.salary.max.toLocaleString()} per ${job.salary.period}` : null;

  return <section className="tracker application-detail" aria-labelledby="application-title">
    <button className="back-link" onClick={onBack}>Back to My applications</button>
    <div className="tracker-heading"><div><span className="section-label">{STAGE_LABELS[application.stage]}{application.closedReason ? ` · ${CLOSED_REASON_LABELS[application.closedReason]}` : ''}</span><h1 id="application-title" ref={headingRef} tabIndex={-1}>{job.title}</h1><p>{job.company}{job.location ? ` · ${job.location}` : ''}</p></div>
      <div className="tracker-heading-actions">{application.stage !== 'closed' && <button className="button" onClick={onPrepare}>Prepare my application</button>}</div></div>
    {statusLine}
    {!job.descriptionAvailable && <section className="tracker-card" aria-label="Add missing job description"><h2>Add the job description</h2><p>Enable matching and tailoring for this application. Previously exported or submitted documents stay unchanged.</p><label className="field"><span>Job description</span><textarea rows={5} maxLength={12000} value={posting} onChange={event => setPosting(event.target.value)} /></label>{postingError && <p role="alert">{postingError}</p>}<button className="button" disabled={postingBusy || !posting.trim()} onClick={() => void savePosting()}>{postingBusy ? 'Saving posting…' : 'Save job description'}</button></section>}
    <div className="detail-grid">
      <section aria-labelledby="detail-overview" className="tracker-card"><h2 id="detail-overview">Overview</h2>
        <StageControl application={application} busy={busy} onChange={onUpdate} />
        <dl className="detail-facts">
          <div><dt>Applied</dt><dd>{application.appliedOn ? formatDay(application.appliedOn) : 'Not recorded'}</dd></div>
          <div><dt>Salary</dt><dd>{salary ?? 'Not listed'}</dd></div>
          <div><dt>Source</dt><dd>{job.provider === 'manual' ? 'Added by you' : job.provider === 'extension' ? 'Saved from a job page' : 'Found in Discover'} · {dateFormat.format(new Date(job.savedAt || application.createdAt))}</dd></div>
          {application.priorStage && <div><dt>Previous stage</dt><dd>{STAGE_LABELS[application.priorStage]}</dd></div>}
        </dl>
        <JobLink job={job} />
        {application.stage === 'closed' && <button className="text-button" onClick={() => onUpdate({ stage: application.priorStage && application.priorStage !== 'closed' ? application.priorStage : 'saved' })}>Reopen application</button>}
      </section>
      <section aria-labelledby="detail-materials" className="tracker-card"><h2 id="detail-materials">Application materials</h2>
        {application.documents.length ? <ul className="document-list">{application.documents.map(doc => <li key={doc.id}><strong>{doc.format === 'pdf' ? 'PDF (keeps the design)' : 'Word (editable content)'}</strong><span>{doc.sourceKind === 'job_version' ? 'Job-specific version' : 'Master resume'} · {doc.template} · exported {dateTimeFormat.format(new Date(doc.exportedAt))}</span>{doc.submittedAt && <span className="stage-chip">Submitted version</span>}
          <button className="text-button" aria-expanded={viewing === doc.id} onClick={() => setViewing(current => current === doc.id ? null : doc.id)}>{viewing === doc.id ? 'Hide this version' : 'View exact version'}</button>
          {viewing === doc.id && <StoredDocumentView ownerId={ownerId} documentId={doc.id} />}</li>)}</ul>
          : <p className="field-hint">No document is attached yet. Exports made while preparing this application are kept here exactly as downloaded.</p>}
        {application.stage !== 'closed' && <button className="button outline" onClick={onPrepare}>{application.stage === 'saved' ? 'Prepare my application' : 'Continue preparing'}</button>}
        <SubmitPrompt ownerId={ownerId} row={row} onSaved={onReplaced} />
      </section>
      <section aria-labelledby="detail-next" className="tracker-card"><h2 id="detail-next">Next action</h2>
        <form onSubmit={event => { event.preventDefault(); onUpdate({ nextAction: nextAction.trim(), nextActionDue: nextAction.trim() ? dueIso : null }); }}>
          <label className="field compact"><span>What is next?</span><input maxLength={APPLICATION_LIMITS.nextAction} value={nextAction} onChange={event => setNextAction(event.target.value)} placeholder="e.g. Send thank-you note" /></label>
          <label className="field compact"><span>Due ({timeZone})</span><input type="datetime-local" value={nextDue} disabled={!nextAction.trim()} onChange={event => setNextDue(event.target.value)} /></label>
          <small className="field-hint">Shown on Today. APWICO does not send email or push reminders.</small>
          <div className="job-card-actions"><button className="button outline" type="submit" disabled={busy || !dirtyNext}>Save next action</button>{application.nextAction && <button className="text-button" type="button" onClick={() => onUpdate({ nextAction: '', nextActionDue: null })}>Clear</button>}</div>
        </form>
      </section>
      <section aria-labelledby="detail-notes" className="tracker-card"><h2 id="detail-notes">Notes</h2>
        <form onSubmit={event => { event.preventDefault(); onUpdate({ notes, contactName, contactDetails }); }}>
          <label className="field compact"><span>Contact or recruiter (optional)</span><input maxLength={APPLICATION_LIMITS.contactName} value={contactName} onChange={event => setContactName(event.target.value)} autoComplete="off" /></label>
          <label className="field compact"><span>Contact details (optional)</span><input maxLength={APPLICATION_LIMITS.contactDetails} value={contactDetails} onChange={event => setContactDetails(event.target.value)} autoComplete="off" /></label>
          <label className="field compact"><span>Private notes</span><textarea rows={4} maxLength={APPLICATION_LIMITS.notes} value={notes} onChange={event => setNotes(event.target.value)} /></label>
          <button className="button outline" type="submit" disabled={busy || !dirtyNotes}>Save notes</button>
        </form>
      </section>
      <section aria-labelledby="detail-timeline" className="tracker-card detail-timeline"><h2 id="detail-timeline">Timeline</h2>
        {(() => { const entries = timelineEntries(application, job); return entries.length ? <ol className="timeline">{entries.map((entry, index) => <li key={`${entry.at}-${index}`}>
          <strong>{entry.label}</strong><span>{entry.origin ? `${ORIGIN_LABELS[entry.origin]} · ` : ''}{dateTimeFormat.format(new Date(entry.at))}</span></li>)}</ol>
          : <p className="field-hint">Stage changes will appear here.</p>; })()}
      </section>
    </div>
  </section>;
}

/** A job saved before tracking started (from Discover or a job page) gets its own "Job saved"
 * entry, and its first tracked stage reads as a move from Saved, not "Added as". Jobs added
 * by hand or by import start tracking at the moment they are added. */
function timelineEntries(application: ApplicationRecord, job: TrackedJob): { label: string; origin: ApplicationEvent['origin'] | null; at: string }[] {
  const savedFirst = job.provider !== 'manual' && !application.events.some(event => event.kind === 'imported');
  const entries = application.events.map(event => {
    const stage = STAGE_LABELS[event.toStage ?? 'saved'];
    const label = event.kind === 'created' ? (event.toStage === 'saved' || !event.toStage ? 'Added to My applications' : savedFirst ? `Saved → ${stage}` : `Added as ${stage}`)
      : event.kind === 'imported' ? `Imported as ${stage}`
      : event.kind === 'stage_changed' ? `${event.fromStage ? `${STAGE_LABELS[event.fromStage]} → ` : ''}${stage}${event.closedReason ? ` (${CLOSED_REASON_LABELS[event.closedReason]})` : ''}`
      : event.kind === 'next_action' ? 'Next action updated' : 'Document attached';
    return { label, origin: event.origin as ApplicationEvent['origin'] | null, at: event.occurredAt };
  });
  if (savedFirst && job.savedAt && application.events.length < 50) entries.push({ label: 'Job saved', origin: null, at: job.savedAt });
  return entries;
}

function localDateTime(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
