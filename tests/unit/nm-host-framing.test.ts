/**
 * Regression tests for audit finding #3: the native-messaging host must
 * reject oversized or malformed length prefixes before allocating buffers.
 * These tests drive the real readNativeMessage loop using PassThrough
 * rather than mocking stdin internals.
 */

import { describe, it, expect } from 'vitest'
import { PassThrough } from 'stream'
import {
  MAX_NM_MESSAGE_BYTES,
  readNativeMessage,
  writeNativeMessage,
} from '../../apps/nm-host/src/framing.js'

function lenPrefix(len: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(len >>> 0, 0)
  return buf
}

describe('readNativeMessage', () => {
  it('reads a well-formed message', async () => {
    const stream = new PassThrough()
    const body = Buffer.from('{"type":"get_state"}')
    stream.write(Buffer.concat([lenPrefix(body.length), body]))

    const result = await readNativeMessage(stream)
    expect(result.toString('utf8')).toBe('{"type":"get_state"}')
  })

  it('rejects a length prefix above the 1 MiB cap', async () => {
    const stream = new PassThrough()
    stream.write(lenPrefix(MAX_NM_MESSAGE_BYTES + 1))

    await expect(readNativeMessage(stream)).rejects.toThrow(/Invalid native message length/)
  })

  it('rejects a giant 4 GiB length prefix without allocating', async () => {
    const stream = new PassThrough()
    // Write raw bytes for 0xFFFFFFFF (max uint32) — would be ~4 GiB.
    const maxUint32 = Buffer.from([0xff, 0xff, 0xff, 0xff])
    stream.write(maxUint32)

    await expect(readNativeMessage(stream)).rejects.toThrow(/Invalid native message length/)
  })

  it('rejects a zero-length prefix (malformed)', async () => {
    const stream = new PassThrough()
    stream.write(lenPrefix(0))

    await expect(readNativeMessage(stream)).rejects.toThrow(/Invalid native message length/)
  })

  it('rejects when stdin closes before the body arrives', async () => {
    const stream = new PassThrough()
    stream.write(lenPrefix(10))
    stream.end()

    await expect(readNativeMessage(stream)).rejects.toThrow(/stdin closed/)
  })

  it('accepts a message at exactly the 1 MiB cap', async () => {
    const stream = new PassThrough()
    const body = Buffer.alloc(MAX_NM_MESSAGE_BYTES, 0x61) // 'a'
    const prefix = lenPrefix(MAX_NM_MESSAGE_BYTES)

    const promise = readNativeMessage(stream)
    // Write prefix and body in chunks — exercises the partial-read code path.
    stream.write(prefix)
    stream.write(body.subarray(0, body.length / 2))
    stream.write(body.subarray(body.length / 2))

    const result = await promise
    expect(result.length).toBe(MAX_NM_MESSAGE_BYTES)
  })

  it('exposes the cap at Chromium\'s documented limit (1 MiB)', () => {
    expect(MAX_NM_MESSAGE_BYTES).toBe(1024 * 1024)
  })
})

describe('writeNativeMessage', () => {
  it('emits length-prefixed JSON', () => {
    const chunks: Buffer[] = []
    const out = new PassThrough()
    out.on('data', (c: Buffer) => chunks.push(c))

    writeNativeMessage({ type: 'no_session' }, out)

    const combined = Buffer.concat(chunks)
    const len = combined.readUInt32LE(0)
    const body = combined.subarray(4, 4 + len).toString('utf8')
    expect(JSON.parse(body)).toEqual({ type: 'no_session' })
  })
})
