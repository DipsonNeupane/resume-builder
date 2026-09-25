import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { example, storageKey, type Resume } from '../../src/model';

// The extraction adapter (apps/extension/src/inject/extract-job.ts) is compiled but not bundled
// (see apps/extension/README.md for why): it's designed to run exactly the way
// chrome.scripting.executeScript({ files: [...] }) runs it — as a classic script whose last
// top-level statement's value becomes the result. Evaluating the compiled file's text directly
// in a real page via page.evaluate reproduces that exact execution model without needing to load
// the actual unpacked extension into a live browser (see HANDOFF.md for why that wasn't done in
// this session). Requires `npm run build:extension` to have populated apps/extension/dist first
// — `npm run test:extension` does this automatically.
const extractScriptPath = fileURLToPath(new URL('../../apps/extension/dist/inject/extract-job.js', import.meta.url));
async function loadExtractScript(): Promise<string> {
  return readFile(extractScriptPath, 'utf8');
}

const jobImportMessageType = 'resumestride:job-import';
async function postJobImport(page: Page, payload: Record<string, unknown>) {
  await page.evaluate(({ type, payload }) => window.postMessage({ type, payload }, window.location.origin), { type: jobImportMessageType, payload });
}

async function seedBaseResumeAndOpenBuilder(page: Page, draft: Resume = example()) {
  await page.addInitScript(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: draft });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Build my resume', exact: true }).first().click();
}

test.describe('extension extraction (runs the compiled injected script exactly as chrome.scripting.executeScript would)', () => {
  test('captures job details from the bundled local fixture page', async ({ page }) => {
    const script = await loadExtractScript();
    await page.goto('/extension-fixture/job-posting.html');
    const result = await page.evaluate(script);
    expect(result.supported).toBe(true);
    expect(result.capture.title).toContain('Senior Widget Engineer');
    expect(result.capture.company).toContain('Acme Corp');
    expect(result.capture.description).toContain('Build and maintain reliable widgets');
    expect(result.capture.sourceUrl).toContain('/extension-fixture/job-posting.html');
    expect(new Date(result.capture.capturedAt).getTime()).toBeGreaterThan(Date.now() - 15000);
  });

  test('reports a clear unsupported state on a page with no matching adapter', async ({ page }) => {
    const script = await loadExtractScript();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(script);
    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/type the title, company/i);
  });

  test('sanitizes hostile and oversized page text instead of passing it through raw', async ({ page }) => {
    const script = await loadExtractScript();
    await page.goto('/extension-fixture/job-posting.html');
    await page.evaluate(() => {
      const huge = '<script>alert(1)</script>' + 'x'.repeat(20000) + '\u0000\u0007';
      document.querySelector('[data-resumestride-field="description"]')!.textContent = huge;
      document.querySelector('[data-resumestride-field="title"]')!.textContent = 'A'.repeat(1000);
    });
    const result = await page.evaluate(script);
    expect(result.supported).toBe(true);
    // Bounded: sanitizeText caps at N chars then appends one ellipsis character.
    expect(result.capture.description.length).toBeLessThanOrEqual(12000);
    expect(result.capture.title.length).toBeLessThanOrEqual(300);
    // Never interpreted as HTML — the literal text survives as plain text, inert.
    expect(result.capture.description).toContain('<script>alert(1)</script>');
    // Control characters are stripped.
    expect(result.capture.description).not.toMatch(/[\u0000-\u0008]/);
  });
});

test.describe('web app job-import receiver (src/services/extensionImport.ts)', () => {
  test('ignores a job-import message relayed from a different origin', async ({ page }) => {
    await seedBaseResumeAndOpenBuilder(page);
    await page.evaluate(type => {
      const iframe = document.createElement('iframe');
      iframe.src = `data:text/html,<script>parent.postMessage({type:${JSON.stringify(type)},payload:{title:'Spy Role',company:'Spy Co',description:'x',sourceUrl:'',capturedAt:new Date().toISOString()}},'*')<\/script>`;
      document.body.appendChild(iframe);
    }, jobImportMessageType);
    await page.waitForTimeout(400);
    await expect(page.getByText('Spy Role')).toHaveCount(0);
  });

  test('ignores a job-import message with an invalid schema', async ({ page }) => {
    await seedBaseResumeAndOpenBuilder(page);
    await postJobImport(page, { title: 123, company: 'Acme', description: 'x', sourceUrl: '', capturedAt: new Date().toISOString() });
    await page.waitForTimeout(300);
    await expect(page.getByText(/job was captured/i)).toHaveCount(0);
  });

  test('rejects an oversized job-import payload rather than truncating it on receipt', async ({ page }) => {
    await seedBaseResumeAndOpenBuilder(page);
    await postJobImport(page, { title: 'Role', company: 'Co', description: 'x'.repeat(13000), sourceUrl: '', capturedAt: new Date().toISOString() });
    await page.waitForTimeout(300);
    await expect(page.getByText(/job was captured/i)).toHaveCount(0);
  });

  test('renders captured job text as literal text, never as markup', async ({ page }) => {
    await seedBaseResumeAndOpenBuilder(page);
    const hostileTitle = '<img src=x onerror=alert(1)> Role';
    await postJobImport(page, { title: hostileTitle, company: 'Acme', description: 'desc', sourceUrl: '', capturedAt: new Date().toISOString() });
    await expect(page.getByText(hostileTitle, { exact: false })).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
  });

  test('accepting a captured job starts a separate draft that preserves the base resume until discarded', async ({ page }) => {
    const draft = example();
    draft.name = 'Original Base Name';
    await seedBaseResumeAndOpenBuilder(page, draft);
    await postJobImport(page, { title: 'Senior Widget Engineer', company: 'Acme Corp', description: 'Build widgets.', sourceUrl: 'http://localhost/x', capturedAt: new Date().toISOString() });
    await expect(page.getByText(/Senior Widget Engineer/)).toBeVisible();

    await page.getByRole('button', { name: 'Start job-specific draft' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Job-specific draft — Tailored for Senior Widget Engineer · Acme Corp/ })).toBeVisible();

    const nameInput = page.getByRole('textbox', { name: 'Full name' });
    await expect(nameInput).toHaveValue('Original Base Name');
    await nameInput.fill('Edited For This Job');
    await page.waitForTimeout(500);

    const storedBase = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), storageKey);
    expect(storedBase.name).toBe('Original Base Name');

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /Discard draft/ }).click();
    await expect(nameInput).toHaveValue('Original Base Name');
    await expect(page.getByRole('status').filter({ hasText: /Job-specific draft — Tailored for/ })).toHaveCount(0);
  });

  test('a second capture while already in a job draft requires discarding first, without corrupting the base', async ({ page }) => {
    const draft = example();
    draft.name = 'Base Person';
    await seedBaseResumeAndOpenBuilder(page, draft);
    await postJobImport(page, { title: 'Role A', company: 'A Co', description: 'd', sourceUrl: '', capturedAt: new Date().toISOString() });
    await page.getByRole('button', { name: 'Start job-specific draft' }).click();

    await postJobImport(page, { title: 'Role B', company: 'B Co', description: 'd', sourceUrl: '', capturedAt: new Date().toISOString() });
    await expect(page.getByText(/already editing a job-specific draft/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start job-specific draft' })).toHaveCount(0);

    const storedBase = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), storageKey);
    expect(storedBase.name).toBe('Base Person');
  });
});

