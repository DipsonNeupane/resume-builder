import { useCallback, useEffect, useRef, useState } from 'react';
import { STAGE_LABELS, type ApplicationInput, type ApplicationPatch, type ApplicationRecord } from '../../lib/applications';
import { ApplicationRequestError, createApplication, loadApplications, updateApplication, type ApplicationsSnapshot } from '../../services/applicationsApi';
import { trackProductEvent } from '../../services/analytics';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving'; savedJobId: string }
  | { kind: 'saved'; savedJobId: string; message: string; undo?: ApplicationPatch }
  | { kind: 'failed'; savedJobId: string; message: string; retry: ApplicationPatch; conflict: boolean };

/** Loads one owner's applications and applies updates with optimistic-revision checks.
 * A failed save keeps the user's change available to retry; nothing is applied locally
 * until the server confirms it, so the list never shows an unsaved stage as saved. */
export function useApplications(ownerId: string | null) {
  const [snapshot, setSnapshot] = useState<ApplicationsSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(ownerId));
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [reloadToken, setReloadToken] = useState(0);
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;

  const loadedOwner = useRef<string | null>(null);
  useEffect(() => {
    // Clear everything only when the account changes; a same-owner reload keeps the
    // current view (and any open import result) until fresh data arrives.
    if (loadedOwner.current !== ownerId) { setSnapshot(null); setStatus({ kind: 'idle' }); loadedOwner.current = ownerId; }
    setLoadError(null);
    if (!ownerId) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    loadApplications(ownerId, controller.signal).then(next => {
      if (ownerRef.current === ownerId) setSnapshot(next);
    }).catch(error => {
      if (controller.signal.aborted || ownerRef.current !== ownerId) return;
      setLoadError(error instanceof Error ? error.message : 'Applications are temporarily unavailable.');
    }).finally(() => { if (!controller.signal.aborted && ownerRef.current === ownerId) setLoading(false); });
    return () => controller.abort();
  }, [ownerId, reloadToken]);

  const reload = useCallback(() => setReloadToken(value => value + 1), []);

  const replace = (next: ApplicationRecord) => setSnapshot(current => current && {
    ...current, applications: current.applications.some(item => item.savedJobId === next.savedJobId)
      ? current.applications.map(item => item.savedJobId === next.savedJobId ? next : item) : [next, ...current.applications],
  });

  const update = useCallback(async (savedJobId: string, patch: ApplicationPatch, options: { undoable?: boolean; isUndo?: boolean } = {}) => {
    const owner = ownerRef.current;
    const current = snapshot?.applications.find(item => item.savedJobId === savedJobId);
    if (!owner || !current) return false;
    setStatus({ kind: 'saving', savedJobId });
    try {
      const next = await updateApplication(owner, savedJobId, current.revision, patch);
      if (ownerRef.current !== owner) return false;
      replace(next);
      const stageChanged = patch.stage !== undefined && patch.stage !== current.stage;
      const undo: ApplicationPatch | undefined = options.undoable !== false && stageChanged && !options.isUndo
        ? { stage: current.stage, closedReason: current.closedReason, appliedOn: current.appliedOn } : undefined;
      setStatus({ kind: 'saved', savedJobId, undo, message: options.isUndo ? `Restored to ${STAGE_LABELS[next.stage]}.` : stageChanged ? `Moved to ${STAGE_LABELS[next.stage]}.` : 'Saved.' });
      if (stageChanged) trackProductEvent('application_stage_changed', { surface: 'applications', user_state: 'authenticated', plan: snapshot?.isPro ? 'Pro' : 'Free', application_status: next.stage });
      return true;
    } catch (error) {
      if (ownerRef.current !== owner) return false;
      const conflict = error instanceof ApplicationRequestError && error.status === 409;
      setStatus({ kind: 'failed', savedJobId, retry: patch, conflict, message: error instanceof Error ? error.message : 'Not saved. Try again.' });
      return false;
    }
  }, [snapshot]);

  const create = useCallback(async (input: Partial<ApplicationInput>) => {
    const owner = ownerRef.current;
    if (!owner) throw new ApplicationRequestError('Please sign in again and retry.', 401);
    const result = await createApplication(owner, input);
    if (ownerRef.current !== owner) return result;
    if (!result.alreadySaved) trackProductEvent('application_added', { surface: 'applications', user_state: 'authenticated', plan: snapshot?.isPro ? 'Pro' : 'Free', job_source: input.sourceUrl ? 'pasted' : 'manual' });
    reload();
    return result;
  }, [reload, snapshot?.isPro]);

  const dismissStatus = useCallback(() => setStatus({ kind: 'idle' }), []);
  return { snapshot, loading, loadError, status, reload, update, create, dismissStatus };
}
