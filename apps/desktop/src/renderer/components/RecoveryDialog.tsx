import React, { useState } from 'react'
import type { RecoveryAction, StaleSessionInfo } from '@latch/shared'
import { formatTime } from '../lib/format-time.js'

interface Props {
  info: StaleSessionInfo
  onClose: () => void
}

export default function RecoveryDialog({ info, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remainingMs = info.session
    ? Math.max(0, info.session.startedAt + info.session.durationMs - Date.now())
    : 0

  const handleAction = async (action: RecoveryAction) => {
    setLoading(true)
    setError(null)
    const result = await window.latch.session.recovery(action)
    setLoading(false)
    if (result.ok) {
      onClose()
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal__icon">⚠️</div>
        <h2 className="modal__title">Interrupted Session Detected</h2>
        <p className="modal__text">
          Latch found an incomplete focus session from a previous run.
          {info.hostsHasMarkers && (
            <> The hosts file may still be blocking sites.</>
          )}
        </p>

        {remainingMs > 0 && (
          <div className="callout callout--info">
            <strong>{formatTime(remainingMs)}</strong> remaining from the previous session.
          </div>
        )}

        {error && <div className="callout callout--error">{error}</div>}

        <div className="modal__actions">
          {remainingMs > 0 && (
            <button
              className="btn btn--primary btn--modal"
              onClick={() => void handleAction('resume')}
              disabled={loading}
            >
              Resume Session
            </button>
          )}
          <button
            className={`btn btn--modal ${remainingMs > 0 ? 'btn--muted' : 'btn--danger'}`}
            onClick={() => void handleAction('cleanup')}
            disabled={loading}
          >
            {loading ? 'Cleaning up…' : 'Clean Up & Dismiss'}
          </button>
        </div>

        <p className="modal__footnote">
          "Clean Up" removes any leftover hosts entries and resets session state.
        </p>
      </div>
    </div>
  )
}
