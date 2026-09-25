/** Standalone, dependency-injected scheduling loop for "Auto Refresh (at most once a
 * day)". Kept separate from JobsPanel so it can be unit-tested with fake time/timer
 * functions instead of real waiting, and so the panel's effect only has to start/stop
 * it. This loop actively reschedules itself for the remaining time in the 24-hour
 * cadence for as long as the caller keeps it running (i.e. while the panel/toggle stay
 * mounted) — it never just checks once and stops. */

export type SchedulerHandle = { stop: () => void }

export type AutoRefreshDeps = {
  cadenceMs: number
  getLastFetchedAt: () => number
  isInFlight: () => boolean
  runRefresh: () => void
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => number
  clearTimeout?: (id: number) => void
}

// If a tick finds a refresh is due but one is already in flight (or `runRefresh`
// declined to run), retry after a short fixed delay instead of the raw remaining-time
// computation, which could otherwise be ~0 and busy-loop timers back to back.
const RETRY_DELAY_MS = 60_000

/** Milliseconds until the next refresh is due, floored at 0 (never negative). Exported
 * standalone so its boundary behavior can be tested without any timer at all. */
export function remainingCadenceMs(lastFetchedAt: number, now: number, cadenceMs: number): number {
  return Math.max(0, cadenceMs - (now - lastFetchedAt))
}

export function startAutoRefreshLoop(deps: AutoRefreshDeps): SchedulerHandle {
  const now = deps.now ?? (() => Date.now())
  const scheduleTimeout = deps.setTimeout ?? ((fn: () => void, ms: number) => window.setTimeout(fn, ms) as unknown as number)
  const cancelTimeout = deps.clearTimeout ?? ((id: number) => window.clearTimeout(id))
  let timerId: number | null = null
  let stopped = false

  function scheduleNext(delay: number) {
    if (stopped) return
    timerId = scheduleTimeout(tick, delay)
  }

  function tick() {
    if (stopped) return
    const remaining = remainingCadenceMs(deps.getLastFetchedAt(), now(), deps.cadenceMs)
    if (remaining <= 0) {
      if (!deps.isInFlight()) deps.runRefresh()
      scheduleNext(RETRY_DELAY_MS)
      return
    }
    scheduleNext(remaining)
  }

  scheduleNext(remainingCadenceMs(deps.getLastFetchedAt(), now(), deps.cadenceMs))

  return {
    stop() {
      stopped = true
      if (timerId !== null) cancelTimeout(timerId)
    },
  }
}
