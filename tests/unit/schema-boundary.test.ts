/**
 * Regression tests for audit finding #2: Zod schemas must reject malformed
 * payloads at every trust boundary. These tests exercise the schemas that are
 * wired into the IPC handlers, ui-socket, helper-client, and nm-host.
 */

import { describe, it, expect } from 'vitest'
import {
  HelperCommandSchema,
  HelperResponseSchema,
  IpcSessionStartSchema,
  RecoveryActionSchema,
  BlockListSchema,
  NativeMessageToElectronSchema,
  NativeMessageFromElectronSchema,
} from '../../packages/shared/src/schema.js'

describe('HelperResponseSchema (helper-client boundary)', () => {
  it('accepts ok:true', () => {
    expect(HelperResponseSchema.safeParse({ ok: true }).success).toBe(true)
  })

  it('accepts ok:false with error', () => {
    expect(
      HelperResponseSchema.safeParse({ ok: false, error: 'boom' }).success
    ).toBe(true)
  })

  it('accepts pong:true', () => {
    expect(HelperResponseSchema.safeParse({ pong: true }).success).toBe(true)
  })

  it('rejects missing error on ok:false', () => {
    expect(HelperResponseSchema.safeParse({ ok: false }).success).toBe(false)
  })

  it('rejects unknown shape', () => {
    expect(HelperResponseSchema.safeParse({ status: 'yolo' }).success).toBe(false)
  })

  it('rejects null', () => {
    expect(HelperResponseSchema.safeParse(null).success).toBe(false)
  })

  it('rejects a string', () => {
    expect(HelperResponseSchema.safeParse('ok').success).toBe(false)
  })
})

describe('NativeMessageToElectronSchema (ui-socket + nm-host inbound)', () => {
  it('accepts get_state', () => {
    expect(NativeMessageToElectronSchema.safeParse({ type: 'get_state' }).success).toBe(true)
  })

  it('accepts subscribe_state', () => {
    expect(
      NativeMessageToElectronSchema.safeParse({ type: 'subscribe_state' }).success
    ).toBe(true)
  })

  it('rejects unknown type', () => {
    expect(
      NativeMessageToElectronSchema.safeParse({ type: 'drop_tables' }).success
    ).toBe(false)
  })

  it('rejects missing type', () => {
    expect(NativeMessageToElectronSchema.safeParse({}).success).toBe(false)
  })

  it('rejects a string', () => {
    expect(NativeMessageToElectronSchema.safeParse('get_state').success).toBe(false)
  })
})

describe('NativeMessageFromElectronSchema (nm-host outbound)', () => {
  it('accepts no_session', () => {
    expect(
      NativeMessageFromElectronSchema.safeParse({ type: 'no_session' }).success
    ).toBe(true)
  })

  it('accepts session_state with null payload', () => {
    expect(
      NativeMessageFromElectronSchema.safeParse({
        type: 'session_state',
        payload: null,
      }).success
    ).toBe(true)
  })

  it('rejects session_state with malformed payload', () => {
    expect(
      NativeMessageFromElectronSchema.safeParse({
        type: 'session_state',
        payload: { id: 'not-a-uuid' },
      }).success
    ).toBe(false)
  })

  it('rejects timer_state without payload', () => {
    expect(
      NativeMessageFromElectronSchema.safeParse({ type: 'timer_state' }).success
    ).toBe(false)
  })
})

describe('IpcSessionStartSchema (session:start IPC boundary)', () => {
  it('accepts a valid payload', () => {
    const r = IpcSessionStartSchema.safeParse({
      blocklistId: 'list-1',
      durationMs: 60_000,
    })
    expect(r.success).toBe(true)
  })

  it('accepts isIndefinite', () => {
    expect(
      IpcSessionStartSchema.safeParse({
        blocklistId: 'list-1',
        durationMs: 0,
        isIndefinite: true,
      }).success
    ).toBe(true)
  })

  it('rejects missing blocklistId', () => {
    expect(IpcSessionStartSchema.safeParse({ durationMs: 60_000 }).success).toBe(false)
  })

  it('rejects empty blocklistId', () => {
    expect(
      IpcSessionStartSchema.safeParse({ blocklistId: '', durationMs: 60_000 }).success
    ).toBe(false)
  })

  it('rejects negative durationMs', () => {
    expect(
      IpcSessionStartSchema.safeParse({ blocklistId: 'x', durationMs: -1 }).success
    ).toBe(false)
  })

  it('rejects string durationMs', () => {
    expect(
      IpcSessionStartSchema.safeParse({ blocklistId: 'x', durationMs: '60000' }).success
    ).toBe(false)
  })
})

describe('RecoveryActionSchema (recovery:action IPC boundary)', () => {
  it('accepts resume', () => {
    expect(RecoveryActionSchema.safeParse('resume').success).toBe(true)
  })

  it('accepts cleanup', () => {
    expect(RecoveryActionSchema.safeParse('cleanup').success).toBe(true)
  })

  it('rejects arbitrary string', () => {
    expect(RecoveryActionSchema.safeParse('nuke').success).toBe(false)
  })

  it('rejects non-string', () => {
    expect(RecoveryActionSchema.safeParse(42).success).toBe(false)
  })
})

describe('BlockListSchema (blocklist:save IPC boundary)', () => {
  const valid = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'focus',
    domains: ['reddit.com'],
    createdAt: 1_700_000_000_000,
  }

  it('accepts a valid blocklist', () => {
    expect(BlockListSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects non-uuid id', () => {
    expect(BlockListSchema.safeParse({ ...valid, id: 'list-1' }).success).toBe(false)
  })

  it('rejects missing name', () => {
    expect(
      BlockListSchema.safeParse({ ...valid, name: undefined }).success
    ).toBe(false)
  })

  it('rejects non-array domains', () => {
    expect(
      BlockListSchema.safeParse({ ...valid, domains: 'reddit.com' }).success
    ).toBe(false)
  })
})

describe('HelperCommandSchema (helper-client outbound — defensive)', () => {
  it('accepts write_block', () => {
    expect(
      HelperCommandSchema.safeParse({
        cmd: 'write_block',
        domains: ['a.com'],
        sessionId: 'sid',
      }).success
    ).toBe(true)
  })

  it('rejects unknown command', () => {
    expect(HelperCommandSchema.safeParse({ cmd: 'rm -rf' }).success).toBe(false)
  })

  it('rejects write_block without sessionId', () => {
    expect(
      HelperCommandSchema.safeParse({ cmd: 'write_block', domains: [] }).success
    ).toBe(false)
  })
})
