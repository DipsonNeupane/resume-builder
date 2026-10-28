import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { example } from '../../src/model';

// Fictional fixtures only; the jobs API is mocked.
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
test.setTimeout(120_000);

const job = (n: number, overrides: Record<string, unknown> = {}) => {
  const base = {
    id: `techmap:${n}`, title: `Support role ${n}`, company: `Company ${n}`,
    location: n === 2 ? { city: null, region: null, country: null } : { city: 'Leeds', region: null, country: 'GB' },
    workplace: n === 3 ? 'onsite' : 'remote', employmentType: 'full_time',
    salary: n === 2 ? null : { min: 30000, max: 35000, currency: 'GBP', period: 'year' }, postedAt: null,
    matchLabel: 'good', matchReasons: ['Your resume shows customer support across email and chat.'], sourceUrl: `https://jobs.acme.example/${n}`,
  };
  const merged = { ...base, ...overrides };
  return { ...merged, savedSnapshot: { id: merged.id, provider: 'techmap', providerJobId: String(n), dedupeKey: String(n).repeat(64).slice(0, 64).replace(/[^0-9a-f]/g, 'a'),
    title: merged.title, company: merged.company, location: { value: merged.location, source: 'provider', confidence: 'medium' },
    workplace: { value: merged.workplace, source: 'provider', confidence: 'high' }, employmentType: { value: 'full_time', source: 'provider', confidence: 'high' },
    salary: merged.salary, descriptionText: 'Help customers.', postedAt: null, expiry: { expiresAt: null, isLikelyExpired: false, source: 'unknown', confidence: 'low' },
    sourceUrl: merged.sourceUrl, portal: 'acme-careers', source: 'employer', retrievedAt: '2026-10-26T00:00:00Z', matchLabel: 'good', matchReasons: merged.matchReasons } };
};

type State = { saved: Record<string, unknown>[]; saves: number; removes: number; preferences: unknown[]; criteria: Record<string, unknown> | null };
async function seed(page: Page, state: State) {
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: 'fake', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await page.addInitScript(([s, r]) => { localStorage.setItem('sb-auth-test-auth-token', JSON.stringify(s)); sessionStorage.setItem('resumestride.resume.v1', JSON.stringify(r)); }, [session, example()] as const);
  await page.route('https://auth-test.supabase.co/rest/v1/**', route => route.fulfill({ json: [] }));
  await page.route('https://auth-test.supabase.co/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/api/jobs-search', route => route.fulfill({ json: { jobs: [job(1), job(2), job(3, { title: 'On-site role 3' })], isPro: false, availableCount: 3, proLimit: 20 } }));
  await page.route('**/api/jobs-account', route => {
    const body = route.request().postDataJSON();
    if (body.action === 'save') {
      state.saves += 1;
      if (!state.saved.some(item => (item.snapshot as { id: string }).id === body.job.id)) state.saved.push({ id: `0000000${state.saved.length + 1}-0000-4000-8000-000000000000`, snapshot: body.job, providerAvailable: true, availabilityCheckedAt: '2026-10-26T00:00:00Z', unavailableAt: null, savedAt: '2026-10-26T00:00:00Z' });
      return route.fulfill({ json: { savedJobId: state.saved.at(-1)!.id, alreadySaved: false } });
    }
    if (body.action === 'remove') { state.removes += 1; state.saved = state.saved.filter(item => item.id !== body.savedJobId); return route.fulfill({ json: { removed: true } }); }
    if (body.action === 'preferences') { state.preferences.push(body); state.criteria = body.criteria; return route.fulfill({ json: { saved: true } }); }
    return route.fulfill({ json: { isPro: false, saveLimit: 100, savedCount: state.saved.length, savedJobs: state.saved, applications: [], jobResumeVersions: [], preferences: { criteria: state.criteria, autoRefresh: false, lastProviderRefreshAt: null } } });
  });
}
const fresh = (): State => ({ saved: [], saves: 0, removes: 0, preferences: [], criteria: null });

