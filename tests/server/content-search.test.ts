import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { comparisons, evidenceIsCurrent } from '../../src/content/comparisons';
import { clusterByGuideSlug, contentClusters, guides } from '../../src/content/guides';
import { searchHubs } from '../../src/content/searchHubs';
import { occupations } from '../../src/content/occupations';
import { regionalGuidance } from '../../src/content/regionalGuidance';
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

test('occupation, regional and comparison research has bounded, substantive public routes', () => {
  assert.deepEqual(searchHubs.map(hub => hub.path), ['/occupations/', '/regions/', '/compare/']);
  for (const hub of searchHubs) {
    assert.ok(Object.hasOwn(publicPages, hub.path));
    const html = read(`public${hub.path}index.html`);
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.ok(html.length > 5000, `${hub.path} must be substantive`);
    assert.match(html, /data-content-cta=/);
  }
  const occupationHub = read('public/occupations/index.html');
  assert.match(occupationHub, /not a private-demand ranking/i);
  assert.doesNotMatch(occupationHub, /guarantee|best occupation|global demand/i);
  const comparison = read('public/compare/index.html');
  assert.match(comparison, /30 days/);
  assert.match(comparison, /90 days/);
  assert.match(comparison, /Named comparisons that passed/i);
  for (const item of comparisons) {
    assert.match(comparison, new RegExp(item.vendor.replace('.', '\\.'), 'i'));
    assert.ok(Object.hasOwn(publicPages, `/compare/${item.slug}/`));
    const detail = read(`public/compare/${item.slug}/index.html`);
    assert.match(detail, /No winner and no private-system claims/i);
    assert.match(detail, /checked 2026-09-30/i);
    assert.match(detail, /href="\/privacy\.html"/);
    assert.match(detail, /href="\/terms\.html"/);
    assert.match(detail, /aria-current="page"/);
  }
  assert.match(read('public/compare/jobscan/index.html'), /pricing.*not established|not established.*pricing/is);
});

test('evidence freshness rejects a passed review deadline', () => {
  assert.equal(evidenceIsCurrent('2026-10-30', '2026-10-30'), true);
  assert.equal(evidenceIsCurrent('2026-10-30', '2026-10-31'), false);
});

test('first occupation portfolio is diverse, sourced and evidence-led', () => {
  assert.equal(occupations.length, 9);
  assert.equal(new Set(occupations.map(item => item.category)).size, 9);
  for (const item of occupations) {
    assert.ok(item.sources.length > 0);
    assert.ok(Object.hasOwn(publicPages, `/occupations/${item.slug}/`));
    const html = read(`public/occupations/${item.slug}/index.html`);
    for (const phrase of ['Direct evidence', 'Worth reviewing', 'Not demonstrated', 'fictional', 'checked 2026-09-30']) assert.match(html, new RegExp(phrase, 'i'));
    assert.doesNotMatch(html, /guaranteed qualification|guaranteed interview|guaranteed hiring/i);
  }
});

test('regional guidance keeps primary sources, dates and jurisdiction boundaries visible', () => {
  const html = read('public/resources/resume-or-cv-by-country/index.html');
  assert.match(html, /href="\/regions\/"/);
  assert.match(html, /maintained source summaries/i);
  assert.match(html, /No country is one hiring market/i);
  assert.match(html, /does not claim complete coverage/i);
});

test('regional matrix records verified claims and explicit unknowns without IP inference', () => {
  const html = read('public/regions/index.html');
  assert.ok(regionalGuidance.length >= 5);
  for (const region of regionalGuidance) {
    assert.match(html, new RegExp(region.place.replace('/', '\\/'), 'i'));
    for (const source of region.sources) assert.ok(html.includes(source.url));
  }
  assert.match(html, /Not established by this source/i);
  assert.match(html, /not location detection|not the visitor.s IP/i);
});

test('search routes retain canonical public and content-free query privacy boundaries', () => {
  for (const path of ['/occupations/', '/regions/', '/compare/', ...occupations.map(item => `/occupations/${item.slug}/`), ...comparisons.map(item => `/compare/${item.slug}/`), ...guides.map(guide => `/resources/${guide.slug}/`)]) {
    const clean = requestSeo(new URL(path, 'https://apwico.com'), true);
    assert.equal(clean.status, 0);
    assert.equal(clean.headers['X-Robots-Tag'], undefined);
    const query = requestSeo(new URL(`${path}?query=private`, 'https://apwico.com'), true);
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
