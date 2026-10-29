import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage presents the two primary paths, three truthful starts and bounded proof', async ({ page }) => {
 await page.setViewportSize({ width: 1366, height: 768 });
 await page.goto('/');

 await expect(page.getByRole('heading', { level: 1, name: 'Find jobs you like. Apply with confidence. Know what happens next.' })).toBeVisible();
 const primary = page.getByRole('link', { name: 'Find my jobs', exact: true });
 await expect(primary).toBeInViewport();
 await expect(page.getByRole('link', { name: 'Organize my applications', exact: true })).toBeInViewport();
 await expect(page.getByRole('button', { name: 'Build a resume free', exact: true }).first()).toBeVisible();

 const starts = page.getByRole('region', { name: 'Where would you like to start?' });
 await expect(starts.getByRole('heading', { level: 3 })).toHaveText(['Upload my resume', 'Build from scratch', 'Start with a job']);
 await expect(starts.getByText('Review the details before continuing. Your file is read in your browser.')).toBeVisible();
 await expect(starts.getByText('Choose from 7 free templates and add your experience.')).toBeVisible();
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

 await page.getByRole('link', { name: 'Organize my applications', exact: true }).click();
 await expect(page).toHaveURL(/\/workspace\/applications$/);
 await expect(page.getByText('Sign in to track applications.')).toBeVisible();
 await page.goBack();
 await page.getByRole('link', { name: 'Compare my resume with a job', exact: true }).first().click();
 await expect(page).toHaveURL(/\/tools\/resume-job-match\/$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Compare your resume with a job' })).toBeVisible();
 await page.goBack();
 await page.getByRole('button', { name: 'Build a resume free', exact: true }).first().click();
 await expect(page).toHaveURL(/\/start\/build$/);
 await expect(page.getByRole('heading', { level: 1, name: 'Start your master resume' })).toBeVisible();
});

test('template previews switch on click without opening the editor and fit a complete page', async ({ page }) => {
 for (const width of [1366, 390]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  for (const name of ['Modern', 'Compact', 'Boardroom', 'Stackline', 'Scholar', 'Primer']) {
   const choice = page.getByRole('button', { name: `Preview ${name}`, exact: true });
   await choice.click();
   await expect(choice).toHaveAttribute('aria-pressed', 'true');
   await expect(page).toHaveURL(/\/$/);
   const specimen = page.getByRole('figure', { name: `Fictional sample in the ${name.toLowerCase()} template` });
   await expect(specimen.locator('.fixed-preview')).toHaveClass(/is-measured/);
   await expect(specimen.locator('.fixed-preview-frame').first()).toBeVisible();
   expect(await specimen.locator('.fixed-preview-page').first().evaluate(el => {
    const page = el.getBoundingClientRect(), frame = el.parentElement!.getBoundingClientRect();
    return Math.abs(page.width - frame.width) < 2 && Math.abs(page.height - frame.height) < 2;
   })).toBe(true);
   if (name === 'Scholar') {
    await expect(specimen).toContainText('Publications');
    await expect(specimen).not.toContainText('Customer Experience Specialist');
   }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
 await page.getByRole('button', { name: 'Use this template', exact: true }).click();
 await expect(page).not.toHaveURL(/\/$/);
});
