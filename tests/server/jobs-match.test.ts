import test from 'node:test'
import assert from 'node:assert/strict'
import { analysisView, analyzeJob, matchJob, parseResumeEvidence, parseSkills } from '../../server/jobs/match.ts'
import { applyDiversity } from '../../server/jobs/diversity.ts'
import { normalizeEmploymentType } from '../../server/jobs/employment.ts'
import { parseSearchCriteria } from '../../server/jobs/criteria.ts'
import { matchesEmploymentType, matchesSalaryPreference } from '../../server/jobs/filter.ts'
import type { NormalizedJob } from '../../server/jobs/types.ts'

function job(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    id: 'techmap:1', provider: 'techmap', providerJobId: '1',
    title: 'Senior Software Engineer', company: 'Acme Inc.',
    location: { value: { city: 'Austin', region: 'TX', country: 'US' }, source: 'provider', confidence: 'high' },
    workplace: { value: 'remote', source: 'provider', confidence: 'high' },
    employmentType: { value: 'unknown', source: 'unknown', confidence: 'low' },
    salary: null,
    descriptionText: 'Build backend services using TypeScript and PostgreSQL.',
    postedAt: null,
    expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
    directness: { value: null, source: 'unknown', confidence: 'low' },
    sourceUrl: 'https://jobs.acme.example/1',
    portal: 'acme-careers', source: 'employer', dedupeKey: 'key-1', retrievedAt: '2026-09-24T00:00:00Z',
    ...overrides,
  }
}

test('parseSkills splits a free-text field and dedupes case-insensitively', () => {
  assert.deepEqual(parseSkills('TypeScript, Node.js; Node.js\nSQL'), ['TypeScript', 'Node.js', 'SQL'])
  assert.deepEqual(parseSkills(''), [])
})

test('parseResumeEvidence bounds and sanitizes untrusted input, never crashing', () => {
  assert.equal(parseResumeEvidence(null), null)
  assert.equal(parseResumeEvidence('x'), null)
  const evidence = parseResumeEvidence({ headline: 'Engineer', skills: 'TypeScript', roles: [{ title: 'Backend Engineer', description: 'Built services' }, 'garbage', { title: 42 }] })
  assert.deepEqual(evidence, { headline: 'Engineer', skills: 'TypeScript', roles: [{ title: 'Backend Engineer', description: 'Built services' }] })
})

test('matchJob labels strong when both a title and multiple skills are demonstrated', () => {
  const evidence = { headline: 'Senior Software Engineer', skills: 'TypeScript, PostgreSQL, Leadership', roles: [] }
  const result = matchJob(evidence, job())
  assert.equal(result.label, 'strong')
  assert.ok(result.reasons.some(r => r.includes('Senior Software Engineer')))
  assert.ok(result.reasons.some(r => r.includes('TypeScript')))
})

test('matchJob labels good with only a title overlap or only one skill', () => {
  const titleOnly = matchJob({ headline: 'Senior Software Engineer', skills: 'Photoshop', roles: [] }, job())
  assert.equal(titleOnly.label, 'good')
  const skillOnly = matchJob({ headline: 'Marketing Manager', skills: 'TypeScript', roles: [] }, job())
  assert.equal(skillOnly.label, 'good')
})

