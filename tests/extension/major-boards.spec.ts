import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ExtractResult } from '../../apps/extension/src/lib/types';

const script = () => readFile('apps/extension/dist/inject/extract-job.js', 'utf8');

test('LinkedIn search pages do not scrape listings or selected job cards', async ({ page }) => {
  const url = 'https://www.linkedin.com/jobs/search/?currentJobId=1234567890';
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: `<main class="scaffold-layout__main"><section class="jobs-search__job-details--container"><a href="/jobs/view/1234567890/">job</a><h1>Backend Engineer</h1><div>Example Labs</div><div>Build Java services.</div></section></main>` }));
  await page.goto(url);
  const result = await page.evaluate<ExtractResult>(await script());
  expect(result.detected).toBe(false);
  if (!result.detected) expect(result.canConfirm).toBe(true);
  expect(JSON.stringify(result)).not.toContain('Backend Engineer');
  expect(JSON.stringify(result)).not.toContain('Example Labs');
  expect(JSON.stringify(result)).not.toContain('Build Java services');
});

test('LinkedIn job detail URLs are saved without reading page content', async ({ page }) => {
  const url = 'https://www.linkedin.com/jobs/view/backend-engineer-1234567890/';
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<main><h1>Backend Engineer</h1><div>Example Labs</div><div>Private posting text</div></main>' }));
  await page.goto(url);
  const result = await page.evaluate<ExtractResult>(await script());
  expect(result.detected).toBe(true);
  if (result.detected) {
    expect(result.capture.site).toBe('linkedin');
    expect(result.capture.sourceUrl).toBe(url.replace(/\/$/, ''));
    expect(result.capture.description).toBe('');
  }
  expect(JSON.stringify(result)).not.toContain('Private posting text');
  expect(JSON.stringify(result)).not.toContain('Example Labs');
});

for (const query of ['jk=abc123DEF', 'vjk=abc123DEF']) test(`Indeed ${query.split('=')[0]} saves the stable URL only`, async ({ page }) => {
  const url = `https://www.indeed.com/viewjob?${query}`;
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<main><h1>Software Engineer</h1><div>Example</div><div>Private posting text</div></main>' }));
  await page.goto(url);
  const result = await page.evaluate<ExtractResult>(await script());
  expect(result.detected).toBe(true);
  if (result.detected) {
    expect(result.capture.site).toBe('indeed');
    expect(result.capture.sourceUrl).toBe(`https://www.indeed.com/viewjob?${query}`);
    expect(result.capture.description).toBe('');
  }
  expect(JSON.stringify(result)).not.toContain('Private posting text');
  expect(JSON.stringify(result)).not.toContain('Software Engineer');
});

test('restricted-board details never use selected text or structured data as a bypass', async ({ page }) => {
  for (const url of ['https://www.linkedin.com/jobs/view/1234567890/', 'https://www.indeed.com/viewjob?jk=abc123DEF']) {
    await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<p id="wanted">Selected description must not be read.</p><script type="application/ld+json">{"@type":"JobPosting","title":"Hidden","hiringOrganization":{"name":"Hidden"},"description":"Hidden description"}</script>' }));
    await page.goto(url);
    await page.locator('#wanted').selectText();
    const result = await page.evaluate<ExtractResult>(await script());
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.capture.description).toBe('');
    expect(JSON.stringify(result)).not.toContain('Selected description');
    expect(JSON.stringify(result)).not.toContain('Hidden');
    await page.unroute(url);
  }
});

test('an Indeed lookalike is not treated as an Indeed detail page', async ({ page }) => {
  const url = 'https://indeed.com.evil.test/viewjob?jk=abc123DEF';
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<main><h1>Fake</h1><div>Not a supported host.</div></main>' }));
  await page.goto(url);
  const result = await page.evaluate<ExtractResult>(await script());
  // A generic page may be confirmable, but the lookalike must not trigger
  // Indeed's restricted URL-only capture path.
  if (result.detected) expect(result.capture.site).not.toBe('indeed');
  expect(JSON.stringify(result)).not.toContain('Not a supported host.');
});

test('ordinary-page selections are not imported into a job capture', async ({ page }) => {
  const url = 'https://jobs.example/role';
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<h1>Design role</h1><p id="wanted">Design accessible product systems for global users.</p><p>PRIVATE UNRELATED PROFILE</p>' }));
  await page.goto(url);
  await page.locator('#wanted').selectText();
  const result = await page.evaluate<ExtractResult>(await script());
  expect(result.detected).toBe(false);
  if (!result.detected) expect(result.canConfirm).toBe(true);
  expect(JSON.stringify(result)).not.toContain('accessible product');
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});

test('ambiguous duplicate structured postings are never auto-captured', async ({ page }) => {
  const base = { '@type': 'JobPosting', title: 'Researcher', hiringOrganization: { name: 'Institute' }, description: 'Conduct careful field research.', url: 'https://careers.example/job/one' };
  for (const data of [[base, base], [base, { ...base, title: 'Chef' }]]) {
    const url = 'https://careers.example/job/one';
    await page.route(url, route => route.fulfill({ contentType: 'text/html', body: `<script type="application/ld+json">${JSON.stringify(data)}</script>` }));
    await page.goto(url);
    const result = await page.evaluate<ExtractResult>(await script());
    expect(result.detected).toBe(false);
    expect(JSON.stringify(result)).not.toContain('Researcher');
    expect(JSON.stringify(result)).not.toContain('Chef');
    await page.unroute(url);
  }
});
