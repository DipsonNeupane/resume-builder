import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
 test(`homepage decision step uses accessible dark text at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const result = await page.locator('.pt-story-decision').evaluate(panel => {
   const channels = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
   const luminance = (value: string) => {
    const rgb = channels(value).map(channel => channel / 255).map(channel =>
     channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
   };
   const background = getComputedStyle(panel).backgroundColor;
   return [...panel.querySelectorAll('.pt-story-number, small, div > span:last-child')].map(node => {
    const style = getComputedStyle(node);
    const light = Math.max(luminance(background), luminance(style.color));
    const dark = Math.min(luminance(background), luminance(style.color));
    return { contrast: (light + 0.05) / (dark + 0.05), color: style.color, border: style.borderColor };
   });
  });

  expect(result).toHaveLength(3);
  expect(result.every(item => item.contrast >= 4.5)).toBe(true);
  expect(result[0].border).toBe(result[0].color);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
 });
}
