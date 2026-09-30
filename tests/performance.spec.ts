import { test, expect } from '@playwright/test';

declare global {
 interface Window { __rsPerf: { lcp: number; cls: number; webglAt: number; fcp: number; idleAt: number } }
}

test.setTimeout(120_000);

test('homepage lab budgets cover LCP, layout shift, interaction response and deferred decoration', async ({ page }) => {
 await page.addInitScript(() => {
  window.__rsPerf = { lcp: 0, cls: 0, webglAt: 0, fcp: 0, idleAt: 0 };
  new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__rsPerf.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(list => { for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) window.__rsPerf.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') window.__rsPerf.fcp = entry.startTime; }).observe({ type: 'paint', buffered: true });
  const originalIdle = window.requestIdleCallback.bind(window);
  window.requestIdleCallback = (callback, options) => originalIdle(deadline => {
   if (!window.__rsPerf.idleAt) window.__rsPerf.idleAt = performance.now();
   callback(deadline);
  }, options);
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
   if (args[0] === 'webgl' && !window.__rsPerf.webglAt) window.__rsPerf.webglAt = performance.now();
   return original.apply(this, args) as ReturnType<typeof original>;
  } as typeof original;
 });
 await page.goto('/', { waitUntil: 'domcontentloaded' });
 await expect(page.locator('.pt-hero-title')).toBeVisible();
 await page.waitForLoadState('networkidle');
 await page.waitForTimeout(2200);
 await expect(page.locator('canvas[data-silk-mode="ready"]').first()).toBeAttached();
 const metrics = await page.evaluate(() => window.__rsPerf);
 expect(metrics.fcp, 'first contentful paint must be observed').toBeGreaterThan(0);
 expect(metrics.lcp, 'local lab LCP').toBeGreaterThan(0);
 expect(metrics.lcp, 'local lab LCP').toBeLessThanOrEqual(3000);
 expect(metrics.cls, 'local lab CLS').toBeLessThanOrEqual(0.1);
 expect(metrics.idleAt, 'idle callback must run before decoration').toBeGreaterThan(0);
 expect(metrics.webglAt, 'WebGL decoration must initialize in the normal lab profile').toBeGreaterThan(0);
 expect(metrics.webglAt, 'WebGL begins only after the idle callback').toBeGreaterThanOrEqual(metrics.idleAt);

 const start = Date.now();
 await page.getByRole('link', { name: 'Compare my resume with a job', exact: true }).first().click();
 await expect(page).toHaveURL(/\/tools\/resume-job-match\/$/);
 expect(Date.now() - start, 'primary CTA response').toBeLessThanOrEqual(1000);
});

test('data-saver devices retain a complete homepage without initializing WebGL', async ({ page }) => {
 await page.addInitScript(() => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => 8 });
  Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ saveData: true }) });
  const original = HTMLCanvasElement.prototype.getContext;
  (window as typeof window & { __webglCalls?: number }).__webglCalls = 0;
  HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
   if (args[0] === 'webgl') (window as typeof window & { __webglCalls?: number }).__webglCalls! += 1;
   return original.apply(this, args) as ReturnType<typeof original>;
  } as typeof original;
 });
 await page.goto('/', { waitUntil: 'domcontentloaded' });
 await expect(page.locator('.pt-hero-title')).toBeVisible();
 await expect(page.locator('canvas[data-silk-mode="static-low-power"]').first()).toBeAttached();
 expect(await page.evaluate(() => (window as typeof window & { __webglCalls?: number }).__webglCalls)).toBe(0);
 await expect(page.getByRole('link', { name: 'Compare my resume with a job', exact: true }).first()).toBeVisible();
});

test('reduced motion renders decoration without leaving an animation loop running', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.addInitScript(() => {
  (window as typeof window & { __draws?: number }).__draws = 0;
  const original = WebGLRenderingContext.prototype.drawArrays;
  WebGLRenderingContext.prototype.drawArrays = function (...args: Parameters<typeof original>) {
   (window as typeof window & { __draws?: number }).__draws! += 1;
   return original.apply(this, args);
  };
 });
 await page.goto('/', { waitUntil: 'domcontentloaded' });
 await expect(page.locator('canvas[data-silk-mode="ready"]').first()).toBeAttached({ timeout: 10_000 });
 await page.waitForTimeout(500);
 const before = await page.evaluate(() => (window as typeof window & { __draws?: number }).__draws ?? 0);
 await page.waitForTimeout(1000);
 const after = await page.evaluate(() => (window as typeof window & { __draws?: number }).__draws ?? 0);
 expect(before).toBeGreaterThan(0);
 expect(after).toBe(before);
});
