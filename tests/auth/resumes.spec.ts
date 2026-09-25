import { test, expect, type Page } from '@playwright/test';

// These tests fake an already-established Supabase session by seeding the
// exact localStorage shape @supabase/auth-js reads on `getSession()` (see
// node_modules/@supabase/auth-js dist/main/GoTrueClient.js `__loadSession`),
// so no real magic-link click-through is needed. All `rest/v1/resumes`
// traffic is mocked with an in-memory fake table — nothing here talks to a
// real Supabase project. See HANDOFF.md for what this does and does not prove.

const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userIdB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const blankNamed = (name: string) => ({version:1,name,headline:'',email:'',phone:'',location:'',website:'',summary:'',skills:'',profileHeading:'Profile',skillsHeading:'Skills & languages',sections:[{id:'s1',title:'Experience',entries:[]},{id:'s2',title:'Education',entries:[]}],template:'modern',paper:'A4',accent:'#20594a',direction:'ltr',language:'en'});

function sessionFor(id: string, email: string) {
 return {
  access_token:`fake-access-token-${id}`, token_type:'bearer', expires_in:3600,
  expires_at:Math.floor(Date.now()/1000)+3600, refresh_token:`fake-refresh-token-${id}`,
  user:{id, aud:'authenticated', role:'authenticated', email, app_metadata:{}, user_metadata:{}, created_at:new Date().toISOString()},
 };
}

async function seedSignedIn(page: Page, guestDraftName: string, id = userId) {
 const session = sessionFor(id, 'cloud-test@example.com');
 await page.addInitScript(([sessionValue, draft]) => {
  localStorage.setItem('sb-auth-test-auth-token', JSON.stringify(sessionValue));
  sessionStorage.setItem('resumestride.resume.v1', JSON.stringify(draft));
 }, [session, blankNamed(guestDraftName)]);
}

async function expectLocalDraftName(page: Page, name: string) {
 await expect.poll(() => page.evaluate(() => {
  const raw = sessionStorage.getItem('resumestride.resume.v1');
  if (!raw) return '';
  try { return JSON.parse(raw).name ?? ''; } catch { return ''; }
 })).toBe(name);
}

// Simulates a second tab/client signing in as a *different* account while this
// tab is still running, by posting directly on the same-name BroadcastChannel
// @supabase/auth-js already opens per storage key for multi-tab session sync
// (see node_modules/@supabase/auth-js GoTrueClient's `broadcastChannel`,
// keyed by `this.storageKey`, whose listener calls `_notifyAllSubscribers`
// with whatever `{event, session}` it receives). This drives the app's real
// `onAuthStateChange` listener (src/hooks/useSession.ts) with `user` jumping
// directly from one account to another, with no intervening signed-out
// render — the exact "switch accounts in the same tab" case that only
// differs from a plain sign-out+sign-in in that `useCloudResume` never sees
// `user` become null in between.
async function broadcastSignIn(page: Page, id: string, email: string) {
 await page.evaluate(([id, email]) => {
  const channel = new BroadcastChannel('sb-auth-test-auth-token');
  const session = {
   access_token:`fake-access-token-${id}`, token_type:'bearer', expires_in:3600,
   expires_at:Math.floor(Date.now()/1000)+3600, refresh_token:`fake-refresh-token-${id}`,
   user:{id, aud:'authenticated', role:'authenticated', email, app_metadata:{}, user_metadata:{}, created_at:new Date().toISOString()},
  };
  channel.postMessage({ event:'SIGNED_IN', session });
  channel.close();
 }, [id, email]);
}

function ownerFromUrl(url: string): string | null {
 const match = /owner_id=eq\.([^&]+)/.exec(url);
 return match ? match[1] : null;
}

test('signed-in user with local content is asked before saving to the cloud, and the local draft on this device is untouched while linked', async ({ page }) => {
 let created: { data: unknown; revision: number; updated_at: string } | null = null;
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  if (method === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created ? [created] : []) }); return; }
  if (method === 'POST') {
   const body = route.request().postDataJSON();
   created = { data: body.data, revision: 1, updated_at: new Date().toISOString() };
   await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
   return;
  }
  if (method === 'PATCH') {
   const body = route.request().postDataJSON();
   created = { data: body.data, revision: (created?.revision ?? 1) + 1, updated_at: new Date().toISOString() };
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([created]) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Local Guest Person');
 await page.goto('/');
 await expect(page.getByText('Save your local resume to your ResumeStride account?')).toBeVisible();
 const originalGuestDraft = await page.evaluate(() => sessionStorage.getItem('resumestride.resume.v1'));
 await page.getByRole('button', { name: 'Save to my account' }).click();
 await page.getByRole('button', { name: /Build my resume|Continue my resume/ }).first().click();
 await expect(page.locator('.save-status')).toContainText('Saved to your account');
 expect(created, 'accepting consent must create the cloud resume').not.toBeNull();
 expect(await page.evaluate(() => sessionStorage.getItem('resumestride.resume.v1')), 'the local guest draft on disk must not change just because the cloud copy was created').toBe(originalGuestDraft);
 await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Cloud Edited Person');
 await expect(page.locator('.save-status')).toContainText('Saved to your account');
 expect((created as { data: { name: string } }).data.name, 'further edits must reach the cloud').toBe('Cloud Edited Person');
 expect(await page.evaluate(() => sessionStorage.getItem('resumestride.resume.v1')), 'edits made while cloud-linked must not leak into the local guest storage key').toBe(originalGuestDraft);
});

