import test from 'node:test'
import assert from 'node:assert/strict'
import { assessSupport, describeIssue, type SupportInput } from '../../src/lib/tailoringSupport.ts'

// Fictional resume and job wording. These checks reduce, and do not eliminate, the chance
// of an unsupported claim; the tests pin specific behaviors, not factual accuracy.
const requirement = { text: 'Resolve customer questions by email and live chat.', status: 'demonstrated' }
const base: SupportInput = {
  originalText: 'Answered customer questions by email and live chat for an online shop.',
  suggestedText: 'Resolved customer questions by email and live chat for an online shop.',
  quotes: ['Answered customer questions by email and live chat'],
  requirements: [requirement],
  jobText: 'We need someone to resolve customer questions by email and live chat. You will manage a team of five and handle complaints.',
}
const kinds = (input: Partial<SupportInput>) => assessSupport({ ...base, ...input }).issues.map(issue => issue.kind)

test('a faithful rewrite with a related requirement and a relevant quote is supported', () => {
  // "Resolved" is wording from the job, so it is flagged; a faithful rewrite keeps the resume's verbs.
  assert.deepEqual(kinds({}), ['job_wording'])
  const faithful = assessSupport({ ...base, suggestedText: 'Answered customer questions by live chat and email for an online shop.' })
  assert.equal(faithful.supported, true)
  assert.deepEqual(faithful.quotes, base.quotes)
})

test('fabricated metrics are flagged, including number words', () => {
  assert.deepEqual(kinds({ suggestedText: 'Answered 200 customer questions by email and live chat for an online shop.' }), ['new_number'])
  assert.deepEqual(kinds({ suggestedText: 'Answered hundreds of customer questions by email and live chat for an online shop.' }), ['new_number'])
  assert.deepEqual(kinds({ suggestedText: 'Answered customer questions by email and live chat, cutting response time by half.' }).sort(), ['added_claim', 'new_number'])
  // A number already in the source is fine; repeating it more often than the source does is not.
  assert.equal(assessSupport({ ...base, originalText: 'Answered 40 customer questions by email and live chat a day.', quotes: ['Answered 40 customer questions'], suggestedText: 'Answered 40 customer questions a day by email and live chat.' }).supported, true)
})

test('changed responsibility, seniority, outcomes and credentials are flagged', () => {
  for (const [suggestedText, term] of [
    ['Managed customer questions by email and live chat for an online shop.', 'managed'],
    ['Led the live chat team answering customer questions by email for an online shop.', 'led'],
    ['Senior agent answering customer questions by email and live chat for an online shop.', 'senior'],
    ['Answered customer questions by email and live chat, improving satisfaction for an online shop.', 'improving'],
    ['Certified agent who answered customer questions by email and live chat.', 'certified'],
    ['Single-handedly answered customer questions by email and live chat for an online shop.', 'single-handedly'],
  ]) {
    const result = assessSupport({ ...base, suggestedText })
    assert.equal(result.supported, false, suggestedText)
    assert.ok(result.issues.some(issue => issue.kind === 'added_claim' && issue.term === term), `${suggestedText} → ${JSON.stringify(result.issues)}`)
  }
  // The same word is fine when the source already says it.
  assert.equal(assessSupport({ ...base, originalText: 'Managed customer questions by email and live chat.', quotes: ['Managed customer questions'], suggestedText: 'Managed customer questions by live chat and email.' }).supported, true)
})

test('a dropped negation and a negated quote are not support', () => {
  const original = 'Answered customer questions by email and live chat, but did not handle complaints.'
  const dropped = assessSupport({ ...base, originalText: original, suggestedText: 'Answered customer questions by email and live chat, and handled complaints.' })
  assert.equal(dropped.supported, false)
  assert.ok(dropped.issues.some(issue => issue.kind === 'dropped_negation'))
  // The quote "handle complaints" sits after "did not", so it supports the opposite claim.
  const negated = assessSupport({ ...base, originalText: original, quotes: ['handle complaints'], suggestedText: 'Handled complaints and customer questions by email and live chat, but not all.' })
  assert.ok(negated.issues.some(issue => issue.kind === 'negated_quote' && issue.quote === 'handle complaints'))
  assert.deepEqual(negated.quotes, [])
  assert.equal(negated.supported, false)
  assert.equal(assessSupport({ ...base, originalText: 'Never missed a shift; answered customer questions by email.', quotes: ['missed a shift'], suggestedText: 'Answered customer questions by email; missed a shift.' }).issues.some(issue => issue.kind === 'negated_quote'), true)
})

test('an irrelevant quote does not support the rewrite', () => {
  const result = assessSupport({ ...base, originalText: 'Answered customer questions by email. Worked weekend shifts.', quotes: ['Worked weekend shifts'], suggestedText: 'Answered customer questions by email and live chat.' })
  assert.ok(result.issues.some(issue => issue.kind === 'irrelevant_quote'))
  assert.ok(result.issues.some(issue => issue.kind === 'no_support'))
  assert.equal(result.supported, false)
})

test('job wording the resume does not contain is flagged, and an unrelated or declined requirement is not traceability', () => {
  const imported = assessSupport({ ...base, suggestedText: 'Answered customer questions and complaints by email and live chat.' })
  assert.ok(imported.issues.some(issue => issue.kind === 'job_wording' && issue.term === 'complaints'))
  assert.ok(kinds({ requirements: [{ text: 'Forklift licence required.' }], suggestedText: 'Answered customer questions by live chat and email for an online shop.' }).includes('no_requirement'))
  assert.ok(kinds({ requirements: [{ ...requirement, status: 'confirmed_incompatible' }], suggestedText: 'Answered customer questions by live chat and email for an online shop.' }).includes('incompatible_requirement'))
})

test('a fact the person adds can resolve flagged wording, and only the wording it covers', () => {
  const suggestedText = 'Answered customer questions and complaints by email and live chat.'
  assert.equal(assessSupport({ ...base, suggestedText }).supported, false)
  const covered = assessSupport({ ...base, suggestedText, userFacts: 'I also answered complaints about late deliveries every week.' })
  assert.equal(covered.supported, true)
  assert.equal(covered.userFactUsed, true)
  const uncovered = assessSupport({ ...base, suggestedText: 'Managed customer questions and complaints by email and live chat.', userFacts: 'I also answered complaints about late deliveries.' })
  assert.equal(uncovered.supported, false)
  assert.ok(uncovered.issues.some(issue => issue.kind === 'added_claim' && issue.term === 'managed'))
  // A short or unrelated "fact" is not support.
  assert.equal(assessSupport({ ...base, quotes: [], suggestedText: 'Answered customer questions by live chat and email for an online shop.', userFacts: 'true' }).supported, false)
})

test('every issue has a plain-language description', () => {
  for (const issue of assessSupport({ ...base, quotes: ['Worked weekend shifts'], requirements: [{ text: 'Forklift licence', status: 'confirmed_incompatible' }], originalText: 'Did not answer calls. Worked weekend shifts.', suggestedText: 'Managed 5 calls and complaints.' }).issues) {
    assert.match(describeIssue(issue), /\S/)
  }
})
