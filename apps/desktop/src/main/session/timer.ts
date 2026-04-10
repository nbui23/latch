/**
 * Wall-clock timer — uses startedAt + durationMs epoch arithmetic.
 * Immune to setInterval drift across sleep/wake cycles.
 */

export class SessionTimer {
  private startedAt: number
  private durationMs: number
  private intervalId?: ReturnType<typeof setInterval>
  private onTick?: (remainingMs: number) => void
  private onEnd?: () => void

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

  start(onTick: (remainingMs: number) => void, onEnd: () => void): void {
    this.onTick = onTick
    this.onEnd = onEnd

    if (this.isExpired()) {
      onEnd()
      return
    }

    this.intervalId = setInterval(() => {
      const remaining = this.getRemainingMs()
      onTick(remaining)
      if (remaining === 0) {
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

  toJSON() {
    return {
      startedAt: this.startedAt,
      durationMs: this.durationMs,
      remainingMs: this.getRemainingMs(),
    }
  }
}
