/**
 * Preload script — exposes the safe IPC API to the renderer via contextBridge.
 *
 * This object IS the renderer-facing contract: `LatchApi` is derived from it
 * with `typeof`, and `src/renderer/latch-api.d.ts` types `window.latch` as
 * that. The renderer used to re-declare the surface by hand, which had already
 * drifted into `Promise<unknown>` in several places; there is now nothing to
 * keep in sync, so every channel keeps its real types all the way through.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppPreferences,
  BlockList,
  DomainValidationResult,
  IpcResult,
  IpcSessionStart,
  RecoveryAction,
  Session,
  StaleSessionInfo,
} from '@latch/shared'

/** Subscribes to a main-process push channel; returns an unsubscribe function. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

const latchApi = {
  session: {
    getState: (): Promise<Session | null> => ipcRenderer.invoke('session:get-state'),
    start: (opts: IpcSessionStart): Promise<IpcResult> => ipcRenderer.invoke('session:start', opts),
    stop: (): Promise<IpcResult> => ipcRenderer.invoke('session:stop'),
    onStateChange: (cb: (session: Session | null) => void): (() => void) =>
      subscribe('session:state', cb),
    onRecovery: (cb: (info: StaleSessionInfo) => void): (() => void) =>
      subscribe('recovery:detected', cb),
    recovery: (action: RecoveryAction): Promise<IpcResult> =>
      ipcRenderer.invoke('recovery:action', action),
  },
  blocklist: {
    load: (): Promise<BlockList[]> => ipcRenderer.invoke('blocklist:load'),
    save: (blocklist: BlockList): Promise<IpcResult> =>
      ipcRenderer.invoke('blocklist:save', blocklist),
  },
  preferences: {
    get: (): Promise<AppPreferences> => ipcRenderer.invoke('preferences:get'),
    update: (patch: Partial<AppPreferences>): Promise<IpcResult<AppPreferences>> =>
      ipcRenderer.invoke('preferences:update', patch),
  },
  domain: {
    validate: (input: string): Promise<DomainValidationResult> =>
      ipcRenderer.invoke('domain:validate', input),
  },
  helper: {
    uninstall: (): Promise<IpcResult> => ipcRenderer.invoke('helper:uninstall'),
  },
} as const

export type LatchApi = typeof latchApi

contextBridge.exposeInMainWorld('latch', latchApi)
