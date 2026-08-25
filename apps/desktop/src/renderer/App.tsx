import React, { useState, useEffect } from 'react'
import BlocklistPanel from './components/BlocklistPanel.js'
import SessionPanel from './components/SessionPanel.js'
import ExtensionGuide from './components/ExtensionGuide.js'
import RecoveryDialog from './components/RecoveryDialog.js'
import { useSession } from './hooks/useSession.js'
import { useBlocklists } from './hooks/useBlocklists.js'
import type { StaleSessionInfo } from '@latch/shared'

type Tab = 'blocklist' | 'session' | 'setup'

const tabClass = (active: boolean) => (active ? 'tab is-active' : 'tab')

function HeaderBrandMark() {
  return (
    <div aria-hidden="true" className="brand-mark">
      <svg width="18" height="18" viewBox="0 0 18 18" role="presentation" focusable="false">
        <rect x="3.5" y="2.2" width="3.1" height="12.1" rx="1.55" fill="#f8fafc" />
        <rect x="3.5" y="11.3" width="9.1" height="3.1" rx="1.55" fill="#f8fafc" />
      </svg>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('session')
  // Both hooks live here so their IPC subscriptions and loads happen once, and
  // the two panels can never drift apart.
  const { session, startSession, stopSession } = useSession()
  const { blocklists, selected, selectedId, setSelectedId, save } = useBlocklists()
  const [recovery, setRecovery] = useState<StaleSessionInfo | null>(null)

  useEffect(() => {
    if (typeof window.latch !== 'undefined') {
      const off = window.latch.session.onRecovery((info) => setRecovery(info))
      return off
    }
  }, [])

  return (
    <div className="app">
      <div className="app-header">
        <HeaderBrandMark />
        <div>
          <h1 className="app-title">Latch</h1>
          <p className="app-tagline">Free, open-source macOS focus blocker</p>
        </div>
      </div>

      <div className="tabs">
        <button className={tabClass(tab === 'session')} onClick={() => setTab('session')}>
          Focus
        </button>
        <button className={tabClass(tab === 'blocklist')} onClick={() => setTab('blocklist')}>
          Block List
        </button>
        <button className={tabClass(tab === 'setup')} onClick={() => setTab('setup')}>
          Setup
        </button>
      </div>

      <div className="app-body">
        {tab === 'session' && (
          <SessionPanel
            session={session}
            startSession={startSession}
            stopSession={stopSession}
            blocklists={blocklists}
            selectedBlocklistId={selectedId}
            onSelectBlocklist={setSelectedId}
          />
        )}
        {tab === 'blocklist' && (
          <BlocklistPanel
            sessionActive={session?.status === 'active'}
            selectedList={selected}
            save={save}
          />
        )}
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
