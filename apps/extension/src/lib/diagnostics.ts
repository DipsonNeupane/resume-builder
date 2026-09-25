// Worker-local diagnostics only. No capture, URL, delivery ID, browser tab ID or
// exception can be passed to this boundary. No storage or external transport.
export function recordBridgeDelivery(received: boolean, durationMs: number): void {
 try {
  console.info(JSON.stringify({
   schema: 1, event: 'bridge_delivery_completed', feature: 'extension',
   category: received === true ? 'ok' : 'bridge_failed',
   durationMs: Number.isFinite(durationMs) ? Math.min(60_000, Math.max(0, Math.round(durationMs))) : 0,
  }));
 } catch { /* Logging must not interfere with acknowledgment or capture cleanup. */ }
}
