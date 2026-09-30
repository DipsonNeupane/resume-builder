import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { comparisons } from '../src/content/comparisons';
import { occupations } from '../src/content/occupations';

const paths = [
  '/occupations/',
  ...occupations.map(item => `/occupations/${item.slug}/`),
  '/regions/',
  '/compare/',
  ...comparisons.map(item => `/compare/${item.slug}/`),
];

test('G7 evidence pages are accessible and responsive at narrow and wide widths', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({ status: 204, contentType: 'text/javascript', body: '' }));
  const browserErrors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', error => browserErrors.push(error.message));
  for (const path of paths) {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${path} at ${width}px`).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const sizes = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(sizes.scroll, `${path} overflows at ${width}px`).toBeLessThanOrEqual(sizes.client);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations, path).toEqual([]);
  }
  expect(browserErrors).toEqual([]);
});
