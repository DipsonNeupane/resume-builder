/** Authenticated AI job-tailoring review UI. Calls POST /api/tailor
 * (api/tailor.ts -> server/ai/tailoring.ts), which itself is gated behind
 * AI_ENABLED, a verified Pro entitlement and per-request budget reservation
 * on the server — this component makes no claim that tailoring is live or
 * included, and every failure mode (disabled, no Pro, budget exhausted,
 * provider error) surfaces the server's own honest message.
 *
 * Suggestions are reviewed one at a time (accept/reject) against a SEPARATE
 * cloned draft resume kept only in this component's own state. This panel
 * never mutates the `resume` prop and never calls a parent setter to apply
 * anything back into the live editor — there isn't one in its props, by
 * design. A user who wants to keep accepted changes downloads the reviewed
 * draft through the same server-enforced document controls as the builder.
 */
import { useEffect, useRef, useState } from 'react';
import { GeneratedDocumentControls } from '../export/GeneratedPdfControls';
import { PaginatedResumePreview } from '../../components/ResumePreview';
import { supabase } from '../../services/supabase';
import { type Resume } from '../../model';
import { applySuggestion, InvalidSuggestionError, type Suggestion, type SuggestionField } from './applySuggestion';

const KNOWN_FIELDS: readonly SuggestionField[] = ['headline', 'summary', 'skills', 'title', 'description'];

type ParsedSuggestion = Suggestion & { why: string };
type ReviewItem = ParsedSuggestion & { status: 'pending' | 'accepted' | 'rejected' };

type Props = { resume: Resume; ownerId: string | null; onSignIn: () => void; onViewPro: () => void; versionId?: string; savedJobId?: string; jobDescriptionAvailable?: boolean; onAcceptedResume?: (resume: Resume) => void };

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object'; }

// Loose shape filtering only, so a malformed/hostile server response cannot
// crash the review list. Every item is re-validated far more strictly,
// against the live draft, by applySuggestion() itself when a user accepts it
// — this function alone is never trusted to make anything safe to apply.
function parseSuggestions(body: unknown): ParsedSuggestion[] {
 if (!record(body) || !Array.isArray(body.suggestions)) throw new Error('AI tailoring returned an unusable response.');
 const out: ParsedSuggestion[] = [];
 for (const item of body.suggestions) {
  if (!record(item)) continue;
  const { sectionId, entryId, field, originalText, suggestedText, why } = item;
  if (typeof field !== 'string' || !KNOWN_FIELDS.includes(field as SuggestionField)) continue;
  if (sectionId !== null && typeof sectionId !== 'string') continue;
  if (entryId !== null && typeof entryId !== 'string') continue;
  if (typeof originalText !== 'string' || typeof suggestedText !== 'string' || typeof why !== 'string' || !why.trim() || why.length > 500) continue;
  out.push({ sectionId: sectionId as string | null, entryId: entryId as string | null, field: field as SuggestionField, originalText, suggestedText, why: why.trim() });
 }
 return out;
}

