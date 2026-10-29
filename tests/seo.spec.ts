import { expect, test } from '@playwright/test';
import { publicPages } from '../src/seo/policy';

test('public source documents, robots and sitemap are served with correct metadata', async ({ request, page }) => {
 // This shared source module is required by the development application graph.
 // A successful HTML response alone does not prove React can mount.
 const captureModule = await request.get('/apps/extension/src/lib/capture.ts');
 expect(captureModule.status()).toBe(200);
 expect(captureModule.headers()['content-type']).toContain('javascript');
 expect(await captureModule.text()).toContain('export');
 const robots = await request.get('/robots.txt'); expect(robots.status()).toBe(200); expect(await robots.text()).toContain('Sitemap: https://apwico.com/sitemap.xml');
 const sitemap = await request.get('/sitemap.xml'); expect(sitemap.status()).toBe(200); expect((await sitemap.text()).match(/<loc>/g)).toHaveLength(Object.keys(publicPages).length);
 for (const path of Object.keys(publicPages)) {
  const response = await request.get(path); expect(response.status()).toBe(200);
  // Development is always noindex, while public HTML is ready for the canonical host.
  expect(response.headers()['x-robots-tag']).toContain('noindex');
  expect(await response.text()).toContain(`rel="canonical" href="https://apwico.com${path}"`);
  await page.goto(path);
  if (path === '/') await expect(page.getByRole('button', { name: 'Build my master resume', exact: true }).first()).toBeVisible();
  if (path === '/resources/') await expect(page.getByRole('heading', { level: 1, name: 'Job search and resume guides' })).toBeVisible();
  if (path.startsWith('/resources/') && path !== '/resources/') await expect(page.locator('article.article-body')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://apwico.com${path}`);
  expect((await page.locator('meta[name="description"]').getAttribute('content'))?.length).toBeGreaterThan(60);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
 }
});

test('editor, jobs, pro and callback states remove public canonical and structured data', async ({ page }) => {
 await page.goto('/');
 await expect(page.locator('script[data-seo-schema]')).toHaveCount(1);
 await page.goto('/workspace/resume');
 await expect(page).toHaveTitle('Resume editor | APWICO');
 await expect(page.locator('link[rel="canonical"], script[data-seo-schema], meta[property="og:url"]')).toHaveCount(0);
 await page.getByRole('button', { name: 'Find jobs', exact: true }).first().click();
 await expect(page).toHaveTitle('Discover jobs | APWICO');
 await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
 await page.getByRole('button', { name: 'APWICO home', exact: true }).click();
 // A tab that entered through a private route remains privacy-tainted until a
 // fresh public navigation, so private metadata cannot leak into attribution.
 await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
 await page.goto('/');
 await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
 await page.getByRole('button', { name: 'View Pro options', exact: true }).click();
 await expect(page).toHaveTitle('Pro options | APWICO');
 await expect(page.locator('link[rel="canonical"], script[data-seo-schema]')).toHaveCount(0);
 for (const suffix of ['?account=1', '?account=1&reset=1&code=fake', '#access_token=fake&type=recovery']) {
  await page.goto(`/${suffix}`);
  await expect(page).toHaveTitle('Account access | APWICO');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel="canonical"], script[data-seo-schema], meta[property="og:url"]')).toHaveCount(0);
  expect(await page.locator('head').innerHTML()).not.toContain('fake');
 }
});

test('unknown paths return an actual 404 and a usable public link, not the SPA home', async ({ page, request }) => {
 for (const path of ['/not-a-page', '/account', '/jobs/private', '/privacy.html/']) {
  const response = await page.goto(path); expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('link', { name: 'APWICO home' })).toHaveAttribute('href', '/');
  await expect(page.locator('link[rel="canonical"],script[type="application/ld+json"]')).toHaveCount(0);
 }
 const alias = await request.get('/index.html?account=1', { maxRedirects: 0 });
 expect(alias.status()).toBe(308); expect(alias.headers().location).toBe('/?account=1');
});