test('declining consent keeps working locally without creating a cloud resume', async ({ page }) => {
 let insertCount = 0;
 await page.route('**/rest/v1/resumes**', async route => {
  if (route.request().method() === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return; }
  if (route.request().method() === 'POST') { insertCount++; await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }); return; }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Declined Consent Person');
 await page.goto('/');
 await expect(page.getByText('Save your local resume to your ResumeStride account?')).toBeVisible();
 await page.getByRole('button', { name: 'Not now' }).click();
 await expect(page.getByText('Save your local resume to your ResumeStride account?')).toHaveCount(0);
 await page.getByRole('button', { name: /Build my resume|Continue my resume/ }).first().click();
 await expectLocalDraftName(page,'Declined Consent Person');
 expect(insertCount, 'declining must never create a cloud resume').toBe(0);
});

test('an existing cloud resume loads automatically, the local guest draft is never overwritten, and signing out restores it', async ({ page }) => {
 const cloudResume = blankNamed('Cloud Person');
 await page.route('**/rest/v1/resumes**', async route => {
  if (route.request().method() === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: cloudResume, revision: 5, updated_at: new Date().toISOString() }]) }); return; }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));
 await seedSignedIn(page, 'Guest Device Draft');
 await page.goto('/');
 await expect(page.getByText('Loaded your saved resume from your ResumeStride account.', { exact: false })).toBeVisible();
 await page.getByRole('button', { name: /Build my resume|Continue my resume/ }).first().click();
 await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Cloud Person');
 expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).name), 'loading the account resume must not touch the local guest draft on disk').toBe('Guest Device Draft');
 await page.goto('/?account=1');
 await page.getByRole('button', { name: 'Sign out on this device' }).click();
 await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
 await page.getByRole('button', { name: 'Back to home', exact: true }).click();
 await page.getByRole('button', { name: /Build my resume|Continue my resume/ }).first().click();
 await expect(page.getByRole('textbox', { name: 'Full name', exact: true }), 'signing out must hand back the original local guest draft, not leave the account resume showing').toHaveValue('Guest Device Draft');
});

test('a stale cloud save surfaces as a conflict instead of silently overwriting, and both resolution paths work', async ({ page }) => {
 let revision = 1;
 let stored = blankNamed('Already Linked');
 let forceConflictOnce = true;
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  if (method === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: stored, revision, updated_at: new Date().toISOString() }]) }); return; }
  if (method === 'PATCH') {
   if (forceConflictOnce) { forceConflictOnce = false; await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return; }
   const body = route.request().postDataJSON();
   stored = body.data; revision += 1;
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: stored, revision, updated_at: new Date().toISOString() }]) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Guest Draft Unused');
 await page.goto('/');
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('My In-progress Edit');
 await expect(page.getByText('Your account resume was saved elsewhere', { exact: false })).toBeVisible();
 const diagnostics=await page.evaluate(async()=>{
  const path='/src/services/diagnostics.ts';
  return (await import(/* @vite-ignore */ path)).readBrowserDiagnostics();
 });
 expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({feature:'cloud',operation:'cloud_save',category:'database_conflict'})]));
 expect(JSON.stringify(diagnostics)).not.toContain('My In-progress Edit');
 expect(JSON.stringify(diagnostics)).not.toContain(userId);
 await page.getByRole('button', { name: 'Keep my edits' }).click();
 await expect(page.locator('.save-status')).toContainText('Saved to your account');
 expect(stored.name, 'choosing "keep my edits" must overwrite the server with this client\'s content').toBe('My In-progress Edit');
});

test('a stale cloud save conflict can be resolved by taking the other version instead', async ({ page }) => {
 let revision = 1;
 let stored = blankNamed('Already Linked');
 let forceConflictOnce = true;
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  if (method === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: stored, revision, updated_at: new Date().toISOString() }]) }); return; }
  if (method === 'PATCH') {
   if (forceConflictOnce) { forceConflictOnce = false; stored = { ...stored, name: 'Changed On Another Device' }; revision += 1; await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return; }
   const body = route.request().postDataJSON();
   stored = body.data; revision += 1;
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: stored, revision, updated_at: new Date().toISOString() }]) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Guest Draft Unused');
 await page.goto('/');
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('My Overwritten Edit');
 await expect(page.getByText('Your account resume was saved elsewhere', { exact: false })).toBeVisible();
 await page.getByRole('button', { name: 'Use the other version' }).click();
 await expect(page.getByRole('textbox', { name: 'Full name', exact: true }), 'choosing "use the other version" must load the server copy, discarding this client\'s unsaved edit').toHaveValue('Changed On Another Device');
});

