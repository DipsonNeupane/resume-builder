import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { example } from '../src/model';

test('meaningful workspace navigation uses stable URLs and browser history', async ({ page }) => {
 await page.goto('/');
 await page.locator('.site-header-actions').getByRole('button', { name: 'Build my resume' }).click();
 await expect(page).toHaveURL(/\/start\/build$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Start with your story, not a design.' })).toBeVisible();

 await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Jobs & Match' }).click();
 await expect(page).toHaveURL(/\/start\/job$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Begin with the role you are considering.' })).toBeVisible();

 await page.goBack();
 await expect(page).toHaveURL(/\/start\/build$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Start with your story, not a design.' })).toBeVisible();
 await page.reload();
 await expect(page).toHaveURL(/\/start\/build$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Start with your story, not a design.' })).toBeVisible();
});

test('private entries are served as noindex/no-store application states', async ({ request }) => {
 for (const path of ['/start/import', '/workspace/resume', '/workspace/jobs', '/workspace/account', '/workspace/pro']) {
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow, noarchive');
  // Vite deliberately replaces the middleware cache header with `no-cache` in
  // development. The HTTP policy unit test verifies production's exact
  // `private, no-store` contract.
 }
 expect((await request.get('/workspace/unknown')).status()).toBe(404);
});

test('unrestored object routes never fall through to a master resume or generic evidence view', async ({ page }) => {
 const id = '11111111-1111-4111-8111-111111111111';
 await page.goto(`/workspace/resumes/${id}`);
 await expect(page.getByRole('heading', { name: 'Open this version from your saved jobs' })).toBeVisible();
 await expect(page.getByText('Your master resume has not been changed.')).toBeVisible();
 await page.goto(`/workspace/jobs/${id}/match`);
 await expect(page.getByRole('heading', { name: 'Open Match Analysis from your saved jobs' })).toBeVisible();
});

test('journey routes explain the right start while sharing one safe workspace model', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 820 });
 const draft = example();
 await page.addInitScript(value => sessionStorage.setItem('resumestride.resume.v1', JSON.stringify(value)), draft);

 await page.goto('/start/import');
 await expect(page.getByRole('heading', { name: 'Bring in the resume you already have.' })).toBeVisible();
 await expect(page.getByText(/Parsing happens in this browser/)).toBeVisible();
 await expect(page.getByRole('region', { name: 'Active document' })).toHaveCount(0);

 await page.goto('/start/build');
 await expect(page.getByRole('heading', { name: 'Start with your story, not a design.' })).toBeVisible();
 await expect(page.getByText(/Templates and formatting wait/)).toBeVisible();
 await page.getByRole('button', { name: 'Start building' }).click();
 await expect(page.getByLabel('Full name')).toHaveValue(draft.name);

 await page.goto('/start/job');
 await expect(page.getByRole('heading', { name: 'Begin with the role you are considering.' })).toBeVisible();
 await expect(page.getByText(/A search result is not retained/)).toBeVisible();

 await page.goto('/start/sample');
 await expect(page.getByRole('heading', { name: 'See how evidence informs a decision.' })).toBeVisible();
 await expect(page.getByText(/fictional community-program coordinator/)).toBeVisible();
 await expect(page.getByText(/Jordan—not ResumeStride—decides/)).toBeVisible();
 await expect(page.getByRole('region', { name: 'Active document' })).toHaveCount(0);
 await expect(page.getByRole('heading', { name: /Find jobs/i })).toHaveCount(0);
 expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).name)).toBe(draft.name);
 expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('browser history changes journey context without discarding the local master draft', async ({ page }) => {
 await page.goto('/start/build');
 await page.getByRole('button', { name: 'Start building' }).click();
 await page.getByLabel('Full name').fill('Amina Rahman');
 await expect(page.locator('.save-status')).toContainText('Saved for this session');
 await page.locator('.site-header').getByRole('button', { name: 'Find jobs', exact: true }).click();
 await expect(page).toHaveURL(/\/workspace\/jobs$/);
 await page.goBack();
 await expect(page).toHaveURL(/\/workspace\/resume$/);
 await expect(page.getByLabel('Full name')).toHaveValue('Amina Rahman');
 await page.reload();
 await expect(page.getByLabel('Full name')).toHaveValue('Amina Rahman');
});
