/** Authenticated generated-document controls. PDF and DOCX both use the same
 * server-owned reservation/idempotency allowance; there is no direct client
 * export path for either format.
 */
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Download } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { validateAll, contentLength, maxContentChars, type Resume } from '../../model';
import { docxMimeType } from '../../services/docx';

const MAX_DOCUMENT_BYTES = 4_200_000;
type ExportFormat = 'pdf' | 'docx';
type Props = { resume: Resume; ownerId: string | null; onSignIn: () => void; onViewPro: () => void };

const formats: Record<ExportFormat, { label: string; endpoint: string; mime: string; filename: string }> = {
 pdf: { label: 'PDF', endpoint: '/api/export-pdf', mime: 'application/pdf', filename: 'ResumeStride.pdf' },
 docx: { label: 'Word', endpoint: '/api/export-docx', mime: docxMimeType, filename: 'ResumeStride.docx' },
};

export function GeneratedDocumentControls({ resume, ownerId, onSignIn, onViewPro }: Props) {
 const [consent, setConsent] = useState(false);
 const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
 const [message, setMessage] = useState('');
 const [allowance, setAllowance] = useState('Checking download availability…');
 const [exhausted, setExhausted] = useState(false);
 const [upgradeOpen, setUpgradeOpen] = useState(false);
 const [upgradeConfirmed, setUpgradeConfirmed] = useState(false);
 const [availabilityUnknown, setAvailabilityUnknown] = useState(false);
 const inFlight = useRef(false);
 const downloadGroup = useRef<HTMLDivElement>(null);
 const active = useRef(true);
 const controllerRef = useRef<AbortController | null>(null);
 const lastRequests = useRef<Partial<Record<ExportFormat, { key: string; id: string }>>>({});

 useEffect(() => {
  active.current = true;
  setConsent(false);
  setMessage('');
  setExhausted(false);
  setUpgradeOpen(false);
  setUpgradeConfirmed(false);
  setAvailabilityUnknown(false);
  lastRequests.current = {};
  return () => { active.current = false; controllerRef.current?.abort(); };
 }, [ownerId]);

 useEffect(() => {
  if (!message) return;
  const timer = window.setTimeout(() => setMessage(''), 5000);
  return () => window.clearTimeout(timer);
 }, [message]);

 useEffect(() => {
  if (!ownerId || !supabase) return;
  const client = supabase;
  let disposed = false;
  let generation = 0;
  const controller = new AbortController();
  async function refresh() {
   const request = ++generation;
   try {
    const session = (await client.auth.getSession()).data.session;
    if (session?.user.id !== ownerId) throw new Error('Account changed');
    const response = await fetch('/api/export-status', { headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal });
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    if (typeof data.isPro !== 'boolean' || !Number.isInteger(data.remaining) || data.remaining < 0 || data.remaining > 3 || typeof data.resetsAt !== 'string' || !Number.isFinite(Date.parse(data.resetsAt))) throw new Error('Invalid allowance');
    const current = (await client.auth.getSession()).data.session;
    if (disposed || request !== generation || current?.user.id !== ownerId) return;
    const resets = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(data.resetsAt));
    setAllowance(data.isPro ? 'Pro document downloads are included.' : data.remaining > 0 ? `${data.remaining} of 3 Free downloads left for this 30-day period.` : `Your Free document download allowance is used for this period. It resets ${resets}.`);
    setExhausted(!data.isPro && data.remaining === 0);
    setAvailabilityUnknown(false);
   } catch {
    if (!disposed && request === generation) { setAllowance(''); setExhausted(false); setAvailabilityUnknown(true); }
   }
  }
  setAllowance('Checking download availability…');
  void refresh();
  window.addEventListener('resumestride:document-allowance', refresh);
  return () => { disposed = true; controller.abort(); window.removeEventListener('resumestride:document-allowance', refresh); };
 }, [ownerId]);

 async function download(format: ExportFormat) {
  if (inFlight.current || !supabase || !ownerId || !consent) return;
  const issues = validateAll(resume);
  if (issues.length) { setMessage('Finish the required resume details before downloading a document.'); return; }
  if (contentLength(resume) > maxContentChars) { setMessage('Shorten your resume before downloading a document.'); return; }
  inFlight.current = true;
  setBusyFormat(format);
  setMessage('');
  const controller = new AbortController();
  controllerRef.current = controller;
  const selected = formats[format];
  try {
   const before = await supabase.auth.getSession();
   if (before.data.session?.user.id !== ownerId) throw new Error('mismatch');
   const snapshot = resume;
   const key = JSON.stringify(snapshot);
   const previous = lastRequests.current[format];
   const id = previous?.key === key ? previous.id : crypto.randomUUID();
   lastRequests.current[format] = { key, id };
   const response = await fetch(selected.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${before.data.session.access_token}` },
    body: JSON.stringify({ requestId: id, resume: snapshot }),
    signal: controller.signal,
   });
   if (!response.ok) {
    let text = `Could not download this ${selected.label} document. Retrying the same request will not use another download.`;
    try { const body: unknown = await response.json(); if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') text = (body as { error: string }).error; } catch { /* keep safe default */ }
    if (response.status === 403 && text === 'Your Free document download allowance is used for this period.') {
     setAllowance(text);
     setExhausted(true);
     setAvailabilityUnknown(false);
     setUpgradeConfirmed(true);
     setUpgradeOpen(true);
     return;
    }
    throw new Error(text);
   }
   const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
   if (type !== selected.mime) throw new Error('Received an unexpected file. Please retry.');
   const declared = response.headers.get('content-length');
   if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_DOCUMENT_BYTES)) throw new Error('The generated file was unexpectedly large. Please retry.');
   const blob = await response.blob();
   if (blob.size === 0 || blob.size > MAX_DOCUMENT_BYTES) throw new Error('The generated file was unexpectedly large or empty. Please retry.');
   const after = await supabase.auth.getSession();
   if (!active.current || controller.signal.aborted) return;
   if (after.data.session?.user.id !== ownerId) throw new Error('mismatch');
   const url = URL.createObjectURL(blob);
   try { const a = document.createElement('a'); a.href = url; a.download = selected.filename; a.click(); }
   finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
   setMessage(`${selected.label} document generated. Your browser should offer the download.`);
  } catch (error) {
   if (controller.signal.aborted || !active.current) return;
   setMessage(error instanceof Error && error.message !== 'mismatch' ? error.message : 'Could not download this document. Please sign in again and retry.');
  } finally {
   window.dispatchEvent(new Event('resumestride:document-allowance'));
   inFlight.current = false;
   if (active.current) setBusyFormat(null);
  }
 }

 if (!ownerId) return <div className="notice" role="status">
  Sign in to download your resume as PDF or Word. A free account includes 3 downloads every 30 days.
  <button className="text-button" onClick={onSignIn}>Sign in</button>
 </div>;

 return <><div ref={downloadGroup} role="group" aria-label="Document downloads" tabIndex={-1} className="field checkbox-field">
  <label><input type="checkbox" checked={consent} disabled={busyFormat !== null} onChange={event => setConsent(event.target.checked)} />I consent to uploading my resume content to ResumeStride’s server to generate my document.</label>
  <p className="field-hint">PDF and Word share your download allowance. Choose the format you need.</p>
  {availabilityUnknown?<p className="field-hint" aria-live="polite">We couldn’t check your download allowance. Free accounts include 3 downloads every 30 days. Free downloads exhausted? <button className="text-button" onClick={()=>{setUpgradeConfirmed(false);setUpgradeOpen(true);}}>View Pro options</button></p>:<p className="field-hint" aria-live="polite">{allowance}</p>}
  <div className="document-download-actions">
   <button className="button" disabled={!consent || busyFormat !== null || exhausted} onClick={() => download('pdf')}><Download size={16} />{busyFormat === 'pdf' ? 'Generating PDF…' : 'Download PDF'}</button>
   <button className="button outline" disabled={!consent || busyFormat !== null || exhausted} onClick={() => download('docx')}><Download size={16} />{busyFormat === 'docx' ? 'Generating Word…' : 'Download Word (.docx)'}</button>
  </div>
  {exhausted && <p className="field-hint">Need it sooner? <button className="text-button" onClick={onViewPro}>View Pro options</button> to download now.</p>}
  {message && <p role="status" className="field-hint">{message}</p>}
 </div>{upgradeOpen&&<Modal fallbackFocus={downloadGroup} className="upgrade-modal" labelledBy="upgrade-title" describedBy="upgrade-description" onClose={()=>setUpgradeOpen(false)}><span className="price-tag">PRO PASS</span><h2 id="upgrade-title">Keep downloading with Pro</h2><p id="upgrade-description">{upgradeConfirmed?'Your Free download allowance has been used for this period. ':"If you’ve used your Free downloads for this period, "}A 30-day Pro pass (US$19.99) includes PDF and Word downloads, plus full Match Analysis and tailoring for saved jobs.</p><div className="upgrade-modal-actions"><button className="button" onClick={onViewPro}>View Pro options</button><button className="button outline" onClick={()=>setUpgradeOpen(false)}>Not now</button></div></Modal>}</>;
}
