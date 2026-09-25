import { boundedDuration, categories, features, operations, statusCategory, type Category, type Feature, type Operation } from './diagnosticSchema';

type BrowserDiagnostic = Readonly<{ feature: Feature; operation: Operation; category: Category; durationMs: number }>;
// Local support/debugging only: bounded memory, no persistence, console output,
// account identifiers, content, network transport, session replay or exception capture.
const recent: BrowserDiagnostic[] = [];
export function recordBrowserDiagnostic(feature: Feature, operation: Operation, category: Category, durationMs = 0): void {
 if (!features.includes(feature) || !operations.includes(operation) || !categories.includes(category)) return;
 recent.push(Object.freeze({ feature, operation, category, durationMs: boundedDuration(durationMs) }));
 if (recent.length > 50) recent.shift();
}
export function readBrowserDiagnostics(): readonly BrowserDiagnostic[] { return recent.slice(); }
export function clearBrowserDiagnostics(): void { recent.length = 0; }
export async function observeBrowserOperation<T>(feature: Feature, operation: Operation, work: () => Promise<T>): Promise<T> {
 const start = performance.now();
 try { const result = await work(); recordBrowserDiagnostic(feature, operation, 'ok', performance.now() - start); return result; }
 catch (error) {
  recordBrowserDiagnostic(feature, operation, error instanceof Error && error.name === 'ResumeConflictError' ? 'database_conflict' : feature === 'cloud' ? 'database_error' : 'unexpected', performance.now() - start);
  throw error;
 }
}
// Supabase auth bypasses the application API. Only fixed feature/status/timing
// reach this local record; URL, credentials and response text are never recorded.
export const diagnosticAuthFetch: typeof fetch = async (input, init) => {
 const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
 if (!path.startsWith('/auth/v1/')) return fetch(input, init);
 const start = performance.now();
 try {
  const response = await fetch(input, init);
  recordBrowserDiagnostic('auth', 'auth_session', statusCategory(response.status), performance.now() - start);
  return response;
 } catch (error) {
  recordBrowserDiagnostic('auth', 'auth_session', 'unavailable', performance.now() - start);
  throw error;
 }
};
