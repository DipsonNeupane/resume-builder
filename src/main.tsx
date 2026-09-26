import { safeAnalyticsEvent } from './services/analytics';
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileText, Globe2, GripVertical, LayoutTemplate, Menu, Plus, RotateCcw, Search, ShieldCheck, Trash2, Upload, UserRound, X } from 'lucide-react';
import { blank, contentLength, entry, example, isExperienceSection, isResume, languagePattern, maxBackupBytes, maxContentChars, migrate, rescueKey, storageKey, templates, validateAll, validatePersonal, validateSection, type Resume } from './model';
import { PaginatedResumePreview } from './components/ResumePreview';
import '@fontsource/noto-sans/400.css';
import './styles.css';
import './design-system.css';
import './patina.css';
import { initialPage as resolveInitialPage, noindex, type AppPage } from './seo/policy';
import { updateAppHead } from './seo/head';
import { HomePage } from './features/home/HomePage';
import { Modal } from './components/Modal';
import { JourneyRail } from './components/JourneyRail';
import { TemplatePicker } from './components/TemplatePicker';
// Lazy-loaded: these are feature/route panels not needed for the initial home-page
// render (auth, billing, jobs, AI tailoring, document export). Deferring them keeps
// the entry bundle smaller for the common first-visit path; each loads on demand
// the first time its page/section actually renders.
const AuthPanel = lazy(() => import('./features/auth/AuthPanel').then(m => ({ default: m.AuthPanel })));
const GeneratedDocumentControls = lazy(() => import('./features/export/GeneratedPdfControls').then(m => ({ default: m.GeneratedDocumentControls })));
const ProPage = lazy(() => import('./features/billing/ProPage').then(m => ({ default: m.ProPage })));
const TailoringPanel = lazy(() => import('./features/tailoring/TailoringPanel').then(m => ({ default: m.TailoringPanel })));
const CapturedJobReview = lazy(() => import('./features/jobs/CapturedJobReview').then(m => ({ default: m.CapturedJobReview })));
const JobsPanel = lazy(() => import('./features/jobs/JobsPanel').then(m => ({ default: m.JobsPanel })));
import { authConfigured, supabase } from './services/supabase';
import { useSession } from './hooks/useSession';
import { useCloudResume } from './hooks/useCloudResume';
import { isJobCapturePayload, listenForJobImport, type JobCapturePayload } from './services/extensionImport';
// docx/pdf import parsing is only needed inside uploadResume() below, so it is
// dynamically imported there instead of shipped in the initial bundle.
const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
import { JobResumeConflictError, jobResumeRequest, parseJobResumeVersion, type JobResumeVersion } from './services/jobResumeVersions';
// Guest/local draft state (base resume + its unreadable-draft rescue slot) intentionally lives in
// sessionStorage, not localStorage: it must survive a reload within this browsing session (so
// autosave/recovery keep working while someone is actively using the app) but must NOT
// survive to a genuinely new visit — reopening the browser later must start from a fresh
// workspace instead of silently resurrecting anonymous browser data from days/weeks ago. Signed-in
// persistence is unaffected: it is delivered by the account-backed cloud resume (useCloudResume),
// which is keyed by account id and reloaded from the server on every sign-in regardless of what,
// if anything, this session storage still holds.
function initial(): {resume:Resume; warning:string; rescue:string|null; conflict:string|null} {
 let rescue:string|null=null;
 try { rescue = sessionStorage.getItem(rescueKey); } catch { /* storage unavailable */ }
 let raw:string|null=null;
 try {
  raw = sessionStorage.getItem(storageKey);
  if (!raw) return {resume:blank(), warning:'', rescue, conflict:null};
  const migrated = migrate(JSON.parse(raw));
  if (isResume(migrated)) return {resume:migrated, warning:'', rescue, conflict:null};
 } catch { /* fall through: preserve the unreadable draft below instead of losing it */ }
 if (raw) {
  if (rescue && rescue !== raw) {
   // The rescue slot already holds a different unreadable draft nobody has downloaded/discarded
   // yet. Do not overwrite it — that would silently destroy the earlier recovery. Keep this newer
   // one available in memory only, so both remain recoverable instead of one quietly replacing the
   // other.
   return {resume:blank(), warning:'Your saved draft could not be read. There are two recovery drafts below — review each one before continuing.', rescue, conflict:raw};
  }
  if (!rescue) { try { sessionStorage.setItem(rescueKey, raw); } catch { /* best effort */ } rescue = raw; }
  return {resume:blank(), warning:'Your saved draft could not be read by this version of the app. Download it below before you continue, so your earlier work is not lost.', rescue, conflict:null};
 }
 return {resume:blank(), warning:'Browser storage is unavailable. Your work will not be saved automatically. Keep this tab open while you resolve the browser storage issue.', rescue, conflict:null};
}
const start=initial();
const sampleResume=example();
// Job-draft recovery (see the effects below where this key is read/written): kept entirely
// separate from `storageKey` (the base resume), and scoped to this browser only — never synced
// to any account.
const jobDraftStorageKey = 'resumestride.jobDraft';
function App(){
 const initialPage=resolveInitialPage(new URL(window.location.href));
 const [resume,setResume]=useState<Resume>(start.resume); const [page,setPage]=useState<AppPage>(initialPage); const [tab,setTab]=useState('personal'); const [saveState,setSaveState]=useState(start.warning?'Storage needs attention':'Saved for this session'); const [message,setMessage]=useState(start.warning); const [rescue,setRescue]=useState(start.rescue); const [conflict,setConflict]=useState(start.conflict); const [dirty,setDirty]=useState(false); const [previewMode,setPreviewMode]=useState(false); const [sampleOpen,setSampleOpen]=useState(false); const [menu,setMenu]=useState(false); const [languageInput,setLanguageInput]=useState(resume.language); const [errors,setErrors]=useState<Record<string,string>>({}); const [pendingFocus,setPendingFocus]=useState<string|null>(null); const [confirmed,setConfirmed]=useState(false); const [returnToProAfterAuth,setReturnToProAfterAuth]=useState(false); const file=useRef<HTMLInputElement>(null); const downloads=useRef<HTMLDivElement>(null);
 const [jobContext,setJobContext]=useState<JobCapturePayload|null>(null);
 const [activeJobVersion,setActiveJobVersion]=useState<JobResumeVersion|null>(null);
 const [jobVersionMasterChanged,setJobVersionMasterChanged]=useState(false);
 const [jobVersionConflict,setJobVersionConflict]=useState<JobResumeVersion|null>(null);
 const jobVersionRevision=useRef<number|null>(null);
 const jobVersionSaving=useRef(false);
 const liveResume=useRef(resume);liveResume.current=resume;
 const session=useSession();
 const metadataName=session.user?.user_metadata?.full_name;
 const profileName=session.user?(typeof metadataName==='string'&&metadataName.trim()?metadataName.trim():session.user.email?.split('@')[0]||'Profile'):'';
 useEffect(()=>{if(returnToProAfterAuth&&session.user){setReturnToProAfterAuth(false);setPage('pro');}},[returnToProAfterAuth,session.user]);
 const restoreGuestDraft=():Resume=>{try{const raw=sessionStorage.getItem(storageKey);if(raw){const migrated=migrate(JSON.parse(raw));if(isResume(migrated))return migrated;}}catch{/* fall through to blank */}return blank();};
 const cloud=useCloudResume(session.user,resume,dirty,setResume,setDirty,restoreGuestDraft,setMessage,Boolean(jobContext));
 useEffect(()=>{if(languagePattern.test(resume.language))setLanguageInput(resume.language);},[resume.language]);
 useEffect(()=>{if(!message)return;const timer=window.setTimeout(()=>setMessage(''),5000);return()=>window.clearTimeout(timer);},[message]);
 useEffect(()=>{if(confirmed){setPreviewMode(true);window.setTimeout(()=>downloads.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'}),0);}},[confirmed]);
 const menuToggle = useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!menu)return;
  const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenu(false);menuToggle.current?.focus();}};
  window.addEventListener('keydown',close);
  return()=>window.removeEventListener('keydown',close);
 },[menu]);
 const previousPage = useRef(page);
 useEffect(()=>{
  if(previousPage.current===page)return;
  previousPage.current=page;
  setMenu(false);
  // Lazy routes may still show their accessible loading landmark. Focus the
  // destination heading once it exists, without moving focus on initial load.
  const focusHeading=()=>{
   // Suspense can retain the previous route's main with display:none while
   // loading the next one. It must not satisfy the destination-focus request.
   const heading=Array.from(document.querySelectorAll<HTMLElement>('#main-content h1:not(.visually-hidden)'))
    .find(node=>node.getClientRects().length>0&&getComputedStyle(node).visibility==='visible');
   if(!heading)return false;
   heading.tabIndex=-1;heading.focus({preventScroll:true});return document.activeElement===heading;
  };
  if(focusHeading())return;
  const observer=new MutationObserver(()=>{if(focusHeading())observer.disconnect();});
  observer.observe(document.getElementById('root')!,{childList:true,subtree:true,attributes:true,attributeFilter:['style','hidden','class']});
  return()=>observer.disconnect();
 },[page]);
 // Job-specific drafts (from the browser extension foundation, apps/extension): a job capture
 // arrives here only via an explicit, validated postMessage (src/services/extensionImport.ts) —
 // never automatically, never from a remote origin. Starting a draft snapshots the current
 // resume in memory (`baseSnapshot`) and pauses local-disk autosave (below) so the job-specific
 // edits below never overwrite the real base resume; discarding restores the snapshot exactly.
 const [incomingJobCapture,setIncomingJobCapture]=useState<JobCapturePayload|null>(null);
 const [baseSnapshot,setBaseSnapshot]=useState<Resume|null>(null);
 const sensitiveSeoEntry=useRef(document.documentElement.dataset.seoPrivateEntry==='true');
 useEffect(()=>{
  const sync=()=>updateAppHead(page,Boolean(incomingJobCapture||jobContext||rescue||conflict||session.user),sensitiveSeoEntry.current);
  sync();window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);
  return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};
 },[page,incomingJobCapture,jobContext,rescue,conflict,session.user]);
 // The identity this specific draft belongs to, fixed once it starts (or once restored) —
 // deliberately NOT read live from `session.user` on every persist. It may advance exactly once,
 // guest (null) to whichever account signs in next (the intended guest-to-login handoff, see the
 // effect below), but never after that: without this, a debounced write keyed on the live session
 // would silently relabel account A's draft as account B's the moment the signed-in identity
 // changed underneath it, exposing A's content to B on a later reload.
 const [jobDraftOwnerId,setJobDraftOwnerId]=useState<string|null>(null);
 const captureOwner = useRef<string|null>(session.user?.id ?? null);
 const captureSequence = useRef(0);
 const [captureKey,setCaptureKey]=useState(0);
 const [capturedJobsRevision,setCapturedJobsRevision]=useState(0);
 useEffect(()=>listenForJobImport(capture=>{captureSequence.current++;setCaptureKey(captureSequence.current);setIncomingJobCapture(capture);}),[]);
 useEffect(()=>{
  if(session.loading)return;
  const next=session.user?.id??null;
  if(captureOwner.current && captureOwner.current!==next)setIncomingJobCapture(null);
  captureOwner.current=next;
 },[session.loading,session.user?.id]);
 // Keep cloud sync suspended while editing a local job draft, including if a
 // different tab signs in. Never silently discard edits or upload them as the base.
 const startJobDraft=()=>{
  if(!incomingJobCapture||jobContext||session.loading||cloud.linked||cloud.loading||conflict||rescue)return;
  try{sessionStorage.setItem(storageKey,JSON.stringify(resume));}catch{setMessage('Could not preserve your master resume. Resolve browser storage before starting a job draft.');return;}
  setBaseSnapshot(resume);
  setJobContext(incomingJobCapture);
  setJobDraftOwnerId(session.user?.id??null);
  setResume(structuredClone(resume));
  setConfirmed(false);
  setDirty(false);
  setErrors({});
  setTab('personal');
  setPreviewMode(false);
  setPage('builder');
  setMessage(`Job-specific draft started for “${incomingJobCapture.title||'this role'}”. Your master resume is preserved separately. This draft is kept only in this browser and should recover here after a reload.`);
  setIncomingJobCapture(null);
 };
 const editJobResume=(version:JobResumeVersion,masterChanged:boolean)=>{
  if(!session.user)return;
  setBaseSnapshot(resume);
  setActiveJobVersion(version);
  jobVersionRevision.current=version.revision;
  setJobVersionMasterChanged(masterChanged);
  setJobVersionConflict(null);
  setJobContext({title:version.jobSnapshot.title,company:version.jobSnapshot.company,description:typeof version.jobSnapshot.descriptionText==='string'?version.jobSnapshot.descriptionText:'',sourceUrl:'',capturedAt:new Date().toISOString()});
  setJobDraftOwnerId(session.user.id);
  setResume(version.resume);
  setDirty(false);setConfirmed(false);setErrors({});setTab('personal');setPreviewMode(false);setPage('builder');
  setMessage(`Opened the job-specific resume for “${version.jobSnapshot.title}”. Your master resume remains separate.`);
 };
 const discardJobDraft=()=>{
  if(!baseSnapshot)return;
  if(activeJobVersion){
   if(dirty||jobVersionSaving.current){setMessage('Wait for this job-specific resume to finish saving before returning to your master resume.');return;}
  }else if(!window.confirm('Discard this job-specific draft and return to your master resume? Any unsaved changes to the job draft will be lost.'))return;
  setResume(baseSnapshot);
  setConfirmed(false);
  setJobContext(null);
  setBaseSnapshot(null);
  setJobDraftOwnerId(null);
  setActiveJobVersion(null);jobVersionRevision.current=null;setJobVersionMasterChanged(false);setJobVersionConflict(null);
  setDirty(false);
  setErrors({});
  setPreviewMode(false);
  try{localStorage.removeItem(jobDraftStorageKey);}catch{/* best effort */}
  setMessage(activeJobVersion?'You are back on your master resume. The job-specific version remains saved to your account.':'Job-specific draft discarded. You are back on your master resume.');
 };
 // Job-draft recovery across a reload: written to its OWN storage key (never `storageKey`, which
 // must keep holding only the preserved base resume while a job draft is active) together with
 // the identity (`ownerId`, null for a guest) this draft belonged to at the time. Restoring
 // requires an exact match against the CURRENT sign-in identity, so a draft captured as a guest
 // (or under a different account) never gets silently applied under a different one — a mismatch
 // just discards the stale entry rather than guessing. This does not survive private browsing,
 // browser storage being cleared, or opening the app in a different browser/device; those
 // remain out of scope (see apps/extension/README.md) and the base resume itself is unaffected
 // either way, since it was already flushed to `storageKey` the moment the draft started.
 useEffect(()=>{
  if(jobContext||session.loading)return;
  let raw:string|null;
  try{raw=localStorage.getItem(jobDraftStorageKey);}catch{return;}
  if(!raw)return;
  try{
   const parsed=JSON.parse(raw) as {ownerId:unknown; jobContext:unknown; baseSnapshot:unknown; resume:unknown};
   const ownerMatches=(parsed.ownerId??null)===(session.user?.id??null);
   if(!ownerMatches||!isJobCapturePayload(parsed.jobContext)||!isResume(parsed.baseSnapshot)||!isResume(parsed.resume)){
    try{localStorage.removeItem(jobDraftStorageKey);}catch{/* best effort */}
    return;
   }
   setBaseSnapshot(parsed.baseSnapshot);
   setJobContext(parsed.jobContext);
   setJobDraftOwnerId(session.user?.id??null);
   setResume(parsed.resume);
   setConfirmed(false);
   setDirty(false);
   setErrors({});
   setPreviewMode(false);
   setPage('builder');
   setMessage(`Your in-progress job-specific draft for “${parsed.jobContext.title||'this role'}” was restored in this browser after reload. Your master resume is preserved separately.`);
  }catch{
   try{localStorage.removeItem(jobDraftStorageKey);}catch{/* best effort */}
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[session.loading,session.user]);
 useEffect(()=>{
  if(!jobContext||!baseSnapshot||activeJobVersion)return;
  const timer=setTimeout(()=>{
   // `jobDraftOwnerId`, not the live session — see its declaration above for why persisting the
   // live identity here would let an account switch silently relabel this draft as belonging to
   // whoever is signed in when the debounce happens to fire.
   try{localStorage.setItem(jobDraftStorageKey,JSON.stringify({ownerId:jobDraftOwnerId,jobContext,baseSnapshot,resume}));}
   catch{/* best effort: recovery becomes unavailable, but the base resume stays safe regardless */}
  },350);
  return()=>clearTimeout(timer);
 },[jobContext,baseSnapshot,resume,jobDraftOwnerId,activeJobVersion]);
 // Guards the draft while it stays active in memory (the effect above only guards what gets
 // written to disk): if the signed-in identity changes to anything other than the one-way
 // guest-to-login promotion below, this draft must never keep running as if nothing happened —
 // continuing to display/persist it would mix one account's job-search content into whichever
 // account now happens to be signed in. Ends the draft the same way an explicit Discard does
 // (revert to `baseSnapshot`, drop the persisted entry) rather than guessing which identity should
 // keep it.
 useEffect(()=>{
  if(!jobContext||!baseSnapshot||session.loading)return;
  const liveId=session.user?.id??null;
  if(liveId===jobDraftOwnerId)return;
  if(jobDraftOwnerId===null&&liveId!==null){
   // Guest draft, now signing in for the first time: adopt this draft under the newly signed-in
   // account so it persists/restores correctly from here on — the one intended promotion.
   setJobDraftOwnerId(liveId);
   return;
  }
  setResume(baseSnapshot);
  setConfirmed(false);
  setJobContext(null);
  setBaseSnapshot(null);
  setJobDraftOwnerId(null);
  setActiveJobVersion(null);jobVersionRevision.current=null;setJobVersionMasterChanged(false);setJobVersionConflict(null);
  setDirty(false);
  setErrors({});
  try{localStorage.removeItem(jobDraftStorageKey);}catch{/* best effort */}
  setMessage('Your signed-in account changed while editing a job-specific draft, so it was ended to protect it. Your master resume is preserved separately.');
 },[session.user,session.loading,jobContext,baseSnapshot,jobDraftOwnerId]);
 useEffect(()=>{
  if(!activeJobVersion||!session.user||!dirty||jobVersionSaving.current||jobVersionConflict)return;
  const ownerId=session.user.id;
  const versionId=activeJobVersion.id;
  const timer=window.setTimeout(async()=>{
   const expectedRevision=jobVersionRevision.current;
   if(expectedRevision===null)return;
   const sending=resume;
   jobVersionSaving.current=true;setSaveState('Saving job-specific resume…');
   try{
    const body=await jobResumeRequest(ownerId,{action:'update_job_resume',versionId,expectedRevision,resume:sending});
    const saved=parseJobResumeVersion(body.version);
    if(jobVersionRevision.current!==expectedRevision)return;
    jobVersionRevision.current=saved.revision;setActiveJobVersion(saved);
    if(liveResume.current===sending)setDirty(false);
    setSaveState('Job-specific resume saved to your account');
   }catch(error){
    if(error instanceof JobResumeConflictError)setJobVersionConflict(error.server);
    setMessage(error instanceof Error?error.message:'Unable to save this job-specific resume.');setSaveState('Job-specific resume not saved');
   }
   finally{jobVersionSaving.current=false;}
  },350);
  return()=>window.clearTimeout(timer);
 },[activeJobVersion?.id,activeJobVersion?.revision,resume,dirty,session.user?.id,jobVersionConflict]);
 const useOtherJobResumeVersion=()=>{
  if(!jobVersionConflict)return;
  jobVersionRevision.current=jobVersionConflict.revision;setActiveJobVersion(jobVersionConflict);setResume(jobVersionConflict.resume);setDirty(false);setJobVersionConflict(null);setConfirmed(false);
  setMessage('Loaded the version saved elsewhere.');
 };
 const keepCurrentJobResumeEdits=()=>{
  if(!jobVersionConflict)return;
  jobVersionRevision.current=jobVersionConflict.revision;setActiveJobVersion(jobVersionConflict);setJobVersionConflict(null);setDirty(true);
  setMessage('Keeping your current edits. ResumeStride will save them as the next revision.');
 };
 const resetJobResumeFromMaster=async()=>{
  if(!activeJobVersion||!baseSnapshot||!session.user||jobVersionSaving.current)return;
  if(!window.confirm('Replace this job-specific resume with your current master resume? Existing tailored and manual changes in this version will be replaced.'))return;
  const expectedRevision=jobVersionRevision.current;if(expectedRevision===null)return;
  jobVersionSaving.current=true;
  try{
   const body=await jobResumeRequest(session.user.id,{action:'reset_job_resume',versionId:activeJobVersion.id,expectedRevision,resume:baseSnapshot});
   const saved=parseJobResumeVersion(body.version);jobVersionRevision.current=saved.revision;setActiveJobVersion(saved);setResume(saved.resume);setDirty(false);setJobVersionMasterChanged(false);setJobVersionConflict(null);setConfirmed(false);
   setMessage('This job-specific resume was reset from your current master resume.');
  }catch(error){setMessage(error instanceof Error?error.message:'Unable to update from your master resume.');}
  finally{jobVersionSaving.current=false;}
 };
 const update=(patch:Partial<Resume>)=>{const next={...resume,...patch};if(contentLength(next)>maxContentChars && contentLength(next)>contentLength(resume)){setMessage(`This resume has reached the maximum size that can be reliably backed up and re-imported (${maxContentChars.toLocaleString()} characters). Remove some content before adding more.`);return;}setResume(next);setConfirmed(false);setDirty(true);setSaveState('Saving…');if(Object.keys(patch).some(key=>errors[key]))setErrors(current=>{const next={...current};for(const key of Object.keys(patch))delete next[key];return next;});};
 useEffect(()=>{if(!pendingFocus)return;const target=pendingFocus;const el=Array.from(document.querySelectorAll<HTMLElement>('[data-field]')).find(node=>node.dataset.field===target);el?.focus();setPendingFocus(null);},[pendingFocus,tab]);
 const tabOrder=['personal','profile',...resume.sections.map(section=>section.id),'design'];
 const enforcePersonal=():boolean=>{const issues=validatePersonal(resume);if(issues.length){setErrors(current=>({...current,...Object.fromEntries(issues.map(i=>[i.field,i.message]))}));setTab('personal');setMessage(issues[0].message);setPendingFocus(issues[0].field);return false;}return true;};
 const enforceSectionsBefore=(targetIdx:number):boolean=>{for(const section of resume.sections){if(tabOrder.indexOf(section.id)>=targetIdx)break;const issues=validateSection(section,resume.noExperience);if(issues.length){setErrors(Object.fromEntries(issues.map(i=>[i.field,i.message])));setTab(section.id);setMessage(issues[0].message);setPendingFocus(issues[0].field);return false;}}return true;};
 const goTo=(targetTab:string)=>{const targetIdx=tabOrder.indexOf(targetTab);const currentIdx=tabOrder.indexOf(tab);if(targetIdx<=currentIdx){setTab(targetTab);setPreviewMode(false);return;}if(!enforcePersonal()||!enforceSectionsBefore(targetIdx))return;setErrors({});setTab(targetTab);setPreviewMode(false);};
 const nextStep=()=>{const currentIdx=tabOrder.indexOf(tab);const next=tabOrder[currentIdx+1];if(next)goTo(next);};
 const confirmResume=()=>{const issues=validateAll(resume);if(issues.length){const issue=issues[0];setErrors(Object.fromEntries(issues.filter(item=>item.tab===issue.tab).map(item=>[item.field,item.message])));setTab(issue.tab);setMessage(issue.message);setPendingFocus(issue.field);return;}if(!languagePattern.test(languageInput)){setTab('design');setMessage('Enter a valid resume language code before confirming.');return;}setErrors({});setConfirmed(true);};
 const requestDownload=()=>{if(confirmed){setPreviewMode(true);requestAnimationFrame(()=>downloads.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'}));return;}const issues=validateAll(resume);if(issues.length){const issue=issues[0];setErrors(Object.fromEntries(issues.filter(item=>item.tab===issue.tab).map(item=>[item.field,item.message])));setTab(issue.tab);setPreviewMode(false);setMessage(issue.message);setPendingFocus(issue.field);return;}setTab('design');setPreviewMode(false);window.scrollTo(0,0);};
 useEffect(()=>{if(cloud.linked||cloud.loading||jobContext)return;if(!dirty)return;if(conflict){setSaveState('Autosave paused — resolve recovery draft');return;}const timer=setTimeout(()=>{try{sessionStorage.setItem(storageKey,JSON.stringify(resume));setSaveState('Saved for this session');}catch{setSaveState('Not saved — browser storage unavailable');}},350);return()=>clearTimeout(timer);},[resume,dirty,conflict,cloud.linked,cloud.loading,jobContext]);
 useEffect(()=>{const persist=()=>{if(cloud.linked||cloud.loading||jobContext)return;if(dirty && !conflict)try{sessionStorage.setItem(storageKey,JSON.stringify(resume));}catch{/* save status already reports the failure */}};window.addEventListener('pagehide',persist);return()=>window.removeEventListener('pagehide',persist);},[resume,dirty,conflict,cloud.linked,cloud.loading,jobContext]);
 const downloadRescue=()=>{if(!rescue)return;const url=URL.createObjectURL(new Blob([rescue],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='unreadable-draft-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const discardRescue=()=>{try{sessionStorage.removeItem(rescueKey);}catch{/* best effort */}setRescue(null);};
 const downloadConflict=()=>{if(!conflict)return;const url=URL.createObjectURL(new Blob([conflict],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='second-unreadable-draft-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const uploadResume=async(event:React.ChangeEvent<HTMLInputElement>)=>{const selected=event.target.files?.[0];if(!selected)return;try{
  if(selected.size>maxBackupBytes)throw Error(`Please choose a file smaller than ${Math.round(maxBackupBytes/1000000)} MB.`);
  const buffer=await selected.arrayBuffer();const bytes=new Uint8Array(buffer);
  const isPdf=selected.type==='application/pdf'||selected.name.toLowerCase().endsWith('.pdf')||(bytes.length>=4&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46);
  const isZip=bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04;
  if(!isPdf&&!isZip)throw Error('Choose a Word (.docx) or PDF file.');
  const format=isPdf?'PDF':'Word document';
  const data=isPdf?await(await import('./services/pdfImport')).resumeFromPdfFile(buffer):await(await import('./services/docx')).resumeFromDocxFile(buffer);
  if(dirty || resume.name){if(!window.confirm(`Replace the current draft with this ${format}? Your current edits will be replaced.`))return;}
  setResume(data);setLanguageInput(data.language);setDirty(true);setSaveState('Saving…');setTab('personal');setPreviewMode(false);setErrors({});setConfirmed(false);setMessage('');setPage('builder');
 }catch(error){setMessage(error instanceof Error?error.message:'Unable to import this file.');}finally{event.target.value='';}};
 const begin=()=>{setPreviewMode(false);setPage('builder');window.scrollTo(0,0);};
 const returnHome=()=>{setMessage('');setPage('home');window.scrollTo(0,0);};
 const field=(label:string,key:'name'|'headline'|'email'|'phone'|'location'|'website'|'summary'|'skills',placeholder:string,multiline=false)=>{const err=errors[key];const errId=`${key}-error`;const fieldId=`field-${key}`;return <div className={multiline?'field full':'field'}><label htmlFor={fieldId}>{label}</label>{multiline?<textarea id={fieldId} name={key} autoComplete="off" data-field={key} aria-invalid={!!err} aria-describedby={err?errId:undefined} dir="auto" rows={key==='summary'?5:3} maxLength={50000} value={resume[key]} placeholder={placeholder} onChange={event=>update({[key]:event.target.value})}/>:<input id={fieldId} name={key} type={key==='email'?'email':key==='phone'?'tel':key==='website'?'url':'text'} autoComplete={({name:'name',headline:'organization-title',email:'email',phone:'tel',location:'off',website:'url',summary:'off',skills:'off'})[key]} spellCheck={key==='email'||key==='website'?false:undefined} data-field={key} aria-invalid={!!err} aria-describedby={err?errId:undefined} dir="auto" maxLength={50000} value={resume[key]} placeholder={placeholder} onChange={event=>update({[key]:event.target.value})}/>}{err&&<span id={errId} className="field-error" role="alert">{err}</span>}</div>;};
 const selectedSection=resume.sections.find(section=>section.id===tab);
 const completion=[resume.name,resume.headline,resume.summary,resume.sections.some(section=>section.entries.some(item=>item.title)),resume.skills].filter(Boolean).length;
 const complete=validateAll(resume).length===0;
 const documentSaveLabel=cloud.statusText??(jobContext?(activeJobVersion?(saveState==='Saved for this session'?'Job-specific resume saved to your account':saveState):'Job draft — kept in this browser'):saveState);
 return <><input ref={file} type="file" accept={`.docx,${docxMimeType},.pdf,application/pdf`} hidden onChange={uploadResume}/>
 <a className="skip-link" href="#main-content">Skip to main content</a>
 <header className={`site-header ${page==='home'?'public-header':''}`}><button className="brand" onClick={returnHome} aria-label="ResumeStride home"><span className="brand-icon"><span className="stride-mark" aria-hidden="true"><i/><i/><i/></span></span>Resume<span className="brand-light">Stride</span></button>{page!=='builder'&&page!=='jobs'?<><button ref={menuToggle} className="icon-button mobile-menu" aria-label="Toggle navigation" aria-controls="main-navigation" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Menu aria-hidden="true"/></button><nav id="main-navigation" aria-label="Main navigation" onClick={event=>{setMenu(false);const link=(event.target as HTMLElement).closest('a');if(link&&page==='home'){const target=document.getElementById(link.hash.slice(1));if(target){target.tabIndex=-1;target.focus({preventScroll:true});}}if(link&&page!=='home'){event.preventDefault();setPage('home');const target=link.getAttribute('href')?.slice(1);window.setTimeout(()=>{if(target)document.getElementById(target)?.scrollIntoView();},0);}}} className={menu?'nav open':'nav'}><a href="#how-it-works">How it works</a><a href="#templates">Templates</a><a href="#pricing">Pricing</a>{authConfigured&&!session.user&&<button className="nav-account" onClick={()=>setPage('account')}>Sign in / Sign up</button>}</nav><div className="site-header-actions">{session.user&&<button className="header-profile" onClick={()=>setPage('account')} aria-label={`Open profile for ${profileName}`}><UserRound size={16} aria-hidden="true"/>Hello, {profileName}</button>}<button className="button header-cta" onClick={begin}>{session.user&&resume.name?'Continue my resume':'Build my resume'}<ArrowRight size={16} aria-hidden="true"/></button></div></>:<div className="header-actions">{<span className="save-status" role="status"><CheckCircle2 size={15}/>{documentSaveLabel}</span>}{page==='builder'&&<button className="button outline header-jobs" aria-label="Find jobs" onClick={()=>setPage('jobs')}><Search size={16} aria-hidden="true"/><span>Find jobs</span></button>}{session.user&&<button className="header-profile" onClick={()=>setPage('account')} aria-label={`Open profile for ${profileName}`}><UserRound size={16}/>Hello, {profileName}</button>}<button className="button outline header-download" aria-label="Download" onClick={requestDownload}><Download size={16} aria-hidden="true"/><span>Download</span></button></div>}</header>
 {message&&<div className="notice" role="status">{message}<button aria-label="Dismiss notification" onClick={()=>setMessage('')}><X size={16}/></button></div>}
 {rescue&&<div className="notice" role="status">An earlier draft on this device could not be loaded and has been kept separately so it isn’t lost.<button className="text-button" onClick={downloadRescue}><Download size={14}/>Download it</button><button aria-label="Discard the unreadable draft" onClick={discardRescue}><X size={16}/></button></div>}
 {conflict&&<div className="notice" role="status">A second unreadable draft was found while an earlier recovered draft above is still waiting. Autosave is paused to keep both recovery drafts safe. Download the unreadable recovery data, then explicitly discard this recovery draft to resume autosave.<button className="text-button" onClick={downloadConflict}><Download size={14}/>Download it</button><button aria-label="Discard this additional unreadable draft" onClick={()=>{if(window.confirm('Discard this recovery draft and allow your current edits to replace it?'))setConflict(null);}}><X size={16}/></button></div>}
 {cloud.consentPending&&<div className="notice" role="status">Save your local resume to your ResumeStride account? It stays available across your signed-in devices.<button className="text-button" onClick={cloud.acceptConsent}>Save to my account</button><button className="text-button" onClick={cloud.declineConsent}>Not now</button></div>}
 {cloud.conflict&&<div className="notice" role="status">{cloud.conflict.server?'Your account resume was saved elsewhere since you last loaded it (perhaps another tab or device). Choose which version to keep.':'Your account resume could not be found — it may have been deleted elsewhere. Save your current edits as a new account resume, or keep working locally.'}{cloud.conflict.server&&<button className="text-button" onClick={cloud.useServerVersion}>Use the other version</button>}<button className="text-button" onClick={cloud.keepMyEdits}>{cloud.conflict.server?'Keep my edits':'Save my edits as new'}</button></div>}
 {cloud.saveBlocked&&<div className="notice" role="alert">Account storage limit reached. Keep this tab open and contact support@resumestride.com before leaving this page.<button className="text-button" onClick={cloud.retryAfterStorageReview}>Retry after storage review</button></div>}
 {incomingJobCapture&&(!captureOwner.current||captureOwner.current===(session.user?.id??null))&&!jobContext&&<Suspense fallback={null}><CapturedJobReview key={captureKey} capture={incomingJobCapture} resume={resume} ownerId={session.loading?null:session.user?.id??null} loading={session.loading} onSignIn={()=>setPage('account')} onSaved={alreadySaved=>{setIncomingJobCapture(null);setCapturedJobsRevision(value=>value+1);setPage('jobs');setMessage(alreadySaved?'This job was already saved. Its existing snapshot and resume were kept; incoming edits did not replace them.':'Job saved to your account. Review its Match Analysis below.');}}/></Suspense>}
 {incomingJobCapture&&(!captureOwner.current||captureOwner.current===(session.user?.id??null))&&(jobContext?<div className="notice" role="status">A new job was captured, but you’re already editing a job-specific draft. Discard the current draft below first, then trigger the capture again from the extension.<button className="text-button" onClick={()=>setIncomingJobCapture(null)}>Dismiss</button></div>:(cloud.linked||cloud.loading)?<div className="notice" role="status">A job was captured from the ResumeStride extension, and can be saved to your account using the review above. Local drafts are unavailable while cloud saving is active.<button className="text-button" onClick={()=>setIncomingJobCapture(null)}>Dismiss</button></div>:<div className="notice" role="status">A job was captured from the ResumeStride extension: “{incomingJobCapture.title||'Untitled role'}”{incomingJobCapture.company?` at ${incomingJobCapture.company}`:''}. Start a job-specific draft — a separate copy of your resume that never changes your saved master resume — to work from these details? Save the job above for Match Analysis and Pro tailoring on a persistent job-specific resume. A local draft supports manual editing only.<button className="text-button" onClick={startJobDraft}>Start job-specific draft</button><button className="text-button" onClick={()=>setIncomingJobCapture(null)}>Dismiss</button></div>)}
 {jobContext&&<div className="notice job-draft-notice" role="status"><strong>{activeJobVersion?'Job-specific resume':'Job-specific draft'}</strong> — Tailored for {jobContext.title||'this role'}{jobContext.company?` · ${jobContext.company}`:''}. Your master resume is preserved separately. {activeJobVersion?'This version is saved to your account; accepted AI suggestions and manual edits update only this version.':'This draft is kept only in this browser and should recover here after a reload.'}{jobVersionMasterChanged&&<span> Your master resume has changed since this version was created. Keep this version, or update from master to replace its tailored/manual changes.</span>}{jobVersionMasterChanged&&<><button className="text-button" onClick={()=>setJobVersionMasterChanged(false)}>Keep this version</button><button className="text-button" onClick={()=>void resetJobResumeFromMaster()}>Update from master</button></>}<button className="text-button" onClick={discardJobDraft}>{activeJobVersion?'Return to master resume':'Discard draft & return to master resume'}</button></div>}
 {jobVersionConflict&&<div className="notice" role="alert"><strong>This job-specific resume was updated elsewhere.</strong> Your current edits were not overwritten. Choose the saved version, or explicitly keep your edits as the next revision.<button className="text-button" onClick={useOtherJobResumeVersion}>Use saved version</button><button className="text-button" onClick={keepCurrentJobResumeEdits}>Keep my edits</button></div>}
 {jobContext?.description&&<details className="job-description-details"><summary>View captured job description</summary><pre className="job-description-text">{jobContext.description}</pre></details>}
 {(page==='builder'||page==='jobs')&&<JourneyRail current={page==='jobs'?'opportunities':jobContext?'tailor':'resume'} onResume={page==='jobs'?()=>setPage('builder'):undefined} onJobs={page==='builder'?()=>setPage('jobs'):undefined}/>}
 {page==='builder'&&<div role="region" aria-label="Active document" className={`document-identity ${jobContext?'is-tailored':''}`}><div><span>{jobContext?'Tailored for':'Master resume'}</span><strong>{jobContext?`${jobContext.title||'Untitled role'}${jobContext.company?` · ${jobContext.company}`:''}`:resume.name||'Your experience starts here'}</strong></div><p>{jobContext?'A separate version. Your master stays unchanged.':'Your foundation for every application.'}<span className="document-save-label">{documentSaveLabel}</span></p></div>}
 {page==='pro'?<Suspense fallback={<main className="route-loading-page" id="main-content"><h1 className="visually-hidden">Loading…</h1><p className="route-loading" role="status">Loading…</p></main>}><ProPage ownerId={session.user?.id??null} onBack={returnHome} onSignIn={()=>{setReturnToProAfterAuth(true);setPage('account');}}/></Suspense>:page==='account'?<Suspense fallback={<main className="route-loading-page" id="main-content"><h1 className="visually-hidden">Loading…</h1><p className="route-loading" role="status">Loading…</p></main>}><AuthPanel onBack={()=>{window.history.replaceState(null,'',window.location.pathname);setPage('home');}}/></Suspense>:page==='jobs'?<main className="builder jobs-page" id="main-content"><Suspense fallback={<><h1 className="visually-hidden">Find jobs</h1><p className="route-loading" role="status">Loading…</p></>}><JobsPanel key={capturedJobsRevision} resume={resume} ownerId={session.user?.id??null} onSignIn={()=>setPage('account')} onViewPro={()=>setPage('pro')} onBack={()=>setPage(resume.name||resume.headline?'builder':'home')} onEditJobResume={editJobResume}/></Suspense></main>:page==='home'?<HomePage onBuild={begin} onUpload={()=>file.current?.click()} onJobs={()=>setPage('jobs')} onPro={()=>setPage('pro')} onTemplate={template=>{update({template});begin();}}/>:<main id="main-content" className={`builder ${previewMode?'is-previewing':'is-editing'}`}><aside className="builder-sidebar"><button className="back-link" onClick={returnHome}><ArrowLeft size={15}/>Back to home</button><h2>Your resume</h2><p className="muted">A foundation to build on.</p><div className="progress-track"><span style={{width:`${completion*20}%`}}/></div><small>{completion} of 5 essentials added</small><nav aria-label="Resume sections"><button className={tab==='personal'?'active':''} onClick={()=>goTo('personal')}><UserRound size={18}/>Personal details</button><button className={tab==='profile'?'active':''} onClick={()=>goTo('profile')}><FileText size={18}/>Profile & skills</button>{resume.sections.map(section=><button className={tab===section.id?'active':''} key={section.id} onClick={()=>goTo(section.id)}><GripVertical size={18}/>{section.title || 'Untitled section'}</button>)}<button disabled={resume.sections.length>=30} title={resume.sections.length>=30?'Maximum of 30 sections reached':undefined} onClick={()=>{if(!enforcePersonal()||!enforceSectionsBefore(tabOrder.indexOf('design')))return;const id=crypto.randomUUID();update({sections:[...resume.sections,{id,title:'Additional experience',entries:[entry()]}]});setTab(id);setPreviewMode(false);}}><Plus size={18}/>Add a section</button><button className={tab==='design'?'active':''} onClick={()=>goTo('design')}><LayoutTemplate size={18}/>Design & format</button></nav><div className="sidebar-tip"><ShieldCheck size={19}/><strong>Your story stays yours.</strong><p>{activeJobVersion?'This version saves to your account. Your master stays separate.':cloud.linked?'Your resume saves to your account. Review it before downloading.':session.user?'Your draft is kept in this browser. Review and confirm it before downloading.':authConfigured?'Your draft is kept only for this browsing session. Confirm your resume, then create a free account to download it.':'Your draft is kept only for this browsing session.'}</p></div><div className="sidebar-tools"><button className="back-link sidebar-upload" onClick={()=>file.current?.click()}><Upload size={15}/>Upload</button><button className="back-link sidebar-sample" onClick={()=>setSampleOpen(true)}><FileText size={15}/>View sample resume</button><button className="back-link sidebar-jobs" onClick={()=>setPage('jobs')}><Search size={15}/>Find jobs</button></div></aside>
 <section className="editor-panel" hidden={previewMode}><div className="editor-heading"><span className="section-label">{tab==='design'?'Finish / Design & format':'Build / Your experience'}</span><h1>{tab==='personal'?'Let’s start with you.':tab==='profile'?'Tell your story.':tab==='design'?'Make it your own.':selectedSection?.title || 'Your experience'}</h1><p>{tab==='personal'?'Your name, a title, and one way to reach you are required. Everything else here is optional.':tab==='profile'?'A little context goes a long way. Keep it clear and true to you.':tab==='design'?'Simple choices. A polished result.':'Every kind of experience counts. Add what matters to your next role.'}</p></div>
 {tab==='personal'&&<><div className="field-grid">{field('Full name','name','e.g. Alex Morgan')}{field('Professional title','headline','Your role or the opportunity you want')}{field('Email','email','you@example.com')}{field('Phone','phone','Include your country code')}{field('Location','location','City, region, or country')}{field('Website or professional profile','website','Portfolio, LinkedIn, or personal website')}</div><div className="helper-box"><Globe2 size={20}/><div><strong>At home, anywhere.</strong><p>Use your preferred name and local contact format — any name, any script. No postal code, street address, or US-style phone format required. Fill in at least one of email, phone, or website so someone can reach you.</p></div></div></>}
 {tab==='profile'&&<div className="field-grid">{field('Professional profile','summary','Introduce your experience, strengths, and the contribution you want to make.',true)}<p className="field-hint">New to work? Include coursework, volunteering, personal projects, or transferable skills.</p>{field('Skills & languages','skills','e.g. Project coordination, Customer service, Excel, English (fluent)',true)}<label className="field">Profile section heading<input name="profile-heading" autoComplete="off" maxLength={200} value={resume.profileHeading} placeholder="Profile" onChange={event=>update({profileHeading:event.target.value})}/></label><label className="field">Skills section heading<input name="skills-heading" autoComplete="off" maxLength={200} value={resume.skillsHeading} placeholder="Skills & languages" onChange={event=>update({skillsHeading:event.target.value})}/></label><div className="helper-box"><ShieldCheck size={20} aria-hidden="true"/><div><strong>Specific is stronger than impressive.</strong><p>Use real examples and only include skills you can confidently discuss. Review your wording and keep every detail accurate.</p></div></div></div>}
 {selectedSection&&<><label className="field">Section title<input name="section-title" autoComplete="off" maxLength={50000} value={selectedSection.title} onChange={event=>update({sections:resume.sections.map(section=>section.id===tab?{...section,title:event.target.value}:section)})}/></label><div className="section-actions"><button className="text-button" disabled={resume.sections[0]?.id===tab} onClick={()=>{const sections=[...resume.sections];const i=sections.findIndex(s=>s.id===tab);[sections[i-1],sections[i]]=[sections[i],sections[i-1]];update({sections});}}>↑ Move section up</button><button className="text-button danger" onClick={()=>{if(window.confirm('Delete this section and its entries?')){update({sections:resume.sections.filter(section=>section.id!==tab)});setTab('personal');}}}><Trash2 size={14}/>Delete section</button></div>{isExperienceSection(selectedSection)&&<div className="field checkbox-field"><label><input type="checkbox" data-field="no-experience" aria-describedby={errors['no-experience']?'no-experience-error':undefined} checked={resume.noExperience} onChange={event=>{if(errors['no-experience'])setErrors(current=>{const next={...current};delete next['no-experience'];return next;});update({noExperience:event.target.checked});}}/>I don’t have work experience yet</label>{errors['no-experience']&&<span id="no-experience-error" className="field-error" role="alert">{errors['no-experience']}</span>}</div>}{selectedSection.entries.map((item,i)=><div className="entry-form" key={item.id}><div className="entry-form-heading"><strong>Entry {i+1}</strong><button className="icon-button" aria-label={`Remove entry ${i+1}`} onClick={()=>{if(window.confirm('Remove this entry?'))update({sections:resume.sections.map(section=>section.id===tab?{...section,entries:section.entries.filter(e=>e.id!==item.id)}:section)});}}><Trash2 size={16}/></button></div><div className="field-grid">{(['title','organization','location','dates','description'] as const).map(key=>{const errKey=key==='title'?`entry-${item.id}-title`:'';const err=errKey?errors[errKey]:undefined;const fieldId=`entry-${item.id}-${key}`;const label=({title:'Role, qualification, or project',organization:'Organization or institution',location:'Location (optional)',dates:'Dates (your preferred format)',description:'Details (one point per line)'})[key];return <div className={`field ${key==='description'?'full':''}`} key={key}><label htmlFor={fieldId}>{label}</label>{key==='description'?<textarea id={fieldId} name={fieldId} autoComplete="off" dir="auto" rows={5} maxLength={50000} value={item[key]} onChange={event=>update({sections:resume.sections.map(section=>section.id===tab?{...section,entries:section.entries.map(e=>e.id===item.id?{...e,[key]:event.target.value}:e)}:section)})}/>:<input id={fieldId} name={fieldId} autoComplete="off" data-field={errKey||undefined} aria-invalid={!!err} aria-describedby={err?`${errKey}-error`:undefined} dir="auto" maxLength={50000} value={item[key]} onChange={event=>{if(errKey&&errors[errKey])setErrors(current=>{const next={...current};delete next[errKey];return next;});update({sections:resume.sections.map(section=>section.id===tab?{...section,entries:section.entries.map(e=>e.id===item.id?{...e,[key]:event.target.value}:e)}:section)});}}/>}{err&&<span id={`${errKey}-error`} className="field-error" role="alert">{err}</span>}</div>;})}</div></div>)}<button className="button outline" disabled={selectedSection.entries.length>=100} title={selectedSection.entries.length>=100?'Maximum of 100 entries per section reached':undefined} onClick={()=>update({sections:resume.sections.map(section=>section.id===tab?{...section,entries:[...section.entries,entry()]}:section)})}><Plus size={16}/>Add an entry</button></>}
 {tab==='design'&&<div className="design-options"><label className="field">Template<select name="template" value={resume.template} onChange={e=>update({template:e.target.value as Resume['template']})}>{templates.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label className="field">Paper size<select name="paper" value={resume.paper} onChange={e=>update({paper:e.target.value as Resume['paper']})}><option>A4</option><option>Letter</option></select></label><label className="field">Accent color<input name="accent" type="color" value={resume.accent} onChange={e=>update({accent:e.target.value})}/></label><label className="field">Writing direction<select name="direction" value={resume.direction} onChange={e=>update({direction:e.target.value as Resume['direction']})}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label><label className="field">Resume language code<input name="resume-language" autoComplete="off" aria-describedby={languageInput!==''&&!languagePattern.test(languageInput)?'language-error':undefined} maxLength={35} value={languageInput} placeholder="en" aria-invalid={languageInput!==''&&!languagePattern.test(languageInput)} onChange={e=>{const next=e.target.value.replace(/[^A-Za-z0-9-]/g,'').slice(0,35);setLanguageInput(next);if(languagePattern.test(next))update({language:next});}}/>{languageInput!==''&&!languagePattern.test(languageInput)&&<span id="language-error" className="field-error" role="alert">Not saved yet — enter a valid code like en, fr, ar, or ne (2–3 letters, optional region).</span>}</label><p className="field-hint">Write in any language. Section titles, the Profile and Skills headings (in Profile & skills), and the resume’s language code are all editable. The language code (e.g. en, fr, ar, ne) helps screen readers and print correctly; it does not translate the interface, which is currently English.</p><p className="field-hint">Resume content: {contentLength(resume).toLocaleString()} of {maxContentChars.toLocaleString()} characters used.</p><button className="text-button danger" onClick={()=>{if(window.confirm('Clear this resume and start again? This cannot be undone.')){update(blank());setConfirmed(false);setTab('personal');setErrors({});}}}><RotateCcw size={16}/>Start a blank resume</button></div>}
 <div className="wizard-actions"><span className="field-hint">{tab==='design'?'Review your details, then confirm to download.':'You can return to any completed section.'}</span><button className="button next-button" aria-label={tab==='design'?'Confirm':'Next'} onClick={tab==='design'?(confirmed?requestDownload:confirmResume):nextStep}>{tab==='design'?'Confirm':tab==='personal'?'Next: profile & skills':'Next section'}{tab==='design'?<Check size={17}/>:<ArrowRight size={17}/>}</button></div>
 </section><section className="preview-panel" aria-label="Resume preview"><div className="preview-toolbar"><span><span className="live-dot"/>{jobContext?'Tailored resume':'Master resume'}</span><TemplatePicker resume={resume} onSelect={template=>update({template})}/><span>{resume.paper}</span></div><div className="paper-container"><PaginatedResumePreview resume={resume}/></div><p className="preview-caption"><ShieldCheck size={14}/>Pages use the same resume layout and paper proportions as your download.</p>{((confirmed&&complete)||import.meta.env.VITE_PAID_FEATURES_UI_ENABLED==='true')&&<div ref={downloads} className="paid-tools">{confirmed&&complete&&<Suspense fallback={null}><GeneratedDocumentControls key={`documents-${session.user?.id??'guest'}-${activeJobVersion?.id??'master'}`} resume={resume} ownerId={session.user?.id??null} onSignIn={()=>setPage('account')} onViewPro={()=>setPage('pro')}/></Suspense>} {import.meta.env.VITE_PAID_FEATURES_UI_ENABLED==='true'&&<Suspense fallback={null}><TailoringPanel key={`ai-${session.user?.id??'guest'}-${activeJobVersion?.id??'master'}`} resume={resume} ownerId={session.user?.id??null} onSignIn={()=>setPage('account')} onViewPro={()=>setPage('pro')} versionId={activeJobVersion?.id} savedJobId={activeJobVersion?.savedJobId} jobDescriptionAvailable={Boolean(activeJobVersion?.jobSnapshot.descriptionText?.trim())} onAcceptedResume={activeJobVersion?(next)=>{setResume(next);setDirty(true);setConfirmed(false);}:undefined}/></Suspense>}</div>}</section><button className="builder-view-toggle button" aria-pressed={previewMode} onClick={()=>{setPreviewMode(current=>!current);window.scrollTo(0,0);}}>{previewMode?<ArrowLeft size={16} aria-hidden="true"/>:<FileText size={16} aria-hidden="true"/>}{previewMode?'Back to editing':'Preview resume'}</button></main>}
 {sampleOpen&&<Modal className="sample-modal" labelledBy="sample-resume-title" onClose={()=>setSampleOpen(false)}><header><div><h2 id="sample-resume-title">Sample resume</h2><p>A fictional example to help you understand what to include. Your resume stays unchanged.</p></div><button className="icon-button" aria-label="Close sample resume" onClick={()=>setSampleOpen(false)}><X size={20}/></button></header><div className="sample-preview"><PaginatedResumePreview resume={sampleResume}/></div></Modal>}
 </>;
}
function NotFound(){
 useEffect(()=>{document.title='Page not found | ResumeStride';document.querySelector('meta[name="robots"]')?.setAttribute('content',noindex);document.querySelectorAll('link[rel="canonical"],meta[property="og:url"],script[data-seo-schema]').forEach(node=>node.remove());},[]);
 return <main id="main-content" className="not-found"><h1>Page not found</h1><p>This address does not have a ResumeStride page.</p><a href="/">ResumeStride home</a></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode>{window.location.pathname==='/'||window.location.pathname==='/index.html'?<App/>:<NotFound/>}<Analytics debug={false} beforeSend={safeAnalyticsEvent}/></React.StrictMode>);