test('storage failure prevents starting a draft that cannot preserve its base', async ({page})=>{
 await seedBaseResumeAndOpenBuilder(page);
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('Storage denied');};});
 await postJobImport(page,{title:'Example job',company:'Example',description:'Example duties',sourceUrl:'',capturedAt:new Date().toISOString()});
 await page.getByRole('button',{name:'Start job-specific draft'}).click();
 await expect(page.getByText('Could not preserve your base resume.',{exact:false})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:/Job-specific draft — Tailored for/})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Alex Morgan');
});

test('duplicate deliveries acknowledge without reopening a dismissed capture',async({page})=>{
 await seedBaseResumeAndOpenBuilder(page);
 const payload={title:'Once only job',company:'Example',description:'Work',sourceUrl:'',capturedAt:new Date().toISOString()};
 const send=()=>page.evaluate(payload=>window.postMessage({type:'resumestride:job-import',payload,deliveryId:'repeat-id'},location.origin),payload);
 await send();await page.getByRole('button',{name:'Dismiss',exact:true}).click();await send();
 await expect(page.getByRole('button',{name:'Start job-specific draft'})).toHaveCount(0);
});

test.describe('job-specific draft recovery across a reload (src/main.tsx, resumestride.jobDraft)', () => {
  test('a job draft started as a guest recovers automatically after a reload, without disturbing the preserved base resume', async ({ page }) => {
    const draft = example();
    draft.name = 'Reload Base Name';
    await seedBaseResumeAndOpenBuilder(page, draft);
    await postJobImport(page, { title: 'Recoverable Role', company: 'Recover Co', description: 'Recoverable duties.', sourceUrl: '', capturedAt: new Date().toISOString() });
    await page.getByRole('button', { name: 'Start job-specific draft' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Job-specific draft — Tailored for Recoverable Role · Recover Co/ })).toBeVisible();

    const nameInput = page.getByRole('textbox', { name: 'Full name' });
    await nameInput.fill('Edited Before Reload');
    // Job-draft persistence debounces on the same 350ms cadence as the base autosave.
    await page.waitForTimeout(600);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/was restored in this browser after reload/)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /Job-specific draft — Tailored for Recoverable Role · Recover Co/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Edited Before Reload');

    const storedBase = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), storageKey);
    expect(storedBase.name).toBe('Reload Base Name');

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /Discard draft/ }).click();
    await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Reload Base Name');
    const remaining = await page.evaluate(() => localStorage.getItem('resumestride.jobDraft'));
    expect(remaining).toBeNull();
  });

  test('a persisted job draft belonging to a different account identity is discarded rather than restored', async ({ page }) => {
    const draft = example();
    await page.addInitScript(({ key, value, jobDraftKey, jobDraft }) => {
      sessionStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem(jobDraftKey, JSON.stringify(jobDraft));
    }, {
      key: storageKey,
      value: draft,
      jobDraftKey: 'resumestride.jobDraft',
      jobDraft: {
        ownerId: 'someone-elses-account',
        jobContext: { title: 'Foreign Role', company: 'Foreign Co', description: 'd', sourceUrl: '', capturedAt: new Date().toISOString() },
        baseSnapshot: draft,
        resume: draft,
      },
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Build my resume', exact: true }).first().click();
    await expect(page.getByText(/was restored in this browser after reload/)).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /Job-specific draft — Tailored for/ })).toHaveCount(0);
    const remaining = await page.evaluate(() => localStorage.getItem('resumestride.jobDraft'));
    expect(remaining).toBeNull();
  });
});