test('matchJob labels stretch and never claims the user lacks anything, only "not demonstrated"', () => {
  const result = matchJob({ headline: 'Marketing Manager', skills: 'Photoshop, Copywriting', roles: [] }, job())
  assert.equal(result.label, 'stretch')
  assert.ok(result.reasons.every(reason => !/you lack|you don'?t have/i.test(reason)))
  assert.ok(result.reasons.some(reason => reason.includes('not demonstrated')))
})

test('matchJob never uses percentages and stays deterministic across repeated calls', () => {
  const evidence = { headline: 'Senior Software Engineer', skills: 'TypeScript', roles: [] }
  const a = matchJob(evidence, job())
  const b = matchJob(evidence, job())
  assert.deepEqual(a, b)
  assert.ok(![...a.reasons].some(reason => /%/.test(reason)))
})

test('short skills require whole-token evidence and are never fabricated from substrings', () => {
  const posting = job({ title: 'Python Engineer', descriptionText: 'Required: Django framework experience.' })
  const result = analyzeJob({ headline: 'Engineer', skills: 'Go', roles: [] }, posting)
  assert.equal(result.analysis.requirements[0].status, 'not_demonstrated')
  assert.equal(result.analysis.requirements[0].evidence.length, 0)
  assert.ok(!result.analysis.observations.some(reason => /resume evidence.*Go/i.test(reason)))
})

test('a shared generic title word does not promote an otherwise unrelated role', () => {
  const result = analyzeJob({ headline: 'Marketing Manager', skills: '', roles: [] }, job({ title: 'Engineering Manager', descriptionText: 'Lead mechanical design reviews.' }))
  assert.equal(result.label, 'stretch')
  assert.ok(!result.analysis.observations.some(reason => /relates directly/i.test(reason)))
})

test('one overlapping qualification word is partial evidence, not a fabricated qualification', () => {
  const posting = job({ descriptionText: 'Required: Five years of oncology nursing experience.' })
  const evidence = { headline: 'Researcher', skills: '', roles: [], qualifications: [{ section: 'Education', title: 'Oncology studies', description: '' }] }
  const result = analyzeJob(evidence, posting)
  assert.notEqual(result.analysis.requirements[0].status, 'demonstrated')
  assert.ok(!result.analysis.requirements[0].evidence.some(item => /oncology studies/i.test(item)))
})

test('employment type normalization degrades to unknown rather than guessing', () => {
  // Full coverage of the verified contractType/workType schema lives in
  // jobs-employment.test.ts; this only checks the degrade-to-unknown behavior stays
  // wired through from this module's own import.
  assert.equal(normalizeEmploymentType({}).value, 'unknown')
  assert.equal(normalizeEmploymentType({ contractType: 'Full-Time' }).value, 'full_time')
  assert.equal(normalizeEmploymentType({ contractType: 'Something Else' }).value, 'unknown')
})

test('applyDiversity caps a single employer from dominating the result, returning fewer than the cap rather than backfilling with more of that employer', () => {
  // Full adversarial-domination coverage lives in jobs-diversity.test.ts. With only two
  // distinct employers/sources, the fair-share cap (half of 10 = 5) leaves seats
  // deliberately unfilled rather than restoring Acme's dominance.
  const jobs = Array.from({ length: 15 }, (_, i) => job({ id: `techmap:${i}`, providerJobId: String(i), company: 'Acme Inc.', portal: 'acme-careers' }))
    .concat(job({ id: 'techmap:other', providerJobId: 'other', company: 'Other Co', portal: 'other-careers' }))
  const result = applyDiversity(jobs, 10)
  assert.ok(result.length < 10, `expected fewer than the cap, got ${result.length}`)
  assert.ok(result.some(j => j.company === 'Other Co'))
  const acmeCount = result.filter(j => j.company === 'Acme Inc.').length
  assert.ok(acmeCount <= 5, `expected Acme capped at its fair share, got ${acmeCount}`)
})

test('applyDiversity is a no-op when already within the cap', () => {
  const jobs = [job({ id: 'a' }), job({ id: 'b' })]
  assert.deepEqual(applyDiversity(jobs, 10), jobs)
})

test('parseSearchCriteria validates explicit criteria and rejects unknown/invalid values', () => {
  // Salary-range and location-specific coverage lives in jobs-criteria.test.ts.
  assert.throws(() => parseSearchCriteria({}), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: '' }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'Engineer', countryCode: 'USA' }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'Engineer', workplace: 'unknown' }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'Engineer', employmentType: 'unknown' }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'Engineer', salary: { period: 'year', currency: 'USD', min: -1 } }), { status: 400 })
  assert.throws(() => parseSearchCriteria({ title: 'Engineer', salary: { period: 'week', currency: 'USD', min: 1 } }), { status: 400 })
  const ok = parseSearchCriteria({ title: ' engineer ', countryCode: 'us', workplace: 'remote', employmentType: 'full_time', salary: { period: 'year', currency: 'usd', min: 100000 } })
  assert.deepEqual(ok, { title: 'engineer', countryCode: 'US', workplace: 'remote', employmentType: 'full_time', salary: { period: 'year', currency: 'USD', min: 100000, max: null } })
})

test('matchesEmploymentType keeps unknown-employment-type jobs eligible', () => {
  assert.equal(matchesEmploymentType(job(), 'full_time'), true)
  assert.equal(matchesEmploymentType(job({ employmentType: { value: 'contract', source: 'provider', confidence: 'high' } }), 'full_time'), false)
  assert.equal(matchesEmploymentType(job({ employmentType: { value: 'full_time', source: 'provider', confidence: 'high' } }), 'full_time'), true)
})

test('matchesSalaryPreference never compares across currency/period and keeps unknown salary eligible', () => {
  // Full range-overlap coverage (min-only, max-only, both) lives in jobs-filter.test.ts.
  const pref = { period: 'year' as const, currency: 'USD', min: 100000, max: null }
  assert.equal(matchesSalaryPreference(job(), pref), true) // no salary listed -> eligible
  const eurJob = job({ salary: { min: 200000, max: 250000, currency: 'EUR', period: 'year', confidence: 'high' } })
  assert.equal(matchesSalaryPreference(eurJob, pref), true) // different currency -> never compared
  const hourlyJob = job({ salary: { min: 500000, max: 600000, currency: 'USD', period: 'hour', confidence: 'high' } })
  assert.equal(matchesSalaryPreference(hourlyJob, pref), true) // different period -> never compared
  const belowMin = job({ salary: { min: 50000, max: 90000, currency: 'USD', period: 'year', confidence: 'high' } })
  assert.equal(matchesSalaryPreference(belowMin, pref), false)
  const meetsMin = job({ salary: { min: 90000, max: 150000, currency: 'USD', period: 'year', confidence: 'high' } })
  assert.equal(matchesSalaryPreference(meetsMin, pref), true)
})

