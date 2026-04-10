import React, { useEffect, useState } from 'react'

export default function ExtensionGuide() {
  const [uninstallState, setUninstallState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [uninstallMessage, setUninstallMessage] = useState('')
  const [showMenuBarIcon, setShowMenuBarIcon] = useState(true)
  const [showDockIconWhenMenuBarEnabled, setShowDockIconWhenMenuBarEnabled] = useState(false)
  const [settingsState, setSettingsState] = useState<'idle' | 'loading' | 'saving' | 'error'>('loading')
  const [settingsMessage, setSettingsMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadPreferences() {
      setSettingsState('loading')
      setSettingsMessage('')
      try {
        const preferences = await window.latch.preferences.get()
        if (!cancelled) {
          setShowMenuBarIcon(preferences.showMenuBarIcon)
          setShowDockIconWhenMenuBarEnabled(preferences.showDockIconWhenMenuBarEnabled)
          setSettingsState('idle')
        }
      } catch (error) {
        if (!cancelled) {
          setSettingsState('error')
          setSettingsMessage(error instanceof Error ? error.message : 'Could not load app settings.')
        }
      }
    }

    void loadPreferences()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleShowMenuBarIconChange(nextValue: boolean) {
    const previousMenuBarValue = showMenuBarIcon
    const previousDockValue = showDockIconWhenMenuBarEnabled
    setShowMenuBarIcon(nextValue)
    if (!nextValue) {
      setShowDockIconWhenMenuBarEnabled(false)
    }
    setSettingsState('saving')
    setSettingsMessage('')

    try {
      const result = await window.latch.preferences.update({
        showMenuBarIcon: nextValue,
        showDockIconWhenMenuBarEnabled: nextValue ? showDockIconWhenMenuBarEnabled : false,
      })
      if (result.error) {
        throw new Error(result.error)
      }
      setShowMenuBarIcon(result.preferences?.showMenuBarIcon ?? nextValue)
      setShowDockIconWhenMenuBarEnabled(result.preferences?.showDockIconWhenMenuBarEnabled ?? false)
      setSettingsState('idle')
    } catch (error) {
      setShowMenuBarIcon(previousMenuBarValue)
      setShowDockIconWhenMenuBarEnabled(previousDockValue)
      setSettingsState('error')
      setSettingsMessage(error instanceof Error ? error.message : 'Could not update app settings.')
    }
  }

  async function handleShowDockIconChange(nextValue: boolean) {
    const previousValue = showDockIconWhenMenuBarEnabled
    setShowDockIconWhenMenuBarEnabled(nextValue)
    setSettingsState('saving')
    setSettingsMessage('')

    try {
      const result = await window.latch.preferences.update({ showDockIconWhenMenuBarEnabled: nextValue })
      if (result.error) {
        throw new Error(result.error)
      }
      setShowDockIconWhenMenuBarEnabled(result.preferences?.showDockIconWhenMenuBarEnabled ?? nextValue)
      setShowMenuBarIcon(result.preferences?.showMenuBarIcon ?? showMenuBarIcon)
      setSettingsState('idle')
    } catch (error) {
      setShowDockIconWhenMenuBarEnabled(previousValue)
      setSettingsState('error')
      setSettingsMessage(error instanceof Error ? error.message : 'Could not update app settings.')
    }
  }

  async function handleUninstallHelper() {
    setUninstallState('running')
    setUninstallMessage('')
    try {
      const result = await window.latch.helper.uninstall()
      if (result.error) {
        setUninstallState('error')
        setUninstallMessage(result.error)
        return
      }
      setUninstallState('done')
      setUninstallMessage(
        'Helper removed. Restart your browsers if they still show the extension bridge as installed.',
      )
    } catch (error) {
      setUninstallState('error')
      setUninstallMessage(error instanceof Error ? error.message : 'Could not uninstall the helper.')
    }
  }

  return (
    <div>
      <SettingsSection
        showMenuBarIcon={showMenuBarIcon}
        showDockIconWhenMenuBarEnabled={showDockIconWhenMenuBarEnabled}
        settingsState={settingsState}
        settingsMessage={settingsMessage}
        onToggleMenuBar={handleShowMenuBarIconChange}
        onToggleDock={handleShowDockIconChange}
      />

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: '#e5e5e5' }}>Browser Extension Setup</h2>
      <p style={{ fontSize: 13, color: '#666666', marginBottom: 20 }}>
        Install the Latch extension to get instant redirect to the blocked page when a site is blocked.
        Without it, blocking still works — your browser just shows a connection error instead.
      </p>

      <ChromeInstructions />

      <div style={{ marginTop: 28, borderTop: '1px solid #2c2c2c', paddingTop: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#e5e5e5' }}>Uninstall Helper</h3>
        <p style={{ fontSize: 13, color: '#666666', marginBottom: 12 }}>
          Removes the one-time macOS helper and native messaging manifests after stopping any active focus session.
        </p>
        <button
          onClick={() => { void handleUninstallHelper() }}
          disabled={uninstallState === 'running'}
          style={{
            padding: '9px 14px',
            borderRadius: 6,
            border: '1px solid #7f1d1d',
            background: uninstallState === 'running' ? '#2a1515' : '#1a1a1a',
            color: '#f87171',
            cursor: uninstallState === 'running' ? 'wait' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {uninstallState === 'running' ? 'Uninstalling…' : 'Uninstall Helper'}
        </button>
        {uninstallMessage && (
          <p
            style={{
              marginTop: 10,
              fontSize: 12,
              color: uninstallState === 'error' ? '#f87171' : '#4ade80',
            }}
          >
            {uninstallMessage}
          </p>
        )}
      </div>
    </div>
  )
}

function SettingsSection({
  showMenuBarIcon,
  showDockIconWhenMenuBarEnabled,
  settingsState,
  settingsMessage,
  onToggleMenuBar,
  onToggleDock,
}: {
  showMenuBarIcon: boolean
  showDockIconWhenMenuBarEnabled: boolean
  settingsState: 'idle' | 'loading' | 'saving' | 'error'
  settingsMessage: string
  onToggleMenuBar: (nextValue: boolean) => Promise<void>
  onToggleDock: (nextValue: boolean) => Promise<void>
}) {
  const disabled = settingsState === 'loading' || settingsState === 'saving'

  return (
    <div style={{ marginBottom: 28, padding: 16, borderRadius: 12, background: '#151515', border: '1px solid #2c2c2c' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: '#e5e5e5' }}>App Settings</h2>
      <p style={{ fontSize: 13, color: '#666666', marginBottom: 16 }}>
        Choose how Latch stays accessible when the main window is closed.
      </p>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          cursor: disabled ? 'wait' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={showMenuBarIcon}
          disabled={disabled}
          onChange={(event) => { void onToggleMenuBar(event.target.checked) }}
          style={{ marginTop: 2 }}
        />
        <span>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>
            Show menu bar icon
          </span>
          <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: '#888888', lineHeight: 1.5 }}>
            Keeps Latch accessible from the macOS menu bar. When disabled, Latch stays available from the Dock instead.
          </span>
        </span>
      </label>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          marginTop: 14,
          cursor: disabled || !showMenuBarIcon ? 'not-allowed' : 'pointer',
          opacity: showMenuBarIcon ? 1 : 0.55,
        }}
      >
        <input
          type="checkbox"
          checked={showDockIconWhenMenuBarEnabled}
          disabled={disabled || !showMenuBarIcon}
          onChange={(event) => { void onToggleDock(event.target.checked) }}
          style={{ marginTop: 2 }}
        />
        <span>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>
            Keep Dock icon visible with menu bar icon
          </span>
          <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: '#888888', lineHeight: 1.5 }}>
            Useful if you want both a permanent Dock icon and menu bar access at the same time.
          </span>
        </span>
      </label>

      {settingsState === 'saving' && (
        <p style={{ marginTop: 10, fontSize: 12, color: '#888888' }}>Saving…</p>
      )}
      {settingsMessage && (
        <p style={{ marginTop: 10, fontSize: 12, color: '#f87171' }}>
          {settingsMessage}
        </p>
      )}
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
      <div style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
        background: '#1e2a3a', border: '1px solid #3b82f6', color: '#3b82f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700,
      }}>
        {n}
      </div>
      <div style={{ fontSize: 14, color: '#aaaaaa', paddingTop: 4 }}>{children}</div>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      background: '#222222', padding: '1px 6px', borderRadius: 4,
      fontSize: 12, fontFamily: 'monospace', color: '#e5e5e5',
      border: '1px solid #2c2c2c',
    }}>
      {children}
    </code>
  )
}

function ChromeInstructions() {
  return (
    <div>
      <div style={{ background: '#0f2318', border: '1px solid #166534', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#4ade80' }}>
        Works in Chrome, Microsoft Edge, Brave, and any Chromium-based browser.
      </div>
      <Step n={1}>
        Open Chrome and navigate to <Code>chrome://extensions</Code>
      </Step>
      <Step n={2}>
        Enable <strong style={{ color: '#e5e5e5' }}>Developer mode</strong> using the toggle in the top-right corner.
      </Step>
      <Step n={3}>
        Click <strong style={{ color: '#e5e5e5' }}>Load unpacked</strong> and select the <Code>extensions/chrome</Code> folder
        inside the Latch app bundle.
      </Step>
      <Step n={4}>
        The Latch extension will appear in your extensions list. Pin it for easy access.
      </Step>
      <Step n={5}>
        Start a focus session and visit a blocked site — you should see the Latch blocked page
        instead of a connection error.
      </Step>
      <div style={{ marginTop: 16, background: '#1f1a00', border: '1px solid #78350f', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#fbbf24' }}>
        <strong>Note:</strong> You need to repeat step 3 for each Chromium browser you want to block in.
      </div>
    </div>
  )
}
