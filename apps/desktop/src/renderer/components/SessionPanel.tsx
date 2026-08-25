import React, { useState, useEffect } from 'react'
import type { BlockList, Session } from '@latch/shared'
import type { useSession } from '../hooks/useSession.js'
import { formatTime } from '../lib/format-time.js'

const DURATIONS = [
  { label: '15 min', ms: 15 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '2 hours', ms: 2 * 60 * 60 * 1000 },
  { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { label: '8 hours', ms: 8 * 60 * 60 * 1000 },
]

interface Props {
  session: Session | null
  startSession: ReturnType<typeof useSession>['startSession']
  stopSession: ReturnType<typeof useSession>['stopSession']
  blocklists: BlockList[]
  selectedBlocklistId: string
  onSelectBlocklist: (id: string) => void
}

export default function SessionPanel({
  session,
  startSession,
  stopSession,
  blocklists,
  selectedBlocklistId,
  onSelectBlocklist,
}: Props) {
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[2].ms)
  const [indefinite, setIndefinite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [remainingMs, setRemainingMs] = useState(0)

  useEffect(() => {
    if (session?.status !== 'active') return
    const update = () => {
      const remaining = Math.max(0, session.startedAt + session.durationMs - Date.now())
      setRemainingMs(remaining)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
    // Only the timing fields matter — keying on the object would rebuild the
    // interval on every unrelated push.
  }, [session?.id, session?.status, session?.startedAt, session?.durationMs])

  const isActive = session?.status === 'active'

  const handleStart = async () => {
    if (!selectedBlocklistId) { setError('Select a block list first'); return }
    setLoading(true)
    setError(null)
    const result = await startSession(selectedBlocklistId, indefinite ? 0 : selectedDuration, indefinite)
    setLoading(false)
    if (!result.ok) setError(result.error)
  }

  const handleStop = async () => {
    setLoading(true)
    await stopSession()
    setLoading(false)
  }

  if (isActive && session) {
    return (
      <div>
        <div className="session-card">
          <div className="session-card__label">Focus session active</div>
          {session.isIndefinite ? (
            <div className="session-card__open">Blocking active — no end time</div>
          ) : (
            <>
              <div className="session-card__time">{formatTime(remainingMs)}</div>
              <div className="session-card__remaining">remaining</div>
            </>
          )}
        </div>

        <button className="btn btn--danger btn--stop" onClick={handleStop} disabled={loading}>
          {loading ? 'Ending...' : 'End Session Early'}
        </button>

        <p className="session-note">
          Sites on your block list are blocked across all browsers.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="panel-title panel-title--spaced">Start a Focus Session</h2>

      <div className="field">
        <label className="field__label">Block list</label>
        <select
          className="select"
          value={selectedBlocklistId}
          onChange={(e) => onSelectBlocklist(e.target.value)}
        >
          {blocklists.map((bl) => (
            <option key={bl.id} value={bl.id}>
              {bl.name} ({bl.domains.length} sites)
            </option>
          ))}
          {blocklists.length === 0 && (
            <option disabled>No block lists — go to Block List tab</option>
          )}
        </select>
      </div>

      <div className="field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={indefinite}
            onChange={(e) => setIndefinite(e.target.checked)}
          />
          Block until turned off
        </label>
      </div>

      {!indefinite && (
        <div className="durations">
          <label className="field__label">Duration</label>
          <div className="durations__grid">
            {DURATIONS.map((d) => (
              <button
                key={d.ms}
                className={selectedDuration === d.ms ? 'duration is-selected' : 'duration'}
                onClick={() => setSelectedDuration(d.ms)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="callout callout--error">{error}</div>}

      <button
        className="btn btn--primary btn--start"
        onClick={handleStart}
        disabled={loading || blocklists.length === 0}
      >
        {loading ? 'Starting...' : '▶  Start Focus Session'}
      </button>
    </div>
  )
}
