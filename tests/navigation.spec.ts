import { expect, test } from '@playwright/test';

test('meaningful workspace navigation uses stable URLs and browser history', async ({ page }) => {
 await page.goto('/');
 await page.locator('.site-header-actions').getByRole('button', { name: 'Build my resume' }).click();
 await expect(page).toHaveURL(/\/workspace\/resume$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Let’s start with you.' })).toBeVisible();

 await page.locator('.site-header').getByRole('button', { name: 'Find jobs', exact: true }).click();
 await expect(page).toHaveURL(/\/workspace\/jobs$/);
 await expect(page.getByRole('heading', { level: 1, name: /Find jobs/i })).toBeVisible();

 await page.goBack();
 await expect(page).toHaveURL(/\/workspace\/resume$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Let’s start with you.' })).toBeVisible();
 await page.reload();
 await expect(page).toHaveURL(/\/workspace\/resume$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Let’s start with you.' })).toBeVisible();
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
