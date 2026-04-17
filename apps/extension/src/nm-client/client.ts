// Native messaging client helpers for the extension background script.
// The extension communicates with the Latch NM host binary via
// chrome.runtime.connectNative. All inbound messages MUST be validated at
// this boundary with the shared Zod schema — the host is trusted but the
// browser <-> host transport can be driven by unexpected/unknown payloads
// (e.g. a stale NM host from an older build, a transient transport glitch,
// or a buggy caller). We must never trust the shape of `msg` before parsing.

import {
  NativeMessageFromElectronSchema,
  NativeMessageToElectronSchema,
  type NativeMessageFromElectron,
  type NativeMessageToElectron,
} from '@latch/shared'

export const NM_HOST_ID = 'app.latch'

export type NMOutboundMessage = NativeMessageToElectron
export type NMInboundMessage = NativeMessageFromElectron

// Narrower aliases preserved for call sites that discriminate by `type`.
export type NMSessionStateMessage = Extract<NMInboundMessage, { type: 'session_state' }>
export type NMNoSessionMessage = Extract<NMInboundMessage, { type: 'no_session' }>
export type NMTimerStateMessage = Extract<NMInboundMessage, { type: 'timer_state' }>

export function parseNMMessage(msg: unknown): NMInboundMessage | null {
  const parsed = NativeMessageFromElectronSchema.safeParse(msg)
  return parsed.success ? parsed.data : null
}

export function parseNMOutboundMessage(msg: unknown): NMOutboundMessage | null {
  const parsed = NativeMessageToElectronSchema.safeParse(msg)
  return parsed.success ? parsed.data : null
}
