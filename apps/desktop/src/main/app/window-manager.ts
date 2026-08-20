/**
 * Main window + dock visibility.
 *
 * Latch keeps running with no window open (menu-bar mode), so "is the window
 * showing" and "is the dock icon showing" are two related pieces of state that
 * have to move together. Keeping them in one object means `index.ts` never has
 * to reason about the pairing.
 */

import { app, BrowserWindow } from 'electron'
import * as path from 'path'

export interface WindowManagerOptions {
  /** Whether the menu-bar icon is currently shown — the dock may hide only then. */
  isMenuBarIconEnabled: () => boolean
  /** User preference: keep the dock icon even while the menu-bar icon is shown. */
  shouldKeepDockIconVisible: () => boolean
}

export class WindowManager {
  private window: BrowserWindow | null = null
  private quitting = false

  constructor(private readonly options: WindowManagerOptions) {}

  getWindow(): BrowserWindow | null {
    return this.window
  }

  /** The window if it still exists and can be driven, otherwise null. */
  private get liveWindow(): BrowserWindow | null {
    return this.window !== null && !this.window.isDestroyed() ? this.window : null
  }

  send(channel: string, payload: unknown): void {
    this.liveWindow?.webContents.send(channel, payload)
  }

  /** Suppresses dock churn while the app is tearing down. */
  markQuitting(): void {
    this.quitting = true
  }

  show(): void {
    if (process.platform === 'darwin' && app.isReady()) {
      app.dock.show()
    }

    const win = this.liveWindow
    if (!win) {
      this.create()
      return
    }

    if (win.isMinimized()) {
      win.restore()
    }
    win.show()
    win.focus()
  }

  restoreIfMinimized(): void {
    const win = this.liveWindow
    if (win?.isMinimized()) {
      win.restore()
    }
  }

  syncDockVisibility(): void {
    if (process.platform !== 'darwin' || !app.isReady() || this.quitting) return

    const hasVisibleWindow = this.liveWindow?.isVisible() === true
    const shouldShowDock =
      hasVisibleWindow ||
      !this.options.isMenuBarIconEnabled() ||
      this.options.shouldKeepDockIconVisible()

    if (shouldShowDock) {
      app.dock.show()
    } else {
      app.dock.hide()
    }
  }

  create(): BrowserWindow {
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

    // Closing the window hides it — quitting is explicit (tray or ⌘Q).
    win.on('close', (event) => {
      if (!this.quitting) {
        event.preventDefault()
        win.hide()
      }
    })

    win.on('show', () => this.syncDockVisibility())
    win.on('hide', () => this.syncDockVisibility())
    win.on('closed', () => {
      if (this.window === win) {
        this.window = null
      }
      this.syncDockVisibility()
    })

    this.window = win
    return win
  }
}
