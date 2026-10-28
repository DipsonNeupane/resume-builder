import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Match methodology is public, indexable, truthful and responsive', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 720 });
  const response = await page.goto('/features/match-methodology/', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('How Match compares a job and resume');
  await expect(page.getByText(/It does not mean the person lacks the skill/)).toBeVisible();
  await expect(page.getByText(/does not use a generative-AI model/)).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://apwico.com/features/match-methodology/',
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index/);
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('pricing limits paid availability without inventing provider behavior', async ({ page }) => {
  test.setTimeout(120_000);
  const response = await page.goto('/pricing/', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await expect(page.getByText(/New paid subscriptions are currently available only in the United States/).first()).toBeVisible();
  await expect(page.getByText(/presented and charged in United States dollars/)).toBeVisible();
  await expect(page.getByText(/tax-inclusive pricing and invoice availability are not promised/i)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
