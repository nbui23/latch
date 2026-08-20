/**
 * IPC bridge — main process handlers for renderer ↔ main communication.
 *
 * Every command handler answers with an `IpcResult`, so the renderer narrows on
 * a single `ok` discriminant instead of probing for an optional `error` field.
 * Query handlers (`*:get`, `*:load`) return their value directly.
 */

import { ipcMain } from 'electron'
import { z } from 'zod'
import type {
  AppPreferences,
  BlockList,
  DomainValidationResult,
  IpcResult,
  Session,
} from '@latch/shared'
import {
  BlockListSchema,
  IpcSessionStartSchema,
  RecoveryActionSchema,
  ipcFail,
  ipcOk,
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
  ipc.handle('session:get-state', (): Session | null => {
    return sessionManager.getSession()
  })

  ipc.handle('session:start', async (_event, rawOpts): Promise<IpcResult> => {
    const parsed = IpcSessionStartSchema.safeParse(rawOpts)
    if (!parsed.success) {
      return ipcFail('Invalid session start parameters')
    }
    const opts = parsed.data
    const blocklist = configStore.getBlocklist(opts.blocklistId)
    if (!blocklist) {
      return ipcFail(`Blocklist ${opts.blocklistId} not found`)
    }
    const domains = blocklist.domains
    if (domains.length === 0) {
      return ipcFail('Blocklist is empty — add some domains first')
    }
    try {
      await sessionManager.startSession(opts, domains)
      return ipcOk()
    } catch (err) {
      return ipcFail(err)
    }
  })

  ipc.handle('session:stop', async (): Promise<IpcResult> => {
    try {
      await sessionManager.stopSession()
      return ipcOk()
    } catch (err) {
      return ipcFail(err)
    }
  })

  ipc.handle('blocklist:load', (): BlockList[] => {
    return configStore.getAllBlocklists()
  })

  ipc.handle('blocklist:save', (_event, rawBlocklist): IpcResult => {
    const parsed = BlockListSchema.safeParse(rawBlocklist)
    if (!parsed.success) {
      return ipcFail('Invalid blocklist payload')
    }
    try {
      configStore.saveBlocklist(parsed.data)
      return ipcOk()
    } catch (err) {
      return ipcFail(err)
    }
  })

  ipc.handle('preferences:get', (): AppPreferences => {
    return configStore.getPreferences()
  })

  ipc.handle('preferences:update', (_event, rawPatch): IpcResult<AppPreferences> => {
    const parsed = AppPreferencesPatchSchema.safeParse(rawPatch ?? {})
    if (!parsed.success) {
      return ipcFail('Invalid preferences patch')
    }
    try {
      const preferences = configStore.updatePreferences(parsed.data)
      onPreferencesChanged?.()
      return ipcOk(preferences)
    } catch (err) {
      return ipcFail(err)
    }
  })

  ipc.handle('domain:validate', (_event, rawInput): DomainValidationResult => {
    const parsed = z.string().safeParse(rawInput)
    if (!parsed.success) {
      return { valid: false, error: 'Domain must be a string' }
    }
    return validateDomain(parsed.data)
  })

  ipc.handle('recovery:action', async (_event, rawAction): Promise<IpcResult> => {
    const parsedAction = RecoveryActionSchema.safeParse(rawAction)
    if (!parsedAction.success) {
      return ipcFail('Unknown recovery action')
    }

    if (parsedAction.data === 'cleanup') {
      try {
        await removeBlock('recovery')
      } catch (err) {
        console.error('removeBlock during recovery:', err)
      }
      writeSessionAtomic(sessionManager.getSessionPath(), null)
      return ipcOk()
    }

    const session = staleSession ?? sessionManager.getSession()
    if (session) {
      await sessionManager.resumeSession(session)
    }
    return ipcOk()
  })

  ipc.handle('helper:uninstall', async (): Promise<IpcResult> => {
    try {
      if (sessionManager.isActive()) {
        await sessionManager.stopSession()
      }
      uninstallMacHelper()
      unregisterNMHost()
      return ipcOk()
    } catch (err) {
      return ipcFail(err)
    }
  })
}
