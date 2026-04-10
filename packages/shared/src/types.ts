// Latch shared types
// Used by desktop app, NM host, and browser extensions

export type SessionStatus =
  | 'idle'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'recovering'
  | 'helper_unavailable'

export interface BlockedSite {
  domain: string
}

export interface BlockList {
  id: string
  name: string
  domains: string[]
  createdAt: number
}

export interface Session {
  id: string
  blocklistId: string
  domains: string[]
  startedAt: number
  durationMs: number
  isIndefinite?: boolean
  status: SessionStatus
  intent?: 'will_write_hosts' | 'will_remove_hosts'
}

export interface TimerState {
  remainingMs: number
  totalMs: number
  startedAt: number
}

export type HelperCommand =
  | { cmd: 'write_block'; domains: string[]; sessionId: string }
  | { cmd: 'remove_block'; sessionId: string }
  | { cmd: 'ping' }

export type HelperResponse =
  | { ok: true }
  | { ok: false; error: string }
  | { pong: true }

// Native messaging messages (extension <-> NM host <-> Electron)
export type NativeMessageToElectron =
  | { type: 'get_state' }
  | { type: 'subscribe_state' }

export type NativeMessageFromElectron =
  | { type: 'session_state'; payload: Session | null }
  | { type: 'no_session' }
  | { type: 'timer_state'; payload: TimerState }

export type NativeMessage = NativeMessageToElectron | NativeMessageFromElectron

// IPC messages (renderer <-> main)
export interface IpcSessionStart {
  blocklistId: string
  durationMs: number
  isIndefinite?: boolean
}

export interface StaleSessionInfo {
  session: Session | null
  hostsHasMarkers: boolean
}

export type RecoveryAction = 'resume' | 'cleanup'

export type HelperStatus = 'running' | 'unavailable'
