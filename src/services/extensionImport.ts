import { recordBrowserDiagnostic } from './diagnostics';
// Untrusted text receiver, active only on local dev servers and the exact production origin.
// Isolated extension delivery waits for acknowledgment. Same-origin messages are not proof of
// extension identity; no account privileges are exposed.
import { isJobCapture } from '../../apps/extension/src/lib/capture';
export type { JobCapture as JobCapturePayload } from '../../apps/extension/src/lib/capture';
import type { JobCapture as JobCapturePayload } from '../../apps/extension/src/lib/capture';

export const jobImportMessageType = 'resumestride:job-import' as const;
// The exact production origin the extension is allowed to deliver into (apps/extension/src/lib/config.ts
// carries the matching constant on the extension side). Hardcoded, not derived from window.location,
// so this boundary can't be widened by a misconfigured deployment.
const productionOrigin = 'https://apwico.com';
const legacyProductionOrigin = 'https://resumestride.com';
export const isJobCapturePayload = isJobCapture;
const pendingCaptureKey = 'apwico:extension-import:v1';
const pendingCaptureTtlMs = 30 * 60 * 1000;
type StoredCapture = {payload: JobCapturePayload; ownerId: string|null; expiresAt: number};
export function storePendingJobImport(storage: Storage, payload: JobCapturePayload, ownerId: string|null): void {
  if(!isJobCapturePayload(payload))throw new Error('Invalid capture');
  storage.setItem(pendingCaptureKey,JSON.stringify({payload,ownerId,expiresAt:Date.now()+pendingCaptureTtlMs} satisfies StoredCapture));
}
export function loadPendingJobImport(storage: Storage, ownerId: string|null): JobCapturePayload|null {
  const raw=storage.getItem(pendingCaptureKey);if(!raw)return null;
  try {
    const value=JSON.parse(raw) as StoredCapture;
    if(!value||!isJobCapturePayload(value.payload)||typeof value.expiresAt!=='number'||value.expiresAt<Date.now()||value.expiresAt>Date.now()+pendingCaptureTtlMs){storage.removeItem(pendingCaptureKey);return null;}
    if(value.ownerId&&value.ownerId!==ownerId){storage.removeItem(pendingCaptureKey);return null;}
    if(!value.ownerId&&ownerId)storePendingJobImport(storage,value.payload,ownerId);
    return value.payload;
  } catch {storage.removeItem(pendingCaptureKey);return null;}
}
export function clearPendingJobImport(storage: Storage): void {storage.removeItem(pendingCaptureKey);}

// Registers the (single) listener for incoming job captures. Returns an unsubscribe function.
// Rejections are silent by design for anything that isn't our own message type at all (many
// things postMessage on a page for unrelated reasons); a message that DOES claim our type but
// fails validation records only a local category; untrusted page text is never recorded.
export function listenForJobImport(onCapture: (payload: JobCapturePayload) => void): () => void {
  // Local review builds use the same exact loopback origins as development. This does not
  // widen the production boundary: a deployed APWICO page can never have a loopback origin.
  const isDevLocal = window.location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(window.location.hostname) && ['5173','5174','5181','5183','5185'].includes(window.location.port);
  const isProduction = [productionOrigin, legacyProductionOrigin].includes(window.location.origin);
  if (!isDevLocal && !isProduction) return () => {};
  const delivered = new Set<string>();
  const handler = (event: MessageEvent) => {
    // Same-window only: rejects anything relayed from a different frame/origin (e.g. an
    // embedded iframe), since the extension's bridge always posts into the top window it is
    // itself running in, with an explicit target origin, never '*'.
    // Same-origin page scripts can also post here: this is NOT extension authentication.
    // This local-only boundary offers untrusted text for review, never account privileges.
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (typeof data !== 'object' || data === null) return;
    const message = data as Record<string, unknown>;
    if (message.type !== jobImportMessageType) return;
    if (!isJobCapturePayload(message.payload)) {
      recordBrowserDiagnostic('extension', 'bridge_receive', 'bridge_rejected');
      return;
    }
    const deliveryId=message.deliveryId;
    if(deliveryId !== undefined && (typeof deliveryId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(deliveryId))) { recordBrowserDiagnostic('extension','bridge_receive','bridge_rejected'); return; }
    if(typeof deliveryId==='string') {
      if(!delivered.has(deliveryId)) {
        if(delivered.size>=100) { recordBrowserDiagnostic('extension','bridge_receive','rate_limit'); return; }
        onCapture(message.payload);
        recordBrowserDiagnostic('extension', 'bridge_receive', 'ok');
        delivered.add(deliveryId);
      }
      window.postMessage({type:'resumestride:job-import-ack',deliveryId},window.location.origin);
    } else { onCapture(message.payload); recordBrowserDiagnostic('extension', 'bridge_receive', 'ok'); }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
