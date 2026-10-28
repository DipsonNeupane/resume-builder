import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { trackProductEvent } from '../../services/analytics';
import '../applications/applications.css';

export type DeckJob = {
  id: string; title: string; company: string;
  location: string | null; workplace: 'remote' | 'hybrid' | 'onsite' | 'field' | 'unknown';
  employmentType: string | null; salary: string | null; portal: string | null; postedAt: string | null; checkedAt: string | null;
  sourceUrl: string; resumeReasons: string[]; preferenceFit: string[]; preferenceMismatch: string[]; uncertainty: string[]; dealbreaker: string | null;
};
type Props = {
  ownerId: string;
  jobs: DeckJob[];
  savedIds: Set<string>;
  onSave: (id: string) => Promise<boolean>;
  onUndoSave: (id: string) => Promise<boolean>;
  renderDetails: (id: string) => ReactNode;
  onEditPreferences: () => void;
  onOpenApplications: () => void;
};
type Action = { kind: 'pass' | 'save'; id: string; index: number };

const WORKPLACE: Record<DeckJob['workplace'], string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site', field: 'Field-based', unknown: 'Workplace not listed' };
const PASS_REASONS = [['', 'No reason'], ['role', 'Not the right role'], ['location', 'Location or arrangement'], ['pay', 'Pay'], ['seniority', 'Seniority'], ['company', 'Company'], ['other', 'Other']] as const;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const passedKey = (owner: string) => `apwico.discover.passed.${owner}`;

function readPassed(owner: string): string[] {
  try { const raw = sessionStorage.getItem(passedKey(owner)); const list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list.filter(item => typeof item === 'string').slice(-500) : []; } catch { return []; }
}

/** Discover results as a list or one card at a time. Both views show the same jobs and
 * the same three actions. Passing hides a job for this browsing session only; it never
 * excludes a role or company permanently. Saving creates (or reuses) one application. */
