import React, { useState, useEffect } from 'react'
import BlocklistPanel from './components/BlocklistPanel.js'
import SessionPanel from './components/SessionPanel.js'
import ExtensionGuide from './components/ExtensionGuide.js'
import RecoveryDialog from './components/RecoveryDialog.js'
import { useSession } from './hooks/useSession.js'
import type { AppPreferences, StaleSessionInfo } from '@latch/shared'

type Tab = 'blocklist' | 'session' | 'setup'

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 20px',
  border: 'none',
  background: 'transparent',
  borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
  color: active ? '#e5e5e5' : '#666666',
  cursor: 'pointer',
  fontWeight: active ? 600 : 400,
  fontSize: 14,
})

function HeaderBrandMark() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 30,
        height: 30,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 9,
        background: 'linear-gradient(180deg, #182133 0%, #111827 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" role="presentation" focusable="false">
        <rect x="3.5" y="2.2" width="3.1" height="12.1" rx="1.55" fill="#f8fafc" />
        <rect x="3.5" y="11.3" width="9.1" height="3.1" rx="1.55" fill="#f8fafc" />
      </svg>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('session')
  const { session } = useSession()
  const [recovery, setRecovery] = useState<StaleSessionInfo | null>(null)

  useEffect(() => {
    if (typeof window.latch !== 'undefined') {
      const off = window.latch.session.onRecovery((info) => setRecovery(info))
      return off
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0e0e0e' }}>
      <div style={{ background: '#111111', padding: '16px 20px', color: '#e5e5e5', borderBottom: '1px solid #2c2c2c' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HeaderBrandMark />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>Latch</h1>
            <p style={{ fontSize: 12, color: '#666666', marginTop: 2 }}>
              Free, open-source macOS focus blocker
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #2c2c2c', background: '#1a1a1a' }}>
        <button style={tabStyle(tab === 'session')} onClick={() => setTab('session')}>
          Focus
        </button>
        <button style={tabStyle(tab === 'blocklist')} onClick={() => setTab('blocklist')}>
          Block List
        </button>
        <button style={tabStyle(tab === 'setup')} onClick={() => setTab('setup')}>
          Setup
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20, background: '#0e0e0e' }}>
        {tab === 'session' && <SessionPanel />}
        {tab === 'blocklist' && <BlocklistPanel sessionActive={session?.status === 'active'} />}
        {tab === 'setup' && <ExtensionGuide />}
      </div>

      {recovery && (
        <RecoveryDialog
          info={recovery}
          onClose={() => setRecovery(null)}
        />
      )}
    </div>
  )
}

declare global {
  interface Window {
    latch: {
      session: {
        getState: () => Promise<unknown>
        start: (opts: { blocklistId: string; durationMs: number; isIndefinite?: boolean }) => Promise<{ ok?: boolean; error?: string }>
        stop: () => Promise<{ ok?: boolean; error?: string }>
        onStateChange: (cb: (s: unknown) => void) => () => void
        onRecovery: (cb: (info: StaleSessionInfo) => void) => () => void
        recovery: (action: 'resume' | 'cleanup') => Promise<{ ok?: boolean; error?: string }>
      }
      blocklist: {
        load: () => Promise<unknown[]>
        save: (bl: unknown) => Promise<{ ok?: boolean; error?: string }>
      }
      preferences: {
        get: () => Promise<AppPreferences>
        update: (patch: Partial<AppPreferences>) => Promise<{ ok?: boolean; error?: string; preferences?: AppPreferences }>
      }
      domain: {
        validate: (input: string) => Promise<{ valid: boolean; normalized?: string; error?: string }>
      }
      helper: {
        uninstall: () => Promise<{ ok?: boolean; error?: string }>
      }
    }
  }
}
