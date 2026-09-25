import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDiversity } from '../../server/jobs/diversity.ts'
import type { NormalizedJob } from '../../server/jobs/types.ts'

function job(id: string, company: string, portal: string): NormalizedJob {
  return {
    id, provider: 'techmap', providerJobId: id,
    title: 'Engineer', company,
    location: { value: { city: null, region: null, country: null }, source: 'unknown', confidence: 'low' },
    workplace: { value: 'unknown', source: 'unknown', confidence: 'low' },
    employmentType: { value: 'unknown', source: 'unknown', confidence: 'low' },
    salary: null,
    descriptionText: '',
    postedAt: null,
    expiry: { expiresAt: null, isLikelyExpired: false, confidence: 'low', source: 'unknown' },
    directness: { value: null, source: 'unknown', confidence: 'low' },
    sourceUrl: `https://jobs.example/${id}`,
    portal, source: null, dedupeKey: id, retrievedAt: '2026-09-24T00:00:00Z',
  }
}

test('returns input unchanged when already within cap and already diverse', () => {
  const jobs = [job('1', 'A', 'p1'), job('2', 'B', 'p2')]
  assert.deepEqual(applyDiversity(jobs, 20), jobs)
})

test('adversarial: a single employer flooding a retrieved set SMALLER than the cap still cannot dominate the result', () => {
  // Only 15 jobs total were retrieved, well under the 20-result cap, so a naive
  // implementation that skips diversity checks whenever `jobs.length <= cap` would
  // return all 15 unchanged — 100% from one employer. The cap must still apply.
  const jobs = Array.from({ length: 15 }, (_, i) => job(`f${i}`, 'FloodCorp', `portal-${i % 3}`))
  const result = applyDiversity(jobs, 20)
  const fromFloodCorp = result.filter(j => j.company === 'FloodCorp')
  assert.ok(fromFloodCorp.length < jobs.length, 'expected the employer cap to trim a same-employer flood even under the overall cap')
  assert.ok(fromFloodCorp.length <= 6, `expected at most the stricter employer fair share, got ${fromFloodCorp.length}`)
})

test('a single dominant employer never fills more than its fair share, even across many distinct sources', () => {
  // 30 jobs from the SAME employer, each posted through a DIFFERENT portal — this never
  // trips the source cap on its own, so only the employer cap can prevent domination.
  const jobs = Array.from({ length: 30 }, (_, i) => job(`e${i}`, 'MegaCorp', `portal-${i}`))
  const result = applyDiversity(jobs, 20)
  const fromMegaCorp = result.filter(j => j.company === 'MegaCorp')
  assert.ok(fromMegaCorp.length <= 10, `expected at most half the cap from one employer, got ${fromMegaCorp.length}`)
})

test('a single dominant source never fills more than its fair share, even across many distinct employers', () => {
  const jobs = Array.from({ length: 30 }, (_, i) => job(`s${i}`, `Employer ${i}`, 'mega-board'))
  const result = applyDiversity(jobs, 20)
  const fromMegaBoard = result.filter(j => j.portal === 'mega-board')
  assert.ok(fromMegaBoard.length <= 10, `expected at most half the cap from one source, got ${fromMegaBoard.length}`)
})

test('returns fewer than the cap rather than backfilling past the caps to restore domination', () => {
  // Only two distinct employers/sources exist at all, so fair-share round-robin can only
  // ever fill 10+10=20... but if one employer only has 5 jobs, the cap should be
  // honestly under-filled rather than the other employer flooding back in to reach 20.
  const jobs = [
    ...Array.from({ length: 5 }, (_, i) => job(`small-${i}`, 'SmallCo', 'portal-a')),
    ...Array.from({ length: 30 }, (_, i) => job(`big-${i}`, 'BigCo', 'portal-b')),
  ]
  const result = applyDiversity(jobs, 20)
  const fromBigCo = result.filter(j => j.company === 'BigCo')
  const fromSmallCo = result.filter(j => j.company === 'SmallCo')
  assert.equal(fromSmallCo.length, 5)
  assert.ok(fromBigCo.length <= 10, `expected BigCo capped at its fair share, got ${fromBigCo.length}`)
  assert.ok(result.length < 20, 'expected fewer than the cap rather than a domination-restoring backfill')
})

test('diverse input with many distinct employers and sources fills the cap exactly', () => {
  const jobs = Array.from({ length: 40 }, (_, i) => job(`d${i}`, `Employer ${i}`, `Portal ${i}`))
  const result = applyDiversity(jobs, 20)
  assert.equal(result.length, 20)
})

test('preserves the caller\'s ranked order among selected jobs', () => {
  const jobs = [job('1', 'A', 'p1'), job('2', 'B', 'p2'), job('3', 'C', 'p3')]
  const result = applyDiversity(jobs, 2)
  assert.deepEqual(result.map(j => j.id), ['1', '2'])
})
