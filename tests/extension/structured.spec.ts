import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ExtractResult } from '../../apps/extension/src/lib/types';
const job = { '@type': 'JobPosting', title: 'Care coordinator', hiringOrganization: { name: 'Example Health' }, description: '<p>Support patients worldwide.</p><script>window.hacked=true</script><img src="https://tracker.invalid/x">', jobLocation: { address: { addressLocality: 'Nairobi', addressCountry: 'KE' } }, jobLocationType: 'TELECOMMUTE', employmentType: 'FULL_TIME', baseSalary: { currency: 'KES', value: { minValue: 50000, maxValue: 70000, unitText: 'YEAR' } } };
for (const scenario of ['object','graph','array','multiple','malformed','oversize','wrong-url','linkedin','indeed','ziprecruiter','workday','workday-query','query-identity','fragment-identity','tracking']) test(`structured capture: ${scenario}`, async ({ page }) => {
  const url = scenario === 'linkedin' ? 'https://www.linkedin.com/jobs/view/software-engineer-at-example-123' : scenario === 'indeed' ? 'https://www.indeed.com/viewjob?jk=123' : scenario === 'ziprecruiter' ? 'https://www.ziprecruiter.com/Jobs/-in-Arlington,TX?lvk=abc123' : scenario.startsWith('workday') ? `https://example.wd1.myworkdayjobs.com/en-US/jobs/job/123${scenario === 'workday-query' ? '?source=careers' : ''}` : 'https://careers.example/job/123' + (scenario === 'query-identity' ? '?id=456' : scenario === 'fragment-identity' ? '#job-456' : scenario === 'tracking' ? '?utm_source=fixture' : '');
  const value = scenario === 'graph' ? { '@graph': [job] } : scenario === 'array' ? [job] : scenario === 'multiple' ? [job, { ...job, title: 'Other' }] : scenario === 'wrong-url' ? { ...job, url: 'https://careers.example/job/other' } : job;
  const json = scenario === 'malformed' ? '{bad' : scenario === 'oversize' ? ' '.repeat(262145) : JSON.stringify(value).replaceAll('</script>', '<\\/script>');
  // Fragments are document identity, never part of the HTTP request URL.
  const requestUrl = new URL(url); requestUrl.hash = '';
  await page.route(requestUrl.href, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<p>Unrelated private content: SECRET</p><script type="application/ld+json">${json}</script>` }));
  let tracker = 0; await page.route('https://tracker.invalid/**', route => { tracker++; return route.abort(); });
  await page.goto(url);
  await expect(page).toHaveURL(url);
  const result = await page.evaluate<ExtractResult>(await readFile('apps/extension/dist/inject/extract-job.js','utf8'));
  const detected = ['object','graph','array','linkedin','indeed','ziprecruiter','workday','workday-query','query-identity','tracking'].includes(scenario);
  expect(result.detected).toBe(detected);
  if (result.detected && ['linkedin','indeed','ziprecruiter'].includes(scenario)) {
    expect(result.capture).toMatchObject({ title: '', company: '', description: '', site: scenario });
  } else if (result.detected) {
    expect(result.capture).toMatchObject({ title: job.title, company: 'Example Health', description: 'Support patients worldwide.', location: 'Nairobi, KE', workplace: 'remote', employmentType: 'full_time', salary: { min: 50000, max: 70000, currency: 'KES', period: 'year' }, site: scenario.startsWith('workday') ? 'workday' : 'jsonld' });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    if (scenario === 'query-identity') expect(result.capture.sourceUrl).toContain('?id=456');
    else if (scenario === 'indeed') expect(result.capture.sourceUrl).toContain('?jk=123');
    else if (scenario === 'ziprecruiter') expect(result.capture.sourceUrl).toContain('?lvk=123');
    else expect(result.capture.sourceUrl).not.toContain('?');
    expect(result.capture.sourceUrl).not.toContain('#');
  }
  expect(tracker).toBe(0);
  expect(await page.evaluate(() => Reflect.get(window, 'hacked'))).toBeUndefined();
});

test('structured capture preserves multiple available locations and recognizes ATS provenance', async ({ page }) => {
  const variants = [
    ['https://jobs.ashbyhq.com/example/11111111-1111-1111-1111-111111111111?utm_source=test', 'ashby'],
    ['https://jobs.lever.co/example/11111111-1111-1111-1111-111111111111?lever-source=test', 'lever'],
  ] as const;
  for (const [url, site] of variants) {
    const value = { ...job, jobLocation: [job.jobLocation, { address: { addressLocality: 'Kampala', addressCountry: 'UG' } }], employmentType: ['OTHER', 'FULL_TIME'] };
    const json = JSON.stringify(value).replaceAll('</script>', '<\\/script>');
    await page.route(url, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<script type="application/ld+json">${json}</script>` }));
    await page.goto(url);
    const result = await page.evaluate<ExtractResult>(await readFile('apps/extension/dist/inject/extract-job.js','utf8'));
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.capture).toMatchObject({ site, location: 'Nairobi, KE; Kampala, UG', employmentType: 'full_time' });
  }
});

test('known job-board listings ask for an individual job while recognized details stay saveable without enrichment', async ({ page }) => {
  for (const [url, state] of [
    ['https://jobs.lever.co/example', 'open_detail'],
    ['https://jobs.ashbyhq.com/example', 'open_detail'],
    ['https://example.wd1.myworkdayjobs.com/en-US/jobs', 'open_detail'],
    ['https://job-boards.greenhouse.io/example', 'open_detail'],
    ['https://jobs.ashbyhq.com/example/11111111-1111-1111-1111-111111111111', 'detected'],
  ] as const) {
    await page.route(url, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>Public jobs</h1>' }));
    await page.goto(url);
    const result = await page.evaluate<ExtractResult>(await readFile('apps/extension/dist/inject/extract-job.js','utf8'));
    if (state === 'detected') expect(result).toMatchObject({ detected: true, capture: { site: 'ashby', title: '', description: '' } });
    else expect(result).toMatchObject({ detected: false, state });
  }
});

test('Lever scoped adapter captures only posting sections and rejects a lookalike host', async ({ page }) => {
  const html = '<div class="main-header-logo"><img alt="Example" /></div><div class="posting-headline"><h2>Mechanic</h2></div><div class="posting-categories"><span class="location">São Paulo</span></div><div class="section-wrapper"><div class="posting"><p>Maintain vehicles.</p><form>PRIVATE APPLICATION</form></div></div><aside>PRIVATE FOOTER</aside>';
  for (const host of ['jobs.lever.co','jobs.lever.co.evil.test']) {
    const url = `https://${host}/example/11111111-1111-1111-1111-111111111111`;
    await page.route(url, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })); await page.goto(url);
    const result = await page.evaluate<ExtractResult>(await readFile('apps/extension/dist/inject/extract-job.js','utf8'));
    expect(result.detected).toBe(host === 'jobs.lever.co');
    if (result.detected) expect(result.capture).toMatchObject({ title: 'Mechanic', company: 'Example', description: 'Maintain vehicles.', location: 'São Paulo', site: 'lever' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  }
});
