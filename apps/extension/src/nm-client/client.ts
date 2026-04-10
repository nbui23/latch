// Native messaging client helpers for the extension background script
// The extension communicates with the Latch NM host binary via chrome.runtime.connectNative

export const NM_HOST_ID = 'app.latch'

export interface NMGetStateMessage {
  type: 'get_state'
}

export type NMOutboundMessage = NMGetStateMessage

export interface NMSessionStateMessage {
  type: 'session_state'
  payload: {
    id: string
    blocklistId: string
    domains: string[]
    startedAt: number
    durationMs: number
    status: string
  } | null
}

export interface NMNoSessionMessage {
  type: 'no_session'
}

export interface NMTimerStateMessage {
  type: 'timer_state'
  payload: {
    remainingMs: number
    totalMs: number
    startedAt: number
  }
}

export type NMInboundMessage = NMSessionStateMessage | NMNoSessionMessage | NMTimerStateMessage

export function parseNMMessage(msg: unknown): NMInboundMessage | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, unknown>
  if (m.type === 'session_state') return m as unknown as NMSessionStateMessage
  if (m.type === 'no_session') return m as unknown as NMNoSessionMessage
  if (m.type === 'timer_state') return m as unknown as NMTimerStateMessage
  return null
}
