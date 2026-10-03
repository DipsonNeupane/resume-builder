import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { example } from '../src/model';

test.setTimeout(120_000);

test('fictional sample is complete, resettable, accessible and isolated from a real draft', async ({ page }) => {
 const real = example();
 await page.addInitScript(value => {
  sessionStorage.setItem('resumestride.resume.v1', JSON.stringify(value));
  localStorage.setItem('resumestride.jobDraft', JSON.stringify({
   ownerId: null,
   jobContext: { title: 'Real saved draft', company: 'Private employer', description: 'Private job text', sourceUrl: 'https://jobs.example/private', capturedAt: '2026-09-29T00:00:00.000Z' },
   baseSnapshot: value,
   resume: { ...value, summary: 'Private job-specific wording.' },
  }));
 }, real);
 await page.goto('/start/sample', { waitUntil: 'domcontentloaded' });
 await expect(page.getByText('This example is fictional')).toBeVisible();
 await expect(page.getByText('Clearly demonstrated', { exact: true })).toBeVisible();
 await expect(page.getByText('Worth reviewing', { exact: true })).toBeVisible();
 await expect(page.getByText('Not demonstrated', { exact: true })).toBeVisible();
 expect(page.url()).not.toContain('Jordan');
 expect(page.url()).not.toContain('Northstar');

 await page.getByLabel('Worth pursuing — create a separate version').check();
 await page.getByRole('button', { name: 'Create a separate version' }).click();
 await expect(page.getByRole('heading', { name: 'Separate fictional job-specific version' })).toBeFocused();
 await expect(page.getByText('Master resume')).toBeVisible();
 await expect(page.getByText('Unchanged · 3 original evidence points')).toBeVisible();
 await page.getByRole('button', { name: 'Accept in separate version' }).first().click();
 await expect(page.getByText('1 of 2 suggestions accepted in the fictional job-specific version.')).toBeVisible();
 expect(await page.evaluate(() => sessionStorage.getItem('resumestride.resume.v1'))).toBe(JSON.stringify(real));
 expect(await page.evaluate(() => localStorage.getItem('resumestride.jobDraft'))).toContain('Private job-specific wording.');

 await page.getByLabel('Keep looking').check();
 await expect(page.getByText('Separate fictional job-specific version')).toHaveCount(0);
 await page.getByLabel('Worth pursuing — create a separate version').check();
 await expect(page.getByRole('button', { name: 'Create a separate version' })).toBeVisible();

 const axe = await new AxeBuilder({ page }).analyze();
 expect(axe.violations).toEqual([]);

 await page.getByRole('button', { name: 'Reset fictional sample' }).click();
 await expect(page.getByRole('button', { name: 'Create a separate version' })).toHaveCount(0);
 await expect(page.getByText('Separate fictional job-specific version')).toHaveCount(0);
 await page.getByRole('button', { name: 'Start with my resume', exact: true }).click();
 await expect(page).toHaveURL(/\/start\/import$/);
 expect(await page.evaluate(() => sessionStorage.getItem('resumestride.resume.v1'))).toBe(JSON.stringify(real));
 await page.goBack();
 await expect(page).toHaveURL(/\/start\/sample$/);
 await expect(page.getByText('Separate fictional job-specific version')).toHaveCount(0);
});

test('sample offers a direct transition to the real browser-only matcher', async ({ page }) => {
 await page.goto('/start/sample', { waitUntil: 'domcontentloaded' });
 await page.getByRole('button', { name: 'Start with a job description' }).click();
 await expect(page).toHaveURL(/\/tools\/resume-job-match\/$/);
 await expect(page.getByRole('heading', { level: 1 })).toContainText(/resume.*job/i);
});
