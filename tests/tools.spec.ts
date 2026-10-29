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
  await expect(page.getByRole('alert')).toContainText('Paste more');

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
  await page.getByRole('button', { name: 'Compare my resume' }).click();
  await expect(page.getByText('Shown in your resume', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Not found in your resume', { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-tool-results]')).not.toContainText(/ATS score|hiring probability|interview likelihood/i);
});

test('public matcher does not turn headings, duties, or generic security overlap into qualification evidence', async ({ page }) => {
  await page.goto('/tools/resume-job-match/');
  await page.locator('#resume-text').fill(`Java Full Stack Developer
Built Java and Spring Boot services for secure financial applications.
Implemented application security controls and REST APIs with React.`);
  await page.locator('#job-description').fill(`Keyholder Full Time
**ESSENTIAL FUNCTIONS/DUTIES**
Notifies supervisor if major repairs are required.
**Essential Duties and Responsibilities:**
Serve customers and operate register.
**Required:**
Security clearance required.
Qualifications
2+ years of retail supervisory experience required.`);
  await page.getByRole('button', { name: 'Compare my resume' }).click();
  const output = page.locator('[data-tool-output]');
  await expect(output).not.toContainText(/ESSENTIAL FUNCTIONS|Essential Duties and Responsibilities|Required:\*\*|Qualifications/);
  await expect(output.locator('.evidence-result').filter({ hasText: 'Notifies supervisor' })).toContainText('Other details');
  await expect(output.locator('.evidence-result').filter({ hasText: 'Serve customers' })).toContainText('Other details');
  const clearance = output.locator('.evidence-result').filter({ hasText: 'Security clearance required' });
  await expect(clearance).toContainText('Required');
  await expect(clearance).toContainText('Not found in your resume');
  await expect(clearance).not.toContainText('Resume evidence to review');
});

test('evidence review qualifies only after a requirement result is genuinely viewed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.addInitScript(() => {
    (window as unknown as { nativeScrollIntoView: typeof Element.prototype.scrollIntoView }).nativeScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {};
  });
  await page.goto('/tools/resume-job-match/');
  await page.locator('#resume-text').fill('Customer Operations Specialist\nCoordinated onboarding with sales and support.\nBuilt Salesforce reports for weekly service reviews.');
  await page.locator('#job-description').fill('Responsibilities\nCoordinate onboarding across sales and support.\nRequired qualifications\nA bachelor degree is required.\nPreferred qualifications\nSQL experience preferred.');
  await page.getByRole('button', { name: 'Compare my resume' }).click();
  const results = page.locator('[data-tool-results]');
  await expect(results).toBeVisible();
  await expect(results).not.toHaveAttribute('data-review-scope', 'limited');
  await page.locator('.evidence-result').first().evaluate(node => {
    (window as unknown as { nativeScrollIntoView: typeof Element.prototype.scrollIntoView }).nativeScrollIntoView.call(node, { block: 'center' });
  });
  await expect(results).toHaveAttribute('data-review-scope', 'limited');
});

test('public evidence can continue with bounded job context without carrying resume text in URL or analytics', async ({ page }) => {
  test.slow();
  await page.goto('/tools/resume-job-match/');
  const privateResume = 'Private Resume Phrase\nCustomer support and Salesforce administration across distributed teams.';
  const job = 'Required qualifications\nSalesforce administration is required.\nPreferred qualifications\nSQL experience preferred.';
  await page.locator('#resume-text').fill(privateResume);
  await page.locator('#job-description').fill(job);
  await page.getByRole('button', { name: 'Compare my resume' }).click();
  await page.getByRole('link', { name: /Continue with full APWICO Match/ }).click();
  await expect(page).toHaveURL('/start/job');
  expect(page.url()).not.toContain('Salesforce');
  const continuation = await page.evaluate(() => sessionStorage.getItem('resumestride.pendingJobFirst.v1'));
  expect(JSON.parse(continuation!).capture.description).toBe(job);
  expect(continuation).not.toContain('Private Resume Phrase');
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

test('bullet checker does not turn vague input into a noun fragment and counters update', async ({ page }) => {
  await page.goto('/tools/resume-bullet-checker/');
  await page.locator('#resume-bullet').fill('Helped customers.');
  await expect(page.locator('[data-count-for="resume-bullet"]')).toContainText('17 / 600');
  await page.getByRole('button', { name: 'Review this bullet' }).click();
  await expect(page.locator('.dimension-card').filter({ hasText: 'Specificity' })).toContainText('Review');
  await expect(page.locator('.structure-card')).toContainText('There is not enough detail to suggest a stronger version yet.');
  await expect(page.locator('[data-tool-output]')).not.toContainText(/^Customers\.?$/);
});

test('extractor carries only the posting into same-tab comparison', async ({ page }) => {
 const posting = 'Strong written English is required. Candidates must build accessible React interfaces.';
 await page.goto('/tools/job-requirement-extractor/');
 await page.locator('#job-description').fill(posting);
 await page.getByRole('button', { name: 'Extract requirements' }).click();
 await page.getByRole('link', { name: 'Compare these requirements with your resume' }).click();
 await expect(page.locator('#job-description')).toHaveValue(posting);
 await expect(page.locator('#resume-text')).toHaveValue('');
 await page.getByRole('button', { name: 'Clear private text' }).click();
 await expect(page.locator('#job-description')).toHaveValue('');
});
