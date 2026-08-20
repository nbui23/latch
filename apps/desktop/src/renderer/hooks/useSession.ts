import { useState, useEffect } from 'react'
import type { Session } from '@latch/shared'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    if (typeof window.latch === 'undefined') return
    let cancelled = false
    const off = window.latch.session.onStateChange(setSession)
    void window.latch.session.getState().then((currentSession) => {
      if (!cancelled) {
        setSession(currentSession)
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const startSession = (blocklistId: string, durationMs: number, isIndefinite?: boolean) =>
    window.latch.session.start({ blocklistId, durationMs, isIndefinite })

  const stopSession = () => window.latch.session.stop()

  return { session, startSession, stopSession }
}