test('a delayed save response does not mark a newer edit clean, and the next save is serialized rather than overlapping', async ({ page }) => {
 let revision = 5;
 let stored = blankNamed('Original Cloud Name');
 // Timestamps are recorded server-side (in this Node-process route handler,
 // not via wall-clock polling from the test), so the serialization proof
 // below does not depend on how fast Playwright's own polling notices things
 // — it compares real start/end instants recorded at the moment each request
 // was actually received and actually responded to.
 const patchLog: { name: string; expectedRevision: string | null; startedAt: number; finishedAt: number }[] = [];
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  const url = route.request().url();
  if (method === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: stored, revision, updated_at: new Date().toISOString() }]) }); return; }
  if (method === 'PATCH') {
   const body = route.request().postDataJSON();
   const expectedRevision = /revision=eq\.(\d+)/.exec(url)?.[1] ?? null;
   const entry = { name: body.data.name, expectedRevision, startedAt: Date.now(), finishedAt: 0 };
   patchLog.push(entry);
   if (patchLog.length === 1) await new Promise(resolve => setTimeout(resolve, 1000)); // artificially slow only the first save
   stored = body.data; revision += 1;
   entry.finishedAt = Date.now();
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: stored, revision, updated_at: new Date().toISOString() }]) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Guest Draft Unused');
 await page.goto('/');
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Original Cloud Name');
 await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Edit One');
 // Make a second edit as soon as the (deliberately slow) first save has
 // actually been sent — this is the race: does the first save's eventual
 // completion wrongly mark this SECOND, still-unsaved edit clean too?
 await expect.poll(() => patchLog.length, { timeout: 3000 }).toBeGreaterThanOrEqual(1);
 await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Edit Two');
 await expect.poll(() => patchLog.length, { timeout: 5000 }).toBe(2);
 expect(patchLog[0].name).toBe('Edit One');
 expect(patchLog[1].name, 'the edit made while the first save was in flight must still reach the server, in a save of its own').toBe('Edit Two');
 expect(patchLog[1].expectedRevision, 'the second save must use the revision the first save returned, not the stale one it started with').toBe(String(patchLog[0].expectedRevision ? Number(patchLog[0].expectedRevision) + 1 : NaN));
 expect(patchLog[1].startedAt, 'the second save must not start until after the first one finished responding — saves are serialized, never overlapping').toBeGreaterThanOrEqual(patchLog[0].finishedAt);
 await expect(page.locator('.save-status')).toContainText('Saved to your account');
 expect(patchLog.length, 'exactly two saves total — no extra request from marking the in-flight edit clean early').toBe(2);
});

test('a slow initial-load response for an account the user has already switched away from is dropped, not applied on top of the next account', async ({ page }) => {
 let releaseADelay: (() => void) | null = null;
 const aDelay = new Promise<void>(resolve => { releaseADelay = resolve; });
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  const owner = ownerFromUrl(route.request().url());
  if (method === 'GET' && owner === userId) {
   await aDelay; // held open deliberately, to resolve well after the switch below
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: blankNamed('Cloud A (slow)'), revision: 1, updated_at: new Date().toISOString() }]) });
   return;
  }
  if (method === 'GET' && owner === userIdB) {
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: blankNamed('Cloud B'), revision: 1, updated_at: new Date().toISOString() }]) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Original Guest Draft', userId);
 await page.goto('/');
 // Account A's load is now in flight and deliberately held open (see aDelay).
 await broadcastSignIn(page, userIdB, 'other-account@example.com');
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Cloud B');
 releaseADelay!();
 await page.waitForTimeout(400);
 await expect(page.getByRole('textbox', { name: 'Full name', exact: true }), 'a superseded account\'s slow response must not land on top of the next account\'s already-current state').toHaveValue('Cloud B');
});

