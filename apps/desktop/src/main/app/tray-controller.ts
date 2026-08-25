/**
 * Menu-bar tray lifecycle: icon caching, menu construction, show/hide.
 *
 * The pure parts (labels, visual state) live in `../tray-state.ts` and are unit
 * tested; this module is only the Electron plumbing around them.
 */

import { Menu, Tray, nativeImage } from 'electron'
import * as path from 'path'
import type { Session } from '@latch/shared'
import { isBlockingSession } from '@latch/shared'
import {
  createTraySvg,
  getTrayMenuBarTitle,
  getTrayStatusLabel,
  getTrayVisualState,
  type TrayVisualState,
} from '../tray-state.js'

const TRAY_ICON_SIZE = { width: 18, height: 18 }

export interface TrayActions {
  /** Surfaces the main window — both "Open Latch" and "Start Focus Session…". */
  openApp: () => void
  stopSession: () => void
  enableAlwaysBlock: () => void
  quit: () => void
}

function getDesktopResourcePath(filename: string): string {
  return path.join(__dirname, '..', '..', 'resources', filename)
}

export class TrayController {
  private tray: Tray | null = null
  private session: Session | null = null
  /**
   * Visual state + status label, from the last render. Every other thing the
   * tray shows — icon, menu-bar title, menu items, tooltip — is a function of
   * those two, so an unchanged pair means the whole tray is unchanged and
   * rebuilding the NSMenu would be pure churn.
   */
  private lastRenderKey: string | null = null
  private labelTimer: ReturnType<typeof setInterval> | null = null
  private readonly images: Partial<Record<TrayVisualState, Electron.NativeImage>> = {}

  constructor(private readonly actions: TrayActions) {}

  /** Creates the tray if it should exist and refreshes it, or tears it down. */
  sync(session: Session | null, enabled: boolean): void {
    if (!enabled) {
      this.destroy()
      return
    }

    if (!this.tray) {
      this.tray = new Tray(this.getImage(getTrayVisualState(session)))
      this.tray.setIgnoreDoubleClickEvents(true)
      this.tray.on('click', () => this.tray?.popUpContextMenu())
      this.tray.on('right-click', () => this.tray?.popUpContextMenu())
    }

    this.update(session)
  }

  update(session: Session | null): void {
    this.session = session
    this.render()

    // A running countdown is the only thing that changes the tray on its own,
    // and only once a minute. Anything else moves when the session state does.
    // No tray means nothing to refresh — arming the timer anyway is the leak
    // this ticket exists to remove.
    if (this.tray && session?.status === 'active' && !session.isIndefinite) {
      if (!this.labelTimer) {
        this.labelTimer = setInterval(() => this.render(), 60_000)
      }
    } else {
      this.clearLabelTimer()
    }
  }

  destroy(): void {
    this.clearLabelTimer()
    if (!this.tray) return
    this.tray.removeAllListeners()
    this.tray.destroy()
    this.tray = null
    this.lastRenderKey = null
  }

  private clearLabelTimer(): void {
    if (!this.labelTimer) return
    clearInterval(this.labelTimer)
    this.labelTimer = null
  }

  private render(): void {
    const tray = this.tray
    if (!tray) return

    const session = this.session
    const visualState = getTrayVisualState(session)
    const statusLabel = getTrayStatusLabel(session)

    const key = `${visualState} ${statusLabel}`
    if (key === this.lastRenderKey) return
    this.lastRenderKey = key

    const image = this.getImage(visualState)
    tray.setImage(image)
    tray.setTitle(getTrayMenuBarTitle(session))
    if (process.platform === 'darwin') {
      tray.setPressedImage(image)
    }

    tray.setContextMenu(Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { type: 'separator' },
      { label: 'Open Latch', click: this.actions.openApp },
      ...this.buildSessionItems(session),
      { type: 'separator' },
      { label: 'Quit Latch', click: this.actions.quit },
    ]))
    tray.setToolTip(statusLabel)
  }

  private buildSessionItems(session: Session | null): Electron.MenuItemConstructorOptions[] {
    const isBlocking = isBlockingSession(session)
    const canStop = isBlocking && session?.status !== 'stopping'
    const items: Electron.MenuItemConstructorOptions[] = []

    if (isBlocking) {
      items.push({ label: 'End Session', enabled: canStop, click: this.actions.stopSession })
    } else {
      items.push({ label: 'Start Focus Session…', click: this.actions.openApp })
    }

    const isIndefinite = session?.status === 'active' && session.isIndefinite === true
    if (isIndefinite) {
      items.push({ label: 'Turn Off Always Block', enabled: canStop, click: this.actions.stopSession })
    } else if (!isBlocking) {
      items.push({ label: 'Enable Always Block', click: this.actions.enableAlwaysBlock })
    }

    return items
  }

  /**
   * Template images ship as PNGs; the inline SVG is the fallback for a build
   * where the resource is missing, so the menu bar is never blank.
   */
  private getImage(state: TrayVisualState): Electron.NativeImage {
    const cached = this.images[state]
    if (cached && !cached.isEmpty()) return cached

    const image = process.platform === 'darwin'
      ? nativeImage
          .createFromPath(getDesktopResourcePath(
            state === 'active' ? 'tray-activeTemplate.png' : 'tray-inactiveTemplate.png',
          ))
          .resize(TRAY_ICON_SIZE)
      : nativeImage.createFromPath(getDesktopResourcePath('icon.png'))

    const resolved = image.isEmpty() ? this.createFallbackImage(state) : image
    this.images[state] = resolved
    return resolved
  }

  private createFallbackImage(state: TrayVisualState): Electron.NativeImage {
    if (process.platform !== 'darwin') return nativeImage.createEmpty()

    const svg = Buffer.from(createTraySvg(state)).toString('base64')
    return nativeImage
      .createFromDataURL(`data:image/svg+xml;base64,${svg}`)
      .resize(TRAY_ICON_SIZE)
  }
}
