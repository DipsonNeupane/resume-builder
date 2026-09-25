import { expect, test } from '@playwright/test';

test('public source documents, robots and sitemap are served with correct metadata', async ({ request, page }) => {
 // This shared source module is required by the development application graph.
 // A successful HTML response alone does not prove React can mount.
 const captureModule = await request.get('/apps/extension/src/lib/capture.ts');
 expect(captureModule.status()).toBe(200);
 expect(captureModule.headers()['content-type']).toContain('javascript');
 expect(await captureModule.text()).toContain('export');
 const robots = await request.get('/robots.txt'); expect(robots.status()).toBe(200); expect(await robots.text()).toContain('Sitemap: https://resumestride.com/sitemap.xml');
 const sitemap = await request.get('/sitemap.xml'); expect(sitemap.status()).toBe(200); expect((await sitemap.text()).match(/<loc>/g)).toHaveLength(3);
 for (const path of ['/', '/privacy.html', '/terms.html']) {
  const response = await request.get(path); expect(response.status()).toBe(200);
  // Development is always noindex, while public HTML is ready for the canonical host.
  expect(response.headers()['x-robots-tag']).toContain('noindex');
  expect(await response.text()).toContain(`rel="canonical" href="https://resumestride.com${path}"`);
  await page.goto(path);
  if (path === '/') await expect(page.getByRole('button', { name: 'Build my resume', exact: true }).first()).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://resumestride.com${path}`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /ResumeStride|resume/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
 }
});

test('editor, jobs, pro and callback states remove public canonical and structured data', async ({ page }) => {
 await page.goto('/');
 await expect(page.locator('script[data-seo-schema]')).toHaveCount(1);
 await page.getByRole('button', { name: 'Build my resume', exact: true }).first().click();
 await expect(page).toHaveTitle('Resume editor | ResumeStride');
 await expect(page.locator('link[rel="canonical"], script[data-seo-schema], meta[property="og:url"]')).toHaveCount(0);
 await page.getByRole('button', { name: 'Find jobs', exact: true }).first().click();
 await expect(page).toHaveTitle('Jobs and Match Analysis | ResumeStride');
 await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
 await page.getByRole('button', { name: 'ResumeStride home', exact: true }).click();
 await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
 await page.getByRole('button', { name: 'View Pro options', exact: true }).click();
 await expect(page).toHaveTitle('Pro options | ResumeStride');
 await expect(page.locator('link[rel="canonical"], script[data-seo-schema]')).toHaveCount(0);
 for (const suffix of ['?account=1', '?account=1&reset=1&code=fake', '#access_token=fake&type=recovery']) {
  await page.goto(`/${suffix}`);
  await expect(page).toHaveTitle('Account access | ResumeStride');
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
  await expect(page.getByRole('link', { name: 'ResumeStride home' })).toHaveAttribute('href', '/');
  await expect(page.locator('link[rel="canonical"],script[type="application/ld+json"]')).toHaveCount(0);
 }
 const alias = await request.get('/index.html?account=1', { maxRedirects: 0 });
 expect(alias.status()).toBe(308); expect(alias.headers().location).toBe('/?account=1');
});
