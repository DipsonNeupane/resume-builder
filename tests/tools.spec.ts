import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { publicTools } from '../src/content/tools';

const paths = ['/tools/', ...publicTools.map(tool => tool.path)];
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 720 },
];

test('tool hub and all tools remain responsive at required widths', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(width.scroll, `${path} at ${viewport.width}px`).toBeLessThanOrEqual(width.client);
    }
  }
});

test('tool pages pass automated accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  for (const tool of publicTools) {
    await page.goto(tool.path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${tool.path}: ${results.violations.map(item => item.id).join(', ')}`).toEqual([]);
  }
});

test('requirement extractor handles empty, huge and hostile input without network disclosure', async ({ page }) => {
  const outbound: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') outbound.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`); });
  await page.goto('/tools/job-requirement-extractor/');
  await page.getByRole('button', { name: 'Extract requirements' }).click();
  await expect(page.getByRole('alert')).toContainText('more detail');

  await page.locator('#job-description').evaluate((field, value) => { (field as HTMLTextAreaElement).value = value as string; }, 'x'.repeat(20_001));
  await page.getByRole('button', { name: 'Extract requirements' }).click();
  await expect(page.getByRole('alert')).toContainText('20,000');

  const hostile = '<img src="https://attacker.invalid/private" onerror="window.__attack=1">';
  await page.locator('#job-description').fill(`Responsibilities\nYou will review ${hostile} customer requests.\nRequirements\nSQL is required.`);
  await page.getByRole('button', { name: 'Extract requirements' }).click();
  await expect(page.locator('[data-tool-results]')).toBeVisible();
  await expect(page.locator('[data-tool-output]')).toContainText(hostile);
  expect(await page.locator('[data-tool-output] img, [data-tool-output] script').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__attack)).toBeUndefined();
  expect(outbound).toEqual([]);
});

test('evidence check separates supported, review and unknown evidence without a score', async ({ page }) => {
  await page.goto('/tools/resume-job-match/');
  await page.locator('#resume-text').fill('Customer Operations Specialist\nCoordinated onboarding with sales and support.\nBuilt Salesforce reports for weekly service reviews.');
  await page.locator('#job-description').fill('Responsibilities\nCoordinate onboarding across sales and support.\nRequired qualifications\nA bachelor degree is required.\nPreferred qualifications\nSQL experience preferred.');
  await page.getByRole('button', { name: 'Check the evidence' }).click();
  await expect(page.getByText('Clearly demonstrated', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Not demonstrated', { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-tool-results]')).not.toContainText(/ATS score|hiring probability|interview likelihood/i);
});

test('bullet checker keeps rewrites grounded and clears private state', async ({ page }) => {
  await page.goto('/tools/resume-bullet-checker/');
  const bullet = 'Responsible for coordinating onboarding with sales and support';
  await page.locator('#resume-bullet').fill(bullet);
  await page.getByRole('button', { name: 'Review this bullet' }).click();
  await expect(page.getByText('Stronger structure using only what you provided')).toBeVisible();
  await expect(page.locator('.structure-card')).toContainText('Coordinating onboarding with sales and support');
  await expect(page.locator('[data-tool-output]')).not.toContainText(/\d+%|increased by|reduced by/i);
  await page.getByRole('button', { name: 'Clear private text' }).click();
  await expect(page.locator('#resume-bullet')).toHaveValue('');
  await expect(page.locator('[data-tool-results]')).toBeHidden();
});
