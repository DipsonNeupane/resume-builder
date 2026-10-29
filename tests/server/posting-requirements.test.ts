import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPostingRequirements, splitSentences } from '../../src/lib/postingRequirements.ts';
import { compareResumeToJob, extractJobRequirements } from '../../src/tools/analysis.ts';
import { analyzeJob, type ResumeEvidence } from '../../server/jobs/match.ts';
import type { NormalizedJob } from '../../server/jobs/types.ts';

// Fictional regression fixture from the launch brief (2026-10-27).
const resume = `Customer support specialist at Example Company, 2022-present.
Supported customers across email, phone and live chat. Used Salesforce CRM to resolve billing issues. Trained three new team members. Improved help centre documentation.`;
const paragraph = `Customer Support Specialist
Experience supporting customers across email, phone and live chat. Experience with Zendesk administration. Ability to coach new team members. Workforce scheduling experience. Preferred: Spanish language proficiency.`;
const bullets = `Customer Support Specialist
- Experience supporting customers across email, phone and live chat.
- Experience with Zendesk administration.
- Ability to coach new team members.
- Workforce scheduling experience.
- Preferred: Spanish language proficiency.`;
const expected = [
  ['Experience supporting customers across email, phone and live chat', 'required'],
  ['Experience with Zendesk administration', 'required'],
  ['Ability to coach new team members', 'required'],
  ['Workforce scheduling experience', 'required'],
  ['Spanish language proficiency', 'preferred'],
] as const;

for (const [name, posting] of [['paragraph', paragraph], ['bullet', bullets]] as const) {
  test(`fixture: ${name} formatting recovers all five requirements with categories`, () => {
    const extracted = extractPostingRequirements(posting);
    assert.deepEqual(extracted.map(item => [item.text, item.category]), expected);
    assert.equal(extracted.some(item => /^Customer Support Specialist$/i.test(item.text)), false, 'title is never a requirement');
    for (const item of extracted) {
      assert.ok(posting.includes(item.source), `source wording preserved: ${item.source}`);
      assert.equal(posting.slice(item.offset).startsWith(posting.split('\n')[item.line - 1]), true, 'line/offset reference is exact');
    }
  });

  test(`fixture: public tool and server Match agree on ${name} formatting`, () => {
    const publicTool = extractJobRequirements(posting);
    assert.deepEqual(publicTool.map(item => [item.text, item.category]), expected);
    const job = { id: 'manual:x', provider: 'manual', providerJobId: 'x', title: 'Customer Support Specialist', company: 'Example Company',
      location: { value: { city: null, region: null, country: null }, source: 'unknown', confidence: 'low' },
      workplace: { value: 'unknown', source: 'unknown', confidence: 'low' }, employmentType: { value: 'unknown', source: 'unknown', confidence: 'low' },
      salary: null, descriptionText: posting, postedAt: null, expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
      directness: { value: null, source: 'unknown', confidence: 'low' }, sourceUrl: 'https://example.com/jobs/1', portal: null, source: null,
      dedupeKey: '0'.repeat(64), retrievedAt: '2026-10-27T00:00:00.000Z' } satisfies NormalizedJob;
    const evidence: ResumeEvidence = { headline: 'Customer support specialist', skills: 'Salesforce', roles: [{ title: 'Customer support specialist', description: resume }] };
    const server = analyzeJob(evidence, job).analysis.requirements;
    assert.deepEqual(server.map(item => [item.text, item.category]), expected);
  });
}

test('evidence classification is separate from extraction and never invents Zendesk or Spanish', () => {
  const results = compareResumeToJob(resume, paragraph);
  const status = Object.fromEntries(results.map(item => [item.text, item.status]));
  assert.equal(status['Experience supporting customers across email, phone and live chat'], 'demonstrated');
  assert.equal(status['Experience with Zendesk administration'], 'not_demonstrated');
  assert.equal(status['Spanish language proficiency'], 'not_demonstrated');
});

test('sentence splitting keeps abbreviations and splits copied inline bullets', () => {
  assert.deepEqual(splitSentences('Experience with tools, e.g. Zendesk. Ability to coach.'), ['Experience with tools, e.g. Zendesk.', 'Ability to coach.']);
  const copied = extractPostingRequirements('Requirements • Experience with Zendesk • Ability to coach new team members • Spanish preferred');
  assert.deepEqual(copied.map(item => [item.text, item.category]), [
    ['Experience with Zendesk', 'required'], ['Ability to coach new team members', 'required'], ['Spanish preferred', 'preferred'],
  ]);
});

test('heading scopes, numbered bullets, inline scope lines and deduplication', () => {
  const posting = `About us
We are a growing support team with experience across 12 countries.
What you'll do
1. Answer customer questions by chat.
Requirements: Experience with Zendesk. Ability to coach new team members.
Nice to have
* Spanish language proficiency
* Experience with Zendesk.
Benefits
Health insurance and experience days.`;
  const extracted = extractPostingRequirements(posting);
  assert.deepEqual(extracted.map(item => [item.text, item.category]), [
    ['Answer customer questions by chat', 'other'],
    ['Experience with Zendesk', 'required'],
    ['Ability to coach new team members', 'required'],
    ['Spanish language proficiency', 'nice_to_have'],
  ]);
});

test('negated, values and labelled single items do not leak scope', () => {
  const extracted = extractPostingRequirements(`Requirements
- Preferred: Spanish language proficiency
- Experience with Zendesk administration
- A degree is not required.
- We value curiosity and welcome many backgrounds.`);
  assert.deepEqual(extracted.map(item => [item.text, item.category]), [
    ['Spanish language proficiency', 'preferred'], ['Experience with Zendesk administration', 'required'],
  ]);
});

 test('explicit language requirements survive paragraph extraction without company promotion', () => {
 const result = extractPostingRequirements("Strong written English is required. Our work directly impacts the experience of millions of users relying on Cisco wireless infrastructure. Join one of the world's most renowned global banks and trusted brand with over 200 years of continuously evolving financial services worldwide.");
 assert.equal(result.length, 1);
 assert.equal(result[0].category, 'required');
 assert.match(result[0].text, /English/);
 });

test('missing posting reports insufficient information instead of negative alignment', () => {
    const job = { id: 'manual:x', provider: 'manual', providerJobId: 'x', title: 'Customer Support Specialist', company: 'Example Company',
      location: { value: { city: null, region: null, country: null }, source: 'unknown', confidence: 'low' },
      workplace: { value: 'unknown', source: 'unknown', confidence: 'low' }, employmentType: { value: 'unknown', source: 'unknown', confidence: 'low' },
      salary: null, descriptionText: '', postedAt: null, expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
      directness: { value: null, source: 'unknown', confidence: 'low' }, sourceUrl: 'https://example.com/jobs/1', portal: null, source: null,
      dedupeKey: '0'.repeat(64), retrievedAt: '2026-10-27T00:00:00.000Z' } satisfies NormalizedJob;
    const evidence: ResumeEvidence = { headline: 'Customer support specialist', skills: 'Salesforce', roles: [{ title: 'Customer support specialist', description: resume }] };
 const result = analyzeJob(evidence, job);
 assert.match(result.analysis.whyPromising, /not enough posting information/);
 assert.equal(result.analysis.importantWarning, null);
 assert.deepEqual(result.analysis.strengths, []);
});
