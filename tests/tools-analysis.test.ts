import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOL_LIMITS, analyzeResumeBullet, compareResumeToJob, extractJobRequirements, validateToolText } from '../src/tools/analysis';

const job = `Customer Operations Lead
Responsibilities
- Coordinate onboarding across sales and support.
- Build weekly performance reports in Salesforce.
Required qualifications
- Must have 3+ years of customer operations experience.
- Bachelor's degree or equivalent practical experience required.
Preferred qualifications
- Experience with SQL is preferred.
- Familiarity with healthcare is a plus.
Work arrangement
- This is a hybrid role based in Toronto.`;

test('extracts only source-backed job signals and preserves category ambiguity', () => {
  const results = extractJobRequirements(job);
  assert.ok(results.length >= 7);
  assert.ok(results.some(item => item.category === 'required' && item.text.includes('3+ years')));
  assert.ok(results.some(item => item.category === 'required' && item.kind === 'education'));
  assert.ok(results.some(item => item.category === 'preferred' && item.text.includes('SQL')));
  assert.ok(results.some(item => item.category === 'other' && item.kind === 'responsibility'));
  assert.ok(results.some(item => item.category === 'other' && item.kind === 'location'));
  for (const result of results) assert.ok(job.includes(result.source), result.source);
});

test('does not promote negated or unsupported language to a requirement', () => {
  const results = extractJobRequirements(`About the role
You will support the service desk.
Requirements
A degree is not required.
We value curiosity and welcome many backgrounds.`);
  assert.equal(results.some(item => /degree/i.test(item.text)), false);
  assert.equal(results.some(item => /curiosity/i.test(item.text)), false);
  assert.ok(results.some(item => item.category === 'other' && /support/i.test(item.text)));
});

test('bounds tool inputs and rejects empty or oversized content', () => {
  assert.throws(() => validateToolText('', 'Job description', TOOL_LIMITS.job, 40), /more detail/);
  assert.throws(() => validateToolText('x'.repeat(TOOL_LIMITS.job + 1), 'Job description', TOOL_LIMITS.job, 40), /20,000/);
  assert.doesNotThrow(() => validateToolText('x'.repeat(40), 'Job description', TOOL_LIMITS.job, 40));
});

test('caps anonymous output and work even when input contains many repeated signals', () => {
  const many = Array.from({ length: 200 }, (_, index) => `- Must have qualification number ${index} for this role.`).join('\n');
  const extracted = extractJobRequirements(`Requirements\n${many}`);
  assert.equal(extracted.length, TOOL_LIMITS.requirements);
  const compared = compareResumeToJob('Qualification number 1 demonstrated through a real project. '.repeat(20), `Requirements\n${many}`);
  assert.equal(compared.length, TOOL_LIMITS.comparisonRequirements);
});

test('compares a limited requirement set with traceable resume evidence', () => {
  const resume = `Customer Operations Specialist
Coordinated onboarding for business accounts with sales and support.
Built Salesforce reports for weekly service reviews.
Skills: Salesforce, customer operations`;
  const results = compareResumeToJob(resume, job);
  assert.ok(results.length <= TOOL_LIMITS.comparisonRequirements);
  assert.ok(results.some(item => item.status === 'demonstrated' && item.resumeEvidence?.includes('Coordinated onboarding')));
  assert.ok(results.some(item => item.status === 'not_demonstrated' && /Bachelor/i.test(item.text)));
  assert.equal(results.some(item => item.status === 'confirmed_incompatible'), false);
  for (const result of results) {
    assert.ok(job.includes(result.source));
    if (result.resumeEvidence) assert.ok(resume.includes(result.resumeEvidence));
  }
});

test('bullet feedback is dimensional and never manufactures facts', () => {
  const source = 'Responsible for coordinating onboarding with sales and support';
  const result = analyzeResumeBullet(source);
  assert.equal(result.dimensions.length, 6);
  assert.equal(result.dimensions.find(item => item.id === 'result')?.state, 'missing');
  assert.equal(result.strongerStructure, 'Coordinating onboarding with sales and support');
  assert.ok(result.prompts.some(prompt => /result only if you can support it/i.test(prompt)));
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /\d+%|increased by|reduced by/i);
});

test('hostile HTML remains inert source text in deterministic results', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const results = extractJobRequirements(`Responsibilities\nYou will review ${payload} customer requests.`);
  assert.ok(results[0].source.includes(payload));
});
