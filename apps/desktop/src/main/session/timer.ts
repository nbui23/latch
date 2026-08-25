/**
 * Wall-clock timer — uses startedAt + durationMs epoch arithmetic.
 * Immune to setInterval drift across sleep/wake cycles.
 */

/**
 * The wake happens at the deadline, but a timer is only as good as the clock
 * behind it: macOS stops the monotonic clock during sleep, so a timer armed
 * for an hour fires an hour of *awake* time later. Re-checking at most this
 * often bounds how long a session can outlive its end after a wake.
 */
const MAX_DELAY_MS = 60_000

export class SessionTimer {
  private startedAt: number
  private durationMs: number
  private timeoutId?: ReturnType<typeof setTimeout>

  constructor(startedAt: number, durationMs: number) {
    this.startedAt = startedAt
    this.durationMs = durationMs
  }

  getRemainingMs(): number {
    return Math.max(0, this.startedAt + this.durationMs - Date.now())
  }

  isExpired(): boolean {
    return this.getRemainingMs() === 0
  }

  /** Sleeps to the deadline rather than counting to it, re-reading the wall
   *  clock on each wake so an early or late fire corrects itself. */
  start(onEnd: () => void): void {
    const check = () => {
      const remaining = this.getRemainingMs()
      if (remaining === 0) {
        this.stop()
        onEnd()
        return
      }
      this.timeoutId = setTimeout(check, Math.min(remaining, MAX_DELAY_MS))
    }

    check()
  }

  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = undefined
    }
  }
}
