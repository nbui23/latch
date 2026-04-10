import React, { useState, useEffect } from 'react'
import { useSession } from '../hooks/useSession.js'
import type { BlockList } from '@latch/shared'

const DURATIONS = [
  { label: '15 min', ms: 15 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '2 hours', ms: 2 * 60 * 60 * 1000 },
  { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { label: '8 hours', ms: 8 * 60 * 60 * 1000 },
]

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSecs = Math.ceil(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function SessionPanel() {
  const { session, startSession, stopSession } = useSession()
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[2].ms)
  const [indefinite, setIndefinite] = useState(false)
  const [blocklists, setBlocklists] = useState<BlockList[]>([])
  const [selectedBlocklistId, setSelectedBlocklistId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [remainingMs, setRemainingMs] = useState(0)

  useEffect(() => {
    if (typeof window.latch === 'undefined') return
    window.latch.blocklist.load().then((bls) => {
      const typed = bls as BlockList[]
      setBlocklists(typed)
      if (typed.length > 0 && !selectedBlocklistId) {
        setSelectedBlocklistId(typed[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (session?.status !== 'active') return
    const update = () => {
      const remaining = Math.max(0, session.startedAt + session.durationMs - Date.now())
      setRemainingMs(remaining)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [session])

  const isActive = session?.status === 'active'

  const handleStart = async () => {
    if (!selectedBlocklistId) { setError('Select a block list first'); return }
    setLoading(true)
    setError(null)
    const result = await startSession(selectedBlocklistId, indefinite ? 0 : selectedDuration, indefinite)
    setLoading(false)
    if (result?.error) setError(result.error)
  }

  const handleStop = async () => {
    setLoading(true)
    await stopSession()
    setLoading(false)
  }

  if (isActive && session) {
    return (
      <div>
        <div style={{
          background: '#1a1a1a', border: '1px solid #2c2c2c', borderRadius: 12, padding: 32,
          textAlign: 'center', marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, color: '#888888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Focus session active
          </div>
          {session.isIndefinite ? (
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8, color: '#e5e5e5' }}>Blocking active — no end time</div>
          ) : (
            <>
              <div style={{ fontSize: 56, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#e5e5e5' }}>
                {formatTime(remainingMs)}
              </div>
              <div style={{ fontSize: 13, color: '#666666', marginTop: 8 }}>remaining</div>
            </>
          )}
        </div>

        <button
          onClick={handleStop}
          disabled={loading}
          style={{
            width: '100%', padding: '12px 0', background: '#dc2626', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {loading ? 'Ending...' : 'End Session Early'}
        </button>

        <p style={{ marginTop: 12, fontSize: 12, color: '#666666', textAlign: 'center' }}>
          Sites on your block list are blocked across all browsers.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#e5e5e5' }}>Start a Focus Session</h2>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#888888' }}>
          Block list
        </label>
        <select
          value={selectedBlocklistId}
          onChange={(e) => setSelectedBlocklistId(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6,
            border: '1px solid #2c2c2c', fontSize: 14,
            background: '#1a1a1a', color: '#e5e5e5',
          }}
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

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: '#888888', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={indefinite}
            onChange={(e) => setIndefinite(e.target.checked)}
          />
          Block until turned off
        </label>
      </div>

      {!indefinite && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#888888' }}>
            Duration
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {DURATIONS.map((d) => (
              <button
                key={d.ms}
                onClick={() => setSelectedDuration(d.ms)}
                style={{
                  padding: '10px 0', borderRadius: 6, border: '2px solid',
                  borderColor: selectedDuration === d.ms ? '#3b82f6' : '#2c2c2c',
                  background: selectedDuration === d.ms ? '#1e2a3a' : '#1a1a1a',
                  color: selectedDuration === d.ms ? '#3b82f6' : '#888888',
                  fontWeight: selectedDuration === d.ms ? 600 : 400,
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#2a1515', border: '1px solid #7f1d1d', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={loading || blocklists.length === 0}
        style={{
          width: '100%', padding: '14px 0', background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer',
          opacity: loading || blocklists.length === 0 ? 0.5 : 1,
        }}
      >
        {loading ? 'Starting...' : '▶  Start Focus Session'}
      </button>
    </div>
  )
}
