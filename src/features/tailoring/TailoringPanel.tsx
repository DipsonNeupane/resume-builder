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
import { trackProductEvent } from '../../services/analytics';
import { assessSupport, describeIssue, type SupportAssessment } from '../../lib/tailoringSupport';
import { withAccepted, type ProvenanceEntry, type ProvenanceOrigin } from '../../lib/tailoringProvenance';
import { ProvenanceList } from './ProvenanceList';

const KNOWN_FIELDS: readonly SuggestionField[] = ['headline', 'summary', 'skills', 'title', 'description'];

type TargetRequirement = { id: string; text: string; category: string; status?: string };
type SupportingFact = { location: string; quote: string };
type ParsedSuggestion = Suggestion & { why: string; targetRequirements: TargetRequirement[]; supportingFacts: SupportingFact[]; grounded: boolean };
/** How an accepted change came to be: the AI wording as proposed, wording the person
 * edited or wrote, or the AI wording backed by a fact the person added. */
type Authorship = 'ai' | 'edited' | 'user_supported';
const CATEGORY_LABEL: Record<string, string> = { required: 'Required', preferred: 'Preferred', nice_to_have: 'Nice to have', other: 'Other' };
const STATUS_LABEL: Record<string, string> = { demonstrated: 'Evidence found', partially_demonstrated: 'Related evidence — review', not_demonstrated: 'No evidence found in this resume', confirmed_incompatible: 'You said you don’t have this' };
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim() !== '' && value.length <= max;
function targets(value: unknown): TargetRequirement[] {
 if (!Array.isArray(value)) return [];
 return value.filter(record).filter(item => text(item.id, 80) && text(item.text, 1000) && typeof item.category === 'string')
  .slice(0, 3).map(item => ({ id: item.id as string, text: item.text as string, category: item.category as string, ...(typeof item.status === 'string' ? { status: item.status } : {}) }));
}
function facts(value: unknown, originalText: string): SupportingFact[] {
 if (!Array.isArray(value)) return [];
 const fold = (v: string) => v.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
 // Re-checked here: a quote is shown as support only when it is in the original wording.
 return value.filter(record).filter(item => text(item.location, 300) && text(item.quote, 300) && fold(originalText).includes(fold(item.quote as string)))
  .slice(0, 3).map(item => ({ location: item.location as string, quote: item.quote as string }));
}
type ReviewItem = ParsedSuggestion & { status: 'pending' | 'accepted' | 'rejected'; aiText: string; factDraft: string; userFacts: string; authorship?: Authorship; provenanceId?: string };
const ORIGIN: Record<Authorship, ProvenanceOrigin> = { ai: 'ai', edited: 'user', user_supported: 'ai_with_user_fact' };
const AUTHORSHIP_LABEL: Record<Authorship, string> = { ai: 'Accepted · AI wording', edited: 'Accepted · your wording', user_supported: 'Accepted · supported by a fact you added' };

type Props = { resume: Resume; ownerId: string | null; onSignIn: () => void; onViewPro: () => void; versionId?: string; savedJobId?: string; jobDescriptionAvailable?: boolean; jobText?: string; provenance?: ProvenanceEntry[]; onAcceptedResume?: (resume: Resume, provenance: ProvenanceEntry[]) => void; onDownload?: () => void };

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object'; }

/** Re-runs the server's support checks here, with any fact the person added. The AI
 * wording can be accepted in one step only when the server and these checks both found
 * it supported, or a fact the person wrote resolves every issue. */
function review(item: ReviewItem, jobText: string): { assessment: SupportAssessment; acceptable: boolean } {
 const assessment = assessSupport({ originalText: item.originalText, suggestedText: item.aiText, quotes: item.supportingFacts.map(fact => fact.quote), requirements: item.targetRequirements, jobText, userFacts: item.userFacts });
 const acceptable = item.targetRequirements.length > 0 && assessment.supported && (item.grounded || assessment.userFactUsed);
 return { assessment, acceptable };
}

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
  const targetRequirements = targets(item.targetRequirements), supportingFacts = facts(item.supportingFacts, originalText);
  out.push({ sectionId: sectionId as string | null, entryId: entryId as string | null, field: field as SuggestionField, originalText, suggestedText, why: why.trim(),
   targetRequirements, supportingFacts, grounded: item.grounded === true && targetRequirements.length > 0 && supportingFacts.length > 0 });
 }
 return out;
}

