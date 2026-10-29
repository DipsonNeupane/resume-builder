/** Connected browser journeys. The browser talks to the REAL server handlers
 * (jobs-account, jobs-search, tailor, export-docx) running in this test process against a
 * fresh local PGlite database with every migration applied. Only these are controlled
 * fixtures: the access-token check (fictional session), the Techmap provider response and
 * the OpenAI response. Fictional people and employers only. Screenshots are written to
 * test-results/journeys/. This is fixture-based coverage, not real-provider verification. */
import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { migratedDatabase, rpcClient } from '../server/pgliteDatabase';
import { jobsAccount } from '../../server/jobs/account';
import { searchJobs, dependencies as searchDependencies } from '../../server/jobs/handler';
import { resetJobsCacheForTests } from '../../server/jobs/cache';
import { tailor } from '../../api/tailor';
import { generateTailoringSuggestions } from '../../server/ai/tailoring';
import { exportDocx } from '../../server/export/docx-handler';
import { renderDocx } from '../../server/export/docx';
import { exportPdf } from '../../server/export/handler';
import { renderPdf } from '../../server/export/render';
import { chromium } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import { writeFile } from 'node:fs/promises';
import { example } from '../../src/model';
import type { NormalizedJob } from '../../server/jobs/types';

test.setTimeout(240_000);
const ORIGIN = 'http://127.0.0.1:5181';
const FREE = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
const OTHER = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const ACCOUNTS: Record<string, { id: string; password: string }> = { 'fixture@example.com': { id: FREE, password: 'fixture-pass-1' }, 'second@example.com': { id: OTHER, password: 'fixture-pass-2' } };
const env = { APP_ORIGIN: ORIGIN, SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  TECHMAP_API_KEY: 'x'.repeat(20), AI_ENABLED: 'true', OPENAI_API_KEY: 'sk-fixture', EXPORTS_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv;
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/journeys/${name}.png`, fullPage: true });

const POSTING = ['Customer Support Specialist at Fixture Outfitters.', 'Requirements:', '- Experience supporting customers across email, phone and live chat.',
  '- Fluency in Spanish.', '- Experience with Zendesk.', 'Preferred:', '- Experience helping new team members build product knowledge.'].join('\n');
function providerJob(n: number, overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return { id: `techmap:${n}`, provider: 'techmap', providerJobId: String(n), title: 'Customer Support Specialist', company: `Fixture Outfitters ${n}`,
    location: { value: { city: 'Leeds', region: null, country: 'GB' }, source: 'provider', confidence: 'high' },
    workplace: { value: 'remote', source: 'provider', confidence: 'high' }, employmentType: { value: 'full_time', source: 'provider', confidence: 'high' },
    salary: null, descriptionText: POSTING, postedAt: null, expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
    directness: { value: null, source: 'unknown', confidence: 'low' }, sourceUrl: `https://jobs.fixture.example/${n}`, portal: `portal-${n}`, source: 'employer',
    dedupeKey: String(n).repeat(64).slice(0, 64), retrievedAt: '2026-10-27T00:00:00Z', ...overrides };
}
const candidates = [
  providerJob(1, { title: 'Senior Customer Support Specialist', workplace: { value: 'onsite', source: 'provider', confidence: 'high' } }),
  providerJob(2, { salary: { min: 30000, max: 34000, currency: 'GBP', period: 'year', confidence: 'high' } as never }),
  providerJob(3),
];

/** `signedIn: false` starts with no session and a stateful Auth stand-in: password sign-in
 * issues a token, logout revokes it, and the server handlers reject revoked tokens. */
