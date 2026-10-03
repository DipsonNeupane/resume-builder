import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage presents one evidence-led choice, three truthful starts and bounded proof', async ({ page }) => {
 await page.setViewportSize({ width: 1366, height: 768 });
 await page.goto('/');

 await expect(page.getByRole('heading', { level: 1, name: 'Find the roles worth your effort.' })).toBeVisible();
 const primary = page.getByRole('link', { name: 'Compare my resume with a job', exact: true }).first();
 await expect(primary).toBeInViewport();
 await expect(page.getByRole('button', { name: 'Build a resume free', exact: true }).first()).toBeVisible();

 const starts = page.getByRole('region', { name: 'Three clear ways in.' });
 await expect(starts.getByRole('heading', { level: 3 })).toHaveText(['Upload my resume', 'Build from scratch', 'Start with a job']);
 await expect(starts.getByText('read in your browser and requires your review')).toBeVisible();
 await expect(starts.getByText('7 Free templates, PDF, and editable Word export')).toBeVisible();
 await expect(starts.getByText('Paste a job description and compare each requirement')).toBeVisible();

 const proof = page.getByRole('list', { name: 'Product facts' });
 await expect(proof.getByRole('listitem')).toHaveCount(4);
 await expect(proof).toContainText('Your master stays unchanged');
 await expect(proof).toContainText('A4, Letter and right-to-left');
 expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('homepage and public navigation use stable destinations without misleading labels', async ({ page }) => {
 await page.goto('/');
 const nav = page.getByRole('navigation', { name: 'Main navigation' });
 await expect(nav.getByRole('link', { name: 'Resume Builder' })).toHaveAttribute('href', '/workspace/resume');
 await expect(nav.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/start/job');
 await expect(nav.getByRole('link', { name: 'Free Tools' })).toHaveAttribute('href', '/tools/');
 await expect(nav.getByRole('link', { name: 'Templates', exact: true })).toHaveAttribute('href', '/templates/');
 await expect(nav.getByRole('link', { name: 'Resources' })).toHaveAttribute('href', '/resources/');
 await expect(nav.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing/');

 await page.getByRole('link', { name: 'Compare my resume with a job', exact: true }).first().click();
 await expect(page).toHaveURL(/\/tools\/resume-job-match\/$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Resume vs. job evidence check' })).toBeVisible();
 await page.goBack();
 await page.getByRole('button', { name: 'Build a resume free', exact: true }).first().click();
 await expect(page).toHaveURL(/\/start\/build$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Start your master resume' })).toBeVisible();
});
