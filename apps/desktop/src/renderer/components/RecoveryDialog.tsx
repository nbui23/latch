import React, { useState } from 'react'
import type { StaleSessionInfo } from '@latch/shared'

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

  const handleAction = async (action: 'resume' | 'cleanup') => {
    setLoading(true)
    setError(null)
    const result = await window.latch.session.recovery(action)
    setLoading(false)
    if (result?.error) {
      setError(result.error)
    } else {
      onClose()
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#1a1a1a', border: '1px solid #2c2c2c',
        borderRadius: 12, padding: 28, maxWidth: 380, width: '90%',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: '#e5e5e5' }}>
          Interrupted Session Detected
        </h2>
        <p style={{ fontSize: 13, color: '#888888', marginBottom: 16, lineHeight: 1.5 }}>
          Latch found an incomplete focus session from a previous run.
          {info.hostsHasMarkers && (
            <> The hosts file may still be blocking sites.</>
          )}
        </p>

        {remainingMs > 0 && (
          <div style={{
            background: '#1e2a3a', border: '1px solid #1d4ed8', borderRadius: 8,
            padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#93c5fd',
          }}>
            <strong>{formatTime(remainingMs)}</strong> remaining from the previous session.
          </div>
        )}

        {error && (
          <div style={{ background: '#2a1515', border: '1px solid #7f1d1d', borderRadius: 6, padding: '8px 12px', marginBottom: 12, color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {remainingMs > 0 && (
            <button
              onClick={() => void handleAction('resume')}
              disabled={loading}
              style={{
                padding: '11px 0', background: '#2563eb', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              Resume Session
            </button>
          )}
          <button
            onClick={() => void handleAction('cleanup')}
            disabled={loading}
            style={{
              padding: '11px 0',
              background: remainingMs > 0 ? '#222222' : '#dc2626',
              color: remainingMs > 0 ? '#aaaaaa' : '#fff',
              border: remainingMs > 0 ? '1px solid #2c2c2c' : 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Cleaning up…' : 'Clean Up & Dismiss'}
          </button>
        </div>

        <p style={{ marginTop: 12, fontSize: 11, color: '#555555', textAlign: 'center' }}>
          "Clean Up" removes any leftover hosts entries and resets session state.
        </p>
      </div>
    </div>
  )
}

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSecs = Math.ceil(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
