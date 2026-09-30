import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { comparisonEvidence, comparisonResearchQueue } from '../../src/content/comparisonEvidence';
import { clusterByGuideSlug, contentClusters, guides } from '../../src/content/guides';
import { searchHubs } from '../../src/content/searchHubs';
import { publicPages, requestSeo } from '../../src/seo/policy';

const read = (file: string) => readFileSync(file, 'utf8');

test('seven content clusters cover every guide exactly once and follow the audience problems', () => {
  assert.equal(contentClusters.length, 7);
  assert.equal(clusterByGuideSlug.size, guides.length);
  assert.deepEqual([...clusterByGuideSlug.keys()].sort(), guides.map(guide => guide.slug).sort());
  const questions = contentClusters.map(cluster => cluster.question).join(' ');
  for (const phrase of ['qualified', 'demonstrate', 'worth applying', 'missing or unclear', 'tailor']) {
    assert.match(questions, new RegExp(phrase, 'i'));
  }
  for (const guide of guides) {
    assert.ok(guide.sections.length >= 5, guide.slug);
    assert.ok(guide.directAnswer.length >= 100, guide.slug);
    const metadata = publicPages[`/resources/${guide.slug}/` as keyof typeof publicPages];
    assert.ok(metadata, `${guide.slug} is missing middleware metadata`);
    assert.equal(metadata.title, guide.seoTitle);
    assert.equal(metadata.description, guide.description);
  }
});

test('occupation and comparison hubs are useful but suppress unsupported page expansion', () => {
  assert.deepEqual(searchHubs.map(hub => hub.path), ['/occupations/', '/compare/']);
  for (const hub of searchHubs) {
    assert.ok(Object.hasOwn(publicPages, hub.path));
    const html = read(`public${hub.path}index.html`);
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.ok(html.length > 5000, `${hub.path} must be substantive`);
    assert.match(html, /data-content-cta=/);
  }
  const occupations = read('public/occupations/index.html');
  assert.match(occupations, /not demand-ranked/i);
  assert.match(occupations, /individual occupation pages remain withheld/i);
  assert.doesNotMatch(occupations, /guarantee|best occupation|global demand/i);
  const comparison = read('public/compare/index.html');
  assert.match(comparison, /30 days/);
  assert.match(comparison, /90 days/);
  assert.match(comparison, /No named competitor comparison is currently published/);
  for (const vendor of [...new Set([...comparisonEvidence, ...comparisonResearchQueue].map(item => item.vendor))]) {
    assert.doesNotMatch(comparison, new RegExp(vendor, 'i'));
    assert.equal(Object.keys(publicPages).some(path => path.startsWith(`/compare/${vendor.toLowerCase()}`)), false);
  }
});

test('regional guidance keeps primary sources, dates and jurisdiction boundaries visible', () => {
  const html = read('public/resources/resume-or-cv-by-country/index.html');
  for (const host of ['nationalcareers.service.gov.uk', 'europass.europa.eu', 'jobbank.gc.ca', 'workforceaustralia.gov.au', 'careers.govt.nz']) {
    assert.ok(html.includes(host), host);
  }
  assert.match(html, /checked on 30 September 2026/i);
  assert.match(html, /No country is one hiring market/i);
  assert.match(html, /does not claim complete coverage/i);
});

test('search routes retain canonical public and content-free query privacy boundaries', () => {
  for (const path of ['/occupations/', '/compare/', ...guides.map(guide => `/resources/${guide.slug}/`)]) {
    const clean = requestSeo(new URL(path, 'https://resumestride.com'), true);
    assert.equal(clean.status, 0);
    assert.equal(clean.headers['X-Robots-Tag'], undefined);
    const query = requestSeo(new URL(`${path}?query=private`, 'https://resumestride.com'), true);
    assert.equal(query.headers['X-Robots-Tag'], 'noindex, nofollow, noarchive');
    assert.equal(query.headers['Cache-Control'], 'private, no-store');
  }
});

test('search review process is repeatable without fabricated results', () => {
  const process = read('docs/redesign/SEARCH_PERFORMANCE_REVIEW.md');
  const template = read('docs/redesign/search-performance-review-template.csv').trim().split('\n');
  assert.equal(template.length, 1, 'Dry-run template must not contain invented observations.');
  for (const boundary of ['Search Console', 'qualified requirement-level evidence reviews', 'unavailable—not zero', 'never place pasted resume/job content']) {
    assert.match(process, new RegExp(boundary, 'i'));
  }
  assert.match(process, /VALIDATION PENDING/);
});
