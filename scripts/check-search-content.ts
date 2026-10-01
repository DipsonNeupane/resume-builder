import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { comparisonEvidence } from '../src/content/comparisonEvidence';
import { comparisons, evidenceIsCurrent } from '../src/content/comparisons';
import { clusterByGuideSlug, contentClusters, guides } from '../src/content/guides';
import { occupationNextReviewAt, occupations } from '../src/content/occupations';
import { regionalGuidance, regionalNextReviewAt } from '../src/content/regionalGuidance';
import { searchHubs } from '../src/content/searchHubs';

assert.equal(contentClusters.length, 7, 'The resource architecture must keep exactly seven intentional clusters.');
assert.equal(new Set(contentClusters.map(cluster => cluster.id)).size, 7, 'Cluster IDs must be unique.');
assert.equal(new Set(guides.map(guide => guide.slug)).size, guides.length, 'Guide slugs must be unique.');
assert.equal(contentClusters.reduce((count, cluster) => count + cluster.slugs.length, 0), guides.length, 'Every guide must have exactly one cluster membership.');
assert.deepEqual(
  [...clusterByGuideSlug.keys()].sort(),
  guides.map(guide => guide.slug).sort(),
  'Every guide must belong to exactly one cluster and no cluster slug may be orphaned.',
);

for (const guide of guides) {
  assert.ok(guide.sections.length >= 5, `${guide.slug} needs substantive sections.`);
  assert.equal(guide.related.length, 3, `${guide.slug} needs three deliberate related links.`);
  assert.ok(existsSync(`public/resources/${guide.slug}/index.html`), `${guide.slug} is not generated.`);
}
for (const hub of searchHubs) {
  assert.ok(hub.sections.length >= 5, `${hub.path} needs substantive sections.`);
  assert.ok(existsSync(`public${hub.path}index.html`), `${hub.path} is not generated.`);
}

for (const evidence of comparisonEvidence) {
  assert.match(evidence.sourceUrl, /^https:\/\//);
  assert.match(evidence.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(evidence.nextReviewAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(evidence.nextReviewAt > evidence.checkedAt, `${evidence.vendor} must have a future review date.`);
  assert.equal(evidence.publishable, true, `${evidence.vendor} evidence expired; recheck or remove it before publication.`);
  assert.ok(evidence.nextReviewAt >= new Date().toISOString().slice(0, 10), `${evidence.vendor} review deadline passed.`);
  assert.ok(evidence.locale.length > 3, `${evidence.vendor} needs a displayed source locale.`);
}

assert.equal(occupations.length, 9, 'The initial portfolio covers nine distinct evidence categories.');
assert.ok(evidenceIsCurrent(occupationNextReviewAt), `Occupation evidence expired on ${occupationNextReviewAt}.`);
assert.ok(evidenceIsCurrent(regionalNextReviewAt), `Regional evidence expired on ${regionalNextReviewAt}.`);
assert.equal(new Set(occupations.map(item => item.category)).size, 9, 'Occupation categories must be diverse.');
for (const occupation of occupations) {
  assert.ok(occupation.sources.length > 0, `${occupation.slug} needs a primary source.`);
  assert.ok(existsSync(`public/occupations/${occupation.slug}/index.html`));
  assert.match(occupation.strongBulletWhy, /fictional/i);
}
for (const comparison of comparisons) {
  assert.ok(comparison.sources.length >= 2, `${comparison.vendor} needs multiple official records.`);
  assert.ok(existsSync(`public/compare/${comparison.slug}/index.html`));
}
assert.ok(regionalGuidance.length >= 5, 'Regional guide needs meaningful, bounded coverage.');

const sitemap = readFileSync('public/sitemap.xml', 'utf8');
for (const path of ['/resources/', '/occupations/', '/regions/', '/compare/', ...occupations.map(item => `/occupations/${item.slug}/`), ...comparisons.map(item => `/compare/${item.slug}/`)]) assert.ok(sitemap.includes(`https://apwico.com${path}`));
console.log(`Search content check passed: ${contentClusters.length} clusters, ${guides.length} guides, ${occupations.length} occupations, ${comparisons.length} comparisons.`);
