/**
 * Wall-clock timer — uses startedAt + durationMs epoch arithmetic.
 * Immune to setInterval drift across sleep/wake cycles.
 */

export class SessionTimer {
  private startedAt: number
  private durationMs: number
  private intervalId?: ReturnType<typeof setInterval>

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

  /** Polls once a second so a sleep/wake jump is noticed promptly; the poll
   *  itself does nothing until the session actually runs out. */
  start(onEnd: () => void): void {
    if (this.isExpired()) {
      onEnd()
      return
    }

    this.intervalId = setInterval(() => {
      if (this.getRemainingMs() === 0) {
        this.stop()
        onEnd()
      }
    }, 1000)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }
}
