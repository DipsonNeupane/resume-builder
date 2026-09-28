import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { example } from '../src/model';

test('mobile navigation has sequential keyboard access, Escape, and destination focus', async ({ page, browserName }) => {
 const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
 await page.setViewportSize({ width: 320, height: 700 });
 await page.goto('/');
 await page.keyboard.press(tab);
 await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
 await page.keyboard.press(tab);
 await expect(page.getByRole('button', { name: 'ResumeStride home' })).toBeFocused();
 await page.keyboard.press(tab);
 const toggle = page.getByRole('button', { name: 'Toggle navigation' });
 await expect(toggle).toBeFocused();
 await expect(toggle).toHaveAttribute('aria-controls', 'main-navigation');
 await page.keyboard.press('Enter');
 await page.keyboard.press(tab);
 await expect(page.getByRole('link', { name: 'How it works' })).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(toggle).toBeFocused();
 await expect(toggle).toHaveAttribute('aria-expanded', 'false');
 await page.keyboard.press('Enter');
 await page.keyboard.press(tab);
 await page.keyboard.press(tab);
 await expect(page.getByRole('link', { name: 'Templates', exact: true })).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(toggle).toHaveAttribute('aria-expanded', 'false');
 await expect(page.locator('#templates')).toBeFocused();
 expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('sample dialog isolates focus, cycles both directions, and restores its opener', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: 'Build my master resume', exact: true }).first().click();
 const opener = page.getByRole('button', { name: 'View sample resume', exact: true });
 await opener.focus();
 await page.keyboard.press('Enter');
 const dialog = page.getByRole('dialog', { name: 'Sample resume' });
 const close = dialog.getByRole('button', { name: 'Close sample resume' });
 await expect(close).toBeFocused();
 for (const key of ['Tab', 'Shift+Tab', 'Tab']) {
  await page.keyboard.press(key);
  await expect(close).toBeFocused();
 }
 // Inert background cannot be focused even programmatically.
 await page.locator('.brand').evaluate((button: HTMLButtonElement) => button.focus());
 await expect(close).toBeFocused();
 expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(opener).toBeFocused();
 await page.keyboard.press('Enter');
 await close.click();
 await expect(opener).toBeFocused();
});

test('builder fields expose input purpose and a visible keyboard focus ring', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: 'Build my master resume', exact: true }).first().click();
 const name = page.getByRole('textbox', { name: 'Full name', exact: true });
 await expect(name).toHaveAttribute('autocomplete', 'name');
 for (const [key, type, autocomplete] of [['email', 'email', 'email'], ['phone', 'tel', 'tel'], ['website', 'url', 'url']]) {
  await expect(page.locator(`#field-${key}`)).toHaveAttribute('type', type);
  await expect(page.locator(`#field-${key}`)).toHaveAttribute('autocomplete', autocomplete);
 }
 await page.getByRole('button', { name: 'Next', exact: true }).click();
 await expect(name).toBeFocused();
 await expect(name).toHaveAttribute('aria-invalid', 'true');
 await expect(page.locator('#name-error')).toHaveAttribute('role', 'alert');
 await page.keyboard.press('Tab');
 await page.keyboard.press('Shift+Tab');
 const outline = await name.evaluate(node => {
  const style = getComputedStyle(node);
  return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, color: style.outlineColor };
 });
 expect(outline.width).toBeGreaterThanOrEqual(2);
 expect(outline.style).toBe('solid');
 // The Patina action colour (#ad521b): the ring must stay the brand's visible action colour.
 expect(outline.color).toBe('rgb(173, 82, 27)');
 expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('lazy route transitions focus the destination heading', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: 'View Pro options', exact: true }).click();
 await expect(page.getByRole('heading', { level: 1, name: 'A promising role. A considered application.' })).toBeFocused();
 await page.getByRole('button', { name: 'Sign in or create account' }).click();
 await expect(page.getByRole('heading', { level: 1, name: 'Make room for your next move.' })).toBeFocused();
});

test('delayed lazy route focuses only its loaded heading and cached routes still receive focus', async ({ page }) => {
 let releaseAccount!: () => void;
 const accountReady = new Promise<void>(resolve => { releaseAccount = resolve; });
 await page.route('**/src/features/auth/AuthPanel.tsx', async route => {
  await accountReady;
  await route.continue();
 });
 try {
  await page.goto('/');
  await page.getByRole('button', { name: 'View Pro options', exact: true }).click();
  const proHeading = page.getByRole('heading', { level: 1, name: 'A promising role. A considered application.' });
  await expect(proHeading).toBeFocused();
  await page.getByRole('button', { name: 'Sign in or create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Loading…' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Loading…' })).not.toBeFocused();
  await expect(proHeading).toBeHidden();
  releaseAccount();
  await expect(page.getByRole('heading', { level: 1, name: 'Make room for your next move.' })).toBeFocused();
  await page.getByRole('button', { name: 'Back to home', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stop searching everywhere. Start with jobs that fit your experience.', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Find opportunities', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Find jobs' })).toBeFocused();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stop searching everywhere. Start with jobs that fit your experience.', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'View Pro options', exact: true }).click();
  await expect(proHeading).toBeFocused();
  await page.getByRole('button', { name: 'Sign in or create account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Make room for your next move.' })).toBeFocused();
 } finally {
  releaseAccount();
 }
});

test('reduced motion applies to scripted download scrolling as well as CSS', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.addInitScript(draft => {
  sessionStorage.setItem('resumestride.resume.v1', JSON.stringify(draft));
  const original = Element.prototype.scrollIntoView;
  (window as unknown as { scrollBehaviors: unknown[] }).scrollBehaviors = [];
  Element.prototype.scrollIntoView = function(options) {
   (window as unknown as { scrollBehaviors: unknown[] }).scrollBehaviors.push(typeof options === 'object' ? options.behavior : 'auto');
   original.call(this, options);
  };
 }, example());
 await page.goto('/');
 await page.getByRole('button', { name: 'Build my master resume', exact: true }).first().click();
 await page.getByRole('button', { name: 'Design & format', exact: true }).click();
 await page.getByRole('button', { name: 'Confirm', exact: true }).click();
 await expect.poll(() => page.evaluate(() => (window as unknown as { scrollBehaviors: unknown[] }).scrollBehaviors)).toContain('instant');
 const behaviors = await page.evaluate(() => (window as unknown as { scrollBehaviors: unknown[] }).scrollBehaviors);
 expect(behaviors).not.toContain('smooth');
 expect(await page.locator('.progress-track span').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
 const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
 expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/);
});

for (const width of [320, 390, 768, 1920]) test(`long international content fits editor and preview at ${width}px`, async ({ page }) => {
 const draft = example();
 draft.name = 'أحمد'.repeat(20);
 draft.headline = '研究と教育'.repeat(20);
 draft.website = `https://example.com/${'portfolio'.repeat(25)}`;
 await page.setViewportSize({ width, height: 900 });
 await page.addInitScript(value => sessionStorage.setItem('resumestride.resume.v1', JSON.stringify(value)), draft);
 await page.goto('/');
 await page.getByRole('button', { name: 'Build my master resume', exact: true }).first().click();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.getByRole('button', { name: 'Preview resume', exact: true }).click();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await expect(page.locator('.paper-container .resume-paper').first()).toContainText(draft.name);
});
