/**
 * IPC bridge — main process handlers for renderer ↔ main communication.
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { IpcSessionStart, RecoveryAction, Session } from '@latch/shared'
import type { SessionManager } from '../session/session-manager.js'
import type { ConfigStore } from '../config/config-store.js'
import { validateDomain } from '../blocklist/validator.js'
import { removeBlock } from '../hosts/hosts-manager.js'
import { writeSessionAtomic } from '../session/session-store.js'
import { uninstallMacHelper } from '../hosts/elevation.js'
import { unregisterNMHost } from '../native-messaging/register.js'

export function registerIpcHandlers(
  sessionManager: SessionManager,
  configStore: ConfigStore,
  staleSession?: Session | null,
  onPreferencesChanged?: () => void,
): void {
  ipcMain.handle('session:get-state', () => {
    return sessionManager.getSession()
  })

  ipcMain.handle('session:start', async (_event, opts: IpcSessionStart) => {
    const blocklist = configStore.getBlocklist(opts.blocklistId)
    if (!blocklist) {
      return { error: `Blocklist ${opts.blocklistId} not found` }
    }
    const domains = blocklist.domains
    if (domains.length === 0) {
      return { error: 'Blocklist is empty — add some domains first' }
    }
    try {
      await sessionManager.startSession(opts, domains)
      return { ok: true }
    } catch (err: unknown) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('session:stop', async () => {
    try {
      await sessionManager.stopSession()
      return { ok: true }
    } catch (err: unknown) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('blocklist:load', () => {
    return configStore.getAllBlocklists()
  })

  ipcMain.handle('blocklist:save', (_event, blocklist) => {
    try {
      configStore.saveBlocklist(blocklist)
      return { ok: true }
    } catch (err: unknown) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('preferences:get', () => {
    return configStore.getPreferences()
  })

  ipcMain.handle('preferences:update', (_event, patch) => {
    try {
      const preferences = configStore.updatePreferences(patch ?? {})
      onPreferencesChanged?.()
      return { ok: true, preferences }
    } catch (err: unknown) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('domain:validate', (_event, input: string) => {
    return validateDomain(input)
  })

  ipcMain.handle('recovery:action', async (_event, action: RecoveryAction) => {
    const sessionPath = sessionManager.getSessionPath()
    if (action === 'cleanup') {
      try {
        await removeBlock('recovery')
      } catch (err) {
        console.error('removeBlock during recovery:', err)
      }
      writeSessionAtomic(sessionPath, null)
      return { ok: true }
    }

    if (action === 'resume') {
      const session = staleSession ?? sessionManager.getSession()
      if (session) {
        await sessionManager.resumeSession(session)
      }
      return { ok: true }
    }

    return { error: 'Unknown recovery action' }
  })

  ipcMain.handle('helper:uninstall', async () => {
    try {
      if (sessionManager.isActive()) {
        await sessionManager.stopSession()
      }
      uninstallMacHelper()
      unregisterNMHost()
      return { ok: true }
    } catch (err: unknown) {
      return { error: (err as Error).message }
    }
  })
}

export function broadcastSessionState(
  windows: BrowserWindow[],
  session: unknown,
): void {
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('session:state', session)
    }
  }
}