export function TailoringPanel({ resume, ownerId, onSignIn, onViewPro, versionId, savedJobId, jobDescriptionAvailable = false, onAcceptedResume }: Props) {
 const currentResume = useRef(resume); currentResume.current = resume;
 const [consent, setConsent] = useState(false);
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState('');
 const [items, setItems] = useState<ReviewItem[]>([]);
 const [draft, setDraft] = useState<Resume | null>(null);
 // Mirrors `draft` synchronously. React state updates are not applied until
 // the next render, so two Accept clicks dispatched before that render (a
 // real fast double-click, or two fired in the same tick) would otherwise
 // both read the same stale `draft` closure and the second setDraft() would
 // silently discard the first acceptance. Every read that feeds a new draft
 // into applySuggestion uses this ref instead, exactly the pattern
 // src/hooks/useCloudResume.ts uses (`savingRef`) for its own writes.
 const draftRef = useRef<Resume | null>(null);
 // The exact resume this review's suggestions/draft were generated from,
 // captured as a JSON snapshot. Used only to detect that `resume` (the live
 // prop) has since diverged — never re-parsed or applied to anything.
 const sourceSignature = useRef<string | null>(null);
 const inFlight = useRef(false);
 const requestIdentity = useRef<{ signature: string; id: string } | null>(null);
 const active = useRef(true);
 const controllerRef = useRef<AbortController | null>(null);

 function setDraftBoth(next: Resume | null) {
  draftRef.current = next;
  setDraft(next);
 }

 function resetReview(notice?: string) {
  setItems([]);
  setDraftBoth(null);
  sourceSignature.current = null;
  if (notice) setMessage(notice);
 }

 // Race-safe account changes: an in-flight request tied to the previous
 // account must never land in the new account's UI, and review state from
 // one account must never silently carry over to another.
 useEffect(() => {
  active.current = true;
  setConsent(false);
  setMessage('');
  requestIdentity.current = null;
  resetReview();
  return () => {
   active.current = false;
   controllerRef.current?.abort();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [ownerId]);

 // If the live resume changes since these suggestions/draft were generated
 // (the user kept editing the real editor in another part of the app),
 // the draft and every pending suggestion are now reviewing a source that no
 // longer exists — clear them rather than let a stale suggestion be accepted
 // against content it was never actually generated from.
 useEffect(() => {
  if (sourceSignature.current === null) return;
  if (sourceSignature.current !== JSON.stringify(resume)) {
   resetReview('Your resume changed since these suggestions were generated, so this review was cleared. Get new suggestions for your current resume.');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [resume]);

 async function fetchSuggestions() {
  if (inFlight.current || !supabase || !ownerId) return;
  if (!consent || !versionId || !savedJobId || !jobDescriptionAvailable) return;
  inFlight.current = true;
  setBusy(true);
  setMessage('');
  const controller = new AbortController();
  controllerRef.current = controller;
  let receivedResponse = false;
  try {
   const session = await supabase.auth.getSession();
   if (session.data.session?.user.id !== ownerId) throw new Error('Please sign in again and retry.');
   const snapshot = resume; // frozen at click time, matching the document controls' pattern
   const requestSignature = JSON.stringify({ ownerId, versionId, savedJobId, resume: snapshot });
   if (requestIdentity.current?.signature !== requestSignature) {
    requestIdentity.current = { signature: requestSignature, id: crypto.randomUUID() };
   }
   const response = await fetch('/api/tailor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.session.access_token}` },
    body: JSON.stringify({ versionId, savedJobId, consent: true, requestId: requestIdentity.current.id }),
    signal: controller.signal,
   });
   receivedResponse = true;
   let body: unknown;
   try { body = await response.json(); } catch { throw new Error('AI tailoring returned an unusable response.'); }
   if (!response.ok) {
    const text = record(body) && typeof body.error === 'string' ? body.error : 'AI tailoring is temporarily unavailable.';
    throw new Error(text);
   }
   const suggestions = parseSuggestions(body);
   const currentSession = await supabase.auth.getSession();
   if (!active.current || controller.signal.aborted) return;
   if (currentSession.data.session?.user.id !== ownerId) throw new Error('Please sign in again and retry.');
   if (JSON.stringify(currentResume.current) !== JSON.stringify(snapshot)) { setMessage('Your resume changed while suggestions were loading. Get new suggestions for the updated version.'); return; }
   sourceSignature.current = JSON.stringify(snapshot);
   requestIdentity.current = null;
   setDraftBoth(snapshot);
   setItems(suggestions.map(suggestion => ({ ...suggestion, status: 'pending' })));
   if (suggestions.length === 0) setMessage('No tailoring suggestions were found for this job description. Review the match evidence and your resume; you can still make your own edits and download it.');
  } catch (error) {
   if (controller.signal.aborted || !active.current) return;
   // Reuse the same request id only when no server response arrived. This lets
   // an ambiguous browser/network retry be deduplicated without making every
   // deliberate later click the same logical request forever.
   if (receivedResponse) requestIdentity.current = null;
   setMessage(error instanceof Error ? error.message : 'AI tailoring is temporarily unavailable.');
  } finally {
   inFlight.current = false;
   if (active.current) setBusy(false);
  }
 }

 function accept(index: number) {
  // Deliberately NOT a nested setState-in-setState (never call setDraftBoth
  // from inside a setItems updater): React's updater functions must stay
  // pure and side-effect-free, and can run more than once (Strict Mode).
  // `applySuggestion`'s own strict originalText match against the live
  // `draftRef.current` is what actually makes a duplicate/late accept fail
  // safely (as a stale suggestion) rather than double-applying, not a lock
  // here.
  const item = items[index];
  const base = draftRef.current;
  if (!item || item.status !== 'pending' || !base) return;
  try {
   const next = applySuggestion(base, item);
   setDraftBoth(next);
   // A saved job-specific version is the only editor document an accepted
   // suggestion may update. The parent persists it with optimistic revision
   // checks; the master-resume path deliberately receives no callback.
   if (onAcceptedResume) {
    sourceSignature.current = JSON.stringify(next);
    onAcceptedResume(next);
   }
   setItems(current => current.map((entry, i) => i === index ? { ...entry, status: 'accepted' } : entry));
  } catch (error) {
   setMessage(error instanceof InvalidSuggestionError ? error.message : 'This suggestion could no longer be applied.');
   setItems(current => current.map((entry, i) => i === index ? { ...entry, status: 'rejected' } : entry));
  }
 }
 function reject(index: number) {
  setItems(current => current.map((entry, i) => i === index ? { ...entry, status: 'rejected' } : entry));
 }
 if (!ownerId) {
  return <div className="notice" role="status">
   Sign in to try Pro job tailoring suggestions.
   <button className="text-button" onClick={onSignIn}>Sign in</button>
  </div>;
 }
 if (!versionId || !savedJobId) {
  return <div className="notice" role="status">
   AI suggestions are available only from a saved job-specific resume. Save a job and choose “Tailor my resume for this job” to begin.
  </div>;
 }

 return <section className="field tailoring-panel" aria-label="Job tailoring">
  <div className="tailoring-heading"><div><span className="section-label">From match to application</span><h3>AI tailoring suggestions</h3><p className="field-hint">Make the connection clearer. Keep the experience yours.</p></div><span>AI suggests. You decide.</span></div>
  <ol className="review-progress" aria-label="Tailoring progress"><li aria-current={!draft?'step':undefined}>01 / Get suggestions</li><li aria-current={draft&&items.some(item=>item.status==='pending')?'step':undefined}>02 / Review each change</li><li aria-current={draft&&!items.some(item=>item.status==='pending')?'step':undefined}>03 / Your resume</li></ol>
  {!jobDescriptionAvailable && <p className="notice" role="status">This saved job has no description available, so ResumeStride cannot generate grounded tailoring suggestions.</p>}
  <div className="field checkbox-field">
   <label>
    <input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />
    I consent to sending this saved job-specific resume and job description to ResumeStride for tailoring suggestions.
   </label>
  </div>
  <button className="button" disabled={busy || !consent || !jobDescriptionAvailable} onClick={fetchSuggestions}>
   {busy ? 'Getting suggestions…' : 'Get tailoring suggestions'}
  </button>
  <p className="field-hint">ResumeStride sends your headline, summary, skills, section entries and relevant Match Analysis evidence to OpenAI. Dedicated contact fields are excluded; contact details you write in summaries or entries may still be included.</p>
  <p className="field-hint">An active Pro pass is required. AI suggests; you decide. {onAcceptedResume ? 'Accepted changes update only this saved job-specific resume; your master stays unchanged.' : 'Accepted changes go into a separate draft; your original stays unchanged.'}</p>
  {message && <p role="status" className="field-hint">{message}</p>}
  {items.length > 0 && <p role="status" className="field-hint">{items.filter(item=>item.status!=='pending').length} of {items.length} suggestions reviewed · {items.filter(item=>item.status==='accepted').length} accepted</p>}
  {items.map((item, index) => <article className="suggestion-card" tabIndex={-1} data-status={item.status} key={`${item.field}-${item.sectionId ?? ''}-${item.entryId ?? ''}`} aria-label={`Suggestion ${index + 1}`}>
   <header><span>Suggestion {index + 1} / {item.field}</span><span>{item.status==='pending'?'Your decision':item.status==='accepted'?'Accepted':'Rejected'}</span></header>
   <div className="pro-preview-compare"><div><span>Before</span><p>{item.originalText || 'No text yet'}</p></div><div><span>After</span><p>{item.suggestedText}</p></div></div>
   <p className="tailoring-why"><strong>Why this helps:</strong> {item.why}</p>
   {item.status === 'pending' && <div className="section-actions"><button className="text-button" onClick={event => { event.currentTarget.closest('article')?.focus({preventScroll:true}); reject(index); }}>Reject</button><button className="button" onClick={event => { event.currentTarget.closest('article')?.focus({preventScroll:true}); accept(index); }}>Accept</button></div>}
   {item.status === 'accepted' && <p className="field-hint">Accepted into the draft below.</p>}
   {item.status === 'rejected' && <p className="field-hint">Rejected — your draft is unchanged.</p>}
  </article>)}
  {draft && <div className="review-document">
   <div>
   <strong>{onAcceptedResume ? 'Your saved job-specific resume' : 'Your reviewed draft'}</strong><div className="paper-container"><PaginatedResumePreview resume={draft}/></div><GeneratedDocumentControls resume={draft} ownerId={ownerId} onSignIn={onSignIn} onViewPro={onViewPro}/>
    <p>{onAcceptedResume ? 'Accepted suggestions are saved to this job-specific version only. Rejected suggestions make no change.' : 'This is a separate copy — it never changes your saved resume. Download it as PDF or Word to keep any accepted changes.'}</p>
   </div>
  </div>}
 </section>;
}
