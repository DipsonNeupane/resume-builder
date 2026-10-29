import { parseAppRoute, type NavigableRoute } from './routes';

const storageKey = 'resumestride.navigationContinuation.v1';
const lifetimeMs = 30 * 60 * 1000;
type StoredContinuation = { version: 1; ownerId: string | null; path: string; createdAt: number };

function privateDestination(path: string): NavigableRoute | null {
 const route = parseAppRoute(new URL(path, 'https://resumestride.invalid'));
 if (route.kind === 'not_found' || route.kind === 'home' || route.kind === 'workspace_account') return null;
 return route;
}

export function saveContinuation(storage: Pick<Storage, 'setItem'>, destination: NavigableRoute, ownerId: string | null, now = Date.now()): void {
 if (!privateDestination(destination.path)) return;
 const value: StoredContinuation = { version: 1, ownerId, path: destination.path, createdAt: now };
 storage.setItem(storageKey, JSON.stringify(value));
}

export function consumeContinuation(storage: Pick<Storage, 'getItem' | 'removeItem'>, ownerId: string, now = Date.now()): NavigableRoute | null {
 const raw = storage.getItem(storageKey);
 storage.removeItem(storageKey);
 if (!raw) return null;
 try {
  const value = JSON.parse(raw) as Partial<StoredContinuation>;
  if (value.version !== 1 || typeof value.path !== 'string' || typeof value.createdAt !== 'number') return null;
  if (value.ownerId !== null && value.ownerId !== ownerId) return null;
  if (value.createdAt > now || now - value.createdAt > lifetimeMs) return null;
  return privateDestination(value.path);
 } catch { return null; }
}

export function clearContinuation(storage: Pick<Storage, 'removeItem'>): void {
 storage.removeItem(storageKey);
}

export const continuationStorageKey = storageKey;
