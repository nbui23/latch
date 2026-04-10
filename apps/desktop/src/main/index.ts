/**
 * Latch — Electron main process entry point
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, dialog } from 'electron'
import * as path from 'path'
import { SessionManager } from './session/session-manager.js'
import { ConfigStore } from './config/config-store.js'
import { registerIpcHandlers } from './ipc/handlers.js'
import { broadcastUISessionState, startUISocket } from './ui-ipc/ui-socket.js'
import { registerNMHost, isNMHostRegistered } from './native-messaging/register.js'
import { detectStaleSession } from './hosts/crash-recovery.js'
import { removeBlock } from './hosts/hosts-manager.js'
import { writeSessionAtomic } from './session/session-store.js'
import { installMacHelper, isHelperInstalled } from './hosts/elevation.js'
import { createTraySvg, getTrayMenuBarTitle, getTrayStatusLabel, getTrayVisualState, isBlockingVisibleInTray, type TrayVisualState } from './tray-state.js'
import type { NativeMessageFromElectron, NativeMessageToElectron, Session } from '@latch/shared'

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const configStore = new ConfigStore()
let lastBroadcastSessionKey: string | null = null
const trayImages: Partial<Record<TrayVisualState, Electron.NativeImage>> = {}
let isQuitting = false

function isMenuBarIconEnabled(): boolean {
  return process.platform === 'darwin' && configStore.getPreferences().showMenuBarIcon
}

function shouldKeepDockIconVisible(): boolean {
  return configStore.getPreferences().showDockIconWhenMenuBarEnabled
}

function syncDockVisibility(): void {
  if (process.platform !== 'darwin' || !app.isReady() || isQuitting) return

  const hasVisibleWindow = !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()
  const shouldShowDock = hasVisibleWindow || !isMenuBarIconEnabled() || shouldKeepDockIconVisible()

  if (shouldShowDock) {
    app.dock.show()
  } else {
    app.dock.hide()
  }
}

function getDesktopResourcePath(filename: string): string {
  return path.join(__dirname, '..', '..', 'resources', filename)
}

function createTrayFallbackImage(state: TrayVisualState): Electron.NativeImage {
  const image = nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(createTraySvg(state)).toString('base64')}`)
    .resize({ width: 18, height: 18 })
  return image
}

function getTrayImage(state: TrayVisualState): Electron.NativeImage {
  const cached = trayImages[state]
  if (cached && !cached.isEmpty()) return cached

  if (process.platform === 'darwin') {
    const filename = state === 'active' ? 'tray-activeTemplate.png' : 'tray-inactiveTemplate.png'
    const image = nativeImage.createFromPath(getDesktopResourcePath(filename)).resize({ width: 18, height: 18 })
    if (!image.isEmpty()) {
      trayImages[state] = image
      return image
    }

    const fallback = createTrayFallbackImage(state)
    trayImages[state] = fallback
    return fallback
  }

  const image = nativeImage.createFromPath(getDesktopResourcePath('icon.png'))
  trayImages[state] = image.isEmpty() ? nativeImage.createEmpty() : image
  return trayImages[state]!
}

function getBroadcastSessionKey(session: Session | null): string {
  return JSON.stringify(
    session
      ? {
          id: session.id,
          status: session.status,
          domains: session.domains,
          startedAt: session.startedAt,
          durationMs: session.durationMs,
          isIndefinite: session.isIndefinite,
        }
      : null,
  )
}

function destroyTray(): void {
  if (!tray) return
  tray.removeAllListeners()
  tray.destroy()
  tray = null
}

function createTray(): void {
  if (tray || !isMenuBarIconEnabled()) return

  tray = new Tray(getTrayImage(getTrayVisualState(sessionManager.getSession())))
  tray.setIgnoreDoubleClickEvents(true)
  tray.on('click', () => {
    tray?.popUpContextMenu()
  })
  tray.on('right-click', () => {
    tray?.popUpContextMenu()
  })
  updateTray(sessionManager.getSession())
}

function syncTrayVisibility(): void {
  if (isMenuBarIconEnabled()) {
    createTray()
    updateTray(sessionManager.getSession())
  } else {
    destroyTray()
  }
  syncDockVisibility()
}

const sessionManager = new SessionManager((session) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('session:state', session)
  }
  const broadcastKey = getBroadcastSessionKey(session)
  if (broadcastKey !== lastBroadcastSessionKey) {
    broadcastUISessionState(session)
    lastBroadcastSessionKey = broadcastKey
  }
  updateTray(session)
})

app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) {
    mainWindow.restore()
  }
  showMainWindow()
})

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 640,
    minWidth: 400,
    minHeight: 500,
    title: 'Latch',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (app.isPackaged) {
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  } else {
    void win.loadURL('http://localhost:5173')
  }

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  win.on('show', () => {
    syncDockVisibility()
  })

  win.on('hide', () => {
    syncDockVisibility()
  })

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
    syncDockVisibility()
  })

  return win
}

function showMainWindow(): void {
  if (process.platform === 'darwin' && app.isReady()) {
    app.dock.show()
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  } else {
    mainWindow = createWindow()
  }
}

function updateTray(session: Session | null): void {
  if (!tray) return

  const hasBlockingSession = isBlockingVisibleInTray(session)
  const canStopSession = hasBlockingSession && session?.status !== 'stopping'
  const isIndefinite = session?.status === 'active' && !!session.isIndefinite
  const statusLabel = getTrayStatusLabel(session)
  const menuBarTitle = getTrayMenuBarTitle(session)
  const trayImage = getTrayImage(getTrayVisualState(session))

  tray.setImage(trayImage)
  tray.setTitle(menuBarTitle)
  if (process.platform === 'darwin') {
    tray.setPressedImage(trayImage)
  }

  const sessionActions: Electron.MenuItemConstructorOptions[] = []

  if (hasBlockingSession) {
    sessionActions.push({
      label: 'End Session',
      enabled: canStopSession,
      click: () => { void sessionManager.stopSession() },
    })
  } else {
    sessionActions.push({
      label: 'Start Focus Session…',
      click: showMainWindow,
    })
  }

  if (isIndefinite) {
    sessionActions.push({
      label: 'Turn Off Always Block',
      enabled: canStopSession,
      click: () => { void sessionManager.stopSession() },
    })
  } else if (!hasBlockingSession) {
    sessionActions.push({
      label: 'Enable Always Block',
      click: () => {
        const blocklists = configStore.getAllBlocklists()
        const first = blocklists.find((blocklist) => blocklist.domains.length > 0)
        if (first) {
          void sessionManager.startSession(
            { blocklistId: first.id, durationMs: 0, isIndefinite: true },
            first.domains,
          )
        } else {
          showMainWindow()
        }
      },
    })
  }

  const menu = Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: 'Open Latch',
      click: showMainWindow,
    },
    ...sessionActions,
    { type: 'separator' as const },
    {
      label: 'Quit Latch',
      click: () => { app.quit() },
    },
  ])

  tray.setContextMenu(menu)
  tray.setToolTip(statusLabel)
}

app.on('before-quit', (event) => {
  isQuitting = true
  if (!sessionManager.isActive()) return
  event.preventDefault()

  const timeout = setTimeout(() => {
    console.error('Helper unresponsive during quit — forcing exit')
    app.exit(1)
  }, 8000)

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

app.whenReady().then(async () => {
  if (!isNMHostRegistered()) {
    registerNMHost()
  }

  if (!isHelperInstalled()) {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Latch Setup',
      message: 'Latch needs one-time admin access to set up the blocking helper.',
      detail: 'You will be prompted for your password once. This helper enables blocking without repeated password prompts.',
      buttons: ['Install Helper', 'Cancel'],
    })
    if (result.response === 0) {
      try {
        installMacHelper()
      } catch (err) {
        await dialog.showMessageBox({
          type: 'error',
          title: 'Setup Failed',
          message: 'Could not install the blocking helper.',
          detail: String(err),
        })
      }
    }
  }

  startUISocket(async (msg: NativeMessageToElectron): Promise<NativeMessageFromElectron> => {
    if (msg.type === 'get_state') {
      const session = sessionManager.getSession()
      return { type: 'session_state', payload: session }
    }
    return { type: 'no_session' }
  })

  const sessionPath = sessionManager.getSessionPath()
  const stale = detectStaleSession(sessionPath)
  if (stale && !stale.policy.requiresDialog) {
    if (stale.hostsHasMarkers) {
      try { await removeBlock('recovery') } catch { /* best effort */ }
    }
    writeSessionAtomic(sessionPath, null)
  }

  registerIpcHandlers(sessionManager, configStore, stale?.session ?? null, () => {
    syncTrayVisibility()
  })

  mainWindow = createWindow()
  syncTrayVisibility()

  if (stale?.policy.requiresDialog && mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('recovery:detected', {
        session: stale.session,
        hostsHasMarkers: stale.hostsHasMarkers,
      })
    })
  }
})

app.on('window-all-closed', () => {
  // intentional no-op: keep the process alive
})

app.on('activate', () => {
  showMainWindow()
})