test('short preferences: only roles are required, skip/back work, and saved values reload for editing', async ({ page }) => {
  const state = fresh();
  await seed(page, state);
  await page.goto('/workspace/preferences', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Which roles are you looking for?' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByLabel('Role title').fill('Support specialist');
  await page.getByRole('button', { name: 'Add role' }).click();
  await page.getByLabel('Role title').fill('Customer success associate');
  await page.getByRole('button', { name: 'Add role' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Remote').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Remote')).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Not sure').check();
  await page.getByRole('button', { name: 'Skip this question' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Target pay (optional)' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip this question' }).click();
  await page.getByRole('button', { name: 'Skip this question' }).click();
  await page.getByLabel('On-site only roles').check();
  const axe = await new AxeBuilder({ page }).include('.preferences-setup').analyze();
  expect(axe.violations).toEqual([]);
  await page.getByRole('button', { name: 'Show my jobs' }).click();
  await expect(page).toHaveURL('/workspace/discover');
  expect(state.criteria).toEqual({ title: 'Support specialist', roles: ['Customer success associate'], workplace: 'remote', experienceLevel: 'unsure', dealbreakers: ['onsite'] });
  expect(JSON.stringify(state.preferences)).not.toMatch(/age|gender|ethnic|religion|disab/i);

  await page.goto('/workspace/preferences', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('group', { name: 'Chosen roles' })).toContainText('Customer success associate', { timeout: 30_000 });
});

test('list and card views share results and actions; undo, session-only pass and dealbreakers are transparent', async ({ page }) => {
  const state = fresh();
  state.criteria = { title: 'Support specialist', workplace: 'remote', dealbreakers: ['onsite'] };
  await seed(page, state);
  await page.goto('/workspace/discover', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Search jobs' }).click({ timeout: 30_000 });
  const results = page.getByRole('region', { name: 'Job results' });
  await expect(results.getByRole('heading', { level: 2 })).toHaveText(['Support role 1', 'Support role 2']);
  await expect(results).toContainText('Show 1 hidden by your dealbreakers');
  await expect(results.locator('.deck-card').nth(1)).toContainText('Salary not listed');
  await expect(results.locator('.deck-card').nth(1)).toContainText('Not stated in the posting: location, salary');
  await expect(results.locator('.deck-card').first()).toContainText('Fits your stated preferences');

  // Card view: same jobs, same actions, operable with the keyboard only.
  await results.getByText('One at a time').click();
  await expect(results.getByText('Job 1 of 2 in this batch')).toBeVisible();
  await results.getByRole('button', { name: 'Pass on Support role 1' }).focus();
  await page.keyboard.press('Enter');
  await expect(results.getByRole('heading', { level: 2, name: 'Support role 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo last action' }).click();
  await expect(results.getByRole('heading', { level: 2, name: 'Support role 1' })).toBeVisible();
  await results.getByRole('button', { name: 'Save job' }).click();
  await expect(page.getByText('Saved Support role 1 to My applications. Saving does not apply.')).toBeVisible();
  expect(state.saves).toBe(1);
  await page.getByRole('button', { name: 'Undo last action' }).click();
  await expect(page.getByText('Save undone. The application was removed.')).toBeVisible();
  expect(state.removes).toBe(1);
  await results.getByRole('button', { name: 'Save job' }).click();
  await results.getByRole('button', { name: 'Pass on Support role 2' }).click();
  await expect(results.getByText('You’ve reviewed this batch.')).toBeVisible();

  // Back in the list: the saved job cannot be saved twice; the pass is session-only and reversible.
  await results.getByText('List', { exact: true }).click();
  await expect(results.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  await results.getByLabel(/Show 1 passed this session/).check();
  await expect(results.getByRole('heading', { level: 2 })).toHaveCount(2);
  expect(state.saves).toBe(2);
  const axe = await new AxeBuilder({ page }).include('.discover-deck').analyze();
  expect(axe.violations).toEqual([]);
});
