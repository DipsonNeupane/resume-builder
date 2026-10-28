import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

// Fictional fixtures only. The API is mocked with an in-memory, owner-scoped store that
// enforces the same revision and closed-reason rules as the database RPCs.
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const otherOwner = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
test.setTimeout(120_000);

type App = Record<string, unknown> & { savedJobId: string; stage: string; revision: number; closedReason: string | null; priorStage: string | null; events: unknown[] };
type Store = { jobs: Record<string, unknown>[]; apps: App[]; failNext: boolean; updates: unknown[]; creates: unknown[] };
const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

function seedStore(count: number, ownerTag: string): Store {
  const jobs: Record<string, unknown>[] = [];
  const apps: App[] = [];
  const stages = ['saved', 'preparing', 'applied', 'interviewing', 'offer', 'closed'];
  for (let n = 1; n <= count; n += 1) {
    const id = uuid(n);
    jobs.push({ id, savedAt: '2026-10-01T00:00:00Z', providerAvailable: true, snapshot: { id: `manual:${n}`, provider: 'manual', title: `${ownerTag} role ${n}`, company: n === 42 ? 'Northwind Health' : `Company ${n % 7}`, sourceUrl: null, location: { value: { city: 'Leeds', region: null, country: null } }, salary: null, descriptionText: '' } });
    const stage = n === 42 ? 'applied' : stages[n % 6];
    apps.push({ savedJobId: id, stage, closedReason: stage === 'closed' ? 'no_response' : null, priorStage: null, appliedOn: stage === 'applied' ? '2026-10-10' : null,
      nextAction: n === 7 ? 'Send portfolio link' : '', nextActionDue: n === 7 ? new Date(Date.now() - 3_600_000).toISOString() : null,
      notes: '', contactName: '', contactDetails: '', origin: 'import', revision: 1, createdAt: '2026-10-01T00:00:00Z', updatedAt: `2026-10-${String(1 + (n % 20)).padStart(2, '0')}T00:00:00Z`, events: [], documents: [] });
  }
  return { jobs, apps, failNext: false, updates: [], creates: [] };
}

async function seed(page: Page, stores: Record<string, Store>, userId = owner) {
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: `token-${userId}`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await page.addInitScript(s => { localStorage.setItem('sb-auth-test-auth-token', JSON.stringify(s)); }, session);
  await page.route('https://auth-test.supabase.co/rest/v1/**', route => route.fulfill({ json: [] }));
  await page.route('https://auth-test.supabase.co/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/api/jobs-account', route => handle(route, stores));
}

function handle(route: Route, stores: Record<string, Store>) {
  const token = route.request().headers().authorization?.replace('Bearer token-', '') ?? '';
  const store = stores[token];
  if (!store) return route.fulfill({ status: 401, json: { error: 'Authentication required' } });
  const body = route.request().postDataJSON();
  if (body.action === 'applications' || body.action === 'load') return route.fulfill({ json: { isPro: false, saveLimit: 100, savedCount: store.jobs.length, savedJobs: store.jobs, applications: store.apps, jobResumeVersions: [], preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null } } });
  if (body.action === 'application_update') {
    store.updates.push(body);
    if (store.failNext) { store.failNext = false; return route.fulfill({ status: 503, json: { error: 'Unable to save this application' } }); }
    const app = store.apps.find(item => item.savedJobId === body.savedJobId);
    if (!app) return route.fulfill({ status: 404, json: { error: 'This application is no longer available.' } });
    if (app.revision !== body.expectedRevision) return route.fulfill({ status: 409, json: { error: 'This application changed in another tab.' } });
    const patch = body.patch as Record<string, unknown>;
    if (patch.stage && patch.stage !== app.stage) { app.events = [{ kind: 'stage_changed', fromStage: app.stage, toStage: patch.stage, closedReason: patch.closedReason ?? null, origin: 'user', occurredAt: new Date().toISOString() }, ...app.events]; app.priorStage = app.stage; }
    Object.assign(app, patch, { revision: app.revision + 1, updatedAt: new Date().toISOString() });
    if (app.stage !== 'closed') app.closedReason = null;
    return route.fulfill({ json: { application: app } });
  }
  if (body.action === 'application_create') {
    store.creates.push(body.application);
    const id = uuid(900 + store.jobs.length);
    const input = body.application as Record<string, unknown>;
    store.jobs.unshift({ id, savedAt: new Date().toISOString(), providerAvailable: true, snapshot: { id: `manual:${id}`, provider: 'manual', title: input.title, company: input.company, sourceUrl: input.sourceUrl ?? null, location: { value: { city: null, region: null, country: null } }, salary: null, descriptionText: '' } });
    store.apps.unshift({ savedJobId: id, stage: String(input.stage), closedReason: null, priorStage: null, appliedOn: input.appliedOn ?? null, nextAction: '', nextActionDue: null, notes: '', contactName: '', contactDetails: '', origin: 'user', revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), events: [{ kind: 'created', fromStage: null, toStage: input.stage, closedReason: null, origin: 'user', occurredAt: new Date().toISOString() }], documents: [] });
    return route.fulfill({ json: { savedJobId: id, alreadySaved: false } });
  }
  if (body.action === 'application_import_preview' || body.action === 'application_import') {
    const rows = (body.rows as Record<string, unknown>[]).map((row, index) => {
      if (!row.company || !row.title) return { row: index + 1, status: 'invalid', message: 'Add the company name (up to 300 characters).' };
      if (!['saved', 'preparing', 'applied', 'interviewing', 'offer', 'closed'].includes(String(row.stage))) return { row: index + 1, status: 'invalid', message: 'Choose a stage: Saved, Preparing, Applied, Interviewing, Offer or Closed.' };
      if (row.company === 'Northwind Health') return body.action === 'application_import' && (body.keepPossibleDuplicates as number[]).includes(index + 1)
        ? { row: index + 1, status: 'created' } : { row: index + 1, status: body.action === 'application_import' ? 'skipped' : 'possible_duplicate', message: 'An application with this company and role already exists. It may be a different opening.' };
      return { row: index + 1, status: body.action === 'application_import' ? 'created' : 'ready' };
    });
    return route.fulfill({ json: { rows } });
  }
  return route.fulfill({ status: 400, json: { error: 'Unknown action' } });
}

