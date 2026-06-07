/**
 * Pure gate that serializes PTY injections (BUG #3, 2026-06-07).
 *
 * Two blocking mechanisms, composable:
 *
 * 1. **Hold window** (`holdFor`) — a monotonic "do not inject before"
 *    deadline. Every dispatched injection extends it by its own expected
 *    duration plus a minimum gap, so two queued payloads can never
 *    interleave their keystrokes (each injection writes its text and its
 *    submitting \r ~250ms apart — back-to-back dispatches used to splice
 *    into each other's window).
 *
 * 2. **Clear barrier** (`beginClearBarrier`/`releaseClearBarrier`) — armed
 *    when a `/clear` is injected and held until the wrapper detects the
 *    fresh session jsonl (CC may not even process the /clear until the
 *    current AI turn ends, so this can legitimately take minutes).
 *    Keystrokes landing while CC rebuilds the session are silently
 *    dropped — that swallowed `/rename idle` (bot-02) and a whole `/clear`
 *    (bot-03, idle-creep). A safety timeout force-releases the barrier so
 *    a /clear whose fresh session never materialises cannot deadlock the
 *    queue forever.
 *
 * Pure: time is always passed in (`now`), so the logic is unit-testable
 * without timers. wrapper.ts owns the actual queue + setTimeout plumbing.
 */
export class InjectionGate {
  private holdUntil = 0
  private clearBarrierStartedAt: number | null = null

  constructor(private readonly clearBarrierTimeoutMs: number) {}

  /** Extend the do-not-inject window to at least `now + ms`. */
  holdFor(ms: number, now: number): void {
    this.holdUntil = Math.max(this.holdUntil, now + ms)
  }

  /** Arm the post-/clear barrier (called when a /clear is injected). */
  beginClearBarrier(now: number): void {
    this.clearBarrierStartedAt = now
  }

  /**
   * Release the barrier (fresh session detected). `settleMs` keeps the
   * queue held a little longer so the post-/clear chain (/rename + outbox
   * event) lands before the next queued payload.
   */
  releaseClearBarrier(settleMs: number, now: number): void {
    this.clearBarrierStartedAt = null
    this.holdFor(settleMs, now)
  }

  /** True while the clear barrier is armed (and not timed out). */
  clearBarrierActive(now: number): boolean {
    if (this.clearBarrierStartedAt === null) return false
    if (now - this.clearBarrierStartedAt > this.clearBarrierTimeoutMs) {
      // Safety valve: fresh session never appeared. Disarm so the queue
      // can drain; the caller logs this as an anomaly.
      this.clearBarrierStartedAt = null
      return false
    }
    return true
  }

  /** True when the next injection must wait. */
  isBlocked(now: number): boolean {
    return this.clearBarrierActive(now) || now < this.holdUntil
  }
}
