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
const productionOrigin = 'https://resumestride.com';
export const isJobCapturePayload = isJobCapture;

// Registers the (single) listener for incoming job captures. Returns an unsubscribe function.
// Rejections are silent by design for anything that isn't our own message type at all (many
// things postMessage on a page for unrelated reasons); a message that DOES claim our type but
// fails validation records only a local category; untrusted page text is never recorded.
export function listenForJobImport(onCapture: (payload: JobCapturePayload) => void): () => void {
  const isDevLocal = import.meta.env.DEV && window.location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(window.location.hostname) && ['5173','5174','5181','5183','5185'].includes(window.location.port);
  const isProduction = window.location.origin === productionOrigin;
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