test('switching to a different signed-in account mid-session cannot leak the previous account\'s cloud resume into the next account or the local guest draft', async ({ page }) => {
 const resumesByOwner: Record<string, { data: unknown; revision: number }> = {
  [userId]: { data: blankNamed('Cloud A'), revision: 1 },
  [userIdB]: { data: blankNamed('Cloud B'), revision: 1 },
 };
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  const owner = ownerFromUrl(route.request().url());
  if (method === 'GET') {
   const row = owner ? resumesByOwner[owner] : undefined;
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row ? [{ data: row.data, revision: row.revision, updated_at: new Date().toISOString() }] : []) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));
 await seedSignedIn(page, 'Original Guest Draft', userId);
 await page.goto('/');
 await expect(page.getByText('Loaded your saved resume from your ResumeStride account.', { exact: false })).toBeVisible();
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Cloud A');
 const guestDraftBeforeSwitch = await page.evaluate(() => sessionStorage.getItem('resumestride.resume.v1'));
 expect(JSON.parse(guestDraftBeforeSwitch!).name).toBe('Original Guest Draft');

 await broadcastSignIn(page, userIdB, 'other-account@example.com');

 await expect(page.getByRole('textbox', { name: 'Full name', exact: true }), 'switching accounts must load the new account\'s own cloud resume, not keep showing the previous one').toHaveValue('Cloud B');
 expect(await page.evaluate(() => sessionStorage.getItem('resumestride.resume.v1')), 'the on-disk guest draft must never change during an account switch, not even transiently').toBe(guestDraftBeforeSwitch);

 // Signing out of B (client-side navigation only, so the broadcast-simulated
 // in-memory session for B is what actually gets signed out of — a real page
 // reload would just re-read A's session back out of localStorage, which
 // isn't what this test is exercising).
 await page.getByRole('button', { name: 'Back to home', exact: true }).click();
 await page.getByRole('button', { name: /Open profile for/ }).click();
 await page.getByRole('button', { name: 'Sign out on this device' }).click();
 await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
 await page.getByRole('button', { name: 'Back to home', exact: true }).click();
 await page.getByRole('button', { name: /Build my resume|Continue my resume/ }).first().click();
 await expect(page.getByRole('textbox', { name: 'Full name', exact: true }), 'signing out must hand back the ORIGINAL guest draft, not account A\'s or B\'s cloud data').toHaveValue('Original Guest Draft');
});

test('a failed initial cloud-resume check never offers to save the local draft, since it could silently overwrite an account resume the check failed to find', async ({ page }) => {
 await page.route('**/rest/v1/resumes**', async route => {
  if (route.request().method() === 'GET') { await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"server error"}' }); return; }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Local Draft With Content');
 await page.goto('/');
 await expect(page.getByText('Could not check your account for a saved resume', { exact: false })).toBeVisible();
 await expect(page.getByText('Save your local resume to your ResumeStride account?')).toHaveCount(0);
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 await expect(page.getByText('Save your local resume to your ResumeStride account?'), 'a failed check must never be treated as confirmation that there is nothing to overwrite').toHaveCount(0);
});

test('a conflict where the account resume itself is gone is an explicit, recoverable state, not silently indistinguishable from "no conflict"', async ({ page }) => {
 let stored: { data: unknown; revision: number } | null = { data: blankNamed('Already Linked'), revision: 1 };
 let created: { data: unknown; revision: number } | null = null;
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  if (method === 'GET') {
   const row = stored ?? created;
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row ? [{ data: row.data, revision: row.revision, updated_at: new Date().toISOString() }] : []) });
   return;
  }
  if (method === 'PATCH') {
   // The row is gone by the time this save reaches the server (e.g. deleted
   // from another device): zero rows match, and the immediate re-check
   // inside saveCloudResume also finds nothing — server: null, not a version
   // to diff against.
   stored = null;
   await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
   return;
  }
  if (method === 'POST') {
   const body = route.request().postDataJSON();
   created = { data: body.data, revision: 1 };
   await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: created.data, revision: created.revision, updated_at: new Date().toISOString() }) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Guest Draft Unused');
 await page.goto('/');
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Already Linked');
 await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Edit After Deletion');
 await expect(page.getByText('Your account resume could not be found', { exact: false })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Use the other version' }), 'there is no server version to switch to when the row is gone').toHaveCount(0);
 await page.getByRole('button', { name: 'Save my edits as new' }).click();
 await expect(page.locator('.save-status')).toContainText('Saved to your account');
 expect((created?.data as { name: string } | undefined)?.name).toBe('Edit After Deletion');
});

test('a delayed initial account-creation save does not mark a newer edit clean, so it still reaches the cloud afterward', async ({ page }) => {
 let created: { data: { name: string }; revision: number } | null = null;
 let patchCount = 0;
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  if (method === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created ? [created] : []) }); return; }
  if (method === 'POST') {
   await new Promise(resolve => setTimeout(resolve, 800)); // deliberately slow the initial create
   const body = route.request().postDataJSON();
   created = { data: body.data, revision: 1 };
   await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: created.data, revision: created.revision, updated_at: new Date().toISOString() }) });
   return;
  }
  if (method === 'PATCH') {
   patchCount++;
   const body = route.request().postDataJSON();
   created = { data: body.data, revision: (created?.revision ?? 1) + 1 };
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: created.data, revision: created.revision, updated_at: new Date().toISOString() }]) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Local Guest Person');
 await page.goto('/');
 await expect(page.getByText('Save your local resume to your ResumeStride account?')).toBeVisible();
 await page.getByRole('button', { name: 'Save to my account' }).click();
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 // The create POST above is now in flight and deliberately slow. Typing a
 // further edit before it resolves is the race: does the create's eventual
 // completion wrongly mark this newer, never-sent edit clean too, silently
 // losing it?
 await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Edited While Creating');
 await expect(page.locator('.save-status')).toContainText('Saved to your account', { timeout: 3000 });
 await expect.poll(() => patchCount, { timeout: 3000 }).toBeGreaterThanOrEqual(1);
 expect(created?.data.name, 'the edit made while the account resume was still being created must still reach the cloud on its own, not be silently dropped').toBe('Edited While Creating');
});

