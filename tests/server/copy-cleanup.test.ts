import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

function htmlFiles(root: string): string[] {
 return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
  const path = join(root, entry.name);
  return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
 });
}

test('customer-facing static output excludes audited internal and removed copy', () => {
 const files = htmlFiles('public').filter(path => !path.endsWith('/privacy.html') && !path.endsWith('/terms.html'));
 const output = files.map(read).join('\n');
 const forbidden = [
  'records implemented boundaries',
  'carefully bounded',
  'verified registry description',
  'evidence gate',
  'source-scope review',
  'release validation',
  'quality gate',
  'publishing gate',
  'Private by design',
  'EVIDENCE, NOT A VERDICT',
  'A USEFUL NEXT STEP',
  'Popular starting points',
  'Customer evidence will stay specific and consented',
  'Start with evidence, not a score.',
  'This address does not have an APWICO page.',
 ];
 for (const phrase of forbidden) assert.doesNotMatch(output, new RegExp(phrase, 'i'), phrase);
});

test('protected public disclosures and canonical evidence language remain', () => {
 const pricing = read('public/pricing/index.html');
 const trust = read('public/trust/index.html');
 const methodology = read('public/features/match-methodology/index.html');
 for (const phrase of [
  'New paid subscriptions are currently available only in the United States.',
  'Paid subscriptions renew monthly until cancelled.',
  'Cancellation stops future renewal.',
  'Stripe handles checkout; APWICO does not receive or store your full card number.',
  'PDF preserves the selected resume design.',
  'Word (.docx) is a clean, editable content document',
  'A recurring paid action requires an explicit consent checkbox',
 ]) assert.match(`${pricing} ${trust}`, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
 for (const label of ['Shown in your resume', 'Possibly relevant—check this', 'Not found in your resume', 'You said you don’t meet this requirement']) {
  assert.match(methodology, new RegExp(label));
 }
 assert.match(methodology, /does not mean the person lacks the skill/i);
 assert.match(methodology, /only when the user explicitly says they do not have it/i);
});

test('all templates remain and mobile tool task content precedes secondary explanation', () => {
 const gallery = read('public/templates/index.html');
 assert.equal((gallery.match(/data-template-card/g) ?? []).length, 27);
 assert.doesNotMatch(gallery, /Popular starting points|A useful starting set/i);
 for (const slug of ['job-requirement-extractor', 'resume-job-match', 'resume-bullet-checker']) {
  const page = read(`public/tools/${slug}/index.html`);
  const heading = page.indexOf('<h1');
  const privacy = page.indexOf('tool-privacy-line');
  const form = page.indexOf('<form');
  const supporting = page.indexOf('tool-supporting-copy');
  assert.ok(heading >= 0 && privacy > heading && form > privacy && supporting > form, slug);
 }
});
