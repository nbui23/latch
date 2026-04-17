/**
 * IPC bridge — main process handlers for renderer ↔ main communication.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { Session } from '@latch/shared'
import {
  BlockListSchema,
  IpcSessionStartSchema,
  RecoveryActionSchema,
} from '@latch/shared'
import type { SessionManager } from '../session/session-manager.js'
import type { ConfigStore } from '../config/config-store.js'
import { validateDomain } from '../blocklist/validator.js'
import { removeBlock } from '../hosts/hosts-manager.js'
import { writeSessionAtomic } from '../session/session-store.js'
import { uninstallMacHelper } from '../hosts/elevation.js'
import { unregisterNMHost } from '../native-messaging/register.js'

// Partial preferences patch for `preferences:update` — each field optional,
// no defaults applied (unlike AppPreferencesSchema which fills defaults).
const AppPreferencesPatchSchema = z
  .object({
    defaultDurationMs: z.number().nonnegative(),
    showMenuBarIcon: z.boolean(),
    showDockIconWhenMenuBarEnabled: z.boolean(),
  })
  .partial()

type IpcRegistrar = Pick<typeof ipcMain, 'handle'>

export function registerIpcHandlers(
  sessionManager: SessionManager,
  configStore: ConfigStore,
  staleSession?: Session | null,
  onPreferencesChanged?: () => void,
): void {
  registerIpcHandlersWith(ipcMain, sessionManager, configStore, staleSession, onPreferencesChanged)
}

export function registerIpcHandlersWith(
  ipc: IpcRegistrar,
  sessionManager: SessionManager,
  configStore: ConfigStore,
  staleSession?: Session | null,
  onPreferencesChanged?: () => void,
): void {
  ipc.handle('session:get-state', () => {
    return sessionManager.getSession()
  })

  ipc.handle('session:start', async (_event, rawOpts) => {
    const parsed = IpcSessionStartSchema.safeParse(rawOpts)
    if (!parsed.success) {
      return { error: 'Invalid session start parameters' }
    }
    const opts = parsed.data
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

  ipc.handle('session:stop', async () => {
    try {
      await sessionManager.stopSession()
      return { ok: true }
    } catch (err: unknown) {
      return { error: (err as Error).message }
    }
  })

  ipc.handle('blocklist:load', () => {
    return configStore.getAllBlocklists()
  })

  ipc.handle('blocklist:save', (_event, rawBlocklist) => {
    const parsed = BlockListSchema.safeParse(rawBlocklist)
    if (!parsed.success) {
      return { error: 'Invalid blocklist payload' }
    }
    try {
      configStore.saveBlocklist(parsed.data)
      return { ok: true }
    } catch (err: unknown) {
      return { error: (err as Error).message }
    }
  })

  ipc.handle('preferences:get', () => {
    return configStore.getPreferences()
  })

  ipc.handle('preferences:update', (_event, rawPatch) => {
    const parsed = AppPreferencesPatchSchema.safeParse(rawPatch ?? {})
    if (!parsed.success) {
      return { error: 'Invalid preferences patch' }
    }
    try {
      const preferences = configStore.updatePreferences(parsed.data)
      onPreferencesChanged?.()
      return { ok: true, preferences }
    } catch (err: unknown) {
      return { error: (err as Error).message }
    }
  })

  ipc.handle('domain:validate', (_event, rawInput) => {
    const parsed = z.string().safeParse(rawInput)
    if (!parsed.success) {
      return { valid: false, error: 'Domain must be a string' }
    }
    return validateDomain(parsed.data)
  })

  ipc.handle('recovery:action', async (_event, rawAction) => {
    const parsedAction = RecoveryActionSchema.safeParse(rawAction)
    if (!parsedAction.success) {
      return { error: 'Unknown recovery action' }
    }
    const action = parsedAction.data
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

  ipc.handle('helper:uninstall', async () => {
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
