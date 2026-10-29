import { expect, test } from '@playwright/test'

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
 test(`APWICO identity is consistent in the ${viewport.name} public and workspace shell`, async ({ page }) => {
  await page.setViewportSize(viewport)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'APWICO home' })).toHaveText(/APWICO/)
  await expect(page.locator('body')).not.toContainText('ResumeStride')
  if (viewport.name === 'mobile') {
   const toggle = page.getByRole('button', { name: 'Toggle navigation' })
   await toggle.click()
   await expect(toggle).toHaveAttribute('aria-expanded', 'true')
   await page.keyboard.press('Escape')
   await expect(toggle).toBeFocused()
  }
  await page.goto('/start/build')
  await expect(page.getByRole('button', { name: 'APWICO home' })).toHaveText(/APWICO/)
  await expect(page.locator('body')).not.toContainText('ResumeStride')
 })
}
