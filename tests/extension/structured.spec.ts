import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ExtractResult } from '../../apps/extension/src/lib/types';
const job = { '@type': 'JobPosting', title: 'Care coordinator', hiringOrganization: { name: 'Example Health' }, description: '<p>Support patients worldwide.</p><script>window.hacked=true</script><img src="https://tracker.invalid/x">', jobLocation: { address: { addressLocality: 'Nairobi', addressCountry: 'KE' } }, jobLocationType: 'TELECOMMUTE', employmentType: 'FULL_TIME', baseSalary: { currency: 'KES', value: { minValue: 50000, maxValue: 70000, unitText: 'YEAR' } } };
for (const scenario of ['object','graph','array','multiple','malformed','oversize','wrong-url','linkedin','indeed','workday','query-identity','fragment-identity','tracking']) test(`structured capture: ${scenario}`, async ({ page }) => {
  const url = scenario === 'linkedin' ? 'https://www.linkedin.com/jobs/view/123' : scenario === 'indeed' ? 'https://www.indeed.com/viewjob' : scenario === 'workday' ? 'https://example.wd1.myworkdayjobs.com/en-US/jobs/job/123' : 'https://careers.example/job/123' + (scenario === 'query-identity' ? '?id=456' : scenario === 'fragment-identity' ? '#job-456' : scenario === 'tracking' ? '?utm_source=fixture' : '');
  const value = scenario === 'graph' ? { '@graph': [job] } : scenario === 'array' ? [job] : scenario === 'multiple' ? [job, { ...job, title: 'Other' }] : scenario === 'wrong-url' ? { ...job, url: 'https://careers.example/job/other' } : job;
  const json = scenario === 'malformed' ? '{bad' : scenario === 'oversize' ? ' '.repeat(262145) : JSON.stringify(value).replaceAll('</script>', '<\\/script>');
  // Fragments are document identity, never part of the HTTP request URL.
  const requestUrl = new URL(url); requestUrl.hash = '';
  await page.route(requestUrl.href, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<p>Unrelated private content: SECRET</p><script type="application/ld+json">${json}</script>` }));
  let tracker = 0; await page.route('https://tracker.invalid/**', route => { tracker++; return route.abort(); });
  await page.goto(url);
  await expect(page).toHaveURL(url);
  const result = await page.evaluate<ExtractResult>(await readFile('apps/extension/dist/inject/extract-job.js','utf8'));
  const supported = ['object','graph','array','workday','tracking'].includes(scenario);
  expect(result.supported).toBe(supported);
  if (result.supported) {
    expect(result.capture).toMatchObject({ title: job.title, company: 'Example Health', description: 'Support patients worldwide.', location: 'Nairobi, KE', workplace: 'remote', employmentType: 'full_time', salary: { min: 50000, max: 70000, currency: 'KES', period: 'year' }, site: 'jsonld' });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(result.capture.sourceUrl).not.toContain('?');
    expect(result.capture.sourceUrl).not.toContain('#');
  }
  expect(tracker).toBe(0);
  expect(await page.evaluate(() => Reflect.get(window, 'hacked'))).toBeUndefined();
});

test('Lever scoped adapter captures only posting sections and rejects a lookalike host', async ({ page }) => {
  const html = '<div class="main-header-logo"><img alt="Example" /></div><div class="posting-headline"><h2>Mechanic</h2></div><div class="posting-categories"><span class="location">São Paulo</span></div><div class="section-wrapper"><div class="posting"><p>Maintain vehicles.</p><form>PRIVATE APPLICATION</form></div></div><aside>PRIVATE FOOTER</aside>';
  for (const host of ['jobs.lever.co','jobs.lever.co.evil.test']) {
    const url = `https://${host}/example/11111111-1111-1111-1111-111111111111`;
    await page.route(url, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })); await page.goto(url);
    const result = await page.evaluate<ExtractResult>(await readFile('apps/extension/dist/inject/extract-job.js','utf8'));
    expect(result.supported).toBe(host === 'jobs.lever.co');
    if (result.supported) expect(result.capture).toMatchObject({ title: 'Mechanic', company: 'Example', description: 'Maintain vehicles.', location: 'São Paulo', site: 'lever' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  }
});
