import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { contentLength, type Resume } from '../model';
import { createCloudResume, loadCloudResume, saveCloudResume, ResumeConflictError, type CloudResume } from '../services/resumes';

// Wrapping the server row in an object (rather than using `CloudResume | null`
// directly) makes a real "the server resume is gone" conflict distinguishable
// from "there is no conflict at all" — both of which would otherwise collapse
// to the same `null` value and silently hide a real, recoverable conflict.
export type CloudConflict = { server: CloudResume | null };

export type CloudResumeApi = {
 saveBlocked: boolean;
 retryAfterStorageReview: () => void;
 linked: boolean;
 loading: boolean;
 consentPending: boolean;
 conflict: CloudConflict | null;
 statusText: string | null;
 acceptConsent: () => void;
 declineConsent: () => void;
 useServerVersion: () => void;
 keepMyEdits: () => void;
 // Mirrors VITE_CLOUD_STORAGE_ENABLED so callers (AuthPanel's copy, tests)
 // can tell "cloud save is off" apart from "cloud save is on but idle"
 // without re-reading import.meta.env themselves.
 cloudStorageEnabled: boolean;
};

// Default OFF: this app ships an auth-only launch mode (sign-in gates
// printing/downloading so the owner can see registered users) that is
// deliberately decoupled from cloud resume storage. Flipping this on is a
// separate, explicit decision — being signed in must never by itself cause a
// read/write against the resumes table.
const cloudStorageEnabled = import.meta.env.VITE_CLOUD_STORAGE_ENABLED === 'true';

