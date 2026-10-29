import { captureFirstTouchAttribution, safeAnalyticsEvent, safeSpeedInsight, trackProductEvent } from './services/analytics';
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileText, Globe2, GripVertical, LayoutTemplate, Lock, Plus, RotateCcw, Search, ShieldCheck, Trash2, Upload, UserRound, X } from 'lucide-react';
import { blank, contentLength, entry, example, isExperienceSection, isPremiumTemplate, isResume, languagePattern, maxBackupBytes, maxContentChars, migrate, rescueKey, storageKey, templates, validateAll, validatePersonal, validateSection, type PremiumTemplateId, type Resume } from './model';
import { PaginatedResumePreview } from './components/ResumePreview';
import '@fontsource/noto-sans/400.css';
import './styles.css';
import './design-system.css';
import './patina.css';
import { noindex } from './seo/policy';
import { updateAppHead } from './seo/head';
import { clearContinuation, consumeContinuation, saveContinuation } from './routing/continuation';
import { accountUrl, authReturnRoute } from './routing/authReturn';
import { applicationRoute, applicationsRoute, preferencesRoute, jobResumeRoute, journeyForRoute, matchRoute, parseAppRoute, routeForJourney, routeForPage, todayRoute, type EntryJourney, type NavigableRoute } from './routing/routes';
import { WorkspaceNav, type WorkspaceSection } from './features/applications/WorkspaceNav';
import { useNavigation } from './routing/useNavigation';
import { HomePage } from './features/home/HomePage';
import { PublicNavigation } from './features/home/PublicNavigation';
import { Modal } from './components/Modal';
import { JourneyRail } from './components/JourneyRail';
import { JourneyStart } from './features/onboarding/JourneyStart';
import { TemplatePicker } from './components/TemplatePicker';
import { PremiumTemplateUnlockModal } from './features/billing/PremiumTemplateUnlockModal';
import { useTemplateAccess } from './hooks/useTemplateAccess';
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
const PreferencesSetup = lazy(() => import('./features/onboarding/PreferencesSetup').then(m => ({ default: m.PreferencesSetup })));
const ApplicationsWorkspace = lazy(() => import('./features/applications/ApplicationsWorkspace').then(m => ({ default: m.ApplicationsWorkspace })));
import { authConfigured, supabase } from './services/supabase';
import { useSession } from './hooks/useSession';
import { useCloudResume } from './hooks/useCloudResume';
import { applyInterfaceLocale } from './i18n/locale';
import { clearPendingJobImport, isJobCapturePayload, listenForJobImport, loadPendingJobImport, storePendingJobImport, type JobCapturePayload } from './services/extensionImport';
import { clearPendingJob, loadPendingJob, savePendingJob } from './features/onboarding/jobFirstState';
// docx/pdf import parsing is only needed inside uploadResume() below, so it is
// dynamically imported there instead of shipped in the initial bundle.
const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
import { JobResumeConflictError, jobResumeRequest, parseJobResumeVersion, type JobResumeVersion } from './services/jobResumeVersions';
import type { ProvenanceEntry } from './lib/tailoringProvenance';
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
  if (!raw) {
   const requested=window.location.pathname.replace(/\/$/,'')==='/start/build'?new URLSearchParams(window.location.search).get('template'):null;
   const template=templates.find(item=>item.id===requested)?.id;
   return {resume:template?{...blank(),template}:blank(), warning:'', rescue, conflict:null};
  }
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
// The master draft lives in sessionStorage: it survives a reload in this tab only, so it
// is never described as saved to an account or kept on this device.
const sessionDraftLabel = 'Temporary draft — this tab only';
function App(){
 const navigation=useNavigation();
 const {route,navigate:setPage}=navigation;
 const page=navigation.page??'home';
 const legacyBrandOrigin=window.location.hostname==='resumestride.com'||window.location.hostname==='www.resumestride.com';
 const [resume,setResume]=useState<Resume>(start.resume); const [tab,setTab]=useState('personal'); const [saveState,setSaveState]=useState(start.warning?'Storage needs attention':sessionDraftLabel); const [message,setMessage]=useState(start.warning); const [rescue,setRescue]=useState(start.rescue); const [conflict,setConflict]=useState(start.conflict); const [dirty,setDirty]=useState(false); const [previewMode,setPreviewMode]=useState(false); const [sampleOpen,setSampleOpen]=useState(false); const [unlockTemplate,setUnlockTemplate]=useState<PremiumTemplateId|null>(null); const [languageInput,setLanguageInput]=useState(resume.language); const [errors,setErrors]=useState<Record<string,string>>({}); const [pendingFocus,setPendingFocus]=useState<string|null>(null); const [confirmed,setConfirmed]=useState(false); const file=useRef<HTMLInputElement>(null); const downloads=useRef<HTMLDivElement>(null);
 const [jobContext,setJobContext]=useState<JobCapturePayload|null>(null);
 const [activeJobVersion,setActiveJobVersion]=useState<JobResumeVersion|null>(null);
 // Provenance of accepted tailoring changes, saved with the version alongside `resume`.
 const [jobProvenance,setJobProvenance]=useState<ProvenanceEntry[]>([]);
 const [jobVersionMasterChanged,setJobVersionMasterChanged]=useState(false);
 const [jobVersionConflict,setJobVersionConflict]=useState<JobResumeVersion|null>(null);
 const [hasSuspendedJobDraft,setHasSuspendedJobDraft]=useState(false);
 const jobVersionRevision=useRef<number|null>(null);
 const jobVersionSaving=useRef(false);
 const liveResume=useRef(resume);liveResume.current=resume;
 const session=useSession();
 const templateAccessState=useTemplateAccess(session.user?.id??null,page==='builder');
 const templateAccess=templateAccessState.access;
 const selectedTemplate=templates.find(item=>item.id===resume.template)!;
 const requestedTemplate=useRef(templates.find(item=>item.id===new URLSearchParams(window.location.search).get('template'))?.id??null);
 const selectedTemplateLocked=isPremiumTemplate(resume.template)&&templateAccessState.status==='ready'&&!templateAccess?.isPro&&!templateAccess?.activeTemplates.includes(resume.template);
 const templateOptionLabel=(template:(typeof templates)[number])=>{
  if(!isPremiumTemplate(template.id))return `${template.label} — Free / Included`;
  if(templateAccessState.status!=='ready')return `${template.label} — Premium · Checking access`;
  if(templateAccessState.access.isPro)return `${template.label} — Included with Pro`;
  return templateAccessState.access.activeTemplates.includes(template.id)?`${template.label} — Premium · Active`:`${template.label} — Premium · Included with Pro`;
 };
 const landingTracked=useRef(false);
 const entryPage=useRef(page);
 const resumeCreatedTracked=useRef(Boolean(start.resume.name||start.resume.headline||start.resume.summary||start.resume.skills));
 const initialJourney=journeyForRoute(route);
 const selectedJourney=useRef<Exclude<EntryJourney,'sample'>|null>(initialJourney==='sample'?null:initialJourney);
 useEffect(()=>{const journey=journeyForRoute(route);if(journey&&journey!=='sample')selectedJourney.current=journey;},[route]);
 const lastConfirmedSignature=useRef<string|null>(null);
 useEffect(()=>{
  if(session.loading||landingTracked.current||entryPage.current!=='home')return;landingTracked.current=true;
  const attribution=captureFirstTouchAttribution(new URL(window.location.href),document.referrer,sessionStorage);
  trackProductEvent('landing_page_view',{surface:'home',user_state:session.user?'authenticated':'anonymous',...attribution});
  trackProductEvent('public_landing_viewed',{surface:'home',user_state:session.user?'authenticated':'anonymous',...attribution});
 },[session.loading]);
 useEffect(()=>{
  if(page==='jobs')trackProductEvent('jobs_viewed',{surface:'jobs',user_state:session.user?'authenticated':'anonymous'});
  if(page==='pro')trackProductEvent('pricing_viewed',{surface:'pricing',user_state:session.user?'authenticated':'anonymous'});
 },[page]);
 const metadataName=session.user?.user_metadata?.full_name;
 const profileName=session.user?(typeof metadataName==='string'&&metadataName.trim()?metadataName.trim():session.user.email?.split('@')[0]||'Profile'):'';
 const lastOwnerId=useRef<string|null>(session.user?.id??null);
 useEffect(()=>{if(session.user?.id)lastOwnerId.current=session.user.id;},[session.user?.id]);
 const accountDestination=():NavigableRoute=>{
  if(route.kind==='not_found'||route.kind==='workspace_account'||route.kind==='home')return routeForPage('home');
  // An anonymous entry may retain only this bounded route. The destination still
  // performs owner-scoped server restoration after sign-in; the UUID is never
  // treated as authorization and no content is placed in continuation storage.
  return route;
 };
 const openAccount=()=>{let destination:NavigableRoute=routeForPage('home');try{clearContinuation(sessionStorage);if(!session.user){destination=accountDestination();if(destination.kind!=='home')saveContinuation(sessionStorage,destination,lastOwnerId.current);}}catch{/* session storage is optional */}setPage('account');if(!session.user&&destination.kind!=='home'){const url=accountUrl(destination);window.setTimeout(()=>window.history.replaceState(null,'',url),0);}};
 const previousOwnerId=useRef<string|null|undefined>(undefined);
 useEffect(()=>{
  if(session.loading)return;
  const previous=previousOwnerId.current;
  previousOwnerId.current=session.user?.id??null;
  if(page!=='account'||!session.user||(previous!==null&&!(previous===undefined&&new URLSearchParams(window.location.search).has('return_to'))))return;
  if(new URLSearchParams(window.location.search).get('reset')==='1')return;
  let destination:NavigableRoute|null=null;
  try{destination=consumeContinuation(sessionStorage,session.user.id);}catch{/* session storage is optional */}
  destination??=authReturnRoute(new URLSearchParams(window.location.search).get('return_to'));
  if(destination)setPage(destination,{replace:true});
 },[page,session.loading,session.user?.id,setPage]);
 const restoreGuestDraft=():Resume=>{try{const raw=sessionStorage.getItem(storageKey);if(raw){const migrated=migrate(JSON.parse(raw));if(isResume(migrated))return migrated;}}catch{/* fall through to blank */}return blank();};
 const cloud=useCloudResume(session.user,resume,dirty,setResume,setDirty,restoreGuestDraft,setMessage,Boolean(jobContext));
 useEffect(()=>{const template=requestedTemplate.current;if(!template||session.loading||cloud.loading)return;if(resume.template!==template){setResume(current=>({...current,template}));setDirty(true);setSaveState('Saving…');trackProductEvent('template_selected',{surface:'builder',user_state:session.user?'authenticated':'anonymous',template});}requestedTemplate.current=null;const url=new URL(window.location.href);url.searchParams.delete('template');window.history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`);},[session.loading,cloud.loading,resume.template,session.user?.id]);
 useEffect(()=>{if(languagePattern.test(resume.language))setLanguageInput(resume.language);},[resume.language]);
 useEffect(()=>{if(!message)return;const timer=window.setTimeout(()=>setMessage(''),5000);return()=>window.clearTimeout(timer);},[message]);
 useEffect(()=>{const url=new URL(window.location.href);if(url.searchParams.get('checkout')!=='cancelled')return;setMessage('Checkout cancelled. Nothing was charged.');url.searchParams.delete('checkout');window.history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`);},[]);
 useEffect(()=>{if(confirmed){setPreviewMode(true);window.setTimeout(()=>downloads.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'}),0);}},[confirmed]);
 const previousRoutePath = useRef(route.path);
 useEffect(()=>{
  if(previousRoutePath.current===route.path)return;
  previousRoutePath.current=route.path;
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
 },[route.path]);
 // Job-specific drafts (from the browser extension foundation, apps/extension): a job capture
 // arrives here only via an explicit, validated postMessage (src/services/extensionImport.ts) —
 // never automatically, never from a remote origin. Starting a draft snapshots the current
 // resume in memory (`baseSnapshot`) and pauses local-disk autosave (below) so the job-specific
 // edits below never overwrite the real base resume; discarding restores the snapshot exactly.
 const [incomingJobCapture,setIncomingJobCapture]=useState<JobCapturePayload|null>(null);
 const [pendingJob,setPendingJob]=useState(()=>{try{return loadPendingJob(sessionStorage,undefined);}catch{return null;}});
 const [baseSnapshot,setBaseSnapshot]=useState<Resume|null>(null);
 const sensitiveSeoEntry=useRef(document.documentElement.dataset.seoPrivateEntry==='true');
 useEffect(()=>{
  const sync=()=>updateAppHead(page,Boolean(incomingJobCapture||jobContext||rescue||conflict||session.user),sensitiveSeoEntry.current);
  sync();window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);
  return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};
 },[page,route.kind,incomingJobCapture,jobContext,rescue,conflict,session.user]);
 // The identity this specific draft belongs to, fixed once it starts (or once restored) —
 // deliberately NOT read live from `session.user` on every persist. It may advance exactly once,
 // guest (null) to whichever account signs in next (the intended guest-to-login handoff, see the
 // effect below), but never after that: without this, a debounced write keyed on the live session
 // would silently relabel account A's draft as account B's the moment the signed-in identity
 // changed underneath it, exposing A's content to B on a later reload.
 const [jobDraftOwnerId,setJobDraftOwnerId]=useState<string|null>(null);
 const captureOwner = useRef<string|null>(session.user?.id ?? null);
 const currentCaptureOwner = useRef<string|null>(null);
 const captureSequence = useRef(0);
 const [captureKey,setCaptureKey]=useState(0);
 const [capturedJobsRevision,setCapturedJobsRevision]=useState(0);
 useEffect(()=>listenForJobImport(capture=>{captureSequence.current++;setCaptureKey(captureSequence.current);try{storePendingJobImport(sessionStorage,capture,currentCaptureOwner.current);}catch{/* session storage optional */}setIncomingJobCapture(capture);}),[]);
 useEffect(()=>{
  if(session.loading)return;
  const next=session.user?.id??null;
  currentCaptureOwner.current=next;
  if(captureOwner.current && captureOwner.current!==next){setIncomingJobCapture(null);try{clearPendingJobImport(sessionStorage);}catch{/* optional */}}
  captureOwner.current=next;
  try{const restored=loadPendingJobImport(sessionStorage,next);if(restored&&!incomingJobCapture){captureSequence.current++;setCaptureKey(captureSequence.current);setIncomingJobCapture(restored);}}catch{/* optional */}
  try{setPendingJob(loadPendingJob(sessionStorage,next));}catch{setPendingJob(null);}
 },[session.loading,session.user?.id,incomingJobCapture]);
 const dismissIncomingCapture=()=>{try{clearPendingJobImport(sessionStorage);}catch{/* optional */}setIncomingJobCapture(null);};
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
  try{clearPendingJobImport(sessionStorage);}catch{/* optional */}
  setIncomingJobCapture(null);
 };
 const editJobResume=(version:JobResumeVersion,masterChanged:boolean)=>{
  if(!session.user)return;
  setBaseSnapshot(resume);
  setActiveJobVersion(version);setJobProvenance(version.provenance);
  jobVersionRevision.current=version.revision;
  setJobVersionMasterChanged(masterChanged);
  setJobVersionConflict(null);
  setJobContext({title:version.jobSnapshot.title,company:version.jobSnapshot.company,description:typeof version.jobSnapshot.descriptionText==='string'?version.jobSnapshot.descriptionText:'',sourceUrl:'',capturedAt:new Date().toISOString()});
  setJobDraftOwnerId(session.user.id);
  setResume(version.resume);
  setDirty(false);setConfirmed(false);setErrors({});setTab('personal');setPreviewMode(false);setPage(jobResumeRoute(version.id));
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
  setPage('builder');
  if(!activeJobVersion)try{localStorage.removeItem(jobDraftStorageKey);setHasSuspendedJobDraft(false);}catch{/* best effort */}
 setMessage(activeJobVersion?'You are back on your master resume. The job-specific version remains saved to your account.':'Job-specific draft discarded. You are back on your master resume.');
 };
 useEffect(()=>{
  if(!activeJobVersion)return;
  if(route.kind==='workspace_job_resume'&&route.versionId===activeJobVersion.id)return;
  if(dirty||jobVersionSaving.current){
   setPage(jobResumeRoute(activeJobVersion.id),{replace:true});
   setMessage('Wait for this job-specific resume to finish saving, then use “Return to master resume” before leaving it.');
   return;
  }
  if(!baseSnapshot)return;
  setResume(baseSnapshot);setConfirmed(false);setJobContext(null);setBaseSnapshot(null);setJobDraftOwnerId(null);
  setActiveJobVersion(null);jobVersionRevision.current=null;setJobVersionMasterChanged(false);setJobVersionConflict(null);
  setDirty(false);setErrors({});setPreviewMode(false);
  setMessage('Closed the saved job-specific resume. Your master resume remains unchanged.');
 },[route.path,activeJobVersion?.id,dirty]);
 // A browser-local job draft must not block an owner-scoped Jobs/Match/version URL.
 // Set it aside intact, restore the master in memory, and offer an explicit return.
 useEffect(()=>{
  if(page!=='jobs'||!jobContext||activeJobVersion||!baseSnapshot)return;
  try{localStorage.setItem(jobDraftStorageKey,JSON.stringify({ownerId:jobDraftOwnerId,jobContext,baseSnapshot,resume}));}
  catch{setMessage('The local job draft could not be set aside safely. Keep this tab open and return to the draft before continuing.');setPage('builder',{replace:true});return;}
  setResume(baseSnapshot);setConfirmed(false);setJobContext(null);setBaseSnapshot(null);setJobDraftOwnerId(null);
  setDirty(false);setErrors({});setPreviewMode(false);setHasSuspendedJobDraft(true);
  setMessage('Your local job-specific draft was set aside without deleting it. Resume it whenever you are ready.');
 },[page,jobContext,activeJobVersion?.id,baseSnapshot,jobDraftOwnerId,resume,setPage]);
 // Job-draft recovery across a reload: written to its OWN storage key (never `storageKey`, which
 // must keep holding only the preserved base resume while a job draft is active) together with
 // the identity (`ownerId`, null for a guest) this draft belonged to at the time. Restoring
 // requires an exact match against the CURRENT sign-in identity, so a draft captured as a guest
 // (or under a different account) never gets silently applied under a different one — a mismatch
 // just discards the stale entry rather than guessing. This does not survive private browsing,
 // browser storage being cleared, or opening the app in a different browser/device; those
 // remain out of scope (see apps/extension/README.md) and the base resume itself is unaffected
 // either way, since it was already flushed to `storageKey` the moment the draft started.
 const initialJobDraftRoute=useRef(route.kind);
 useEffect(()=>{
  if(jobContext||session.loading)return;
  // Automatic browser-local job-draft recovery is an initial-entry behavior,
  // never a reaction to Back/Forward or an in-app route transition. Preserve
  // the stored draft without displacing sample, Jobs, Match or saved-version URLs.
  if(initialJobDraftRoute.current!=='home'&&initialJobDraftRoute.current!=='workspace_resume')return;
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
   setHasSuspendedJobDraft(false);
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
 const resumeSuspendedJobDraft=()=>{
  let raw:string|null=null;
  try{raw=localStorage.getItem(jobDraftStorageKey);}catch{/* handled below */}
  if(!raw){setHasSuspendedJobDraft(false);setMessage('That local job-specific draft is no longer available in this browser.');return;}
  try{
   const parsed=JSON.parse(raw) as {ownerId:unknown;jobContext:unknown;baseSnapshot:unknown;resume:unknown};
   if((parsed.ownerId??null)!==(session.user?.id??null)||!isJobCapturePayload(parsed.jobContext)||!isResume(parsed.baseSnapshot)||!isResume(parsed.resume))throw new Error('invalid');
   setBaseSnapshot(parsed.baseSnapshot);setJobContext(parsed.jobContext);setJobDraftOwnerId(session.user?.id??null);setResume(parsed.resume);
   setConfirmed(false);setDirty(false);setErrors({});setPreviewMode(false);setHasSuspendedJobDraft(false);setPage('builder');
   setMessage('Your local job-specific draft is open again. Your master resume remains preserved separately.');
  }catch{
   try{localStorage.removeItem(jobDraftStorageKey);}catch{/* best effort */}
   setHasSuspendedJobDraft(false);setMessage('That local job-specific draft could not be restored safely and was not opened.');
  }
 };
 useEffect(()=>{
  if(session.loading||jobContext)return;
  try{
   const raw=localStorage.getItem(jobDraftStorageKey);if(!raw){setHasSuspendedJobDraft(false);return;}
   const parsed=JSON.parse(raw) as {ownerId:unknown;jobContext:unknown;baseSnapshot:unknown;resume:unknown};
   const valid=(parsed.ownerId??null)===(session.user?.id??null)&&isJobCapturePayload(parsed.jobContext)&&isResume(parsed.baseSnapshot)&&isResume(parsed.resume);
   if(!valid){localStorage.removeItem(jobDraftStorageKey);setHasSuspendedJobDraft(false);return;}
   setHasSuspendedJobDraft(true);
  }catch{setHasSuspendedJobDraft(false);}
 },[session.loading,session.user?.id,jobContext]);
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
    const body=await jobResumeRequest(ownerId,{action:'update_job_resume',versionId,expectedRevision,resume:sending,provenance:jobProvenance});
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
 },[activeJobVersion?.id,activeJobVersion?.revision,resume,jobProvenance,dirty,session.user?.id,jobVersionConflict]);
 const useOtherJobResumeVersion=()=>{
  if(!jobVersionConflict)return;
  jobVersionRevision.current=jobVersionConflict.revision;setActiveJobVersion(jobVersionConflict);setJobProvenance(jobVersionConflict.provenance);setResume(jobVersionConflict.resume);setDirty(false);setJobVersionConflict(null);setConfirmed(false);
  setMessage('Loaded the version saved elsewhere.');
 };
 const keepCurrentJobResumeEdits=()=>{
  if(!jobVersionConflict)return;
  jobVersionRevision.current=jobVersionConflict.revision;setActiveJobVersion(jobVersionConflict);setJobVersionConflict(null);setDirty(true);
  setMessage('Keeping your current edits. APWICO will save them as the next revision.');
 };
 const resetJobResumeFromMaster=async()=>{
  if(!activeJobVersion||!baseSnapshot||!session.user||jobVersionSaving.current)return;
  if(!window.confirm('Replace this job-specific resume with your current master resume? Existing tailored and manual changes in this version will be replaced.'))return;
  const expectedRevision=jobVersionRevision.current;if(expectedRevision===null)return;
  jobVersionSaving.current=true;
  try{
   const body=await jobResumeRequest(session.user.id,{action:'reset_job_resume',versionId:activeJobVersion.id,expectedRevision,resume:baseSnapshot});
   const saved=parseJobResumeVersion(body.version);jobVersionRevision.current=saved.revision;setActiveJobVersion(saved);setJobProvenance(saved.provenance);setResume(saved.resume);setDirty(false);setJobVersionMasterChanged(false);setJobVersionConflict(null);setConfirmed(false);
   setMessage('This job-specific resume was reset from your current master resume.');
  }catch(error){setMessage(error instanceof Error?error.message:'Unable to update from your master resume.');}
  finally{jobVersionSaving.current=false;}
 };
 const update=(patch:Partial<Resume>)=>{const next={...resume,...patch};if(contentLength(next)>maxContentChars && contentLength(next)>contentLength(resume)){setMessage(`This resume has reached the maximum size that can be reliably backed up and re-imported (${maxContentChars.toLocaleString()} characters). Remove some content before adding more.`);return;}if(!resumeCreatedTracked.current&&(next.name||next.headline||next.summary||next.skills||next.sections.some(section=>section.entries.some(item=>item.title||item.description)))){resumeCreatedTracked.current=true;trackProductEvent('resume_created',{surface:'builder',user_state:session.user?'authenticated':'anonymous'});if(selectedJourney.current)trackProductEvent('first_useful_input_completed',{surface:'builder',user_state:session.user?'authenticated':'anonymous',journey:selectedJourney.current});}setResume(next);setConfirmed(false);setDirty(true);setSaveState('Saving…');if(Object.keys(patch).some(key=>errors[key]))setErrors(current=>{const next={...current};for(const key of Object.keys(patch))delete next[key];return next;});};
 useEffect(()=>{if(!pendingFocus)return;const target=pendingFocus;const el=Array.from(document.querySelectorAll<HTMLElement>('[data-field]')).find(node=>node.dataset.field===target);el?.focus();setPendingFocus(null);},[pendingFocus,tab]);
 const tabOrder=['personal','profile',...resume.sections.map(section=>section.id),'design'];
 const enforcePersonal=():boolean=>{const issues=validatePersonal(resume);if(issues.length){setErrors(current=>({...current,...Object.fromEntries(issues.map(i=>[i.field,i.message]))}));setTab('personal');setMessage(issues[0].message);setPendingFocus(issues[0].field);return false;}return true;};
 const enforceSectionsBefore=(targetIdx:number):boolean=>{for(const section of resume.sections){if(tabOrder.indexOf(section.id)>=targetIdx)break;const issues=validateSection(section,resume.noExperience);if(issues.length){setErrors(Object.fromEntries(issues.map(i=>[i.field,i.message])));setTab(section.id);setMessage(issues[0].message);setPendingFocus(issues[0].field);return false;}}return true;};
 const goTo=(targetTab:string)=>{const targetIdx=tabOrder.indexOf(targetTab);const currentIdx=tabOrder.indexOf(tab);if(targetIdx<=currentIdx){setTab(targetTab);setPreviewMode(false);return;}if(!enforcePersonal()||!enforceSectionsBefore(targetIdx))return;setErrors({});setTab(targetTab);setPreviewMode(false);};
 const nextStep=()=>{const currentIdx=tabOrder.indexOf(tab);const next=tabOrder[currentIdx+1];if(next)goTo(next);};
 const confirmResume=()=>{const issues=validateAll(resume);if(issues.length){const issue=issues[0];setErrors(Object.fromEntries(issues.filter(item=>item.tab===issue.tab).map(item=>[item.field,item.message])));setTab(issue.tab);setMessage(issue.message);setPendingFocus(issue.field);return;}if(!languagePattern.test(languageInput)){setTab('design');setMessage('Enter a valid resume language code before confirming.');return;}setErrors({});setConfirmed(true);const documentScope=activeJobVersion?'job_specific':jobContext?'job_draft':'master';const signature=`${documentScope}:${JSON.stringify(resume)}`;if(lastConfirmedSignature.current!==signature){lastConfirmedSignature.current=signature;trackProductEvent(jobContext?'job_specific_resume_completed':'resume_completed',{surface:'builder',user_state:session.user?'authenticated':'anonymous',template:resume.template});trackProductEvent(jobContext?'changes_reviewed':'master_resume_usable',{surface:'builder',user_state:session.user?'authenticated':'anonymous',document_scope:documentScope,storage_scope:activeJobVersion||cloud.linked?'account':'local'});}};
 const requestDownload=()=>{if(selectedTemplateLocked){setPreviewMode(true);setUnlockTemplate(resume.template as PremiumTemplateId);return;}if(confirmed){setPreviewMode(true);requestAnimationFrame(()=>downloads.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'}));return;}const issues=validateAll(resume);if(issues.length){const issue=issues[0];setErrors(Object.fromEntries(issues.filter(item=>item.tab===issue.tab).map(item=>[item.field,item.message])));setTab(issue.tab);setPreviewMode(false);setMessage(issue.message);setPendingFocus(issue.field);return;}setTab('design');setPreviewMode(false);window.scrollTo(0,0);};
 useEffect(()=>{if(cloud.linked||cloud.loading||jobContext)return;if(!dirty)return;if(conflict){setSaveState('Autosave paused — resolve recovery draft');return;}const timer=setTimeout(()=>{try{sessionStorage.setItem(storageKey,JSON.stringify(resume));setSaveState(sessionDraftLabel);}catch{setSaveState('Not saved — browser storage unavailable');}},350);return()=>clearTimeout(timer);},[resume,dirty,conflict,cloud.linked,cloud.loading,jobContext]);
 useEffect(()=>{const persist=()=>{if(cloud.linked||cloud.loading||jobContext)return;if(dirty && !conflict)try{sessionStorage.setItem(storageKey,JSON.stringify(resume));}catch{/* save status already reports the failure */}};window.addEventListener('pagehide',persist);return()=>window.removeEventListener('pagehide',persist);},[resume,dirty,conflict,cloud.linked,cloud.loading,jobContext]);
 const downloadRescue=()=>{if(!rescue)return;const url=URL.createObjectURL(new Blob([rescue],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='unreadable-draft-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const discardRescue=()=>{try{sessionStorage.removeItem(rescueKey);}catch{/* best effort */}setRescue(null);};
 const downloadConflict=()=>{if(!conflict)return;const url=URL.createObjectURL(new Blob([conflict],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='second-unreadable-draft-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const uploadResume=async(event:React.ChangeEvent<HTMLInputElement>)=>{const selected=event.target.files?.[0];if(!selected)return;const journey=selectedJourney.current;let failureTracked=false;trackProductEvent('import_started',{surface:'builder',user_state:session.user?'authenticated':'anonymous',...(journey?{journey}:{})});try{
  if(selected.size>maxBackupBytes){failureTracked=true;trackProductEvent('import_failed',{surface:'builder',user_state:session.user?'authenticated':'anonymous',...(journey?{journey}:{}),failure_category:'file_too_large'});throw Error(`Please choose a file smaller than ${Math.round(maxBackupBytes/1000000)} MB.`);}
  const buffer=await selected.arrayBuffer();const bytes=new Uint8Array(buffer);
  const isPdf=selected.type==='application/pdf'||selected.name.toLowerCase().endsWith('.pdf')||(bytes.length>=4&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46);
  const isZip=bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04;
  if(!isPdf&&!isZip){failureTracked=true;trackProductEvent('import_failed',{surface:'builder',user_state:session.user?'authenticated':'anonymous',...(journey?{journey}:{}),failure_category:'unsupported_file'});throw Error('Choose a Word (.docx) or PDF file.');}
  const format=isPdf?'PDF':'Word document';
  const data=isPdf?await(await import('./services/pdfImport')).resumeFromPdfFile(buffer):await(await import('./services/docx')).resumeFromDocxFile(buffer);
  if(dirty || resume.name){if(!window.confirm(`Replace the current draft with this ${format}? Your current edits will be replaced.`)){trackProductEvent('import_failed',{surface:'builder',user_state:session.user?'authenticated':'anonymous',...(journey?{journey}:{}),failure_category:'cancelled'});return;}}
  resumeCreatedTracked.current=true;trackProductEvent('import_completed',{surface:'builder',user_state:session.user?'authenticated':'anonymous',...(journey?{journey}:{}),outcome:'success'});if(journey)trackProductEvent('first_useful_input_completed',{surface:'builder',user_state:session.user?'authenticated':'anonymous',journey});
  setResume(data);setLanguageInput(data.language);setDirty(true);setSaveState('Saving…');setTab('personal');setPreviewMode(false);setErrors({});setConfirmed(false);
  setMessage(pendingJob?`${format} imported. Review every recovered section before returning to the preserved job.`:`${format} imported. Review every recovered section before confirming this master resume.`);setPage('builder');
 }catch(error){if(!failureTracked)trackProductEvent('import_failed',{surface:'builder',user_state:session.user?'authenticated':'anonymous',...(journey?{journey}:{}),failure_category:'parse_failure'});setMessage(error instanceof Error?error.message:'Unable to import this file.');}finally{event.target.value='';}};
 const begin=(journey?:'build_first')=>{if(journey){selectedJourney.current=journey;trackProductEvent('entry_journey_selected',{surface:'home',user_state:session.user?'authenticated':'anonymous',journey});}trackProductEvent('builder_started',{surface:'builder',user_state:session.user?'authenticated':'anonymous',...(selectedJourney.current?{journey:selectedJourney.current}:{})});setPreviewMode(false);setPage(journey?routeForJourney(journey):routeForPage('builder'));window.scrollTo(0,0);};
 const openBuilder=()=>{trackProductEvent('builder_started',{surface:'builder',user_state:session.user?'authenticated':'anonymous',...(selectedJourney.current?{journey:selectedJourney.current}:{})});setPreviewMode(false);setPage('builder');};
 const selectImportJourney=()=>{selectedJourney.current='import_first';trackProductEvent('entry_journey_selected',{surface:'home',user_state:session.user?'authenticated':'anonymous',journey:'import_first'});setPage(routeForJourney('import_first'));};
 const selectJobJourney=()=>{selectedJourney.current='job_first';trackProductEvent('entry_journey_selected',{surface:'home',user_state:session.user?'authenticated':'anonymous',journey:'job_first'});setPage(routeForJourney('job_first'));};
 const selectCompareJourney=()=>{selectedJourney.current='job_first';trackProductEvent('entry_journey_selected',{surface:'home',user_state:session.user?'authenticated':'anonymous',journey:'job_first'});};
 const preserveJobFirst=(capture:JobCapturePayload,next:'import'|'build')=>{if(session.loading){setMessage('Finish checking your account before preserving this job.');return;}try{const stored=savePendingJob(sessionStorage,capture,session.user?.id??null);setPendingJob(stored);}catch{setMessage('This job could not be preserved safely. Review the pasted text and try again.');return;}selectedJourney.current='job_first';setPage(routeForJourney(next==='import'?'import_first':'build_first'));};
 const continueJobFirst=(capture:JobCapturePayload)=>{try{clearPendingJob(sessionStorage);}catch{/* optional */}setPendingJob(null);setIncomingJobCapture(capture);setPage('jobs');};
 const resumePendingJob=()=>{if(!pendingJob)return;continueJobFirst(pendingJob.capture);};
 const viewPro=()=>{trackProductEvent('upgrade_prompt_viewed',{surface:page==='jobs'?'jobs':page==='builder'?'builder':'home',user_state:session.user?'authenticated':'anonymous'});setPage('pro');};
 const selectTemplate=(template:Resume['template'])=>{trackProductEvent('template_selected',{surface:page==='home'?'home':'builder',user_state:session.user?'authenticated':'anonymous',template});update({template});};
 const returnHome=()=>{setMessage('');setPage('home');window.scrollTo(0,0);};
 const field=(label:string,key:'name'|'headline'|'email'|'phone'|'location'|'website'|'summary'|'skills',placeholder:string,multiline=false)=>{const err=errors[key];const errId=`${key}-error`;const fieldId=`field-${key}`;return <div className={multiline?'field full':'field'}><label htmlFor={fieldId}>{label}</label>{multiline?<textarea id={fieldId} name={key} autoComplete="off" data-field={key} aria-invalid={!!err} aria-describedby={err?errId:undefined} dir="auto" rows={key==='summary'?5:3} maxLength={50000} value={resume[key]} placeholder={placeholder} onChange={event=>update({[key]:event.target.value})}/>:<input id={fieldId} name={key} type={key==='email'?'email':key==='phone'?'tel':key==='website'?'url':'text'} autoComplete={({name:'name',headline:'organization-title',email:'email',phone:'tel',location:'off',website:'url',summary:'off',skills:'off'})[key]} spellCheck={key==='email'||key==='website'?false:undefined} data-field={key} aria-invalid={!!err} aria-describedby={err?errId:undefined} dir="auto" maxLength={50000} value={resume[key]} placeholder={placeholder} onChange={event=>update({[key]:event.target.value})}/>}{err&&<span id={errId} className="field-error" role="alert">{err}</span>}</div>;};
 const selectedSection=resume.sections.find(section=>section.id===tab);
 const selectedSectionHelper=selectedSection?.title.toLowerCase().includes('education')
  ? 'Add education or training relevant to your resume.'
  : selectedSection?.title.toLowerCase().includes('additional')
   ? 'Add projects, volunteering, research, certifications, or other relevant experience.'
   : 'Add roles, projects, or other work that supports your next step.';
 const completion=[resume.name,resume.headline,resume.summary,resume.sections.some(section=>section.entries.some(item=>item.title)),resume.skills].filter(Boolean).length;
 const complete=validateAll(resume).length===0;
 const documentSaveLabel=cloud.statusText??(jobContext?(activeJobVersion?(saveState===sessionDraftLabel?'Job-specific resume saved to your account':saveState):'Job draft — saved in this browser only'):saveState);
 const activeDocumentName=jobContext?`${jobContext.title||'Untitled role'}${jobContext.company?` · ${jobContext.company}`:''}`:resume.name||'Master resume';
 const activeDocumentKind=activeJobVersion?'Job-specific resume':jobContext?'Job-specific draft':'Master resume';
 const workspaceSection:WorkspaceSection=route.kind==='workspace_today'?'today':route.kind==='workspace_applications'||route.kind==='workspace_application'||route.kind==='workspace_saved_jobs'?'applications':route.kind==='workspace_jobs'||route.kind==='workspace_match'?'discover':null;
 const activeStorageScope=activeJobVersion?'Account-saved version':jobContext?'Local draft · this browser only':cloud.linked?'Account-saved resume':'Temporary draft · this tab only';
 const routeJourney=journeyForRoute(route);
 return <><input ref={file} type="file" accept={`.docx,${docxMimeType},.pdf,application/pdf`} hidden onChange={uploadResume}/>
 <a className="skip-link" href="#main-content">Skip to main content</a>
 {legacyBrandOrigin&&<aside className="brand-transition-notice" aria-label="APWICO domain transition"><div><strong>ResumeStride is moving to APWICO.</strong><p>Browser-only work on this address cannot transfer automatically to a different domain. Before the old address redirects, review and download anything you need. If account saving is available to you, sign in and confirm it is saved there too.</p></div><div><button className="button outline" onClick={openBuilder}>Review this browser draft</button><button className="text-button" onClick={openAccount}>Open account</button></div></aside>}
 {routeJourney||page!=='builder'&&page!=='jobs'&&page!=='tracker'?<PublicNavigation authAvailable={authConfigured} signedIn={Boolean(session.user)} profileName={profileName} resumeReady={Boolean(resume.name)} onHome={returnHome} onContinue={resume.name?openBuilder:()=>begin('build_first')} onJobs={selectJobJourney} onAccount={openAccount}/>:<header className="site-header"><button className="brand" onClick={returnHome} aria-label="APWICO home"><span className="brand-icon"><span className="stride-mark" aria-hidden="true"><i/><i/><i/></span></span><span>APWICO</span></button>{(page==='builder'||page==='jobs'||page==='tracker')&&<WorkspaceNav current={workspaceSection} onNavigate={section=>setPage(section==='today'?todayRoute():section==='applications'?applicationsRoute():'jobs')}/>}<div className="header-actions">{page!=='tracker'&&<span className="save-status" role="status"><CheckCircle2 size={15}/>{documentSaveLabel}</span>}{page==='builder'&&<button className="button outline header-jobs" aria-label="Find jobs" onClick={()=>setPage('jobs')}><Search size={16} aria-hidden="true"/><span>Find jobs</span></button>}{session.user&&<button className="header-profile" onClick={openAccount} aria-label={`Open profile for ${profileName}`}><UserRound size={16}/>Hello, {profileName}</button>}<button className="button outline header-download" aria-label={selectedTemplateLocked?'Use Pro to download':'Download'} onClick={requestDownload}>{selectedTemplateLocked?<Lock size={16} aria-hidden="true"/>:<Download size={16} aria-hidden="true"/>}<span>{selectedTemplateLocked?'Use Pro to download':'Download'}</span></button></div></header>}
 {message&&<div className="notice" role="status">{message}<button aria-label="Dismiss notification" onClick={()=>setMessage('')}><X size={16}/></button></div>}
 {rescue&&<div className="notice" role="status">An earlier draft on this device could not be loaded and has been kept separately so it isn’t lost.<button className="text-button" onClick={downloadRescue}><Download size={14}/>Download it</button><button aria-label="Discard the unreadable draft" onClick={discardRescue}><X size={16}/></button></div>}
 {conflict&&<div className="notice" role="status">A second unreadable draft was found while an earlier recovered draft above is still waiting. Autosave is paused to keep both recovery drafts safe. Download the unreadable recovery data, then explicitly discard this recovery draft to resume autosave.<button className="text-button" onClick={downloadConflict}><Download size={14}/>Download it</button><button aria-label="Discard this additional unreadable draft" onClick={()=>{if(window.confirm('Discard this recovery draft and allow your current edits to replace it?'))setConflict(null);}}><X size={16}/></button></div>}
 {cloud.consentPending&&<div className="notice" role="status">Save your local resume to your APWICO account? It stays available across your signed-in devices.<button className="text-button" onClick={cloud.acceptConsent}>Save to my account</button><button className="text-button" onClick={cloud.declineConsent}>Not now</button></div>}
 {cloud.loadFailed&&<div className="notice" role="alert">APWICO could not verify your account master resume. Job-specific restoration is paused so a local draft cannot be mistaken for your master.<button className="text-button" onClick={cloud.retryLoad}>Retry account resume check</button></div>}
 {cloud.conflict&&<div className="notice" role="status">{cloud.conflict.server?'Your account resume was saved elsewhere since you last loaded it (perhaps another tab or device). Choose which version to keep.':'Your account resume could not be found — it may have been deleted elsewhere. Save your current edits as a new account resume, or keep working locally.'}{cloud.conflict.server&&<button className="text-button" onClick={cloud.useServerVersion}>Use the other version</button>}<button className="text-button" onClick={cloud.keepMyEdits}>{cloud.conflict.server?'Keep my edits':'Save my edits as new'}</button></div>}
 {cloud.saveBlocked&&<div className="notice" role="alert">Account storage limit reached. Keep this tab open and contact support@apwico.com before leaving this page.<button className="text-button" onClick={cloud.retryAfterStorageReview}>Retry after storage review</button></div>}
 {cloud.linked&&!jobContext&&<div className="notice cloud-storage-controls" role="note"><span>Your master resume is saved to this account. Download a JSON backup before removal if you need a separate copy.</span><button className="text-button danger" onClick={()=>{if(window.confirm('Remove the account-saved master resume and its retained revisions? Your earlier local draft on this device will reopen. Download a JSON backup first if needed.'))cloud.removeFromAccount();}}>Remove account-saved copy</button></div>}
 {hasSuspendedJobDraft&&!jobContext&&<div className="notice" role="status">A local job-specific draft is set aside in this browser. It has not been deleted or mixed into this workspace item.<button className="text-button" onClick={resumeSuspendedJobDraft}>Resume local job draft</button></div>}
 {incomingJobCapture&&(!captureOwner.current||captureOwner.current===(session.user?.id??null))&&!jobContext&&<Suspense fallback={null}><CapturedJobReview key={captureKey} capture={incomingJobCapture} resume={resume} ownerId={session.loading?null:session.user?.id??null} loading={session.loading} onSignIn={openAccount} onSaved={alreadySaved=>{try{clearPendingJobImport(sessionStorage);}catch{/* optional */}setIncomingJobCapture(null);setCapturedJobsRevision(value=>value+1);setPage('jobs');setMessage(alreadySaved?'This job was already saved. Its existing snapshot and resume were kept; incoming edits did not replace them.':'Job saved to your account. Review its Match Analysis below.');}}/></Suspense>}
 {incomingJobCapture&&(!captureOwner.current||captureOwner.current===(session.user?.id??null))&&(jobContext?<div className="notice" role="status">A new job was captured, but you’re already editing a job-specific draft. Discard the current draft below first, then trigger the capture again from the extension.<button className="text-button" onClick={dismissIncomingCapture}>Dismiss</button></div>:(cloud.linked||cloud.loading)?<div className="notice" role="status">A job was captured from the APWICO extension, and can be saved to your account using the review above. Local drafts are unavailable while cloud saving is active.<button className="text-button" onClick={dismissIncomingCapture}>Dismiss</button></div>:<div className="notice" role="status">A job was captured from the APWICO extension: “{incomingJobCapture.title||'Untitled role'}”{incomingJobCapture.company?` at ${incomingJobCapture.company}`:''}. Start a job-specific draft — a separate copy of your resume that never changes your saved master resume — to work from these details? Save the job above for Match Analysis and Pro tailoring on a persistent job-specific resume. A local draft supports manual editing only.<button className="text-button" onClick={startJobDraft}>Start job-specific draft</button><button className="text-button" onClick={dismissIncomingCapture}>Dismiss</button></div>)}
 {pendingJob&&page==='builder'&&!routeJourney&&!jobContext&&<div className="notice pending-job-notice" role="status"><span>The pasted job is preserved separately while you work on your master resume.</span><button className="text-button" onClick={resumePendingJob}>Review the job with this resume</button><button className="text-button" onClick={()=>{try{clearPendingJob(sessionStorage);}catch{/* optional */}setPendingJob(null);}}>Discard pasted job</button></div>}
 {jobContext&&<div className="notice job-draft-notice" role="status"><strong>{activeJobVersion?'Job-specific resume':'Job-specific draft'}</strong> — Tailored for {jobContext.title||'this role'}{jobContext.company?` · ${jobContext.company}`:''}. Your master resume is preserved separately. {activeJobVersion?'This version is saved to your account; accepted AI suggestions and manual edits update only this version.':'This draft is kept only in this browser and should recover here after a reload.'}{jobVersionMasterChanged&&<span> Your master resume has changed since this version was created. Keep this version, or update from master to replace its tailored/manual changes.</span>}{jobVersionMasterChanged&&<><button className="text-button" onClick={()=>setJobVersionMasterChanged(false)}>Keep this version</button><button className="text-button" onClick={()=>void resetJobResumeFromMaster()}>Update from master</button></>}<button className="text-button" onClick={discardJobDraft}>{activeJobVersion?'Return to master resume':'Discard draft & return to master resume'}</button></div>}
 {jobVersionConflict&&<div className="notice" role="alert"><strong>This job-specific resume was updated elsewhere.</strong> Your current edits were not overwritten. Choose the saved version, or explicitly keep your edits as the next revision.<button className="text-button" onClick={useOtherJobResumeVersion}>Use saved version</button><button className="text-button" onClick={keepCurrentJobResumeEdits}>Keep my edits</button></div>}
 {jobContext?.description&&<details className="job-description-details"><summary>View captured job description</summary><pre className="job-description-text">{jobContext.description}</pre></details>}
 {!routeJourney&&(page==='builder'||page==='jobs')&&<JourneyRail current={route.kind==='workspace_match'?'match':page==='jobs'?'opportunities':activeJobVersion||jobContext?'tailor':'resume'} onResume={page==='jobs'?()=>setPage('builder'):undefined} onJobs={page==='builder'?()=>setPage('jobs'):undefined}/>}
 {!routeJourney&&(page==='builder'||page==='jobs')&&<div role="region" aria-label="Active document" className={`document-identity ${jobContext?'is-tailored':''}`}><div><span>{activeDocumentKind}</span><strong>{activeDocumentName}</strong></div><p>{jobContext?'A separate version. Your master stays unchanged.':'Use this master to create job-specific versions.'}<span className="document-storage-scope">{activeStorageScope}</span></p></div>}
 {routeJourney?<JourneyStart key={`${routeJourney}:${session.loading?'loading':session.user?.id??'guest'}:${pendingJob?.createdAt??'none'}`} journey={routeJourney} resumeReady={Boolean(resume.name||resume.headline||resume.summary)} pendingJob={pendingJob?.capture??null} onPreserveJob={preserveJobFirst} onContinueJob={continueJobFirst} onChooseFile={routeJourney==='import_first'?()=>file.current?.click():()=>setPage(routeForJourney('import_first'))} onStartBuilding={()=>setPage('builder')} onUseRealJob={()=>setPage('jobs')} onUseSample={()=>setPage(routeForJourney('sample'))}/>:page==='pro'?<Suspense fallback={<main className="route-loading-page" id="main-content"><h1 className="visually-hidden">Loading…</h1><p className="route-loading" role="status">Loading…</p></main>}><ProPage ownerId={session.user?.id??null} onBack={returnHome} onSignIn={openAccount}/></Suspense>:page==='account'?<Suspense fallback={<main className="route-loading-page" id="main-content"><h1 className="visually-hidden">Loading…</h1><p className="route-loading" role="status">Loading…</p></main>}><AuthPanel onBack={()=>setPage('home',{replace:true})} onRecoveryComplete={()=>{const destination=authReturnRoute(new URLSearchParams(window.location.search).get('return_to'));setMessage('Password updated. You are signed in.');setPage(destination??routeForPage('account'),{replace:true});}}/></Suspense>:(page==='jobs'||(route.kind==='workspace_job_resume'&&activeJobVersion?.id!==route.versionId))?<main className="builder jobs-page" id="main-content"><Suspense fallback={<><h1 className="visually-hidden">Opportunity workspace</h1><p className="route-loading" role="status">Loading…</p></>}><JobsPanel key={`${capturedJobsRevision}:${session.user?.id??'guest'}`} resume={resume} ownerId={session.user?.id??null} masterReady={!session.loading&&!cloud.loading&&!cloud.loadFailed&&!cloud.conflict&&!cloud.consentPending&&!rescue&&!conflict&&!jobContext&&!activeJobVersion} target={route.kind==='workspace_match'?{kind:'match',savedJobId:route.savedJobId}:route.kind==='workspace_job_resume'?{kind:'job_resume',versionId:route.versionId}:route.kind==='workspace_saved_jobs'?{kind:'saved_jobs'}:{kind:'jobs'}} onSignIn={openAccount} onViewPro={viewPro} onBack={()=>setPage(resume.name||resume.headline?'builder':'home')} onOpenSavedJobs={()=>setPage(applicationsRoute())} onOpenMatch={savedJobId=>setPage(matchRoute(savedJobId))} onEditJobResume={editJobResume} onEditPreferences={()=>setPage(preferencesRoute())}/></Suspense></main>:route.kind==='workspace_preferences'?<Suspense fallback={<main className="tracker" id="main-content"><p className="route-loading" role="status">Loading…</p></main>}><PreferencesSetup key={session.user?.id??'guest'} ownerId={session.user?.id??null} sessionLoading={session.loading} resume={resume} onDone={()=>setPage('jobs')} onSignIn={openAccount}/></Suspense>:page==='tracker'?<main className="tracker-page" id="main-content"><Suspense fallback={<><h1 className="visually-hidden">My applications</h1><p className="route-loading" role="status">Loading…</p></>}><ApplicationsWorkspace key={session.user?.id??'guest'} ownerId={session.user?.id??null} sessionLoading={session.loading} view={route.kind==='workspace_application'?{kind:'detail',savedJobId:route.savedJobId}:route.kind==='workspace_applications'?{kind:'list'}:{kind:'today'}} onOpenList={()=>setPage(applicationsRoute())} onOpenDetail={id=>setPage(applicationRoute(id))} onOpenToday={()=>setPage(todayRoute())} onDiscover={()=>setPage('jobs')} onPrepare={id=>setPage(matchRoute(id))} onSignIn={openAccount} onViewPro={viewPro}/></Suspense></main>:page==='home'?<HomePage onFindJobs={()=>{trackProductEvent('entry_journey_selected',{surface:'home',user_state:session.user?'authenticated':'anonymous',journey:'find_jobs'});setPage(preferencesRoute());}} onOrganize={()=>{trackProductEvent('entry_journey_selected',{surface:'home',user_state:session.user?'authenticated':'anonymous',journey:'organize'});setPage(applicationsRoute());}} onBuild={()=>resume.name||resume.headline||resume.summary?openBuilder():begin('build_first')} onUpload={selectImportJourney} onJobs={selectJobJourney} onCompare={selectCompareJourney} onPro={viewPro} onTemplate={template=>{selectTemplate(template);begin();}}/>:<main id="main-content" className={`builder ${previewMode?'is-previewing':'is-editing'}`}><aside className="builder-sidebar"><button className="back-link" onClick={returnHome}><ArrowLeft size={15}/>Back to home</button><h2>Your resume</h2><p className="muted">{activeJobVersion?'Edit this job-specific resume.':'Build your master resume.'}</p><div className="progress-track"><span style={{width:`${completion*20}%`}}/></div><small>{completion} of 5 essentials added</small><nav aria-label="Resume sections"><button className={tab==='personal'?'active':''} onClick={()=>goTo('personal')}><UserRound size={18}/>Personal details</button><button className={tab==='profile'?'active':''} onClick={()=>goTo('profile')}><FileText size={18}/>Profile & skills</button>{resume.sections.map(section=><button className={tab===section.id?'active':''} key={section.id} onClick={()=>goTo(section.id)}><GripVertical size={18}/>{section.title || 'Untitled section'}</button>)}<button disabled={resume.sections.length>=30} title={resume.sections.length>=30?'Maximum of 30 sections reached':undefined} onClick={()=>{if(!enforcePersonal()||!enforceSectionsBefore(tabOrder.indexOf('design')))return;const id=crypto.randomUUID();update({sections:[...resume.sections,{id,title:'Additional experience',entries:[entry()]}]});setTab(id);setPreviewMode(false);}}><Plus size={18}/>Add a section</button><button className={tab==='design'?'active':''} onClick={()=>goTo('design')}><LayoutTemplate size={18}/>Design & format</button></nav><div className="sidebar-tip"><ShieldCheck size={19}/><strong>{activeStorageScope}</strong><p>{activeJobVersion?'This version saves to your account. Your master stays separate.':cloud.linked?'Your resume saves to your account. Review it before downloading.':session.user?'Your draft is kept in this browser. Review and confirm it before downloading.':authConfigured?'This draft stays in your browser session. Sign in when you are ready to download.':'This draft stays in your browser session.'}</p></div><div className="sidebar-tools"><button className="back-link sidebar-upload" onClick={()=>file.current?.click()}><Upload size={15}/>Upload</button><button className="back-link sidebar-sample" onClick={()=>setSampleOpen(true)}><FileText size={15}/>View sample resume</button><button className="back-link sidebar-jobs" onClick={()=>setPage('jobs')}><Search size={15}/>Find jobs</button></div></aside>
 <section className="editor-panel" hidden={previewMode}><div className="editor-heading"><h1>{tab==='personal'?'Personal details':tab==='profile'?'Profile and skills':tab==='design'?'Choose your design and format':selectedSection?.title || 'Your experience'}</h1><p>{tab==='personal'?'Add your name, professional title, and at least one contact method. Other fields are optional.':tab==='profile'?'Summarize your experience and list skills you can discuss confidently.':tab==='design'?null:selectedSectionHelper}</p></div>
 {tab==='personal'&&<><div className="field-grid">{field('Full name','name','e.g. Alex Morgan')}{field('Professional title','headline','Your role or the opportunity you want')}{field('Email','email','you@example.com')}{field('Phone','phone','Include your country code')}{field('Location','location','City, region, or country')}{field('Website or professional profile','website','Portfolio, LinkedIn, or personal website')}</div><div className="helper-box"><Globe2 size={20}/><div><strong>Use your local format</strong><p>Use your preferred name, script, and local contact format. Do not add a street address. Include at least one of email, phone, or website.</p></div></div></>}
 {tab==='profile'&&<div className="field-grid">{field('Professional profile','summary','Introduce your experience, strengths, and the contribution you want to make.',true)}<p className="field-hint">New to work? Include coursework, volunteering, personal projects, or transferable skills.</p>{field('Skills & languages','skills','e.g. Project coordination, Customer service, Excel, English (fluent)',true)}<label className="field">Profile section heading<input name="profile-heading" autoComplete="off" maxLength={200} value={resume.profileHeading} placeholder="Profile" onChange={event=>update({profileHeading:event.target.value})}/></label><label className="field">Skills section heading<input name="skills-heading" autoComplete="off" maxLength={200} value={resume.skillsHeading} placeholder="Skills & languages" onChange={event=>update({skillsHeading:event.target.value})}/></label><div className="helper-box"><ShieldCheck size={20} aria-hidden="true"/><div><strong>Specific is stronger than impressive.</strong><p>Use real examples and include only skills you can discuss confidently.</p></div></div></div>}
 {selectedSection&&<><label className="field">Section title<input name="section-title" autoComplete="off" maxLength={50000} value={selectedSection.title} onChange={event=>update({sections:resume.sections.map(section=>section.id===tab?{...section,title:event.target.value}:section)})}/></label><div className="section-actions"><button className="text-button" disabled={resume.sections[0]?.id===tab} onClick={()=>{const sections=[...resume.sections];const i=sections.findIndex(s=>s.id===tab);[sections[i-1],sections[i]]=[sections[i],sections[i-1]];update({sections});}}>↑ Move section up</button><button className="text-button danger" onClick={()=>{if(window.confirm('Delete this section and its entries?')){update({sections:resume.sections.filter(section=>section.id!==tab)});setTab('personal');}}}><Trash2 size={14}/>Delete section</button></div>{isExperienceSection(selectedSection)&&<div className="field checkbox-field"><label><input type="checkbox" data-field="no-experience" aria-describedby={errors['no-experience']?'no-experience-error':undefined} checked={resume.noExperience} onChange={event=>{if(errors['no-experience'])setErrors(current=>{const next={...current};delete next['no-experience'];return next;});update({noExperience:event.target.checked});}}/>I don’t have work experience yet</label>{errors['no-experience']&&<span id="no-experience-error" className="field-error" role="alert">{errors['no-experience']}</span>}</div>}{selectedSection.entries.map((item,i)=><div className="entry-form" key={item.id}><div className="entry-form-heading">{selectedSection.entries.length>1&&<strong>Entry {i+1}</strong>}<button className="icon-button" aria-label={`Remove entry ${i+1}`} onClick={()=>{if(window.confirm('Remove this entry?'))update({sections:resume.sections.map(section=>section.id===tab?{...section,entries:section.entries.filter(e=>e.id!==item.id)}:section)});}}><Trash2 size={16}/></button></div><div className="field-grid">{(['title','organization','location','dates','description'] as const).map(key=>{const errKey=key==='title'?`entry-${item.id}-title`:'';const err=errKey?errors[errKey]:undefined;const fieldId=`entry-${item.id}-${key}`;const label=({title:'Role, qualification, or project',organization:'Organization or institution',location:'Location (optional)',dates:'Dates (your preferred format)',description:'Details (one point per line)'})[key];return <div className={`field ${key==='description'?'full':''}`} key={key}><label htmlFor={fieldId}>{label}</label>{key==='description'?<textarea id={fieldId} name={fieldId} autoComplete="off" dir="auto" rows={5} maxLength={50000} value={item[key]} onChange={event=>update({sections:resume.sections.map(section=>section.id===tab?{...section,entries:section.entries.map(e=>e.id===item.id?{...e,[key]:event.target.value}:e)}:section)})}/>:<input id={fieldId} name={fieldId} autoComplete="off" data-field={errKey||undefined} aria-invalid={!!err} aria-describedby={err?`${errKey}-error`:undefined} dir="auto" maxLength={50000} value={item[key]} onChange={event=>{if(errKey&&errors[errKey])setErrors(current=>{const next={...current};delete next[errKey];return next;});update({sections:resume.sections.map(section=>section.id===tab?{...section,entries:section.entries.map(e=>e.id===item.id?{...e,[key]:event.target.value}:e)}:section)});}}/>}{err&&<span id={`${errKey}-error`} className="field-error" role="alert">{err}</span>}</div>;})}</div></div>)}<button className="button outline" disabled={selectedSection.entries.length>=100} title={selectedSection.entries.length>=100?'Maximum of 100 entries per section reached':undefined} onClick={()=>update({sections:resume.sections.map(section=>section.id===tab?{...section,entries:[...section.entries,entry()]}:section)})}><Plus size={16}/>Add an entry</button></>}
 {tab==='design'&&<div className="design-options"><label className="field">Template<select name="template" value={resume.template} onChange={e=>update({template:e.target.value as Resume['template']})}>{templates.map(t=><option key={t.id} value={t.id}>{templateOptionLabel(t)}</option>)}</select></label><p className="field-hint">7 Free · 20 Premium · Preview any design before unlocking</p><label className="field">Paper size<select name="paper" value={resume.paper} onChange={e=>update({paper:e.target.value as Resume['paper']})}><option>A4</option><option>Letter</option></select></label><label className="field">Accent color<input name="accent" type="color" value={resume.accent} onChange={e=>update({accent:e.target.value})}/></label><label className="field">Writing direction<select name="direction" value={resume.direction} onChange={e=>update({direction:e.target.value as Resume['direction']})}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label><label className="field">Resume language code<input name="resume-language" autoComplete="off" aria-describedby={languageInput!==''&&!languagePattern.test(languageInput)?'language-error':undefined} maxLength={35} value={languageInput} placeholder="en" aria-invalid={languageInput!==''&&!languagePattern.test(languageInput)} onChange={e=>{const next=e.target.value.replace(/[^A-Za-z0-9-]/g,'').slice(0,35);setLanguageInput(next);if(languagePattern.test(next))update({language:next});}}/>{languageInput!==''&&!languagePattern.test(languageInput)&&<span id="language-error" className="field-error" role="alert">Not saved yet — enter a valid code like en, fr, ar, or ne (2–3 letters, optional region).</span>}</label><p className="field-hint">Write your resume in any language and edit all section headings. The language code—for example, en, fr, ar, or ne—helps screen readers and printing; it does not translate the English interface.</p><p className="field-hint">Resume content: {contentLength(resume).toLocaleString()} of {maxContentChars.toLocaleString()} characters used.</p><button className="text-button danger" onClick={()=>{if(window.confirm('Clear this resume and start again? This cannot be undone.')){update(blank());setConfirmed(false);setTab('personal');setErrors({});}}}><RotateCcw size={16}/>Start a blank resume</button></div>}
 <div className="wizard-actions">{tab==='design'&&<span className="field-hint">Review your resume, then confirm.</span>}<button className="button next-button" aria-label={tab==='design'?'Confirm':'Next'} onClick={tab==='design'?(confirmed?requestDownload:confirmResume):nextStep}>{tab==='design'?'Confirm':tab==='personal'?'Next: profile & skills':'Next section'}{tab==='design'?<Check size={17}/>:<ArrowRight size={17}/>}</button></div>
 </section><section className="preview-panel" aria-label="Resume preview">
  <div className="preview-toolbar"><span><span className="live-dot"/>{jobContext?'Tailored resume':'Master resume'}</span><TemplatePicker resume={resume} accessState={templateAccessState} onSelect={template=>update({template})} onUnlock={setUnlockTemplate} onViewPro={()=>setPage('pro')}/><span>{resume.paper}</span></div>
  {selectedTemplateLocked&&<section className="premium-preview-state" aria-label="Premium template preview"><Lock size={18} aria-hidden="true"/><div><strong>Previewing {selectedTemplate.label} — Premium</strong><span>Preview for free. Pro includes this design and all 27 templates.</span></div><div><button className="button" onClick={()=>setUnlockTemplate(resume.template as PremiumTemplateId)}>Use with Pro</button><button className="button outline" onClick={()=>setPage('pro')}>Review Pro — all 27 templates</button></div></section>}
  <div className="paper-container"><PaginatedResumePreview resume={resume}/></div>{tab==='design'&&<p className="preview-caption"><ShieldCheck size={14}/>Pages use the same resume layout and paper proportions as your download.</p>}
  {((confirmed&&complete)||import.meta.env.VITE_PAID_FEATURES_UI_ENABLED==='true')&&<div ref={downloads} className="paid-tools">{confirmed&&complete&&(selectedTemplateLocked?<section className="locked-download-panel"><Lock size={20} aria-hidden="true"/><div><h2>Use this design with Pro</h2><p>{selectedTemplate.label} is available to preview. Pro includes PDF and DOCX downloads with all 27 templates.</p></div><button className="button" onClick={()=>setUnlockTemplate(resume.template as PremiumTemplateId)}>Use with Pro</button><button className="button outline" onClick={()=>setPage('pro')}>Review Pro — all 27 templates</button></section>:<Suspense fallback={null}><GeneratedDocumentControls key={`documents-${session.user?.id??'guest'}-${activeJobVersion?.id??'master'}`} resume={resume} ownerId={session.user?.id??null} documentScope={activeJobVersion?'job_specific':jobContext?'job_draft':'master'} jobResumeVersionId={activeJobVersion?.id} onSignIn={openAccount} onViewPro={()=>setPage('pro')}/></Suspense>)} {import.meta.env.VITE_PAID_FEATURES_UI_ENABLED==='true'&&activeJobVersion&&<Suspense fallback={null}><TailoringPanel key={`ai-${session.user?.id??'guest'}-${activeJobVersion?.id??'master'}`} resume={resume} ownerId={session.user?.id??null} onSignIn={openAccount} onViewPro={()=>setPage('pro')} versionId={activeJobVersion?.id} savedJobId={activeJobVersion?.savedJobId} jobDescriptionAvailable={Boolean(activeJobVersion?.jobSnapshot.descriptionText?.trim())} jobText={activeJobVersion?.jobSnapshot.descriptionText??''} onDownload={requestDownload} provenance={jobProvenance} onAcceptedResume={activeJobVersion?(next,provenance)=>{setResume(next);setJobProvenance(provenance);setDirty(true);setConfirmed(false);}:undefined}/></Suspense>}</div>}
 </section><button className="builder-view-toggle button" aria-pressed={previewMode} onClick={()=>{setPreviewMode(current=>!current);window.scrollTo(0,0);}}>{previewMode?<ArrowLeft size={16} aria-hidden="true"/>:<FileText size={16} aria-hidden="true"/>}{previewMode?'Back to editing':'Preview resume'}</button></main>}
 {sampleOpen&&<Modal className="sample-modal" labelledBy="sample-resume-title" onClose={()=>setSampleOpen(false)}><header><div><h2 id="sample-resume-title">Sample resume</h2><p>A fictional example to help you understand what to include. Your resume stays unchanged.</p></div><button className="icon-button" aria-label="Close sample resume" onClick={()=>setSampleOpen(false)}><X size={20}/></button></header><div className="sample-preview"><PaginatedResumePreview resume={sampleResume}/></div></Modal>}
 {unlockTemplate&&<PremiumTemplateUnlockModal key={unlockTemplate} templateId={unlockTemplate} ownerId={session.user?.id??null} access={templateAccess} onClose={()=>setUnlockTemplate(null)} onSignIn={openAccount} onViewPro={()=>setPage('pro')}/>}
 </>;
}
function NotFound(){
 useEffect(()=>{document.title='Page not found | APWICO';document.querySelector('meta[name="robots"]')?.setAttribute('content',noindex);document.querySelectorAll('link[rel="canonical"],meta[property="og:url"],script[data-seo-schema]').forEach(node=>node.remove());},[]);
 return <main id="main-content" className="not-found"><h1>Page not found</h1><p>We couldn’t find that page.</p><a href="/">APWICO home</a></main>;
}
const entryRoute=parseAppRoute(window.location);
applyInterfaceLocale();
createRoot(document.getElementById('root')!).render(<React.StrictMode>{entryRoute.kind==='not_found'?<NotFound/>:<App/>}<Analytics debug={false} beforeSend={safeAnalyticsEvent}/><SpeedInsights debug={false} beforeSend={safeSpeedInsight}/></React.StrictMode>);