test('a duplicate click on "Keep my edits" does not send two overlapping conflict-resolution requests', async ({ page }) => {
 let revision = 1;
 let stored = blankNamed('Already Linked');
 let forceConflictOnce = true;
 let patchCount = 0;
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  if (method === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: stored, revision, updated_at: new Date().toISOString() }]) }); return; }
  if (method === 'PATCH') {
   patchCount++;
   if (forceConflictOnce) { forceConflictOnce = false; await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return; }
   await new Promise(resolve => setTimeout(resolve, 300)); // slow enough that a naive (state-only) guard's second click would race in before the first request settles
   const body = route.request().postDataJSON();
   stored = body.data; revision += 1;
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: stored, revision, updated_at: new Date().toISOString() }]) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Guest Draft Unused');
 await page.goto('/');
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('My In-progress Edit');
 await expect(page.getByText('Your account resume was saved elsewhere', { exact: false })).toBeVisible();
 // Dispatch two clicks on the same DOM node from one synchronous script —
 // the strictest form of "duplicate click": both handlers run before React
 // gets a chance to re-render `savingCloud`, which is exactly the race the
 // ref-based `savingRef` guard (mutated immediately, not via state) exists
 // to close; a guard checking only the `savingCloud` state would let both
 // clicks straight through, since neither handler's closure would yet see
 // the other's update.
 await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Keep my edits') as HTMLButtonElement;
  button.click(); button.click();
 });
 await expect(page.locator('.save-status')).toContainText('Saved to your account', { timeout: 3000 });
 expect(patchCount, 'a duplicate click must not fire a second overlapping save request').toBe(2); // 1 forced conflict + exactly 1 real save
});

test('signing out while the initial cloud-resume check is still in flight resumes guest autosave instead of freezing it', async ({ page }) => {
 let releaseLoad: (() => void) | null = null;
 const loadHeldOpen = new Promise<void>(resolve => { releaseLoad = resolve; });
 await page.route('**/rest/v1/resumes**', async route => {
  if (route.request().method() === 'GET') {
   await loadHeldOpen; // held open deliberately; sign-out below happens well before this ever resolves
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: blankNamed('Cloud Person'), revision: 1, updated_at: new Date().toISOString() }]) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));
 await seedSignedIn(page, 'Guest Before Signout');
 await page.goto('/');
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 await expect(page.locator('.save-status')).toContainText('Checking your account…');
 await page.goto('/?account=1');
 await page.getByRole('button', { name: 'Sign out on this device' }).click();
 await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
 await page.getByRole('button', { name: 'Back to home', exact: true }).click();
 await page.getByRole('button', { name: /Build my resume|Continue my resume/ }).first().click();
 await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Guest Before Signout');
 await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Edited After Signout');
 await expectLocalDraftName(page,'Edited After Signout');
 expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).name)).toBe('Edited After Signout');
 releaseLoad!();
});

test('a run of autosave network failures backs off instead of retrying every 350ms, and status reflects the failure truthfully', async ({ page }) => {
 let revision = 1;
 const patchTimestamps: number[] = [];
 let failUntilSuccess = true;
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  if (method === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: blankNamed('Cloud Person'), revision, updated_at: new Date().toISOString() }]) }); return; }
  if (method === 'PATCH') {
   patchTimestamps.push(Date.now());
   if (failUntilSuccess) { await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"network down"}' }); return; }
   const body = route.request().postDataJSON();
   revision += 1;
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: body.data, revision, updated_at: new Date().toISOString() }]) });
   return;
  }
  await route.fulfill({ status: 404, body: '{}' });
 });
 await seedSignedIn(page, 'Guest Draft Unused');
 await page.goto('/');
 await page.getByRole('button', { name: 'Continue my resume' }).click();
 await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Edit During Outage');
 // A flat 350ms retry loop (the bug) would produce far more than two
 // requests in this window; a backed-off retry produces exactly two.
 await expect.poll(() => patchTimestamps.length, { timeout: 3000 }).toBeGreaterThanOrEqual(2);
 await expect(page.locator('.save-status'), 'a failed save must say so truthfully, not keep claiming an active save while quietly retrying').toContainText('Not saved yet');
 expect(patchTimestamps[1] - patchTimestamps[0], 'the retry after a failure must back off well beyond the normal 350ms debounce, not hammer the server').toBeGreaterThanOrEqual(550);
 failUntilSuccess = false;
 await expect(page.locator('.save-status')).toContainText('Saved to your account', { timeout: 5000 });
});

