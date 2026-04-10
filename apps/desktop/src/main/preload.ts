/**
 * Preload script — exposes safe IPC API to renderer via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcSessionStart,
  BlockList,
  Session,
  StaleSessionInfo,
  RecoveryAction,
  AppPreferences,
} from '@latch/shared'

contextBridge.exposeInMainWorld('latch', {
  session: {
    getState: (): Promise<Session | null> => ipcRenderer.invoke('session:get-state'),
    start: (opts: IpcSessionStart) => ipcRenderer.invoke('session:start', opts),
    stop: () => ipcRenderer.invoke('session:stop'),
    onStateChange: (cb: (session: Session | null) => void) => {
      const handler = (_: unknown, session: Session | null) => cb(session)
      ipcRenderer.on('session:state', handler)
      return () => ipcRenderer.off('session:state', handler)
    },
    onRecovery: (cb: (info: StaleSessionInfo) => void) => {
      const handler = (_: unknown, info: StaleSessionInfo) => cb(info)
      ipcRenderer.on('recovery:detected', handler)
      return () => ipcRenderer.off('recovery:detected', handler)
    },
    recovery: (action: RecoveryAction) => ipcRenderer.invoke('recovery:action', action),
  },
  blocklist: {
    load: (): Promise<BlockList[]> => ipcRenderer.invoke('blocklist:load'),
    save: (bl: BlockList): Promise<{ ok?: boolean; error?: string }> =>
      ipcRenderer.invoke('blocklist:save', bl),
  },
  preferences: {
    get: (): Promise<AppPreferences> => ipcRenderer.invoke('preferences:get'),
    update: (patch: Partial<AppPreferences>): Promise<{ ok?: boolean; error?: string; preferences?: AppPreferences }> =>
      ipcRenderer.invoke('preferences:update', patch),
  },
  domain: {
    validate: (input: string) => ipcRenderer.invoke('domain:validate', input),
  },
  helper: {
    uninstall: (): Promise<{ ok?: boolean; error?: string }> =>
      ipcRenderer.invoke('helper:uninstall'),
  },
})
