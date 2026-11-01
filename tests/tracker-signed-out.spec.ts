import { expect, test } from '@playwright/test';

test('signed-out Today and My applications explain their own purpose without resume download controls', async ({ page }) => {
  await page.goto('/workspace/today');
  const today = page.locator('.tracker');
  await expect(today.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(today.getByText('See which recorded next steps are due, coming up or waiting across your applications.')).toBeVisible();
  await expect(today.getByText('Keep every application, stage and next step in one private list.')).toHaveCount(0);
  await expect(today.getByText('Sign in to track applications.')).toBeVisible();
  await expect(page.locator('.header-download')).toHaveCount(0);

  await page.goto('/workspace/applications');
  const applications = page.locator('.tracker');
  await expect(applications.getByRole('heading', { level: 1, name: 'My applications' })).toBeVisible();
  await expect(applications.getByText('Keep every application, stage and next step in one private list.')).toBeVisible();
  await expect(page.locator('.header-download')).toHaveCount(0);

  // The resume workspace keeps its document download entry point.
  await page.goto('/workspace/resume');
  await expect(page.locator('.header-download')).toBeVisible();
});
