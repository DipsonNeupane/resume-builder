import test from 'node:test'
import assert from 'node:assert/strict'
import { remainingCadenceMs, startAutoRefreshLoop } from '../../src/features/jobs/autoRefreshScheduler.ts'

const DAY_MS = 24 * 60 * 60 * 1000

test('remainingCadenceMs: floors at 0 and never returns negative', () => {
  assert.equal(remainingCadenceMs(0, 0, DAY_MS), DAY_MS)
  assert.equal(remainingCadenceMs(0, DAY_MS / 2, DAY_MS), DAY_MS / 2)
  assert.equal(remainingCadenceMs(0, DAY_MS, DAY_MS), 0)
  assert.equal(remainingCadenceMs(0, DAY_MS * 5, DAY_MS), 0)
})

// A fake, fully synchronous "clock + timer queue": setTimeout just records the
// callback and delay instead of scheduling anything real, so the loop's own
// self-rescheduling behavior can be driven deterministically by calling `advance()` —
// no real waiting, ever.
function fakeScheduler(startNow: number) {
  let now = startNow
  let nextId = 1
  const pending = new Map<number, { fn: () => void; fireAt: number }>()
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++
      pending.set(id, { fn, fireAt: now + ms })
      return id
    },
    clearTimeout: (id: number) => { pending.delete(id) },
    advance(ms: number) {
      now += ms
      const due = [...pending.entries()].filter(([, entry]) => entry.fireAt <= now)
      for (const [id, entry] of due) {
        pending.delete(id)
        entry.fn()
      }
    },
    pendingCount: () => pending.size,
  }
}

test('auto refresh loop: schedules itself for the remaining cadence, does not just check once', () => {
  const clock = fakeScheduler(0)
  let lastFetchedAt = 0
  let runs = 0
  const handle = startAutoRefreshLoop({
    cadenceMs: DAY_MS,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    isInFlight: () => false,
    getLastFetchedAt: () => lastFetchedAt,
    runRefresh: () => { runs += 1; lastFetchedAt = clock.now() },
  })

  // Well under a day: no run yet, but a timer must already be queued for later.
  clock.advance(DAY_MS / 2)
  assert.equal(runs, 0)
  assert.ok(clock.pendingCount() > 0, 'expected the loop to have scheduled a future check, not just checked once')

  // Crossing the 24h mark fires exactly one run...
  clock.advance(DAY_MS / 2 + 1)
  assert.equal(runs, 1)

  // ...and the loop keeps going: a second full cadence later, it runs again on its own,
  // proving it reschedules for the *next* cadence rather than stopping after one shot.
  clock.advance(DAY_MS)
  assert.equal(runs, 2)

  handle.stop()
  clock.advance(DAY_MS * 3)
  assert.equal(runs, 2, 'expected no further runs after stop() cancels the timer')
})

test('auto refresh loop: never starts a duplicate search while one is already in flight', () => {
  const clock = fakeScheduler(0)
  let lastFetchedAt = 0
  let runs = 0
  let inFlight = false
  const handle = startAutoRefreshLoop({
    cadenceMs: DAY_MS,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    isInFlight: () => inFlight,
    getLastFetchedAt: () => lastFetchedAt,
    runRefresh: () => { runs += 1 },
  })

  inFlight = true
  clock.advance(DAY_MS + 1)
  assert.equal(runs, 0, 'expected the due refresh to be skipped while a search is already in flight')

  inFlight = false
  lastFetchedAt = clock.now()
  // Next retry tick will find it no longer in flight but also no longer due (just
  // refreshed above) — advancing a full cadence from here should trigger exactly one
  // run, not a backlog of skipped ones.
  clock.advance(DAY_MS + 1)
  assert.equal(runs, 1)

  handle.stop()
})
