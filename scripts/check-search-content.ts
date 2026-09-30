import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { comparisonEvidence } from '../src/content/comparisonEvidence';
import { clusterByGuideSlug, contentClusters, guides } from '../src/content/guides';
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
  assert.equal(evidence.publishable, false, 'No incomplete named comparison may be published.');
}

const sitemap = readFileSync('public/sitemap.xml', 'utf8');
for (const path of ['/resources/', '/occupations/', '/compare/']) assert.ok(sitemap.includes(`https://resumestride.com${path}`));
assert.doesNotMatch(sitemap, /\/compare\/(?:teal|huntr|jobscan|resume-io|enhancv)\//i);
console.log(`Search content check passed: ${contentClusters.length} clusters, ${guides.length} guides, ${searchHubs.length} research hubs.`);
