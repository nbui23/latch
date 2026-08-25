/**
 * Latch — Electron main process entry point.
 *
 * This file is the composition root: it owns the singletons, wires them to each
 * other, and drives the app lifecycle. Tray rendering lives in
 * `app/tray-controller.ts`, window and dock handling in `app/window-manager.ts`,
 * and everything domain-shaped in its own module under `main/`.
 */

import { app, dialog } from 'electron'
import { SessionManager } from './session/session-manager.js'
import { ConfigStore } from './config/config-store.js'
import { registerIpcHandlers } from './ipc/handlers.js'
import { broadcastUISessionState, startUISocket } from './ui-ipc/ui-socket.js'
import { ensureNMHostRegistered } from './native-messaging/register.js'
import { detectStaleSession } from './hosts/crash-recovery.js'
import { removeBlock } from './hosts/hosts-manager.js'
import { writeSessionAtomic } from './session/session-store.js'
import { installMacHelper, isHelperInstalled } from './hosts/elevation.js'
import { TrayController } from './app/tray-controller.js'
import { WindowManager } from './app/window-manager.js'
import { toErrorMessage } from '@latch/shared'
import type { NativeMessageFromElectron } from '@latch/shared'

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

/** Grace period for the helper to release the hosts file during quit. */
const QUIT_TIMEOUT_MS = 8000

const configStore = new ConfigStore()

function isMenuBarIconEnabled(): boolean {
  return process.platform === 'darwin' && configStore.getPreferences().showMenuBarIcon
}

const windowManager = new WindowManager({
  isMenuBarIconEnabled,
  shouldKeepDockIconVisible: () => configStore.getPreferences().showDockIconWhenMenuBarEnabled,
})

// The tray and the session manager each drive the other, so one of the two has
// to be constructed first; every reference below runs from a callback, well
// after both are initialised.
const tray = new TrayController({
  openApp: () => windowManager.show(),
  stopSession: () => {
    sessionManager.stopSession().catch((err: unknown) => {
      console.error('Could not end session:', toErrorMessage(err))
    })
  },
  enableAlwaysBlock: () => {
    enableAlwaysBlock().catch((err: unknown) => {
      console.error('Could not enable always-on blocking:', toErrorMessage(err))
    })
  },
  quit: () => { app.quit() },
})

// Only real state transitions land here — the countdown no longer publishes —
// so every one of these is news to all three consumers.
const sessionManager = new SessionManager((session) => {
  windowManager.send('session:state', session)
  broadcastUISessionState(session)
  tray.update(session)
})

async function enableAlwaysBlock(): Promise<void> {
  const firstUsable = configStore.getAllBlocklists().find((blocklist) => blocklist.domains.length > 0)
  if (!firstUsable) {
    windowManager.show()
    return
  }

  await sessionManager.startSession(
    { blocklistId: firstUsable.id, durationMs: 0, isIndefinite: true },
    firstUsable.domains,
  )
}

function syncTrayVisibility(): void {
  tray.sync(sessionManager.getSession(), isMenuBarIconEnabled())
  windowManager.syncDockVisibility()
}

async function promptHelperInstall(): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Latch Setup',
    message: 'Latch needs one-time admin access to set up the blocking helper.',
    detail: 'You will be prompted for your password once. This helper enables blocking without repeated password prompts.',
    buttons: ['Install Helper', 'Cancel'],
  })
  if (result.response !== 0) return

  try {
    installMacHelper()
  } catch (err) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Setup Failed',
      message: 'Could not install the blocking helper.',
      detail: toErrorMessage(err),
    })
  }
}

/**
 * Recover from an interrupted run before the UI exists. Cases the policy table
 * can settle on its own are handled here; the rest wait for the renderer to ask
 * the user (see `recovery:detected`).
 */
async function recoverStaleSession() {
  const stale = detectStaleSession(sessionManager.getSessionPath())
  if (!stale || stale.policy.requiresDialog) return stale

  if (stale.hostsHasMarkers) {
    try {
      await removeBlock('recovery')
    } catch {
      // best effort — the renderer still surfaces leftover markers on next start
    }
  }
  writeSessionAtomic(sessionManager.getSessionPath(), null)
  return stale
}

app.on('second-instance', () => {
  windowManager.show()
})

app.on('before-quit', (event) => {
  windowManager.markQuitting()
  if (!sessionManager.isActive()) return
  event.preventDefault()

  const timeout = setTimeout(() => {
    console.error('Helper unresponsive during quit — forcing exit')
    app.exit(1)
  }, QUIT_TIMEOUT_MS)

  sessionManager
    .stopSession()
    .then(() => {
      clearTimeout(timeout)
      app.exit(0)
    })
    .catch(() => {
      clearTimeout(timeout)
      app.exit(1)
    })
})

app.on('window-all-closed', () => {
  // intentional no-op: keep the process alive
})

app.on('activate', () => {
  windowManager.show()
})

app.whenReady().then(async () => {
  ensureNMHostRegistered()

  if (!isHelperInstalled()) {
    await promptHelperInstall()
  }

  // Both inbound message types mean "tell me the state now"; subscribe_state
  // also registers the socket for the broadcasts that follow. Answering it with
  // `no_session` mid-session left a cold-cache extension unable to block.
  startUISocket(async (): Promise<NativeMessageFromElectron> => ({
    type: 'session_state',
    payload: sessionManager.getSession(),
  }))

  const stale = await recoverStaleSession()

  registerIpcHandlers(sessionManager, configStore, stale?.session ?? null, syncTrayVisibility)

  const window = windowManager.create()
  syncTrayVisibility()

  if (stale?.policy.requiresDialog) {
    window.webContents.on('did-finish-load', () => {
      windowManager.send('recovery:detected', {
        session: stale.session,
        hostsHasMarkers: stale.hostsHasMarkers,
      })
    })
  }
})
