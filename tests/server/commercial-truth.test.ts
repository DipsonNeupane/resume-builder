import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commercialPlans, commercialPolicy, customerProof, publishableCustomerProof, type CustomerProof } from '../../src/content/commercial.ts';
import { publicPages } from '../../src/seo/policy.ts';
import { freeTemplates, premiumTemplates } from '../../src/model.ts';

const read = (path: string) => readFileSync(path, 'utf8');

test('the commercial contract exposes all three paths and only verified recurring prices', () => {
 assert.deepEqual(commercialPlans.map(plan => plan.id), ['free', 'premium_template', 'pro']);
 assert.deepEqual(commercialPlans.map(plan => plan.price), ['$0', 'US$1.99', 'US$19.99']);
 assert.equal(commercialPlans[0].recurring, false);
 assert.equal(commercialPlans[1].recurring, true);
 assert.equal(commercialPlans[2].recurring, true);
 assert.ok(commercialPlans[0].includes.some(item => item.includes(`${freeTemplates.length} Free templates`)));
 assert.ok(commercialPlans[2].includes.some(item => item.includes(`${premiumTemplates.length} Premium templates`)));
 assert.match(commercialPolicy.templateAfterCancellation, /preview/);
 assert.match(commercialPolicy.templateAfterCancellation, /not deleted/);
 assert.match(commercialPolicy.docx, /does not promise visual parity/);
 assert.match(commercialPolicy.freeDownloads, /3 successful PDF or Word downloads/);
 assert.match(commercialPolicy.paidDownloads, /No unlimited-download claim/);
});

test('customer proof is unpublished by default and its future shape requires scoped consent and withdrawal', () => {
 assert.deepEqual(customerProof, []);
 const source = read('src/content/commercial.ts');
 assert.match(source, /consentScope: 'public_quote' \| 'public_case_study'/);
 assert.match(source, /moderatedAt: string/);
 assert.match(source, /factsVerifiedAt: string/);
 assert.match(source, /withdrawalContact: string/);
 const trust = read('public/trust/index.html');
 assert.match(trust, /No customer stories are published yet/);
 assert.match(trust, /withdraw future public display/);
 assert.doesNotMatch(trust, /<blockquote>/);
 const valid: CustomerProof = { id: 'story-one', quote: 'The requirement view helped me decide.', context: 'A customer describing the decision workflow.', consentRecordedAt: '2026-01-01', factsVerifiedAt: '2026-01-02', consentScope: 'public_quote', consentReference: 'proof-consent-story-one', moderatedAt: '2026-01-03', publishedAt: '2026-01-04', withdrawnAt: null, withdrawalContact: 'support@resumestride.com' };
 assert.deepEqual(publishableCustomerProof([valid], new Date('2026-09-30T00:00:00Z')), [valid]);
 assert.deepEqual(publishableCustomerProof([{ ...valid, withdrawnAt: '2026-01-05' }], new Date('2026-09-30T00:00:00Z')), []);
 assert.throws(() => publishableCustomerProof([{ ...valid, quote: 'Call 312-555-1212' }], new Date('2026-09-30T00:00:00Z')), /contact detail/);
 assert.throws(() => publishableCustomerProof([{ ...valid, factsVerifiedAt: '2025-12-31' }], new Date('2026-09-30T00:00:00Z')), /lifecycle order/);
 assert.throws(() => publishableCustomerProof([{ ...valid, publishedAt: '2027-01-04' }], new Date('2026-09-30T00:00:00Z')), /lifecycle order/);
});

test('pricing and trust are stable public pages with truthful policy links', () => {
 assert.ok(publicPages['/pricing/']);
 assert.ok(publicPages['/trust/']);
 const pricing = read('public/pricing/index.html');
 for (const phrase of ['Every access path, together', 'One Premium template', 'US$1.99', 'US$19.99', 'renew monthly until cancelled', 'After an individual Premium-template subscription expires', 'PDF preserves the selected resume design', 'Word (.docx) is a clean, editable content document']) assert.match(pricing, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
 assert.match(pricing, /href="\/trust\/"/);
 assert.match(pricing, /href="\/terms.html"/);
});

test('every implemented checkout trigger requires explicit recurring consent', () => {
 const template = read('src/features/billing/PremiumTemplateUnlockModal.tsx');
 const pro = read('src/features/billing/BillingPanel.tsx');
 for (const source of [template, pro]) {
  assert.match(source, /useState\(false\)/);
  assert.match(source, /renewalConsent:\s*true/);
  assert.match(source, /disabled=\{!consent/);
  assert.match(source, /continues through the paid/);
 }
 assert.match(template, /US\$1\.99 monthly subscription/);
 assert.match(template, /available only in the United States/);
 assert.match(pro, /US\$19\.99 monthly subscription/);
 assert.match(pro, /available only in the United States/i);
});
