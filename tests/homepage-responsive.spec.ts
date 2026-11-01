import { expect, test } from '@playwright/test';

test('homepage hero headline stays inside its copy column from phone to desktop', async ({ page }) => {
 for (const width of [390, 1024, 1280, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  await expect(page.locator('.pt-hero-title')).toBeVisible();
  const bounds = await page.locator('.pt-hero-title > span').nth(2).evaluate(element => {
   const range = document.createRange();
   range.selectNodeContents(element);
   const text = range.getBoundingClientRect();
   const copy = element.closest('.pt-hero-copy')!.getBoundingClientRect();
   return { textRight: text.right, copyRight: copy.right };
  });
  expect(bounds.textRight, `headline overflow at ${width}px`).toBeLessThanOrEqual(bounds.copyRight + 1);
 }
});