test('review: choosing server version during an in-flight keep-my-edits cannot silently diverge from saved content', async ({ page }) => {
 let stored = blankNamed('Server Version');
 let revision = 1;
 let forceConflict = true;
 let releaseSave!: () => void;
 const held = new Promise<void>(resolve => { releaseSave = resolve; });
 let saving = false;
 await page.route('**/rest/v1/resumes**', async route => {
  if (route.request().method() === 'GET') {
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{data:stored,revision,updated_at:new Date().toISOString()}])}); return;
  }
  if (route.request().method() === 'PATCH') {
   if (forceConflict) { forceConflict=false; await route.fulfill({status:200,contentType:'application/json',body:'[]'}); return; }
   const incoming = route.request().postDataJSON().data;
   saving = true;
   await held;
   stored = incoming; revision++;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{data:stored,revision,updated_at:new Date().toISOString()}])}); return;
  }
  await route.fulfill({status:404,body:'{}'});
 });
 await seedSignedIn(page,'Guest');
 await page.goto('/');
 await page.getByRole('button',{name:'Continue my resume'}).click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Server Version');
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('My Version');
 await page.getByRole('button',{name:'Keep my edits',exact:true}).click();
 await expect.poll(()=>saving).toBe(true);
 const other=page.getByRole('button',{name:'Use the other version',exact:true});
 if (await other.isEnabled()) await other.click();
 releaseSave();
 await expect(page.locator('.save-status')).toContainText('Saved to your account');
 expect(await page.getByRole('textbox',{name:'Full name',exact:true}).inputValue()).toBe(stored.name);
});

test('signing in during a job draft preserves edits and defers cloud access until return to base',async({page})=>{
 const guest=blankNamed('Guest Base');
 await page.addInitScript(draft=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(draft)),guest);
 let reads=0;let writes=0;
 await page.route('**/rest/v1/resumes**',async route=>{
  if(route.request().method()==='GET'){reads++;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{data:blankNamed('Account Base'),revision:1,updated_at:new Date().toISOString()}])});}
  else {writes++;await route.fulfill({status:500,body:'{}'});}
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Build my resume|Continue my resume/}).first().click();
 await page.evaluate(()=>window.postMessage({type:'resumestride:job-import',payload:{title:'Example role',company:'Example',description:'Duties',sourceUrl:'',capturedAt:new Date().toISOString()}},location.origin));
 await page.getByRole('button',{name:'Start job-specific draft'}).click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Unsaved Job Version');
 await broadcastSignIn(page,userId,'cloud-test@example.com');
 // The job notice remains visible, while the authenticated profile proves the auth event arrived.
 await expect(page.getByRole('status').filter({hasText:/Job-specific draft — Tailored for Example role · Example/})).toBeVisible();
 await expect(page.getByRole('button',{name:'Open profile for cloud-test',exact:true})).toBeVisible();
 await page.waitForTimeout(800);
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Unsaved Job Version');
 expect(reads).toBe(0);expect(writes).toBe(0);
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).name)).toBe('Guest Base');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:/Discard draft/}).click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Account Base');
 expect(reads).toBe(1);expect(writes).toBe(0);
});

// Regression coverage for the debounced job-draft persist effect (src/main.tsx) reassigning a
// draft's persisted `ownerId` to whichever account happens to be signed in the moment its 350ms
// timer fires, instead of the identity that actually started (or was legitimately promoted into)
// the draft. `broadcastSignIn` (above) drives the app's real `useSession`/`onAuthStateChange`
// listener exactly as a same-tab account switch would, with `user` jumping directly from one id to
// another — the scenario the fix has to hold up under.
test('switching to a different signed-in account mid-job-draft ends the draft instead of silently relabeling or exposing it to the new account',async({page})=>{
 const guest=blankNamed('Guest Base');
 await page.addInitScript(draft=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(draft)),guest);
 const resumesByOwner:Record<string,{data:unknown;revision:number}>={[userIdB]:{data:blankNamed('Cloud B'),revision:1}};
 await page.route('**/rest/v1/resumes**',async route=>{
  const method=route.request().method();
  const owner=ownerFromUrl(route.request().url());
  if(method==='GET'){
   const row=owner?resumesByOwner[owner]:undefined;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(row?[{data:row.data,revision:row.revision,updated_at:new Date().toISOString()}]:[])});
   return;
  }
  await route.fulfill({status:404,body:'{}'});
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Build my resume|Continue my resume/}).first().click();
 await page.evaluate(()=>window.postMessage({type:'resumestride:job-import',payload:{title:'Sensitive role',company:'Account A Co',description:'Duties',sourceUrl:'',capturedAt:new Date().toISOString()}},location.origin));
 await page.getByRole('button',{name:'Start job-specific draft'}).click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Account A Job Edit');

 // Guest-to-login promotion: this is the one direction that must keep working (preserving the
 // existing test immediately above), and it locks the draft to account A from here on.
 await broadcastSignIn(page,userId,'account-a@example.com');
 await expect(page.getByRole('status').filter({hasText:/Job-specific draft — Tailored for Sensitive role · Account A Co/})).toBeVisible();
 await page.waitForTimeout(600);
 const persistedAfterA=await page.evaluate(()=>JSON.parse(localStorage.getItem('resumestride.jobDraft')!));
 expect(persistedAfterA.ownerId,'the persisted draft must be tagged with the account that actually adopted it').toBe(userId);
 expect(persistedAfterA.resume.name).toBe('Account A Job Edit');

 // Now account B signs in on this same tab while the draft (tagged to A above) is still active.
 await broadcastSignIn(page,userIdB,'account-b@example.com');
 await expect(page.getByText(/Your signed-in account changed while editing a job-specific draft/)).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:/Job-specific draft — Tailored for/})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Full name',exact:true}),'must load account B\'s own cloud resume, never keep showing account A\'s job-draft edit under account B').toHaveValue('Cloud B');
 expect(await page.evaluate(()=>localStorage.getItem('resumestride.jobDraft')),'account A\'s draft must be removed, never silently relabeled as account B\'s').toBeNull();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).name),'the on-disk local base resume must be untouched by a protective draft end').toBe('Guest Base');
});

