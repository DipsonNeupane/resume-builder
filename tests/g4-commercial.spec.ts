import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public pricing presents all access paths, cancellation and export policy before purchase', async ({ page }) => {
 await page.goto('/pricing/');
 await expect(page.getByRole('heading', { level: 1 })).toContainText('Preview first');
 const plans = page.locator('.pricing-grid article');
 await expect(plans).toHaveCount(3);
 await expect(plans.nth(0)).toContainText('No subscription');
 await expect(plans.nth(1)).toContainText('US$1.99');
 await expect(plans.nth(1)).toContainText('Paid subscriptions renew monthly until cancelled');
 await expect(plans.nth(2)).toContainText('US$19.99');
 await expect(page.getByRole('heading', { name: 'A monthly subscription for one selected design' })).toBeVisible();
 await expect(page.getByText(/After an individual Premium-template subscription expires/)).toBeVisible();
 await expect(page.getByText(/Word \(.docx\) is a clean, editable content document/)).toBeVisible();
 await expect(page.getByText(/Downloads require a signed-in account and explicit consent/)).toBeVisible();
 expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('trust page publishes factual boundaries and no fabricated customer proof', async ({ page }) => {
 await page.goto('/trust/');
 await expect(page).toHaveTitle('How ResumeStride earns trust');
 await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://resumestride.com/trust/');
 await expect(page.getByRole('heading', { name: 'No customer stories are published yet.' })).toBeVisible();
 await expect(page.locator('blockquote')).toHaveCount(0);
 await expect(page.getByText(/does not decide whether you should apply/)).toBeVisible();
 await expect(page.getByText(/does not rewrite the master resume/)).toBeVisible();
 expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('Premium template choice keeps preview separate for a signed-out visitor', async ({ page }) => {
 await page.goto('/start/build');
 await page.getByRole('button', { name: 'Start building' }).click();
 await page.getByRole('button', { name: /Templates/ }).click();
 const premium = page.locator('.template-picker-card').filter({ hasText: 'Boardroom' });
 await premium.getByRole('button', { name: 'Unlock for $1.99/month' }).click();
 const dialog = page.getByRole('dialog');
 await expect(dialog).toContainText('recurring subscription, not a one-time purchase');
 await expect(dialog).toContainText('Free');
 await expect(dialog).toContainText('One design');
 await expect(dialog).toContainText('Pro');
 await expect(dialog.getByRole('checkbox')).toHaveCount(0);
 await expect(dialog.getByRole('button', { name: 'Sign in to unlock' })).toBeVisible();
 await expect(dialog.getByRole('button', { name: 'Keep previewing — no purchase' })).toBeVisible();
 await expect(dialog.getByRole('link', { name: /Compare every access path/ })).toHaveAttribute('href', '/pricing/');
 expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('commercial pages expose a working keyboard skip path', async ({ page }) => {
 for (const path of ['/pricing/', '/trust/']) {
  await page.goto(path);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
 }
});

test('pricing and trust remain usable without overflow at narrow width', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 720 });
 for (const path of ['/pricing/', '/trust/']) {
  await page.goto(path);
  const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
 }
});