test('a Free user organizes 100 records: find, change stage, undo, reopen, next action and failed-save recovery', async ({ page }) => {
  const stores = { [owner]: seedStore(100, 'Owner'), [otherOwner]: seedStore(3, 'Other') };
  await seed(page, stores);
  await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'My applications' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('100 of 100 Free applications used.', { exact: false })).toBeVisible();
  await expect(page.getByText(/the Free limit\. Every existing record stays available/)).toBeVisible();
  const counts = page.getByRole('list', { name: 'Applications by stage' });
  await expect(counts.getByRole('button', { name: /Applied/ })).toContainText(String(stores[owner].apps.filter(app => app.stage === 'applied').length));

  await page.getByLabel('Search company or role').fill('Northwind');
  await expect(page.locator('.application-row')).toHaveCount(1);
  const row = page.locator('.application-row').first();
  await row.getByLabel('Stage for Owner role 42').selectOption('interviewing');
  await expect(page.getByText('Moved to Interviewing.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Restored to Applied.')).toBeVisible();
  await expect(row.getByLabel('Stage for Owner role 42')).toHaveValue('applied');

  // Closing requires an explicit reason; no response is not a rejection.
  await row.getByLabel('Stage for Owner role 42').selectOption('closed');
  await page.getByLabel('Why is it closed?').selectOption('no_response');
  await page.getByRole('button', { name: 'Close application' }).click();
  await expect(page.getByText('Moved to Closed.')).toBeVisible();
  await page.getByRole('search').getByRole('combobox', { name: 'Stage', exact: true }).selectOption('all');
  await expect(row).toContainText('Closed · No response');

  // A failed save is reported and recoverable without losing the change.
  stores[owner].failNext = true;
  await page.locator('.application-open').first().click();
  await expect(page).toHaveURL(/\/workspace\/applications\/00000042-/);
  await expect(page.getByRole('heading', { level: 1, name: 'Owner role 42' })).toBeVisible();
  await page.getByRole('button', { name: 'Reopen application' }).click();
  await expect(page.getByRole('alert')).toContainText('Not saved: Unable to save this application');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Moved to Applied.')).toBeVisible();
  await expect(page.locator('.timeline')).toContainText('Closed → Applied');

  await page.getByLabel('What is next?').fill('Prepare interview examples');
  await page.getByLabel(/^Due/).fill('2026-11-03T10:00');
  await page.getByRole('button', { name: 'Save next action' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  const last = stores[owner].updates.at(-1) as { patch: Record<string, unknown> };
  expect(last.patch.nextAction).toBe('Prepare interview examples');

  await page.reload();
  await expect(page.getByLabel('What is next?')).toHaveValue('Prepare interview examples');
  const axe = await new AxeBuilder({ page }).include('.tracker').analyze();
  expect(axe.violations).toEqual([]);
});

test('Today shows recorded due actions as suggestions and pipeline counts that match records', async ({ page }) => {
  const stores = { [owner]: seedStore(12, 'Owner') };
  await seed(page, stores);
  await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL('/workspace/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText(/Suggested — was due .*: Send portfolio link/)).toBeVisible();
  await expect(page.getByText(/No email, push or calendar notifications are sent/)).toBeVisible();
  for (const stage of ['saved', 'preparing', 'applied', 'interviewing', 'offer', 'closed'] as const) {
    const expected = stores[owner].apps.filter(app => app.stage === stage).length;
    await expect(page.getByRole('list', { name: 'Applications by stage' }).locator('li').filter({ hasText: new RegExp(stage, 'i') }).locator('strong')).toHaveText(String(expected));
  }
});

test('a new user adds an application without a resume, quiz or job link, and pasted links are kept', async ({ page }) => {
  const stores = { [owner]: { jobs: [], apps: [], failNext: false, updates: [], creates: [] } as Store };
  await seed(page, stores);
  await page.goto('/workspace/today', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Nothing to do yet.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add your first application' }).click();
  await page.getByRole('textbox', { name: 'Company', exact: true }).fill('Example Company');
  await page.getByRole('textbox', { name: 'Role', exact: true }).fill('Customer support specialist');
  await page.getByRole('button', { name: 'Add application' }).click();
  await expect(page.locator('.application-row')).toHaveCount(1);
  expect(stores[owner].creates[0]).toMatchObject({ company: 'Example Company', title: 'Customer support specialist', stage: 'saved', sourceUrl: null });

  await page.getByRole('textbox', { name: 'Company', exact: true }).fill('Acme');
  await page.getByRole('textbox', { name: 'Role', exact: true }).fill('Analyst');
  await page.getByLabel('Job link (optional)').fill('http://10.0.0.1/jobs');
  await expect(page.getByText('Use a public https job link, or leave it empty.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add application' })).toBeDisabled();
  await page.getByLabel('Job link (optional)').fill('https://careers.acme.com/openings/77');
  await page.getByRole('button', { name: 'Add application' }).click();
  await expect(page.locator('.application-row')).toHaveCount(2);
  expect(stores[owner].creates[1]).toMatchObject({ sourceUrl: 'https://careers.acme.com/openings/77' });
});

test('CSV import maps columns, previews row errors and duplicates, and export escapes formulas', async ({ page }) => {
  const stores = { [owner]: seedStore(3, 'Owner') };
  await seed(page, stores);
  await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.getByLabel('CSV file').setInputFiles({ name: 'apps.csv', mimeType: 'text/csv', buffer: Buffer.from('Company,Job Title,Status,Notes\nBeta,Designer,Applied,=SUM(A1)\nNorthwind Health,Owner role 42,Saved,\n,Missing company,Saved,\nGamma,Writer,Phone screen?,\n') });
  await expect(page.getByLabel('Company (required)')).toHaveValue('0');
  await page.getByRole('button', { name: 'Preview 4 rows' }).click();
  const table = page.getByRole('region', { name: 'Import preview' });
  await expect(table).toContainText('Possible duplicate');
  await expect(table).toContainText('Needs a fix');
  await expect(page.getByText('1 will be imported.', { exact: false })).toBeVisible();
  await table.getByLabel('Import anyway (different opening)').check();
  await expect(page.getByText('2 will be imported.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Import applications' }).click();
  await expect(page.getByText('2 imported.')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await (await download).path();
  const csv = await readFile(file!, 'utf8');
  expect(csv).toContain('Company,Role,Stage');
  expect(csv).not.toContain('00000001-0000');
});

test('records are owner-scoped: switching accounts never shows the previous owner’s applications', async ({ page }) => {
  const stores = { [owner]: seedStore(5, 'Owner'), [otherOwner]: seedStore(2, 'Other') };
  await seed(page, stores);
  await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.application-row').first()).toContainText('Owner role');
  await seed(page, stores, otherOwner);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'My applications' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('search').getByRole('combobox', { name: 'Stage', exact: true }).selectOption('all');
  await expect(page.locator('.application-row')).toHaveCount(2);
  await expect(page.getByText(/Owner role/)).toHaveCount(0);
  await page.goto(`/workspace/applications/${uuid(4)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('This application is unavailable.')).toBeVisible({ timeout: 30_000 });
});

for (const width of [320, 390, 768]) {
  test(`tracker list and detail reflow without horizontal overflow at ${width}px`, async ({ page }) => {
    const stores = { [owner]: seedStore(8, 'Owner') };
    await seed(page, stores);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.application-row').first()).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.locator('.application-open').first().click();
    await expect(page.getByRole('heading', { level: 2, name: 'Timeline' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