// Keeps the account's cloud resume in sync with the editor while preserving
// invariants the local-only builder never had to think about:
// 1. The local (guest) draft in sessionStorage is never overwritten by account
//    data — while `linked` or `loading` is true, the caller must stop writing
//    to its own local storage key, so signing out (or switching accounts)
//    hands the original guest draft back untouched. `loadingCloud` is always
//    reset back to false on sign-out/switch too, even if the previous
//    account's own load is still in flight, since it never gets to clear
//    that itself (its result is dropped by the epoch check in invariant 4).
// 2. A save is only ever accepted against the revision this client last saw;
//    a stale write surfaces as `conflict` for the user to resolve explicitly,
//    never a silent overwrite of someone/something else's newer save. A
//    conflict where the server row is simply gone is still a `conflict`, not
//    treated the same as "no conflict" — and the same conflict path is used
//    when the initial cloud check resolves after the user has already typed
//    a guest edit it didn't know about, instead of silently discarding it.
// 3. Every write path (autosave, `acceptConsent`, `keepMyEdits`) is
//    serialized behind the single `savingRef` guard, so a duplicate click —
//    even two dispatched in the same tick — or an in-flight save can't start
//    a second overlapping request; each only clears `dirty` if nothing has
//    been edited since it started sending.
// 4. Every async operation (load/save/create) is stamped with the account
//    "epoch" active when it started; if the signed-in account changes before
//    it resolves, its result is dropped instead of being applied to state
//    that now belongs to a different account (or to no account at all).
// 5. A run of consecutive network-error save failures (not a revision
//    conflict) backs off exponentially instead of retrying every 350ms, and
//    `statusText` says so truthfully instead of claiming an active save.
export function useCloudResume(
 signedInUser: User | null,
 resume: Resume,
 dirty: boolean,
 setResume: (resume: Resume) => void,
 setDirty: (dirty: boolean) => void,
 restoreGuestDraft: () => Resume,
 notify: (message: string) => void,
 paused = false,
): CloudResumeApi {
 // Every reference to `user` below is intentionally this gated value, not
 // the raw session — when cloud storage is off, `user` is always null here
 // regardless of sign-in state, so every effect below (load/save/create/
 // consent) short-circuits on its existing `!user` checks and never issues a
 // resumes-table request or a consent prompt just because someone signed in.
 const user = cloudStorageEnabled ? signedInUser : null;
 const [linked, setLinked] = useState(false);
 const [loadingCloud, setLoadingCloud] = useState(false);
 const [savingCloud, setSavingCloud] = useState(false);
 const [revision, setRevision] = useState<number | null>(null);
 const [consentPending, setConsentPending] = useState(false);
 const [consentDeclined, setConsentDeclined] = useState(false);
 const [loadFailed, setLoadFailed] = useState(false);
 const [conflict, setConflict] = useState<CloudConflict | null>(null);
 // True once the most recent autosave attempt failed for a reason other than
 // a revision conflict (network error) — lets `statusText` say so truthfully
 // instead of claiming an active save while quietly retrying.
 const [saveError, setSaveError] = useState(false);
 const [saveBlocked,setSaveBlocked] = useState(false);
 const handleStorageCap=(error:unknown):boolean=>{
  if(typeof error !== 'object' || !error) return false;
  const value=error as {code?:unknown;message?:unknown};
  if(value.code!=='P0001' || typeof value.message!=='string' || !/^Account save-history (?:storage )?limit reached/.test(value.message)) return false;
  setSaveBlocked(true);
  notify('Account storage limit reached. Your latest edits are not saved to your account. Keep this tab open and contact support@resumestride.com before leaving this page.');
  return true;
 };
 const resumeRef = useRef(resume);
 resumeRef.current = resume;
 // The actual serialization guard for every write path (`savingCloud` above
 // is only its UI-facing mirror). A ref, not state, because two clicks
 // dispatched in the same synchronous tick (a real double-click, or a test
 // firing both before React has re-rendered) would otherwise both close over
 // the same pre-click `savingCloud` value and both pass the check — state
 // updates only take effect on the next render, but a ref mutates immediately.
 const savingRef = useRef(false);
 const previousUserId = useRef<string | null>(null);
 const previousPaused = useRef(false);
 // Bumped once per sign-in/out/switch. Any async callback started under an
 // earlier epoch checks this before touching state, so a slow response from
 // an account the user has since left can never land on the next one.
 const sessionEpoch = useRef(0);
 // Consecutive non-conflict save failures; backs off the retry delay
 // exponentially instead of retrying every 350ms against a dead network.
 const saveFailureCount = useRef(0);

 // Reset/reload whenever the signed-in account changes (sign-in, sign-out, or
 // switching accounts in the same tab), or cloud synchronization resumes after
 // a job-draft pause. This is deliberately independent of resume keystrokes.
 useEffect(() => {
  const epoch = ++sessionEpoch.current;
  const previous = previousUserId.current;
  const current = user?.id ?? null;
  const identityChanged = previous !== current;
  const resumed = previousPaused.current && !paused;
  previousUserId.current = current;
  previousPaused.current = paused;
  setLoadingCloud(false); setConsentPending(false); setSavingCloud(false);
  savingRef.current = false;
  saveFailureCount.current = 0;
  // A job draft pauses cloud work but does not change account identity. Most
  // importantly, it must not run the sign-out/account-switch base restore
  // below and overwrite the separately restored job draft. Incrementing the
  // epoch above also makes any load/save started just before the pause inert.
  if (paused) return;
  if (!identityChanged && !resumed) return;
  setLinked(false); setConflict(null); setRevision(null); setLoadFailed(false); setSaveError(false); setSaveBlocked(false);
  if (identityChanged) setConsentDeclined(false);
  // What `resume` will actually hold once this effect's own synchronous work
  // below is done — NOT necessarily `resumeRef.current` as-is, since that
  // still reflects the render *before* this effect ran. On an account
  // switch, the `setResume(restoreGuestDraft())` a few lines down is itself
  // queued, async React state; comparing against the stale pre-switch
  // `resumeRef.current` once the load resolves would misread that
  // deliberate restore as a user edit made during loading, wrongly treating
  // a completely ordinary account switch as an edit-conflict.
  let startingResume = resumeRef.current;
  if (previous && previous !== current) {
   // Logging out, or switching to a different account in the same tab:
   // `resume` may currently hold the PREVIOUS account's cloud data (if it was
   // linked) or edits made against it — never the true on-disk guest draft.
   // Restore that draft now, before this account's own load even starts, so
   // neither the old account's data nor an in-flight edit against it can leak
   // into the next account's session, and so local autosave (paused only
   // while `linked`/`loading`) never has stale account data sitting in
   // `resume` to write once it resumes.
   startingResume = restoreGuestDraft();
   setResume(startingResume); setDirty(false);
  }
  if (!current) return;
  setLoadingCloud(true);
  const resumeAtLoadStart = startingResume;
  loadCloudResume(current).then(existing => {
   if (sessionEpoch.current !== epoch) return; // superseded by a later sign-in/out/switch
   setLoadingCloud(false);
   if (existing) {
    if (resumeRef.current !== resumeAtLoadStart) {
     // The user kept typing in the guest draft while this check was in
     // flight. Applying the account's resume now would silently discard
     // those edits, so surface it as an explicit conflict instead — the same
     // "use the other version" / "keep my edits" choice already used for a
     // stale save, rather than a second, riskier overwrite path.
     setLinked(true); setConflict({ server: existing });
     notify('Your account resume finished loading while you were editing. Choose which version to keep.');
    } else {
     setLinked(true); setRevision(existing.revision);
     setResume(existing.resume); setDirty(false);
     notify('Loaded your saved resume from your ResumeStride account. Your local draft on this device is unchanged and returns if you sign out.');
    }
   }
  }).catch(() => {
   if (sessionEpoch.current !== epoch) return;
   setLoadingCloud(false);
   // Explicitly recorded (not just a transient notice) so the consent offer
   // below cannot fire on the false premise that we confirmed this account
   // has no cloud resume yet — we simply don't know either way.
   setLoadFailed(true);
   notify('Could not check your account for a saved resume. Your local draft is unaffected; try reloading.');
  });
  // Deliberately keyed only on account identity and the explicit pause state:
  // restoreGuestDraft/setResume/setDirty/notify are stable callbacks, and
  // resumeRef.current supplies the live resume when needed.
 }, [user?.id, paused]);

 // Offer to save the local draft once signed in, whenever there's content
 // worth asking about and the account has no cloud resume yet. Re-evaluated
 // as the draft changes so it also covers someone who signs in with a blank
 // draft and starts typing afterward. Never offered while still checking, or
 // once that check has failed — we cannot claim there is nothing to
 // overwrite when we never actually found out. This effect and the reset
 // effect above both run within the same commit whenever `user` changes
 // (React runs a component's effects in declaration order, all against the
 // pre-update render), so this one can still see `loadingCloud`'s stale
 // (pre-reset) value on that first commit — it must actively retract any
 // optimistic `true` via the `loadingCloud || loadFailed` branch below, not
 // just skip setting a new value, or a load that later fails leaves an
 // already-true consent offer stuck with nothing left to clear it.
 useEffect(() => {
  if (paused) { setConsentPending(false); return; }
  if (!user || linked || consentDeclined) return;
  if (loadingCloud || loadFailed) { setConsentPending(false); return; }
  setConsentPending(contentLength(resume) > 0);
 }, [user, loadingCloud, linked, consentDeclined, loadFailed, resume, paused]);

 // Debounced cloud autosave, mirroring the existing local-autosave effect in
 // main.tsx but writing to the account instead of sessionStorage. Serialized by
 // `savingRef`: while a save is in flight this effect returns immediately
 // instead of starting a second overlapping one, even though `resume`
 // changing keeps re-triggering it on every keystroke; once the in-flight
 // save finishes and `savingCloud` flips back to false, it re-evaluates and
 // schedules a fresh debounce for whatever is dirty by then.
 useEffect(() => {
  if (paused || saveBlocked || !user || !linked || !dirty || conflict || revision === null || savingRef.current) return;
  // A failed save (network error, not a revision conflict) leaves `dirty`
  // true and `savingCloud` false, which alone would re-trigger this effect
  // and retry every 350ms forever — a request storm against a network that's
  // already down. `saveFailureCount` backs the delay off exponentially
  // (capped at 30s) instead, and resets on the next success or real
  // conflict, so a normal edit right after a blip still saves promptly.
  const delay = saveFailureCount.current === 0 ? 350 : Math.min(350 * 2 ** saveFailureCount.current, 30000);
  const timer = setTimeout(() => {
   const epoch = sessionEpoch.current;
   const sending = resumeRef.current;
   const sentRevision = revision;
   savingRef.current = true;
   setSavingCloud(true);
   saveCloudResume(user.id, sending, sentRevision).then(saved => {
    if (sessionEpoch.current !== epoch) return; // account changed mid-save; drop the stale result entirely
    saveFailureCount.current = 0;
    setSaveError(false);
    setRevision(saved.revision);
    savingRef.current = false;
    setSavingCloud(false);
    // Only clear `dirty` if nothing has edited `resume` further since this
    // save started: `update()` in main.tsx always replaces `resume` with a
    // new object, so reference equality is a reliable "no newer edit landed"
    // check. If something did land, `dirty` stays true and this effect
    // re-runs now that `savingCloud` is false, sending the newest content.
    if (resumeRef.current === sending) setDirty(false);
   }).catch(error => {
    if (sessionEpoch.current !== epoch) return;
    savingRef.current = false;
    setSavingCloud(false);
    if (handleStorageCap(error)) { /* permanent: explicit retry only */ }
    else if (error instanceof ResumeConflictError) { saveFailureCount.current = 0; setSaveError(false); setConflict({ server: error.server }); }
    else {
     saveFailureCount.current += 1;
     setSaveError(true);
     // Only notify once per outage, not on every backed-off retry.
     if (saveFailureCount.current === 1) notify('Could not save to your account. Check your connection; your edits remain in this browser for now.');
    }
   });
  }, delay);
  return () => clearTimeout(timer);
 }, [resume, dirty, linked, conflict, revision, user?.id, savingCloud, saveBlocked, paused]);

 const acceptConsent = () => {
  // Guarded by `savingRef` (checked and set synchronously, not via React
  // state) shared with the autosave effect and `keepMyEdits` below, so a
  // duplicate click — even a second one dispatched in the same tick, before
  // React has re-rendered `savingCloud` — can't fire a second, overlapping
  // create.
  if (paused || saveBlocked || !user || savingRef.current) return;
  const epoch = sessionEpoch.current;
  const sending = resumeRef.current;
  setConsentPending(false);
  savingRef.current = true;
  setSavingCloud(true);
  createCloudResume(user.id, sending).then(saved => {
   if (sessionEpoch.current !== epoch) return;
   savingRef.current = false;
   setSavingCloud(false);
   setLinked(true); setRevision(saved.revision);
   // Only clear `dirty` if nothing was typed while this create was in
   // flight; a newer edit stays dirty and the autosave effect above picks it
   // up as soon as `linked`/`revision` land, instead of being marked clean
   // and silently lost.
   if (resumeRef.current === sending) setDirty(false);
   notify('Saved to your account.');
  }).catch(error => {
   if (sessionEpoch.current !== epoch) return;
   savingRef.current = false;
   setSavingCloud(false);
   if (handleStorageCap(error)) { /* permanent: explicit retry only */ }
    else if (error instanceof ResumeConflictError) { setLinked(true); setConflict({ server: error.server }); }
   else notify('Could not save to your account. Check your connection and try again from the account page.');
  });
 };
 const declineConsent = () => { setConsentPending(false); setConsentDeclined(true); };
 const useServerVersion = () => {
  if (paused || savingRef.current || !conflict || !conflict.server) return; // serialize every conflict choice with in-flight writes
  setResume(conflict.server.resume); setRevision(conflict.server.revision); setDirty(false); setConflict(null);
 };
 const keepMyEdits = () => {
  // Same `savingRef` guard as `acceptConsent`: a duplicate click on "Keep my
  // edits" before the first request settles must not fire a second one.
  if (paused || saveBlocked || !user || !conflict || savingRef.current) return;
  const epoch = sessionEpoch.current;
  const server = conflict.server;
  const sending = resumeRef.current;
  savingRef.current = true;
  setSavingCloud(true);
  if (server) {
   saveCloudResume(user.id, sending, server.revision).then(saved => {
    if (sessionEpoch.current !== epoch) return;
    savingRef.current = false;
    setSavingCloud(false);
    setRevision(saved.revision); setConflict(null);
    if (resumeRef.current === sending) setDirty(false);
   }).catch(error => {
    if (sessionEpoch.current !== epoch) return;
    savingRef.current = false;
    setSavingCloud(false);
    if (handleStorageCap(error)) { /* permanent: explicit retry only */ }
    else if (error instanceof ResumeConflictError) setConflict({ server: error.server });
    else notify('Could not save your version to your account. Check your connection and try again.');
   });
  } else {
   // The account resume is gone (deleted elsewhere, or never actually
   // landed) — there is no revision left to update against, so re-create it
   // fresh from this client's current edits instead of retrying an update
   // that could only ever match zero rows.
   createCloudResume(user.id, sending).then(saved => {
    if (sessionEpoch.current !== epoch) return;
    savingRef.current = false;
    setSavingCloud(false);
    setLinked(true); setRevision(saved.revision); setConflict(null);
    if (resumeRef.current === sending) setDirty(false);
   }).catch(error => {
    if (sessionEpoch.current !== epoch) return;
    savingRef.current = false;
    setSavingCloud(false);
    if (handleStorageCap(error)) { /* permanent: explicit retry only */ }
    else if (error instanceof ResumeConflictError) setConflict({ server: error.server });
    else notify('Could not save your version to your account. Check your connection and try again.');
   });
  }
 };

 const statusText = paused || !user ? null
  : loadingCloud ? 'Checking your account…'
  : saveBlocked ? 'Not saved — account storage limit reached'
  : conflict ? 'Account resume needs attention'
  : linked ? (savingCloud ? 'Saving to your account…' : saveError && dirty ? 'Not saved yet — retrying…' : dirty ? 'Saving to your account…' : 'Saved to your account')
  : null;

 const retryAfterStorageReview=()=>{saveFailureCount.current=0;setSaveBlocked(false);};
 return { saveBlocked, retryAfterStorageReview, linked, loading: loadingCloud, consentPending, conflict, statusText, acceptConsent, declineConsent, useServerVersion, keepMyEdits, cloudStorageEnabled };
}