// Companion coverage using REAL persisted Supabase sessions (not the in-memory broadcast above),
// so the ownerId match on reload is exercised against actual `getSession()`/`onAuthStateChange`
// restoration for two distinct accounts, not a hand-written fixture string.
test('a job draft restores after a reload under the real signed-in account that adopted it, and is discarded on reload under a different real account',async({page})=>{
 const resumesByOwner:Record<string,{data:unknown;revision:number}>={[userIdB]:{data:blankNamed('Cloud B'),revision:1}};
 await page.route('**/rest/v1/resumes**',async route=>{
  const method=route.request().method();
  const owner=ownerFromUrl(route.request().url());
  if(method==='GET'){
   const row=owner?resumesByOwner[owner]:undefined;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(row?[{data:row.data,revision:row.revision,updated_at:new Date().toISOString()}]:[])});
   return;
  }
  await route.fulfill({status:404,body:'{}'});
 });
 await seedSignedIn(page,'Cloud-Backed Guest',userId);
 await page.goto('/',{waitUntil:'domcontentloaded'});
 // Confirms cloud.loading has resolved (no cloud resume yet for A) and cloud.linked is false —
 // the state startJobDraft requires to allow an already-signed-in user to start a draft.
 await expect(page.getByText('Save your local resume to your ResumeStride account?')).toBeVisible();
 await page.getByRole('button',{name:'Continue my resume',exact:true}).click();
 await page.evaluate(()=>window.postMessage({type:'resumestride:job-import',payload:{title:'Role',company:'Co',description:'Duties',sourceUrl:'',capturedAt:new Date().toISOString()}},location.origin));
 await page.getByRole('button',{name:'Start job-specific draft'}).click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Job Edit Under A');
 await page.waitForTimeout(600);

 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.getByText(/was restored in this browser after reload/)).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Job Edit Under A');
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).name),'the base resume flushed at draft start must be unaffected by the reload').toBe('Cloud-Backed Guest');

 // A different real account's session now occupies this browser (e.g. someone else signed in on
 // the same device) and reloads — account A's still-persisted draft must never surface for them.
 // Install B's persisted session for the next document before the app/Supabase
 // initialize. Writing from the old document immediately before reload is
 // racy because that document's live auth client can persist A again while it
 // unloads; addInitScript models the actual next-page session deterministically.
 await page.addInitScript(session=>localStorage.setItem('sb-auth-test-auth-token',JSON.stringify(session)),sessionFor(userIdB,'account-b@example.com'));
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.getByText(/was restored in this browser after reload/)).toHaveCount(0);
 await expect(page.getByRole('status').filter({hasText:/Job-specific draft — Tailored for/})).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('resumestride.jobDraft')),'a foreign-account draft must be discarded, not left around, once a different real account reloads').toBeNull();
 await page.getByRole('button',{name:'Continue my resume',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true}),'account B must see its own cloud resume, never account A\'s job-draft content').toHaveValue('Cloud B');
});

test('permanent history cap pauses retries, preserves in-tab edits and offers a retry without JSON export',async({page})=>{
 let writes=0;
 await page.route('**/rest/v1/resumes**',async route=>{
  if(route.request().method()==='GET') await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{data:blankNamed('Account Base'),revision:1,updated_at:new Date().toISOString()}])});
  else {writes++;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'Account save-history storage limit reached (50000000 bytes).'})});}
 });
 await seedSignedIn(page,'Guest Base');await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Continue my resume',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Account Base');
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Unsaved Edit');
 await expect(page.getByRole('alert').filter({hasText:'Keep this tab open'})).toBeVisible();
 await expect(page.getByRole('button',{name:/backup/i})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Newer Unsaved Edit');
 await page.waitForTimeout(1800);expect(writes).toBe(1);
 await expect(page.locator('.save-status')).toContainText('Not saved');
 await page.getByRole('button',{name:'Retry after storage review'}).click();await expect.poll(()=>writes).toBe(2);
});