async function connect(page: Page, { master = example(), signedIn = true }: { master?: ReturnType<typeof example>; signedIn?: boolean } = {}) {
  resetJobsCacheForTests();
  const pg = await migratedDatabase();
  await pg.exec(`insert into auth.users(id, email, created_at) values ('${FREE}', 'fixture@example.com', now() - interval '1 day'), ('${OTHER}', 'second@example.com', now() - interval '1 day')`);
  const db = rpcClient(pg);
  const live = new Map<string, string>([[`token-${FREE}`, FREE]]);
  const authenticate = async (request: Request) => {
    const owner = live.get((request.headers.get('authorization') ?? '').replace(/^Bearer /, ''));
    if (!owner) throw Object.assign(new Error('Authentication required'), { status: 401 });
    return owner;
  };
  const serviceDatabase = (() => db) as never;
  const toRequest = (route: Route) => new Request(route.request().url(), { method: route.request().method(), headers: route.request().headers(), body: route.request().method() === 'GET' ? undefined : route.request().postData() ?? undefined });
  const send = async (route: Route, response: Response) => route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers.entries()), body: Buffer.from(await response.arrayBuffer()) });
  const userFor = (id: string) => ({ id, aud: 'authenticated', role: 'authenticated', email: Object.keys(ACCOUNTS).find(email => ACCOUNTS[email].id === id), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
  const sessionFor = (id: string, token: string) => ({ access_token: token, refresh_token: `refresh-${token}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: userFor(id) });
  const authCalls: string[] = [];
  await page.addInitScript(([s, r]) => { if (s && !sessionStorage.getItem('journey.seeded')) { localStorage.setItem('sb-auth-test-auth-token', JSON.stringify(s)); sessionStorage.setItem('journey.seeded', '1'); } if (!sessionStorage.getItem('resumestride.resume.v1')) sessionStorage.setItem('resumestride.resume.v1', JSON.stringify(r)); }, [signedIn ? sessionFor(FREE, `token-${FREE}`) : null, master] as const);
  if (!signedIn) live.clear();
  await page.route('https://auth-test.supabase.co/rest/v1/**', route => route.fulfill({ json: [] }));
  await page.route('https://auth-test.supabase.co/auth/v1/user', route => {
    const owner = live.get((route.request().headers().authorization ?? '').replace(/^Bearer /, ''));
    authCalls.push(`user:${owner ?? 'rejected'}`);
    return owner ? route.fulfill({ json: userFor(owner) }) : route.fulfill({ status: 401, json: { code: 401, msg: 'invalid JWT' } });
  });
  await page.route('https://auth-test.supabase.co/auth/v1/token?grant_type=password', route => {
    const { email, password } = route.request().postDataJSON() as { email: string; password: string };
    const account = ACCOUNTS[email];
    if (!account || account.password !== password) { authCalls.push('password:rejected'); return route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }); }
    const token = `token-${account.id}-${live.size + authCalls.length}`;
    live.set(token, account.id);
    authCalls.push(`password:${account.id}`);
    return route.fulfill({ json: sessionFor(account.id, token) });
  });
  await page.route('https://auth-test.supabase.co/auth/v1/logout**', route => {
    const token = (route.request().headers().authorization ?? '').replace(/^Bearer /, '');
    live.delete(token);
    authCalls.push('logout');
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/jobs-account', async route => send(route, await jobsAccount(toRequest(route), env, { authenticate, serviceDatabase } as never)));
  await page.route('**/api/jobs-search', async route => send(route, await searchJobs(toRequest(route), env, { ...searchDependencies, authenticate, serviceDatabase,
    techmapSearch: (async () => ({ jobs: candidates, page: 1, hasMore: false })) as never, delay: async () => {} } as never)));
  // PDF export runs the real handler and renderer; only the browser binary is the local
  // Playwright Chromium instead of the packaged serverless Chromium.
  await page.route('**/api/export-pdf', async route => send(route, await exportPdf(toRequest(route), env, { authenticate, serviceDatabase, renderDocument: resume => renderPdf(resume, chromium.executablePath()) } as never)));
  await page.route('**/api/export-docx', async route => send(route, await exportDocx(toRequest(route), env, { authenticate, serviceDatabase, renderDocument: renderDocx } as never)));
  await page.route('**/api/export-status**', async route => {
    const status = await db.rpc('pdf_status', { p_owner: FREE });
    const row = (status.data as Record<string, unknown>[])[0];
    return route.fulfill({ json: { isPro: row.is_pro, hasPaidAccess: Boolean(row.is_pro), remaining: row.remaining, resetsAt: row.resets_at } });
  });
  // The provider fixture quotes the source field and names a server-issued requirement id.
  await page.route('**/api/tailor', async route => send(route, await tailor(toRequest(route), env, { authenticate, serviceDatabase,
    generateTailoringSuggestions: (config, prereqs, resume, jobText, _fetch, match) => {
      const source = resume.sections[0].entries[0].description;
      const target = match?.relevantRequirements.find(item => /email, phone and live chat/.test(item.text));
      const suggestion = { sectionId: resume.sections[0].id, entryId: resume.sections[0].entries[0].id, field: 'description', originalText: source,
        suggestedText: source.replace('Support customers across email, phone, and live chat', 'Support customers by email, phone and live chat'),
        why: 'Uses the posting’s channel wording for experience already listed.', targetRequirementIds: target ? [target.id] : [], supportingQuotes: ['Support customers across email, phone, and live chat'] };
      const fetcher = (async () => Response.json({ id: 'resp_fixture', model: 'gpt-fixture', status: 'completed', usage: { input_tokens: 400, output_tokens: 90 },
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ suggestions: [suggestion] }) }] }] })) as typeof fetch;
      return generateTailoringSuggestions(config, prereqs, resume, jobText, fetcher, match);
    } } as never)));
  return { pg, db, live, authCalls, authenticate };
}

test('Journey A (browser, connected): preferences → discovery → save → correct requirement → tailor with trace → export exact version → confirm applied → view submitted', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { pg } = await connect(page);
  const pageErrors: string[] = [];
  page.on('pageerror', error => { pageErrors.push(error.message); console.log('PAGEERROR', error.message, error.stack?.split('\n').slice(0, 4).join(' | ')); });

  // Preferences: roles + remote + level + priorities + a hard dealbreaker.
  await page.goto('/workspace/preferences', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Which roles are you looking for?' })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('Role title').fill('Customer Support Specialist');
  await page.getByRole('button', { name: 'Add role' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Remote').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Mid level').check();
  await shot(page, 'a1-preferences-level');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip this question' }).click();
  await page.getByLabel('Flexibility — remote or hybrid work').check();
  await page.getByLabel('Pay shown in the posting').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('On-site only roles').check();
  await page.getByRole('button', { name: 'Show my jobs' }).click();
  await expect(page).toHaveURL('/workspace/discover');

  // Discovery from the provider fixture, ranked by the server with the stored preferences.
  await page.getByRole('button', { name: 'Search jobs' }).click({ timeout: 60_000 });
  const results = page.getByRole('region', { name: 'Job results' });
  await expect(results.locator('.deck-card').first()).toContainText('Fixture Outfitters 2', { timeout: 30_000 });
  await expect(results.locator('.deck-card').first()).toContainText('Pay is stated in the posting');
  await expect(results.locator('.deck-card').first()).toContainText('Remote, as you prefer');
  await expect(results.locator('.deck-card').first()).not.toContainText('Remote — matches your flexibility priority');
  await expect(results).toContainText('Show 1 hidden by your dealbreakers');
  await shot(page, 'a2-discover-ranked');
  await results.locator('.deck-card').first().getByRole('button', { name: 'Save job' }).click();
  await expect(page.getByText(/Saved .* to My applications\. Saving does not apply\./)).toBeVisible();

  // The saved application, from My applications.
  await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Customer Support Specialist Fixture Outfitters 2/ }).click({ timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 1, name: /Customer Support Specialist/ })).toBeVisible();
  await shot(page, 'a3-application-saved');
  await page.getByRole('button', { name: /Prepare my application/ }).first().click();
  const match = page.getByRole('region', { name: 'Match Analysis' });
  await expect(match).toBeVisible({ timeout: 60_000 });
  const savedJobId = new URL(page.url()).pathname.split('/')[3];
  // Before the trial is bound, a Free saved job offers an explicit comparison.
  await match.getByRole('button', { name: 'Show what my resume shows' }).click();
  await expect(match.getByRole('heading', { name: 'What your resume shows' })).toBeVisible();
  await shot(page, 'a4-match-free-preview');

  // Prepare with the one Free trial: a separate job-specific resume; the master is unchanged.
  await match.getByRole('button', { name: 'Prepare my application (free trial)' }).click();
  await expect(page.getByRole('region', { name: 'Active document' })).toContainText('Job-specific resume', { timeout: 60_000 });
  await shot(page, 'a5-job-specific-resume');

  // The trial includes the full evidence view for this application: correct the extraction.
  await page.goto(`/workspace/jobs/${savedJobId}/match`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'Match Analysis' })).toBeVisible({ timeout: 60_000 });
  const review = page.getByRole('region', { name: 'Match Analysis' }).locator('.requirement-review');
  await expect(review).toBeVisible({ timeout: 60_000 });
  await review.locator('li', { hasText: 'Experience with Zendesk' }).getByRole('button', { name: 'Remove — not a real requirement' }).click();
  await review.getByLabel('Add a requirement the extraction missed').fill('Weekend availability');
  await review.getByLabel('Classification').last().selectOption('required');
  await review.getByRole('button', { name: 'Add', exact: true }).click();
  await review.getByRole('button', { name: 'Save requirement review' }).click();
  await expect(page.getByRole('region', { name: 'Match Analysis' })).toContainText('Weekend availability', { timeout: 30_000 });
  await shot(page, 'a6-requirements-corrected');

  // Clarify evidence: the owner confirms a fact the resume does not state.
  await page.getByRole('button', { name: 'I can demonstrate this' }).first().click();
  await expect(page.getByRole('region', { name: 'Match Analysis' })).toContainText('Match Analysis updated with your answer', { timeout: 30_000 });
  await shot(page, 'a7-evidence-clarified');
  const stored = (await pg.query<{ a: { requirements: { text: string; status: string }[] } }>(`select match_analysis as a from public.saved_jobs where id = $1`, [savedJobId])).rows[0].a.requirements;
  expect(stored.some(r => /Zendesk/.test(r.text))).toBe(false);
  expect(stored.find(r => r.text === 'Weekend availability')?.status).toBe('demonstrated');

  // Tailor: a traceable suggestion (requirement + quoted resume fact), accepted into the version.
  await expect(page.getByRole('button', { name: 'View the full evidence analysis with Pro' })).toHaveCount(0);
  await expect(page.getByText('Full evidence analysis', { exact: true })).toBeVisible();
  // Already saved: the footer points to preparing, never to saving it again.
  await expect(page.getByRole('region', { name: 'Match Analysis' })).toContainText('Choose “Prepare my application” to start a separate job-specific resume.');
  await expect(page.getByRole('region', { name: 'Match Analysis' })).not.toContainText('Save this job to start');
  await page.getByRole('button', { name: 'Open job-specific resume' }).click();
  await expect(page.getByRole('region', { name: 'Active document' })).toContainText('Job-specific resume', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Design & format' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByRole('checkbox', { name: /I consent to sending this saved job-specific resume/ }).check();
  await page.getByRole('button', { name: 'Get tailoring suggestions' }).click();
  const card = page.getByRole('article', { name: 'Suggestion 1', exact: true });
  await expect(card.locator('.suggestion-trace')).toContainText('Experience supporting customers across email, phone and live chat', { timeout: 60_000 });
  await expect(card.locator('.suggestion-trace')).toContainText('“Support customers across email, phone, and live chat” — Experience · Customer Experience Specialist, Example Company');
  await shot(page, 'a8-traceable-suggestion');
  await card.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(card).toContainText('Accepted and saved to this job-specific resume');
  const version = (await pg.query<{ data: { sections: { entries: { description: string }[] }[] } }>(`select data from public.job_resume_versions where saved_job_id = $1`, [savedJobId])).rows[0].data;
  await expect.poll(async () => (await pg.query<{ d: string }>(`select data#>>'{sections,0,entries,0,description}' as d from public.job_resume_versions where saved_job_id = $1`, [savedJobId])).rows[0].d).toContain('Support customers by email, phone and live chat');
  expect(version).toBeTruthy();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).sections[0].entries[0].description)).toContain('Support customers across email, phone, and live chat');

  // Export that exact version as Word and keep it with the application. There is one set of
  // download controls; accepting a change asks for the preview to be confirmed again.
  await page.getByRole('button', { name: 'Review and download this version' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('group', { name: 'Document downloads' })).toHaveCount(1);
  const downloads = page.getByRole('group', { name: 'Document downloads' });
  await downloads.getByRole('checkbox', { name: /I consent to uploading my resume content/ }).check();
  await expect(downloads.getByRole('checkbox', { name: /Keep a copy of this exact version/ })).toBeChecked();
  const [download] = await Promise.all([page.waitForEvent('download'), downloads.getByRole('button', { name: 'Download Word (.docx)' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  await download.saveAs('test-results/journeys/sample-job-specific.docx');
  await shot(page, 'a9-exported');

  // Confirm applied explicitly, then view the exact submitted version.
  await page.goto(`/workspace/applications/${savedJobId}`, { waitUntil: 'domcontentloaded' });
  const prompt = page.getByRole('region', { name: 'Submission check' });
  await expect(prompt).toBeVisible({ timeout: 60_000 });
  await shot(page, 'a10-submit-prompt');
  // Saved from Discover first, tracked from "Prepare": the timeline says so.
  const timeline = page.locator('.detail-timeline');
  await expect(timeline).toContainText('Job saved');
  await expect(timeline).toContainText('Saved → Preparing');
  await expect(timeline).not.toContainText('Added as Preparing');
  await prompt.getByRole('button', { name: 'Yes, record as applied with this document' }).click();
  await expect(page.locator('.document-list')).toContainText('Submitted version', { timeout: 30_000 });
  await page.getByRole('button', { name: 'View exact version' }).click();
  const kept = page.getByRole('region', { name: 'Kept version, read-only' });
  await expect(kept).toContainText('Support customers by email, phone and live chat', { timeout: 30_000 });
  await expect(kept).toContainText('confirmed as submitted');
  expect((await new AxeBuilder({ page }).include('.application-detail').analyze()).violations).toEqual([]);
  await shot(page, 'a11-submitted-version');
  const stage = (await pg.query<{ stage: string }>(`select stage from public.job_application_workflows where saved_job_id = $1`, [savedJobId])).rows[0].stage;
  expect(stage).toBe('applied');

  // Provenance: saved with the version and copied into the kept document.
  type Stored = { id: string; origin: string; aiText: string; keptText: string; requirements: { text: string }[]; resumeQuotes: { quote: string }[] }[];
  const { p: provenance, id: versionId } = (await pg.query<{ p: Stored; id: string }>(`select provenance as p, id from public.job_resume_versions where saved_job_id = $1`, [savedJobId])).rows[0];
  expect(provenance).toHaveLength(1);
  expect(provenance[0]).toMatchObject({ origin: 'ai', requirements: [{ text: 'Experience supporting customers across email, phone and live chat' }], resumeQuotes: [{ quote: 'Support customers across email, phone, and live chat' }] });
  expect(provenance[0].keptText).toContain('Support customers by email, phone and live chat');
  expect((await pg.query<{ p: Stored }>(`select provenance as p from public.job_application_documents where saved_job_id = $1`, [savedJobId])).rows[0].p).toEqual(provenance);
  await kept.getByText('Tailoring record kept with this version (1)').click();
  await expect(kept).toContainText('Entry description · AI wording · In this version');
  await expect(kept).toContainText('Job requirement: Experience supporting customers across email, phone and live chat');
  await shot(page, 'a12-kept-provenance');

  // After a reload the version shows the record; a later manual edit reads as edited, while the
  // kept document still shows the wording as exported.
  await page.goto(`/workspace/resumes/${versionId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'Active document' })).toContainText('Job-specific resume', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Design & format' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByText('Tailoring record for this version (1)').click();
  const record = page.locator('.tailoring-panel .provenance-list');
  await expect(record).toContainText('Entry description · AI wording · In this version');
  await page.getByRole('button', { name: 'Back to editing' }).click();
  await page.getByRole('button', { name: 'Experience', exact: true }).click();
  const description = page.getByRole('textbox', { name: 'Details (one point per line)' }).first();
  await description.fill(`${await description.inputValue()}\nCovered weekend shifts.`);
  await expect.poll(async () => (await pg.query<{ d: string }>(`select data#>>'{sections,0,entries,0,description}' as d from public.job_resume_versions where id = $1`, [versionId])).rows[0].d, { timeout: 30_000 }).toContain('Covered weekend shifts.');
  expect((await pg.query<{ p: Stored }>(`select provenance as p from public.job_resume_versions where id = $1`, [versionId])).rows[0].p).toEqual(provenance);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'Active document' })).toContainText('Job-specific resume', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Design & format' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByText('Tailoring record for this version (1)').click();
  await expect(record).toContainText('Entry description · AI wording · Edited by you since');
  await shot(page, 'a13-version-provenance-edited');
  await page.goto(`/workspace/applications/${savedJobId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'View exact version' }).click();
  await kept.getByText('Tailoring record kept with this version (1)').click();
  await expect(kept).toContainText('Entry description · AI wording · In this version');
  await pg.close();
});

test('Journey B (browser, connected): tracker-first from home → quick add → CSV import → stage update → next action → Today', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { pg } = await connect(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Organize my applications' }).first().click();
  await expect(page).toHaveURL('/workspace/applications');
  await expect(page.getByRole('heading', { level: 1, name: 'My applications' })).toBeVisible({ timeout: 60_000 });

  // Quick add: company, role and stage only — no resume, quiz or link.
  await page.getByRole('textbox', { name: 'Company', exact: true }).fill('Example Clinic');
  await page.getByRole('textbox', { name: 'Role', exact: true }).fill('Front desk coordinator');
  await page.getByRole('button', { name: 'Add application' }).click();
  await expect(page.locator('.application-row')).toHaveCount(1, { timeout: 30_000 });
  await shot(page, 'b1-quick-add');

  // CSV import with mapping, preview, an invalid row and an explicit duplicate decision.
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.getByLabel('CSV file').setInputFiles({ name: 'apps.csv', mimeType: 'text/csv', buffer: Buffer.from(
    'Company,Job Title,Status,Notes\nFixture Labs,Lab assistant,Applied,\nExample Clinic,Front desk coordinator,Saved,\nSample Works,Operations associate,No response,\n,Missing company,Saved,\n') });
  await page.getByRole('button', { name: 'Preview 4 rows' }).click();
  const preview = page.getByRole('region', { name: 'Import preview' });
  await expect(preview).toContainText('Possible duplicate', { timeout: 30_000 });
  await expect(preview).toContainText('Needs a fix');
  await shot(page, 'b2-import-preview');
  await page.getByRole('button', { name: 'Import applications' }).click();
  await expect(page.getByText('2 imported.')).toBeVisible({ timeout: 30_000 });
  // Closed records are hidden from the default list but counted and kept.
  await expect(page.getByText('3 of 100 Free applications used.')).toBeVisible();
  await expect(page.locator('.application-row')).toHaveCount(2);
  const closed = (await pg.query<{ stage: string; closed_reason: string }>(`select w.stage, w.closed_reason from public.job_application_workflows w join public.saved_jobs j on j.id = w.saved_job_id where j.snapshot->>'company' = 'Sample Works'`)).rows[0];
  expect(closed).toEqual({ stage: 'closed', closed_reason: 'no_response' });

  // Stage update from the list, then a next action due in the past on the record.
  await page.getByLabel('Stage for Lab assistant').selectOption('interviewing');
  await expect.poll(async () => (await pg.query<{ stage: string }>(`select w.stage from public.job_application_workflows w join public.saved_jobs j on j.id = w.saved_job_id where j.snapshot->>'title' = 'Lab assistant'`)).rows[0]?.stage).toBe('interviewing');
  await page.locator('.application-row', { hasText: 'Lab assistant' }).getByRole('button', { name: /Lab assistant/ }).click();
  await page.getByLabel('What is next?').fill('Send interview thank-you note');
  const yesterday = new Date(Date.now() - 86_400_000); const local = new Date(yesterday.getTime() - yesterday.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.getByLabel(/^Due/).fill(local);
  await page.getByRole('button', { name: 'Save next action' }).click();
  await expect.poll(async () => (await pg.query<{ next_action: string }>(`select w.next_action from public.job_application_workflows w join public.saved_jobs j on j.id = w.saved_job_id where j.snapshot->>'title' = 'Lab assistant'`)).rows[0]?.next_action).toBe('Send interview thank-you note');
  await shot(page, 'b3-next-action');

  // Today: due work is a suggestion, counts equal the stored records.
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Suggested — was due .*: Send interview thank-you note/)).toBeVisible();
  const counts = (await pg.query<{ stage: string; n: number }>(`select stage, count(*)::int as n from public.job_application_workflows group by stage`)).rows;
  for (const { stage, n } of counts) await expect(page.getByRole('list', { name: 'Applications by stage' }).locator('li').filter({ hasText: new RegExp(stage, 'i') }).locator('strong')).toHaveText(String(n));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, 'b4-today');
  await pg.close();
});

test('Journey C (browser, connected): reload and a lost session during preparation recover the job-specific draft and context', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { pg } = await connect(page);
  await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Company', exact: true }).fill('Fixture Outfitters');
  await page.getByRole('textbox', { name: 'Role', exact: true }).fill('Customer Support Specialist');
  await page.getByRole('button', { name: 'Add application' }).click({ timeout: 60_000 });
  await page.locator('.application-row').getByRole('button', { name: /Customer Support Specialist/ }).click();
  await page.getByRole('button', { name: 'Prepare my application' }).first().click();
  await page.getByRole('button', { name: /Prepare my application \(free trial\)/ }).click({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Active document' })).toContainText('Job-specific resume', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Profile & skills' }).click();
  await page.getByRole('textbox', { name: 'Professional profile', exact: true }).fill('Customer support specialist preparing for Fixture Outfitters.');
  await expect.poll(async () => (await pg.query<{ s: string }>(`select data->>'summary' as s from public.job_resume_versions`)).rows[0]?.s).toBe('Customer support specialist preparing for Fixture Outfitters.');
  const versionUrl = page.url();
  expect(versionUrl).toMatch(/\/workspace\/resumes\/[0-9a-f-]{36}$/);

  // Reload: same job-specific version, same edit, master untouched.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'Active document' })).toContainText('Customer Support Specialist · Fixture Outfitters', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Profile & skills' }).click();
  await expect(page.getByRole('textbox', { name: 'Professional profile', exact: true })).toHaveValue('Customer support specialist preparing for Fixture Outfitters.');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).summary)).toBe(example().summary);
  await shot(page, 'c1-after-reload');

  // Session lost (signed out in another tab): nothing account-scoped is shown.
  const saved = await page.evaluate(() => { const v = localStorage.getItem('sb-auth-test-auth-token'); localStorage.removeItem('sb-auth-test-auth-token'); return v; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Customer support specialist preparing for Fixture Outfitters.')).toHaveCount(0);
  await shot(page, 'c2-signed-out');
  // Signing in again returns to the same version with the edit intact.
  await page.evaluate(v => localStorage.setItem('sb-auth-test-auth-token', v!), saved);
  await page.goto(versionUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'Active document' })).toContainText('Customer Support Specialist · Fixture Outfitters', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Profile & skills' }).click();
  await expect(page.getByRole('textbox', { name: 'Professional profile', exact: true })).toHaveValue('Customer support specialist preparing for Fixture Outfitters.');
  await shot(page, 'c3-after-sign-in');
  await pg.close();
});

/** A two-page fictional resume, so the PDF has a real page break to inspect. */
function longResume() {
  const resume = example();
  const extra = Array.from({ length: 7 }, (_, i) => ({ id: `extra${i + 1}`, title: `Support Role ${i + 1}`, organization: `Fixture Company ${i + 1}`, location: 'Leeds, UK', dates: `${2010 + i} — ${2011 + i}`,
    description: ['Answered customer questions by email and phone for a busy online shop.', 'Kept order notes accurate and shared common fixes with the team.', 'Covered the live chat queue during seasonal peaks.'].join('\n') }));
  resume.sections[0].entries.push(...extra);
  resume.sections.push({ id: 'certs', title: 'Training', entries: [{ id: 'cert1', title: 'FINAL SECTION MARKER', organization: 'Fixture Training', location: '', dates: '2019', description: '' }] } as never);
  return resume;
}

test('Journey D (browser, connected): job-specific PDF export → rendered pages inspected → exact version kept and retrieved', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const master = longResume();
  const { pg } = await connect(page, { master });
  await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Company', exact: true }).fill('Fixture Outfitters');
  await page.getByRole('textbox', { name: 'Role', exact: true }).fill('Customer Support Specialist');
  await page.getByRole('button', { name: 'Add application' }).click({ timeout: 60_000 });
  await page.locator('.application-row').getByRole('button', { name: /Customer Support Specialist/ }).click();
  const savedJobId = new URL(page.url()).pathname.split('/')[3];
  await page.getByRole('button', { name: 'Prepare my application' }).first().click();
  await page.getByRole('button', { name: /Prepare my application \(free trial\)/ }).click({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Active document' })).toContainText('Job-specific resume', { timeout: 60_000 });
  const marker = 'JOB-SPECIFIC VERSION for Fixture Outfitters: customer support specialist who answers questions clearly.';
  await page.getByRole('button', { name: 'Profile & skills' }).click();
  await page.getByRole('textbox', { name: 'Professional profile', exact: true }).fill(marker);
  await expect.poll(async () => (await pg.query<{ s: string }>(`select data->>'summary' as s from public.job_resume_versions where saved_job_id = $1`, [savedJobId])).rows[0]?.s).toBe(marker);
  const versionId = (await pg.query<{ id: string }>(`select id from public.job_resume_versions where saved_job_id = $1`, [savedJobId])).rows[0].id;

  await page.getByRole('button', { name: 'Design & format' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  const downloads = page.getByRole('group', { name: 'Document downloads' });
  await expect(downloads).toHaveCount(1);
  await downloads.getByRole('checkbox', { name: /I consent to uploading my resume content/ }).check();
  await expect(downloads.getByRole('checkbox', { name: /Keep a copy of this exact version/ })).toBeChecked();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), downloads.getByRole('button', { name: 'Download PDF', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const file = 'test-results/journeys/sample-job-specific.pdf';
  await download.saveAs(file);
  await shot(page, 'd1-pdf-exported');

  // Inspect the PDF itself: pages, extracted text, page break placement and rendered pages.
  const bytes = new Uint8Array(await (await import('node:fs/promises')).readFile(file));
  expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  const parser = new PDFParse({ data: bytes });
  const text = await parser.getText();
  expect(text.total).toBeGreaterThanOrEqual(2);
  const flat = (value: string) => value.replace(/\s+/g, ' ');
  const all = flat(text.text);
  expect(all).toContain('Alex Morgan');
  expect(all).toContain(flat(marker));
  expect(all).not.toContain('People-first customer experience specialist');
  expect(all).toContain('FINAL SECTION MARKER');
  for (const p of text.pages) expect(p.text.trim().length).toBeGreaterThan(40);
  // The name and job-specific summary open page 1; the last section ends the last page.
  expect(flat(text.pages[0].text)).toContain(flat(marker));
  expect(flat(text.pages[text.pages.length - 1].text)).toContain('FINAL SECTION MARKER');
  // No entry is split from its heading: each role title appears on the same page as its dates.
  for (let i = 1; i <= 7; i++) {
    const home = text.pages.find(p => flat(p.text).includes(`Support Role ${i}`));
    expect(home, `Support Role ${i}`).toBeTruthy();
    expect(flat(home!.text)).toContain(`${2010 + i - 1} — ${2010 + i}`);
  }
  const shots = await parser.getScreenshot({ scale: 1 });
  for (const p of shots.pages) await writeFile(`test-results/journeys/d-pdf-page-${p.pageNumber}.png`, p.data);
  await parser.destroy();

  // Kept with the application as the exact job-specific version, then retrieved.
  const kept = (await pg.query<{ id: string; format: string; source_kind: string; job_resume_version_id: string; resume_snapshot: { summary: string } }>(
    `select id, format, source_kind, job_resume_version_id, resume_snapshot from public.job_application_documents where saved_job_id = $1`, [savedJobId])).rows;
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatchObject({ format: 'pdf', source_kind: 'job_version', job_resume_version_id: versionId });
  expect(kept[0].resume_snapshot.summary).toBe(marker);
  // Rendering the kept snapshot again produces the same text as the downloaded file.
  const again = new PDFParse({ data: await renderPdf(kept[0].resume_snapshot as never, chromium.executablePath()) });
  expect(flat((await again.getText()).text)).toBe(all);
  await again.destroy();

  // Later edits to the version do not change what was kept.
  await page.getByRole('button', { name: 'Back to editing' }).click();
  await page.getByRole('button', { name: 'Profile & skills' }).click();
  await page.getByRole('textbox', { name: 'Professional profile', exact: true }).fill('Edited after export.');
  await expect.poll(async () => (await pg.query<{ s: string }>(`select data->>'summary' as s from public.job_resume_versions where saved_job_id = $1`, [savedJobId])).rows[0]?.s).toBe('Edited after export.');
  await page.goto(`/workspace/applications/${savedJobId}`, { waitUntil: 'domcontentloaded' });
  const prompt = page.getByRole('region', { name: 'Submission check' });
  await expect(prompt).toBeVisible({ timeout: 60_000 });
  await prompt.getByRole('button', { name: 'Yes, record as applied with this document' }).click();
  await expect(page.locator('.document-list')).toContainText('Submitted version', { timeout: 30_000 });
  await expect(page.locator('.document-list')).toContainText('PDF');
  await page.getByRole('button', { name: 'View exact version' }).click();
  const view = page.getByRole('region', { name: 'Kept version, read-only' });
  await expect(view).toContainText(marker, { timeout: 30_000 });
  await expect(view).not.toContainText('Edited after export.');
  await shot(page, 'd2-pdf-version-retrieved');
  await pg.close();
});

test('Journey E (browser, connected): genuinely signed out → sign in and return → draft → logout → second account isolated → sign back in and recover', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { pg, live, authCalls, authenticate } = await connect(page, { signedIn: false });
  const apiStatuses: number[] = [];
  page.on('response', response => { if (/\/api\/(jobs-account|export-status)/.test(response.url())) apiStatuses.push(response.status()); });
  const signIn = async (email: string, password: string) => {
    const account = page.getByRole('region', { name: 'APWICO account' });
    await expect(account).toBeVisible({ timeout: 30_000 });
    const mode = account.getByLabel('Account options').getByRole('button', { name: 'Sign in', exact: true });
    if (await mode.count()) await mode.click();
    await account.getByLabel('Email address').fill(email);
    await account.getByLabel('Password', { exact: true }).fill(password);
    await account.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  };

  // 1. Genuinely signed out: no stored session, Auth rejects, nothing account-scoped loads.
  await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Sign in to track applications.')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => localStorage.getItem('sb-auth-test-auth-token'))).toBeNull();
  expect(apiStatuses.filter(status => status === 200)).toEqual([]);
  await shot(page, 'e1-signed-out');

  // 2. Sign in from the protected page (a wrong password first) and return to it.
  await page.getByRole('button', { name: 'Sign in or create a free account' }).click();
  await signIn('fixture@example.com', 'wrong-password');
  await expect(page.getByRole('region', { name: 'APWICO account' }).getByRole('alert')).toBeVisible();
  await shot(page, 'e1b-wrong-password');
  await signIn('fixture@example.com', 'fixture-pass-1');
  await expect(page.getByRole('heading', { level: 1, name: 'My applications' })).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL('/workspace/applications');
  await expect(page.getByRole('textbox', { name: 'Company', exact: true })).toBeVisible({ timeout: 60_000 });
  await shot(page, 'e2-signed-in-returned');

  // 3. Start preparing an application and make a draft edit.
  await page.getByRole('textbox', { name: 'Company', exact: true }).fill('Fixture Outfitters');
  await page.getByRole('textbox', { name: 'Role', exact: true }).fill('Customer Support Specialist');
  await page.getByRole('button', { name: 'Add application' }).click();
  await page.locator('.application-row').getByRole('button', { name: /Customer Support Specialist/ }).click();
  await page.getByRole('button', { name: 'Prepare my application' }).first().click();
  await page.getByRole('button', { name: /Prepare my application \(free trial\)/ }).click({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Active document' })).toContainText('Job-specific resume', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Profile & skills' }).click();
  const draft = 'Draft for Fixture Outfitters written before signing out.';
  await page.getByRole('textbox', { name: 'Professional profile', exact: true }).fill(draft);
  await expect.poll(async () => (await pg.query<{ s: string }>(`select data->>'summary' as s from public.job_resume_versions`)).rows[0]?.s).toBe(draft);
  const versionUrl = page.url();
  const tokenA = [...live.entries()].find(([, id]) => id === FREE)![0];

  // 4. Log out through the UI: the token is revoked server-side and nothing of A remains visible.
  await page.getByRole('button', { name: /Open profile for/ }).click();
  await page.getByRole('button', { name: 'Sign out on this device' }).click();
  await expect.poll(() => authCalls.includes('logout')).toBe(true);
  await expect(page.getByText(draft)).toHaveCount(0);
  const draftInFields = () => page.locator('textarea, input').evaluateAll((fields, text) => fields.some(field => (field as HTMLInputElement).value === text), draft);
  expect(await draftInFields()).toBe(false);
  await rejectsOld(authenticate, tokenA);
  await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Sign in to track applications.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Fixture Outfitters')).toHaveCount(0);
  await shot(page, 'e3-after-logout');

  // 5. A second account sees none of the first account's applications or draft.
  await page.getByRole('button', { name: 'Sign in or create a free account' }).click();
  await signIn('second@example.com', 'fixture-pass-2');
  await expect(page.getByRole('textbox', { name: 'Company', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.application-row')).toHaveCount(0);
  await expect(page.getByText('Fixture Outfitters')).toHaveCount(0);
  await page.goto(versionUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await expect(page.getByText(draft)).toHaveCount(0);
  expect(await draftInFields()).toBe(false);
  await expect(page.getByText('This workspace item is unavailable.')).toBeVisible();
  await shot(page, 'e4-second-account-isolated');

  // 6. Switch back: sign out B, sign in A on the version link, and the draft is recovered.
  await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Open profile for/ }).click();
  await page.getByRole('button', { name: 'Sign out on this device' }).click();
  await expect.poll(() => authCalls.filter(call => call === 'logout').length).toBe(2);
  await page.goto(versionUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Sign in/ }).first().click({ timeout: 60_000 });
  await signIn('fixture@example.com', 'fixture-pass-1');
  await expect(page.getByRole('region', { name: 'Active document' })).toContainText('Customer Support Specialist · Fixture Outfitters', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Profile & skills' }).click();
  await expect(page.getByRole('textbox', { name: 'Professional profile', exact: true })).toHaveValue(draft);
  await shot(page, 'e5-draft-recovered');
  expect(authCalls).toContain('password:rejected');
  await pg.close();
});

async function rejectsOld(authenticate: (request: Request) => Promise<string>, token: string) {
  await expect(authenticate(new Request(`${ORIGIN}/api/jobs-account`, { headers: { authorization: `Bearer ${token}` } }))).rejects.toThrow('Authentication required');
}
