import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeContinuation, continuationStorageKey, saveContinuation } from '../../src/routing/continuation.ts';
import { jobResumeRoute, journeyForRoute, matchRoute, parseAppRoute, routeForJourney, routeForPage, routePage } from '../../src/routing/routes.ts';

const origin = 'https://apwico.com';
const id = '11111111-1111-4111-8111-111111111111';

test('workspace routes are strict, stable and map to the existing screen boundary', () => {
 assert.equal(routePage(parseAppRoute(new URL('/workspace/resume', origin))), 'builder');
 assert.equal(routePage(parseAppRoute(new URL('/workspace/jobs/saved', origin))), 'jobs');
 assert.deepEqual(parseAppRoute(new URL(`/workspace/jobs/${id}/match`, origin)), matchRoute(id));
 assert.deepEqual(parseAppRoute(new URL(`/workspace/resumes/${id}`, origin)), jobResumeRoute(id));
 assert.equal(parseAppRoute(new URL('/workspace/jobs/not-an-id/match', origin)).kind, 'not_found');
 assert.equal(parseAppRoute(new URL('/workspace/unknown', origin)).kind, 'not_found');
 assert.equal(parseAppRoute(new URL('/Workspace/Resume', origin)).kind, 'workspace_resume');
 assert.equal(routeForPage('account').path, '/workspace/account');
});

test('legacy query entries and auth callbacks remain compatible without putting content in URLs', () => {
 assert.equal(parseAppRoute(new URL('/?jobs=1', origin)).kind, 'workspace_jobs');
 assert.equal(parseAppRoute(new URL('/?builder=1', origin)).kind, 'workspace_resume');
 assert.equal(parseAppRoute(new URL('/?pro=1', origin)).kind, 'workspace_pro');
 assert.equal(parseAppRoute(new URL('/?code=secret', origin)).kind, 'workspace_account');
 assert.equal(parseAppRoute(new URL('/#access_token=secret&type=recovery', origin)).kind, 'workspace_account');
 assert.equal(parseAppRoute(new URL('/workspace/resume?code=secret', origin)).kind, 'workspace_account');
});

test('entry journeys have one typed, content-free route and converge on the shared workspaces', () => {
 const expectations = [
  ['import_first', '/start/import', 'builder'],
  ['build_first', '/start/build', 'builder'],
  ['job_first', '/start/job', 'jobs'],
  ['sample', '/start/sample', 'jobs'],
 ] as const;
 for (const [journey, path, page] of expectations) {
  const route = routeForJourney(journey);
  assert.equal(route.path, path);
  assert.equal(journeyForRoute(route), journey);
  assert.equal(routePage(parseAppRoute(new URL(path, origin))), page);
  assert.doesNotMatch(path, /resume|description|jobText|url|@/i);
 }
 assert.equal(journeyForRoute(routeForPage('builder')), null);
});

function memoryStorage() {
 const values = new Map<string, string>();
 return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), values };
}

test('sign-in continuation is bounded, content-free, expiring and owner-scoped', () => {
 const storage = memoryStorage();
 saveContinuation(storage, routeForPage('jobs'), null, 1_000);
 const raw = storage.values.get(continuationStorageKey)!;
 assert.doesNotMatch(raw, /resume|description|jobText|url/i);
 assert.equal(consumeContinuation(storage, 'owner-a', 2_000)?.kind, 'workspace_jobs');
 assert.equal(consumeContinuation(storage, 'owner-a', 2_000), null, 'intent is single-use');

 saveContinuation(storage, routeForPage('pro'), 'owner-a', 3_000);
 assert.equal(consumeContinuation(storage, 'owner-b', 4_000), null, 'another account cannot inherit the intent');
 saveContinuation(storage, routeForPage('pro'), null, 5_000);
 assert.equal(consumeContinuation(storage, 'owner-a', 5_000 + 31 * 60 * 1_000), null, 'stale intent expires');
});