test('storage cap on first account save can reoffer consent and save the latest draft', async ({page}) => {
 let writes = 0;
 let savedName = '';
 await page.route('**/rest/v1/resumes**', async route => {
  if (route.request().method() === 'GET') return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  writes++;
  if (writes === 1) return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'Account save-history limit reached (5000 revisions).'})});
  const data = route.request().postDataJSON().data;
  savedName = data.name;
  return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({data,revision:1,updated_at:new Date().toISOString()})});
 });
 await seedSignedIn(page,'First Draft'); await page.goto('/');
 await page.getByRole('button',{name:'Save to my account',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry after storage review'})).toBeVisible();
 await page.getByRole('button',{name:'Continue my resume',exact:true}).click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Latest First Draft');
 await page.getByRole('button',{name:'Retry after storage review'}).click();
 await expect(page.getByRole('button',{name:'Save to my account',exact:true})).toBeVisible();
 expect(writes).toBe(1);
 await page.getByRole('button',{name:'Save to my account',exact:true}).click();
 await expect.poll(()=>savedName).toBe('Latest First Draft');
 await expect(page.locator('.save-status')).toContainText('Saved to your account');
});


for (const deleted of [false, true]) test(`storage cap during conflict recovery preserves the choice (${deleted ? 'deleted' : 'existing'} account resume)`, async ({page}) => {
 let writes = 0;
 let savedName = '';
 await page.route('**/rest/v1/resumes**', async route => {
  const method = route.request().method();
  if (method === 'GET') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(deleted && writes > 0 ? [] : [{data:blankNamed('Account Original'),revision:writes ? 2 : 1,updated_at:new Date().toISOString()}])});
  writes++;
  if (writes === 1) return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  if (writes === 2) return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'Account save-history storage limit reached (50000000 bytes).'})});
  const data = route.request().postDataJSON().data;
  savedName = data.name;
  const row = {data,revision:3,updated_at:new Date().toISOString()};
  return route.fulfill({status:method === 'POST' ? 201 : 200,contentType:'application/json',body:JSON.stringify(method === 'POST' ? row : [row])});
 });
 await seedSignedIn(page,'Guest'); await page.goto('/');
 await page.getByRole('button',{name:'Continue my resume',exact:true}).click();
 const name = page.getByRole('textbox',{name:'Full name',exact:true});
 await expect(name).toHaveValue('Account Original');
 await name.fill('Conflict Draft');
 const keep = page.getByRole('button',{name:deleted ? 'Save my edits as new' : 'Keep my edits',exact:true});
 await keep.click();
 await expect(page.getByRole('button',{name:'Retry after storage review'})).toBeVisible();
 await name.fill('Latest Conflict Draft');
 await keep.click();
 expect(writes).toBe(2);
 await page.getByRole('button',{name:'Retry after storage review'}).click();
 await keep.click();
 await expect.poll(()=>savedName).toBe('Latest Conflict Draft');
 await expect(page.locator('.save-status')).toContainText('Saved to your account');
 await expect(keep).toHaveCount(0);
});

for (const revision of [null, 0, 1.5, '2']) test(`unusable cloud revision ${JSON.stringify(revision)} preserves the guest draft and prevents writes`,async({page})=>{
 let writes=0;
 await page.route('**/rest/v1/resumes**',async route=>{
  if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{data:blankNamed('Invalid Cloud Metadata'),revision,updated_at:new Date().toISOString()}])});
  writes++;return route.fulfill({status:500,body:'{}'});
 });
 await seedSignedIn(page,'Preserved Guest');await page.goto('/');
 await expect(page.getByText('Could not check your account for a saved resume.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Continue my resume',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Preserved Guest');
 await expect(page.getByRole('button',{name:'Save to my account',exact:true})).toHaveCount(0);
 expect(writes).toBe(0);
});

test('unverifiable successful write preserves edits and resolves the resulting revision conflict',async({page})=>{
 let stored=blankNamed('Cloud Base');let revision=1;let writes=0;
 await page.route('**/rest/v1/resumes**',async route=>{
  if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{data:stored,revision,updated_at:new Date().toISOString()}])});
  writes++;
  if(writes===1){
   stored=route.request().postDataJSON().data;revision=2;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{data:stored,revision:null,updated_at:new Date().toISOString()}])});
  }
  if(writes===2)return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  stored=route.request().postDataJSON().data;revision=3;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{data:stored,revision,updated_at:new Date().toISOString()}])});
 });
 await seedSignedIn(page,'Guest Base');await page.goto('/');
 await page.getByRole('button',{name:'Continue my resume',exact:true}).click();
 const name=page.getByRole('textbox',{name:'Full name',exact:true});
 await expect(name).toHaveValue('Cloud Base');await name.fill('First Edit');
 await expect(page.locator('.save-status')).toContainText('Not saved yet');
 await name.fill('Newer Edit');
 await page.getByRole('button',{name:'Keep my edits',exact:true}).waitFor();
 await expect(name).toHaveValue('Newer Edit');
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).name)).toBe('Guest Base');
 await page.getByRole('button',{name:'Keep my edits',exact:true}).click();
 await expect(page.locator('.save-status')).toContainText('Saved to your account');
 expect(stored.name).toBe('Newer Edit');expect(writes).toBe(3);
});