export function DiscoverDeck({ ownerId, jobs, savedIds, onSave, onUndoSave, renderDetails, onEditPreferences, onOpenApplications }: Props) {
  const [view, setView] = useState<'list' | 'cards'>(() => { try { return sessionStorage.getItem('apwico.discover.view') === 'cards' ? 'cards' : 'list'; } catch { return 'list'; } });
  const [passed, setPassed] = useState<string[]>(() => readPassed(ownerId));
  const [showPassed, setShowPassed] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [index, setIndex] = useState(0);
  // Card view opens details on request; the list view shows them unless collapsed.
  const [details, setDetails] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const detailsOpen = (id: string) => view === 'list' ? !collapsed.has(id) : details === id;
  const toggleDetails = (id: string) => view === 'list' ? setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }) : setDetails(value => value === id ? null : id);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<Action[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const cardHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { try { sessionStorage.setItem(passedKey(ownerId), JSON.stringify(passed)); } catch { /* optional */ } }, [passed, ownerId]);
  useEffect(() => { try { sessionStorage.setItem('apwico.discover.view', view); } catch { /* optional */ } }, [view]);

  const hiddenByDealbreaker = jobs.filter(job => job.dealbreaker);
  const visible = useMemo(() => jobs.filter(job => (showHidden || !job.dealbreaker) && (showPassed || !passed.includes(job.id))), [jobs, passed, showPassed, showHidden]);
  // Cards walk the batch in order; saved jobs stay in the batch but are marked.
  const queue = visible;
  const current = queue[Math.min(index, queue.length)] ?? null;
  useEffect(() => { if (view === 'cards') cardHeading.current?.focus(); }, [index, view]);

  const pass = (job: DeckJob, at: number) => {
    setPassed(list => list.includes(job.id) ? list : [...list, job.id]);
    setHistory(list => [...list, { kind: 'pass', id: job.id, index: at }]);
    setStatus(`Passed on ${job.title}. It is hidden for this session only.${reason === 'location' || reason === 'pay' || reason === 'seniority' ? ' If this keeps happening, you can update your preferences.' : ''}`);
    trackProductEvent('job_passed', { surface: 'discover', user_state: 'authenticated' });
    setReason(''); setDetails(null);
    if (view === 'cards' && !showPassed) setIndex(at); // the next job moves into this position
  };
  const save = async (job: DeckJob, at: number) => {
    if (savedIds.has(job.id)) { if (view === 'cards') setIndex(at + 1); return; }
    setBusy(true);
    const ok = await onSave(job.id);
    setBusy(false);
    if (!ok) { setStatus('Not saved. Nothing changed; try again.'); return; }
    setHistory(list => [...list, { kind: 'save', id: job.id, index: at }]);
    setStatus(`Saved ${job.title} to My applications. Saving does not apply.`);
    setDetails(null);
    if (view === 'cards') setIndex(at + 1);
  };
  const undo = async () => {
    const last = history.at(-1);
    if (!last) return;
    if (last.kind === 'pass') setPassed(list => list.filter(id => id !== last.id));
    if (last.kind === 'save') {
      setBusy(true);
      const ok = await onUndoSave(last.id);
      setBusy(false);
      if (!ok) { setStatus('Could not undo the save. The application is still in My applications.'); return; }
    }
    setHistory(list => list.slice(0, -1));
    setIndex(last.index);
    setStatus(last.kind === 'pass' ? 'Pass undone.' : 'Save undone. The application was removed.');
  };

  // Optional gesture: horizontal drags only, never on vertical scroll, and only past a
  // deliberate distance. Buttons remain the primary way to act.
  const onPointerDown = (event: PointerEvent<HTMLElement>) => { if (event.pointerType !== 'mouse' && current) drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx)) { drag.current = null; setOffset(0); return; }
    setOffset(dx);
  };
  const onPointerUp = () => {
    const dx = offset;
    drag.current = null; setOffset(0);
    if (!current || busy) return;
    if (dx > 140) void save(current, index);
    else if (dx < -140) pass(current, index);
  };

  const meta = (job: DeckJob) => <ul className="deck-meta" aria-label="Job facts">
    <li>{job.location ?? 'Location not listed'}</li><li>{WORKPLACE[job.workplace]}</li>
    <li>{job.employmentType ?? 'Employment type not listed'}</li><li>{job.salary ?? 'Salary not listed'}</li>
    <li>{job.portal ? `Source: ${job.portal}` : 'Source not listed'}{job.postedAt ? ` · posted ${dateFormat.format(new Date(job.postedAt))}` : ''}{job.checkedAt ? ` · retrieved ${dateFormat.format(new Date(job.checkedAt))}` : ''}</li>
  </ul>;
  const reasons = (job: DeckJob) => <>
    {job.preferenceFit.length > 0 && <div><strong className="deck-label">Fits your stated preferences</strong><ul>{job.preferenceFit.slice(0, 4).map(item => <li key={item}>{item}</li>)}</ul></div>}
    {job.preferenceMismatch.length > 0 && <div><strong className="deck-label">Ranked lower for your preferences</strong><ul>{job.preferenceMismatch.slice(0, 3).map(item => <li key={item}>{item}</li>)}</ul></div>}
    {job.resumeReasons.length > 0 && <div><strong className="deck-label">From your resume evidence</strong><ul>{job.resumeReasons.slice(0, 3).map(item => <li key={item}>{item}</li>)}</ul></div>}
    {job.uncertainty.length > 0 && <p className="field-hint"><strong>Not stated in the posting:</strong> {job.uncertainty.join(', ')}.</p>}
  </>;
  const actions = (job: DeckJob, at: number) => <div className="job-card-actions deck-actions">
    <button className="button outline" disabled={busy} onClick={() => pass(job, at)} aria-label={`Pass on ${job.title}`}>Pass</button>
    <button className="button outline" aria-expanded={detailsOpen(job.id)} onClick={() => toggleDetails(job.id)}>{detailsOpen(job.id) ? 'Hide details' : 'View details'}</button>
    <button className="button" disabled={busy || savedIds.has(job.id)} onClick={() => void save(job, at)}>{savedIds.has(job.id) ? 'Saved' : 'Save job'}</button>
  </div>;

  return <section className="discover-deck" aria-label="Job results">
    <div className="deck-toolbar">
      <fieldset className="deck-view"><legend className="visually-hidden">Results view</legend>
        {(['list', 'cards'] as const).map(mode => <label key={mode} className={view === mode ? 'is-selected' : ''}><input type="radio" name="discover-view" checked={view === mode} onChange={() => { setView(mode); setIndex(0); }} />{mode === 'list' ? 'List' : 'One at a time'}</label>)}
      </fieldset>
      <button className="text-button" disabled={!history.length || busy} onClick={() => void undo()}>Undo last action</button>
      <button className="text-button" onClick={onEditPreferences}>Edit preferences</button>
    </div>
    <p className="tracker-status" role="status" aria-live="polite">{status}</p>
    {(passed.length > 0 || hiddenByDealbreaker.length > 0) && <p className="field-hint">
      {passed.length > 0 && <label className="checkbox-field"><input type="checkbox" checked={showPassed} onChange={event => setShowPassed(event.target.checked)} />Show {passed.length} passed this session</label>}
      {hiddenByDealbreaker.length > 0 && <label className="checkbox-field"><input type="checkbox" checked={showHidden} onChange={event => setShowHidden(event.target.checked)} />Show {hiddenByDealbreaker.length} hidden by your dealbreakers (the posting states it)</label>}
    </p>}
    {view === 'list' ? <ul className="jobs-results">{visible.map((job, at) => <li key={job.id} className="job-card deck-card">
      <div className="job-card-heading"><div><h2>{job.title}</h2><span>{job.company}</span></div>{passed.includes(job.id) && <span className="stage-chip">Passed</span>}{job.dealbreaker && <span className="stage-chip is-closed">{job.dealbreaker}</span>}</div>
      {meta(job)}{reasons(job)}{actions(job, at)}
      {detailsOpen(job.id) && <div className="deck-details">{renderDetails(job.id)}<a className="text-link" href={job.sourceUrl} target="_blank" rel="noopener noreferrer">View job<span className="visually-hidden"> on the original site (opens a new tab; does not apply)</span></a></div>}
    </li>)}</ul>
      : current ? <article className="job-card deck-card deck-single" aria-roledescription="job card" style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null; setOffset(0); }}>
        <p className="section-label">Job {Math.min(index, queue.length - 1) + 1} of {queue.length} in this batch</p>
        <div className="job-card-heading"><div><h2 ref={cardHeading} tabIndex={-1}>{current.title}</h2><span>{current.company}</span></div>{savedIds.has(current.id) && <span className="stage-chip">Saved</span>}</div>
        {meta(current)}{reasons(current)}
        <label className="field compact"><span>Pass reason (optional)</span><select value={reason} onChange={event => setReason(event.target.value)}>{PASS_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {actions(current, Math.min(index, queue.length - 1))}
        <p className="field-hint">On touch screens you can also swipe the card: right to save, left to pass.</p>
        {detailsOpen(current.id) && <div className="deck-details">{renderDetails(current.id)}<a className="text-link" href={current.sourceUrl} target="_blank" rel="noopener noreferrer">View job<span className="visually-hidden"> on the original site (opens a new tab; does not apply)</span></a></div>}
      </article>
        : <div className="empty-state" role="status"><strong>You’ve reviewed this batch.</strong><p>Saved roles are in My applications. Passed roles stay hidden only for this session. Run a new search for more roles.</p>
          <div className="job-card-actions"><button className="button" onClick={onOpenApplications}>Go to My applications</button><button className="button outline" onClick={() => setIndex(0)}>Review this batch again</button></div></div>}
  </section>;
}
