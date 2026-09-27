import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { guides } from '../src/content/guides';

const paths = ['/resources/', ...guides.map(guide => `/resources/${guide.slug}/`)];
const viewports = [
 { width: 1920, height: 1080 },
 { width: 1366, height: 900 },
 { width: 390, height: 844 },
 { width: 320, height: 720 },
];

test('resource hub and all guides are responsive without horizontal overflow', async ({ page }) => {
 for (const viewport of viewports) {
  await page.setViewportSize(viewport);
  for (const path of paths) {
   await page.goto(path);
   await expect(page.locator('h1')).toHaveCount(1);
   const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
   expect(overflow.scroll, `${path} at ${viewport.width}px`).toBeLessThanOrEqual(overflow.client);
  }
 }
});

test('resource pages meet automated accessibility checks', async ({ page }) => {
 await page.setViewportSize({ width: 1366, height: 900 });
 for (const path of paths) {
  await page.goto(path);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, `${path}: ${results.violations.map(item => item.id).join(', ')}`).toEqual([]);
 }
});
