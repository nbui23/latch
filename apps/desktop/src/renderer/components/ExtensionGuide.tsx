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
      if (!result.ok) {
        throw new Error(result.error)
      }
      setShowMenuBarIcon(result.data.showMenuBarIcon)
      setShowDockIconWhenMenuBarEnabled(result.data.showDockIconWhenMenuBarEnabled)
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
      if (!result.ok) {
        throw new Error(result.error)
      }
      setShowDockIconWhenMenuBarEnabled(result.data.showDockIconWhenMenuBarEnabled)
      setShowMenuBarIcon(result.data.showMenuBarIcon)
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
      if (!result.ok) {
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

      <h2 className="panel-title">Browser Extension Setup</h2>
      <p className="panel-note panel-note--lead">
        Install the Latch extension to get instant redirect to the blocked page when a site is blocked.
        Without it, blocking still works — your browser just shows a connection error instead.
      </p>

      <ChromeInstructions />

      <div className="guide-section">
        <h3 className="guide-section__title">Uninstall Helper</h3>
        <p className="panel-note panel-note--tight">
          Removes the one-time macOS helper and native messaging manifests after stopping any active focus session.
        </p>
        <button
          className="btn btn--uninstall"
          onClick={() => { void handleUninstallHelper() }}
          disabled={uninstallState === 'running'}
        >
          {uninstallState === 'running' ? 'Uninstalling…' : 'Uninstall Helper'}
        </button>
        {uninstallMessage && (
          <p className={`uninstall-status${uninstallState === 'error' ? ' is-error' : ''}`}>
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
    <div className="settings-card">
      <h2 className="panel-title">App Settings</h2>
      <p className="panel-note">
        Choose how Latch stays accessible when the main window is closed.
      </p>

      <label className={`settings-row${disabled ? ' is-busy' : ''}`}>
        <input
          className="settings-row__checkbox"
          type="checkbox"
          checked={showMenuBarIcon}
          disabled={disabled}
          onChange={(event) => { void onToggleMenuBar(event.target.checked) }}
        />
        <span>
          <span className="settings-row__title">Show menu bar icon</span>
          <span className="settings-row__hint">
            Keeps Latch accessible from the macOS menu bar. When disabled, Latch stays available from the Dock instead.
          </span>
        </span>
      </label>

      <label
        className={`settings-row settings-row--dock${disabled || !showMenuBarIcon ? ' is-locked' : ''}${showMenuBarIcon ? '' : ' is-faded'}`}
      >
        <input
          className="settings-row__checkbox"
          type="checkbox"
          checked={showDockIconWhenMenuBarEnabled}
          disabled={disabled || !showMenuBarIcon}
          onChange={(event) => { void onToggleDock(event.target.checked) }}
        />
        <span>
          <span className="settings-row__title">Keep Dock icon visible with menu bar icon</span>
          <span className="settings-row__hint">
            Useful if you want both a permanent Dock icon and menu bar access at the same time.
          </span>
        </span>
      </label>

      {settingsState === 'saving' && <p className="settings-status">Saving…</p>}
      {settingsMessage && <p className="settings-status is-error">{settingsMessage}</p>}
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="step">
      <div className="step__number">{n}</div>
      <div className="step__body">{children}</div>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="code">{children}</code>
}

function ChromeInstructions() {
  return (
    <div>
      <div className="callout callout--ok">
        Works in Chrome, Microsoft Edge, Brave, and any Chromium-based browser.
      </div>
      <Step n={1}>
        Open Chrome and navigate to <Code>chrome://extensions</Code>
      </Step>
      <Step n={2}>
        Enable <strong>Developer mode</strong> using the toggle in the top-right corner.
      </Step>
      <Step n={3}>
        Click <strong>Load unpacked</strong> and select the <Code>extensions/chrome</Code> folder
        inside the Latch app bundle.
      </Step>
      <Step n={4}>
        The Latch extension will appear in your extensions list. Pin it for easy access.
      </Step>
      <Step n={5}>
        Start a focus session and visit a blocked site — you should see the Latch blocked page
        instead of a connection error.
      </Step>
      <div className="guide-note">
        <strong>Note:</strong> You need to repeat step 3 for each Chromium browser you want to block in.
        {' '}If you previously loaded an older FreeTurkey or repo-local unpacked extension, remove it and reload from the bundled <Code>extensions/chrome</Code> folder—moved or deleted source folders break blocked-page redirects.
      </div>
    </div>
  )
}
