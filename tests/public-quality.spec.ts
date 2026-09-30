import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { publicPages } from '../src/seo/policy';

const paths = Object.keys(publicPages);
const viewports = [
  { width: 320, height: 720 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

test('every public page is quiet, accessible and free of horizontal overflow', async ({ page, baseURL }) => {
  // The source-owned public registry intentionally grows as reviewed evergreen
  // pages are added. Keep one serial browser so console/overflow failures retain
  // route context, but give the complete 3-viewport + axe matrix a bounded budget.
  test.setTimeout(240_000);
  const failures: string[] = [];
  const origin = new URL(baseURL!).origin;
  let activePath = '/';

  // Vercel supplies this path only in the hosted runtime. Stub that exact
  // content-free platform script so local checks still fail on every app asset.
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({
    status: 204,
    contentType: 'text/javascript',
    body: '',
  }));
  await page.route('**/_vercel/speed-insights/script.js', route => route.fulfill({
    status: 204,
    contentType: 'text/javascript',
    body: '',
  }));

  page.on('console', message => {
    if (message.type() === 'error') failures.push(`${activePath}: console ${message.text()}`);
  });
  page.on('pageerror', error => failures.push(`${activePath}: pageerror ${error.message}`));
  page.on('requestfailed', request => {
    if (new URL(request.url()).origin === origin) failures.push(`${activePath}: requestfailed ${request.url()}`);
  });
  page.on('response', response => {
    if (new URL(response.url()).origin === origin && response.status() >= 400) {
      failures.push(`${activePath}: ${response.status()} ${response.url()}`);
    }
  });

  for (const path of paths) {
    activePath = path;
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const response = await page.goto(path);
      expect(response?.status(), `${path} at ${viewport.width}px`).toBe(200);
      await expect(page.getByRole('heading', { level: 1 }).first(), `${path} must expose a primary heading`).toBeVisible();
      const widths = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(widths.scroll, `${path} overflows at ${viewport.width}px`).toBeLessThanOrEqual(widths.client);
    }
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations, `${path}: ${accessibility.violations.map(item => item.id).join(', ')}`).toEqual([]);
  }

  expect(failures).toEqual([]);
});
