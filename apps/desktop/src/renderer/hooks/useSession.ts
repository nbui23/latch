import { useState, useEffect } from 'react'
import type { Session } from '@latch/shared'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    if (typeof window.latch === 'undefined') return
    let cancelled = false
    const off = window.latch.session.onStateChange((s) => {
      setSession(s as Session | null)
    })
    void window.latch.session.getState().then((currentSession) => {
      if (!cancelled) {
        setSession(currentSession as Session | null)
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const startSession = async (blocklistId: string, durationMs: number, isIndefinite?: boolean) => {
    const result = await window.latch.session.start({ blocklistId, durationMs, isIndefinite })
    return result
  }

  const stopSession = async () => {
    return window.latch.session.stop()
  }

  return { session, startSession, stopSession }
}