test('classifies Required, Preferred and Nice to have separately and reports only resume evidence', () => {
  const posting = job({ descriptionText: `Requirements:\nMust hold an active RN license.\nPreferred: Spanish language fluency.\nNice to have: Epic certification.` })
  const evidence = { headline: 'Registered Nurse', summary: '', skills: 'Spanish', roles: [], qualifications: [{ section: 'Licenses', title: 'Registered Nurse (RN)', description: 'Active license' }] }
  const result = analyzeJob(evidence, posting)
  assert.deepEqual(result.analysis.requirements.map(item => item.category), ['required', 'preferred', 'nice_to_have'])
  assert.equal(result.analysis.requirements[0].status, 'demonstrated')
  assert.equal(result.analysis.requirements[1].status, 'demonstrated')
  assert.equal(result.analysis.requirements[2].status, 'not_demonstrated')
  assert.ok(JSON.stringify(result.analysis).includes('Epic certification'))
  assert.ok(!JSON.stringify(result.analysis).includes('Resume evidence: Epic'))
})

test('does not turn an explicitly optional or negated qualification into a requirement', () => {
  const result = analyzeJob({ headline: 'Support Specialist', skills: '', roles: [] }, job({ descriptionText: 'A university degree is not required. You do not need a professional license.' }))
  assert.deepEqual(result.analysis.requirements, [])
})

test('absence is unknown/not demonstrated while an explicit clarification can confirm incompatibility', () => {
  const posting = job({ descriptionText: 'You must hold an active commercial driving license.' })
  const evidence = { headline: 'Delivery Driver', skills: '', roles: [] }
  const unknown = analyzeJob(evidence, posting)
  assert.equal(unknown.analysis.requirements[0].status, 'not_demonstrated')
  assert.match(unknown.analysis.importantWarning ?? '', /not demonstrated/i)
  assert.equal(unknown.confirmedIncompatibility, false)
  const id = unknown.analysis.requirements[0].id
  const confirmed = analyzeJob(evidence, posting, { title: posting.title }, { [id]: 'not_have' })
  assert.equal(confirmed.analysis.requirements[0].status, 'confirmed_incompatible')
  assert.equal(confirmed.label, 'stretch')
  assert.equal(confirmed.confirmedIncompatibility, true)
})

test('seniority is neutral and never blocks analysis', () => {
  const result = analyzeJob({ headline: 'Software Engineer', skills: 'TypeScript', roles: [] }, job({ title: 'Principal Software Engineer' }))
  assert.equal(result.analysis.seniorityMessage, 'This role appears more senior than the experience currently demonstrated in your resume.')
  assert.ok(result.analysis.observations.length > 0)
})

test('salary, location, workplace and employment constraints appear only from explicit compatible facts', () => {
  const result = analyzeJob({ headline: 'Engineer', skills: 'TypeScript', roles: [] }, job({
    workplace: { value: 'remote', source: 'provider', confidence: 'high' }, employmentType: { value: 'full_time', source: 'provider', confidence: 'high' },
    salary: { min: 100000, max: 130000, currency: 'USD', period: 'year', confidence: 'high' },
  }), { title: 'Engineer', location: 'Austin', workplace: 'remote', employmentType: 'full_time', salary: { currency: 'USD', period: 'year', min: 100000, max: null } })
  assert.equal(result.analysis.constraints.length, 4)
})

test('Free depth is bounded while Pro receives full analysis and the truthful tailoring handoff', () => {
  const result = analyzeJob({ headline: 'Engineer', skills: 'TypeScript', roles: [] }, job({ descriptionText: 'Required: TypeScript.\nPreferred: PostgreSQL.\nNice to have: Kubernetes.' }))
  const free = analysisView(result.analysis, false)
  const pro = analysisView(result.analysis, true)
  assert.equal(free.observations.length <= 3, true)
  assert.equal(free.fullAnalysis, undefined)
  assert.ok(free.additionalAreasAnalyzed >= 0)
  assert.equal(pro.fullAnalysis?.requirements.length, 3)
  assert.equal(pro.fullAnalysis?.tailoringAction, 'Tailor my resume for this job')
  assert.doesNotMatch(JSON.stringify({ free, pro }), /\d+%|chance of|probability/i)
})