export function TailoringPanel({ resume, ownerId, onSignIn, onViewPro, versionId, savedJobId, jobDescriptionAvailable = false, jobText = '', provenance = [], onAcceptedResume, onDownload }: Props) {
 const currentResume = useRef(resume); currentResume.current = resume;
 // The saved record of accepted changes. Mirrored in a ref for the same reason as
 // draftRef: two accepts before the next render must both be recorded.
 const provenanceRef = useRef(provenance);
 useEffect(() => { provenanceRef.current = provenance; }, [provenance]);
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
  trackProductEvent('tailoring_started', { surface: 'tailoring', user_state: 'authenticated', plan: 'Pro' });
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
   if (JSON.stringify(currentResume.current) !== JSON.stringify(snapshot)) { setMessage('Your resume changed. Run suggestions again.'); return; }
   sourceSignature.current = JSON.stringify(snapshot);
   requestIdentity.current = null;
   setDraftBoth(snapshot);
   setItems(suggestions.map(suggestion => ({ ...suggestion, status: 'pending', aiText: suggestion.suggestedText, factDraft: '', userFacts: '' })));
   if (suggestions.length === 0) setMessage('No suggestions found. You can still edit and download your resume.');
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
  // Unchanged AI wording needs support; changed wording is the person's own.
  const edited = item.suggestedText !== item.aiText;
  const { acceptable, assessment } = review(item, jobText);
  if (edited ? !item.suggestedText.trim() || item.suggestedText === item.originalText : !acceptable) return;
  const authorship: Authorship = edited ? 'edited' : item.grounded && !item.userFacts ? 'ai' : assessment.userFactUsed ? 'user_supported' : 'ai';
  const provenanceId = crypto.randomUUID();
  try {
   const next = applySuggestion(base, item);
   setDraftBoth(next);
   // A saved job-specific version is the only editor document an accepted
   // suggestion may update. The parent persists it, with its provenance, using
   // optimistic revision checks; the master-resume path receives no callback.
   if (onAcceptedResume) {
    sourceSignature.current = JSON.stringify(next);
    const origin = ORIGIN[authorship];
    provenanceRef.current = withAccepted(provenanceRef.current, {
     id: provenanceId, field: item.field, sectionId: item.sectionId, entryId: item.entryId, origin,
     originalText: item.originalText.slice(0, 4000), aiText: item.aiText, keptText: item.suggestedText,
     userFact: origin === 'ai_with_user_fact' ? item.userFacts : null,
     requirements: item.targetRequirements.map(requirement => ({ id: requirement.id, text: requirement.text })),
     resumeQuotes: item.supportingFacts.filter(fact => assessment.quotes.includes(fact.quote)).map(fact => ({ location: fact.location, quote: fact.quote })),
     acceptedAt: new Date().toISOString(),
    });
    onAcceptedResume(next, provenanceRef.current);
   }
   setItems(current => current.map((entry, i) => i === index ? { ...entry, status: 'accepted', authorship, provenanceId } : entry));
   trackProductEvent('suggestion_reviewed', { surface: 'tailoring', user_state: 'authenticated', plan: 'Pro' });
   trackProductEvent('suggestion_accepted', { surface: 'tailoring', user_state: 'authenticated', plan: 'Pro' });
  } catch (error) {
   setMessage(error instanceof InvalidSuggestionError ? error.message : 'This suggestion could no longer be applied.');
   setItems(current => current.map((entry, i) => i === index ? { ...entry, status: 'rejected' } : entry));
  }
 }
 // Undo reverses an accepted change exactly, and only while the accepted wording is
 // still present (a later manual edit is never overwritten).
 function undo(index: number) {
  const item = items[index];
  const base = draftRef.current;
  if (!item || item.status !== 'accepted' || !base) return;
  try {
   const next = applySuggestion(base, { ...item, originalText: item.suggestedText, suggestedText: item.originalText });
   setDraftBoth(next);
   if (onAcceptedResume) {
    sourceSignature.current = JSON.stringify(next);
    provenanceRef.current = provenanceRef.current.filter(entry => entry.id !== item.provenanceId);
    onAcceptedResume(next, provenanceRef.current);
   }
   setItems(current => current.map((entry, i) => i === index ? { ...entry, status: 'pending', authorship: undefined, provenanceId: undefined } : entry));
   setMessage('Change undone. The original wording is back.');
  } catch { setMessage('This change was edited afterwards, so it cannot be undone automatically. Edit it in the editor instead.'); }
 }
 function editSuggestion(index: number, suggestedText: string) {
  setItems(current => current.map((entry, i) => i === index && entry.status === 'pending' ? { ...entry, suggestedText } : entry));
 }
 function setFactDraft(index: number, factDraft: string) {
  setItems(current => current.map((entry, i) => i === index && entry.status === 'pending' ? { ...entry, factDraft } : entry));
 }
 function checkFact(index: number) {
  setItems(current => current.map((entry, i) => i === index && entry.status === 'pending' ? { ...entry, userFacts: entry.factDraft.trim() } : entry));
 }
 function reject(index: number) {
  setItems(current => current.map((entry, i) => i === index ? { ...entry, status: 'rejected' } : entry));
  trackProductEvent('suggestion_reviewed', { surface: 'tailoring', user_state: 'authenticated', plan: 'Pro' });
  trackProductEvent('suggestion_rejected', { surface: 'tailoring', user_state: 'authenticated', plan: 'Pro' });
 }
 if (!ownerId) return null;
 if (!versionId || !savedJobId) {
  return <div className="notice" role="status">
   Save a job and choose “Prepare my application” to get suggestions.
  </div>;
 }

 return <section className="field tailoring-panel" aria-label="Job tailoring">
  <div className="tailoring-heading"><div><span className="section-label">Your application</span><h3>Resume suggestions</h3><p className="field-hint">Review each change before keeping it.</p></div></div>
  <ol className="tailoring-flow" aria-label="How tailoring keeps you in control">
   <li><strong>Master resume</strong>Remains unchanged</li>
   <li><strong>Job-specific version</strong>A separate document</li>
   <li><strong>AI suggestions</strong>Each one reviewable</li>
   <li><strong>You</strong>Accept, reject or edit</li>
  </ol>
  <ol className="review-progress" aria-label="Tailoring progress"><li aria-current={!draft?'step':undefined}>01 / Get suggestions</li><li aria-current={draft&&items.some(item=>item.status==='pending')?'step':undefined}>02 / Review each change</li><li aria-current={draft&&!items.some(item=>item.status==='pending')?'step':undefined}>03 / Your resume</li></ol>
  {!jobDescriptionAvailable && <p className="notice" role="status">Add a job description to get suggestions.</p>}
  <div className="field checkbox-field">
   <label>
    <input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />
    I agree to send my resume and job description to OpenAI for suggestions.
   </label>
  </div>
  <button className="button" disabled={busy || !consent || !jobDescriptionAvailable} onClick={fetchSuggestions}>
   {busy ? 'Getting suggestions…' : 'Get tailoring suggestions'}
  </button>
  <details className="tailoring-data-details"><summary>What gets sent</summary><p>Your resume details and job description go to OpenAI. Contact fields are excluded; details in your writing may be included.</p></details>
  <p className="field-hint">{ownerId ? 'Pro or one free trial for this job.' : 'Sign in to continue.'} Suggestions change a separate resume; your original stays unchanged.</p>
  {message && <p role="status" className="field-hint">{message}</p>}
  {items.length > 0 && <p role="status" className="field-hint">{items.filter(item=>item.status!=='pending').length} of {items.length} suggestions reviewed · {items.filter(item=>item.status==='accepted').length} accepted</p>}
  {items.map((item, index) => { const { assessment, acceptable } = review(item, jobText); const edited = item.suggestedText !== item.aiText;
   const issues = assessment.issues.length || acceptable ? assessment.issues : [{ kind: 'no_support' as const }];
   const yours = edited ? assessSupport({ originalText: item.originalText, suggestedText: item.suggestedText, quotes: [], requirements: item.targetRequirements, jobText }).issues.filter(issue => issue.kind === 'new_number' || issue.kind === 'added_claim' || issue.kind === 'dropped_negation' || issue.kind === 'job_wording') : [];
   // Once the person's own wording is accepted, the AI wording's checks no longer describe what was kept.
   const ownWordingKept = item.status === 'accepted' && item.authorship === 'edited';
   const showIssues = !acceptable && !ownWordingKept;
   const focus = (event: { currentTarget: HTMLElement }) => event.currentTarget.closest('article')?.focus({preventScroll:true});
   return <article className="suggestion-card" tabIndex={-1} data-status={item.status} data-supported={acceptable ? 'true' : 'false'} key={`${item.field}-${item.sectionId ?? ''}-${item.entryId ?? ''}`} aria-label={`Suggestion ${index + 1}`}>
   <header><span>Suggestion {index + 1} / {item.field}</span><span>{item.status==='pending'?(acceptable?'Your decision':'Needs your support'):item.status==='accepted'?AUTHORSHIP_LABEL[item.authorship ?? 'ai']:'Rejected'}</span></header>
   <div className="pro-preview-compare"><div><span>Original wording</span><p>{item.originalText || 'No text yet'}</p></div><div><span>{item.status === 'accepted' && item.authorship === 'edited' ? 'Your wording' : 'Proposed wording'}</span><p>{item.status === 'accepted' ? item.suggestedText : item.aiText}</p></div></div>
   {(item.targetRequirements.length > 0 || assessment.quotes.length > 0) && <details className="suggestion-support"><summary>See supporting evidence</summary><dl className="suggestion-trace">
    {item.targetRequirements.length > 0 && <div><dt>Job requirements</dt>{item.targetRequirements.map(requirement => <dd key={requirement.id}>{requirement.text} <small>({CATEGORY_LABEL[requirement.category] ?? 'Other'}{requirement.status && STATUS_LABEL[requirement.status] ? ` · ${STATUS_LABEL[requirement.status]}` : ''})</small></dd>)}</div>}
    {assessment.quotes.length > 0 && <div><dt>Supported by your resume</dt>{item.supportingFacts.filter(fact => assessment.quotes.includes(fact.quote)).map(fact => <dd key={fact.quote}>“{fact.quote}” <small>— {fact.location}</small></dd>)}</div>}
    {assessment.userFactUsed && acceptable && <div><dt>Fact you added</dt><dd>“{item.userFacts}” <small>— written by you, not from your resume</small></dd></div>}
   </dl></details>}
   {showIssues && <div className="notice suggestion-ungrounded" role="note"><div><p><strong>Needs more support before use.</strong></p>
    <ul>{issues.map((issue, i) => <li key={i}>{describeIssue(issue)}</li>)}</ul>
    <small>Check each claim before using it.</small></div></div>}
   {ownWordingKept ? <p className="tailoring-why"><strong>Your wording:</strong> Check every claim for accuracy.</p>
    : <p className="tailoring-why"><strong>Why:</strong> {item.why}</p>}
   {item.status === 'pending' && !acceptable && <details className="suggestion-support"><summary>Add a supporting fact</summary>
    <label className="field compact"><span>What experience supports this?</span><textarea rows={3} maxLength={600} value={item.factDraft} onChange={event => setFactDraft(index, event.target.value)} /></label>
    <small className="field-hint">Used to check this suggestion, not added to your resume.</small>
    <div className="section-actions"><button className="button outline" type="button" disabled={item.factDraft.trim().length < 12} onClick={() => checkFact(index)}>Check again</button></div>
    {item.userFacts && !acceptable && <p className="field-hint" role="status">Add more support or edit the wording.</p>}
   </details>}
   {item.status === 'pending' && <details {...(!acceptable ? { className: 'suggestion-rewrite' } : {})}><summary>{acceptable ? 'Edit wording' : 'Write your own wording'}</summary><label className="field compact"><span>Your wording</span><textarea rows={3} maxLength={2000} value={item.suggestedText} onChange={event => editSuggestion(index, event.target.value)} /></label><small className="field-hint">Keep claims accurate. Your edits are marked as yours.</small>
    {yours.length > 0 && <ul className="field-hint" aria-label="Check your wording">{yours.map((issue, i) => <li key={i}>{describeIssue(issue).replace(/^It /, 'Your wording ')}</li>)}</ul>}</details>}
   {item.status === 'pending' && <div className="section-actions"><button className="text-button" onClick={event => { focus(event); reject(index); }}>Reject</button>
    {edited ? <button className="button" disabled={!item.suggestedText.trim() || item.suggestedText === item.originalText} onClick={event => { focus(event); accept(index); }}>Use my wording</button>
     : acceptable && <button className="button" onClick={event => { focus(event); accept(index); }}>{assessment.userFactUsed && !item.grounded ? 'Accept with your fact' : 'Accept'}</button>}</div>}
   {item.status === 'accepted' && <p className="field-hint">{onAcceptedResume ? 'Saved to this job resume.' : 'Added to your draft.'} <button className="text-button" onClick={() => undo(index)}>Undo</button></p>}
   {item.status === 'rejected' && <p className="field-hint">Rejected — your draft is unchanged.</p>}
  </article>; })}
  {onAcceptedResume && <ProvenanceList entries={provenance} resume={resume} heading="Tailoring record for this version" />}
  {draft && <div className="review-document">
   <div>
   <strong>{onAcceptedResume ? 'Your saved job-specific resume' : 'Your reviewed draft'}</strong><div className="paper-container"><PaginatedResumePreview resume={draft}/></div>
    {/* A saved job-specific version is exported by the page's own download controls, so
        there is one export path for it (after the same preview confirmation). */}
    {onAcceptedResume ? <>{onDownload && <button className="button outline" type="button" onClick={onDownload}>Review and download this version</button>}</>
     : <><GeneratedDocumentControls resume={draft} ownerId={ownerId} documentScope="job_specific" jobResumeVersionId={versionId} onSignIn={onSignIn} onViewPro={onViewPro}/><p>This copy won’t change your master resume.</p></>}
   </div>
  </div>}
 </section>;
}
