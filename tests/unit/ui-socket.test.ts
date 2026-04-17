import * as fs from 'fs'
import * as net from 'net'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  broadcastUISessionState,
  getUISocketPath,
  startUISocket,
  stopUISocket,
} from '../../apps/desktop/src/main/ui-ipc/ui-socket.js'

let tempDir = ''

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition')
    }
    await delay(20)
  }
}

async function connectAndExchange(message: string): Promise<string> {
  const socketPath = getUISocketPath()

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath)
    let buffer = ''

    socket.once('connect', () => {
      socket.write(message)
    })
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline === -1) return
      socket.destroy()
      resolve(buffer.slice(0, newline))
    })
    socket.once('error', reject)
  })
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join('/tmp', 'latch-ui-socket-'))
  process.env.LATCH_UI_SOCKET = path.join(tempDir, 'ui.sock')
})

afterEach(async () => {
  stopUISocket()
  await waitFor(() => !fs.existsSync(getUISocketPath()), 1000).catch(() => {})
  delete process.env.LATCH_UI_SOCKET
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('ui socket', () => {
  it('serves valid requests and rejects malformed input over a real unix socket', async () => {
    startUISocket(async (msg) => {
      if (msg.type === 'get_state') {
        return { type: 'no_session' }
      }
      return { type: 'timer_state', payload: { remainingMs: 10, totalMs: 20, startedAt: 30 } }
    })

    await waitFor(() => fs.existsSync(getUISocketPath()))

    await expect(connectAndExchange('{"type":"get_state"}\n')).resolves.toBe(
      '{"type":"no_session"}',
    )
    await expect(connectAndExchange('not-json\n')).resolves.toBe(
      '{"type":"error","error":"Invalid JSON"}',
    )
  })

  it('cleans up a stale socket path before binding and applies 0600 permissions', async () => {
    fs.writeFileSync(getUISocketPath(), 'stale')

    startUISocket(async () => ({ type: 'no_session' }))

    await waitFor(() => {
      try {
        return fs.statSync(getUISocketPath()).isSocket()
      } catch {
        return false
      }
    })
    const stat = fs.statSync(getUISocketPath())

    expect(stat.isSocket()).toBe(true)
    expect(stat.mode & 0o777).toBe(0o600)
  })

  it('broadcasts session updates to subscribed clients', async () => {
    startUISocket(async (msg) => {
      if (msg.type === 'subscribe_state') {
        return { type: 'no_session' }
      }
      return { type: 'no_session' }
    })

    await waitFor(() => fs.existsSync(getUISocketPath()))

    let sawAck = false
    const received = new Promise<string>((resolve, reject) => {
      const socket = net.createConnection(getUISocketPath())
      let messages: string[] = []
      let buffer = ''

      socket.once('connect', () => {
        socket.write('{"type":"subscribe_state"}\n')
      })
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        while (true) {
          const newline = buffer.indexOf('\n')
          if (newline === -1) return
          messages.push(buffer.slice(0, newline))
          buffer = buffer.slice(newline + 1)
          if (messages.length === 1) {
            sawAck = true
          }
          if (messages.length === 2) {
            socket.destroy()
            resolve(messages[1])
            return
          }
        }
      })
      socket.once('error', reject)
    })

    await waitFor(() => sawAck)
    broadcastUISessionState({
      id: '550e8400-e29b-41d4-a716-446655440030',
      blocklistId: '550e8400-e29b-41d4-a716-446655440031',
      domains: ['reddit.com'],
      startedAt: 1_700_000_000_000,
      durationMs: 60_000,
      isIndefinite: false,
      status: 'active',
    })

    await expect(received).resolves.toBe(
      '{"type":"session_state","payload":{"id":"550e8400-e29b-41d4-a716-446655440030","blocklistId":"550e8400-e29b-41d4-a716-446655440031","domains":["reddit.com"],"startedAt":1700000000000,"durationMs":60000,"isIndefinite":false,"status":"active"}}',
    )
  })
})
