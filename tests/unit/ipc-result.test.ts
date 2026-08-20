/**
 * IPC handlers answer with a discriminated `IpcResult`. The renderer narrows on
 * `ok` alone, so these helpers must never produce a half-populated envelope.
 */

import { describe, expect, it } from 'vitest'
import { ipcFail, ipcOk, toErrorMessage } from '../../packages/shared/src/index.js'

describe('ipcOk', () => {
  it('marks success with no payload', () => {
    expect(ipcOk()).toEqual({ ok: true, data: undefined })
  })

  it('carries a payload when there is one', () => {
    expect(ipcOk({ showMenuBarIcon: true })).toEqual({
      ok: true,
      data: { showMenuBarIcon: true },
    })
  })
})

describe('ipcFail', () => {
  it('unwraps an Error message', () => {
    expect(ipcFail(new Error('helper is not running'))).toEqual({
      ok: false,
      error: 'helper is not running',
    })
  })

  it('accepts a plain string reason', () => {
    expect(ipcFail('Invalid blocklist payload')).toEqual({
      ok: false,
      error: 'Invalid blocklist payload',
    })
  })
})

describe('toErrorMessage', () => {
  it('reads the message off an Error', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('reads a message-shaped object thrown across a process boundary', () => {
    expect(toErrorMessage({ message: 'serialized failure' })).toBe('serialized failure')
  })

  // The previous `(err as Error).message` cast threw a second time on these.
  it('survives thrown values that are not Errors', () => {
    expect(toErrorMessage('plain string')).toBe('plain string')
    expect(toErrorMessage(undefined)).toBe('undefined')
    expect(toErrorMessage(null)).toBe('null')
    expect(toErrorMessage(42)).toBe('42')
  })
})
