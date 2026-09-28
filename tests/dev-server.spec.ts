import { test, expect } from '@playwright/test';

// Runs against the project's own `npm run dev` web server (playwright.config.ts). If the dev SEO
// filter 404s any module the app imports, the page renders blank rather than failing loudly.
test('npm run dev serves every application module and renders the home page', async ({ page, baseURL }) => {
 const failed: string[] = [];
 page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(baseURL!).origin) failed.push(`${response.status()} ${response.url()}`); });
 page.on('pageerror', error => failed.push(`pageerror ${error.message}`));
 await page.goto('/');
 await expect(page.getByRole('heading', { level: 1, name: 'Stop searching everywhere. Start with jobs that fit your experience.', exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Build my master resume', exact: true }).first()).toBeVisible();
 expect(failed).toEqual([]);
});
