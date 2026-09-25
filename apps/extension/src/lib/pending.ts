import { isJobCapture, type JobCapture } from './capture.js';
const key = 'pendingCapture';
const ttl = 30 * 60 * 1000;
export async function readPending(): Promise<JobCapture | null> {
  const entry = (await chrome.storage.session.get(key))[key] as { payload?: unknown; expiresAt?: number } | undefined;
  if (!entry || typeof entry.expiresAt !== 'number' || entry.expiresAt < Date.now() || entry.expiresAt > Date.now() + ttl || !isJobCapture(entry.payload)) {
    await chrome.storage.session.remove(key); return null;
  }
  return entry.payload;
}
export async function keepPending(payload: JobCapture): Promise<void> {
  if (!isJobCapture(payload)) throw new Error('Invalid capture');
  await chrome.storage.session.set({ [key]: { payload, expiresAt: Date.now() + ttl } });
  await chrome.alarms.create('expire-capture', { delayInMinutes: 30 });
}
function canonical(value: unknown): string {
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
export async function clearPending(expected?: JobCapture): Promise<void> {
  // Chrome storage may return dictionary keys in a different order. Compare values,
  // and do not erase a newer user-edited capture when an older send completes.
  if (expected && canonical(await readPending()) !== canonical(expected)) return;
  await chrome.storage.session.remove(key);
}
