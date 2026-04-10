/**
 * Latch NM Host Proxy
 *
 * Spawned by Chromium browsers as a native messaging host.
 * Reads browser NM stdio (4-byte length prefix + JSON) and proxies
 * messages to/from the running Electron app via a UI socket.
 */

import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import type { NativeMessageFromElectron, NativeMessageToElectron } from '@latch/shared'

// P0-7: /var/run is root-owned on macOS; use per-user temp dir instead.
// Must match the path used in apps/desktop/src/main/ui-ipc/ui-socket.ts.
const UI_SOCKET = path.join(os.tmpdir(), 'latch-ui.sock')

// MARK: - NM framing: 4-byte little-endian length prefix + JSON body

function readNativeMessage(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lenBuf = Buffer.alloc(4)
    let lenBytesRead = 0
    let msgLen = -1

    const cleanup = () => {
      process.stdin.removeListener('readable', onReadable)
      process.stdin.removeListener('error', onError)
      process.stdin.removeListener('end', onEnd)
    }

    const onError = (err: Error) => { cleanup(); reject(err) }
    const onEnd = () => { cleanup(); reject(new Error('stdin closed')) }

    const onReadable = () => {
      // Phase 1: read 4-byte length prefix
      while (lenBytesRead < 4) {
        const chunk = process.stdin.read(4 - lenBytesRead) as Buffer | null
        if (!chunk) return // wait for more data
        chunk.copy(lenBuf, lenBytesRead)
        lenBytesRead += chunk.length
      }
      if (msgLen === -1) {
        msgLen = lenBuf.readUInt32LE(0)
      }

      // Phase 2: read message body
      const body = process.stdin.read(msgLen) as Buffer | null
      if (!body) return // wait for more data
      cleanup()
      resolve(body)
    }

    process.stdin.on('readable', onReadable)
    process.stdin.on('error', onError)
    process.stdin.on('end', onEnd)
    // Attempt immediate read in case data is already buffered
    onReadable()
  })
}

function writeNativeMessage(msg: object): void {
  const json = JSON.stringify(msg)
  const len = Buffer.byteLength(json, 'utf8')
  const buf = Buffer.alloc(4 + len)
  buf.writeUInt32LE(len, 0)
  buf.write(json, 4, 'utf8')
  process.stdout.write(buf)
}

// MARK: - Connect to Electron UI socket with retry

const NO_SESSION_MSG: NativeMessageFromElectron = { type: 'no_session' }
let subscriptionSocket: net.Socket | null = null
let subscriptionBuffer = ''
let subscriptionRetryTimer: ReturnType<typeof setTimeout> | null = null

function connectToElectron(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(UI_SOCKET)
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

async function connectWithRetry(attempts = 3, delayMs = 500): Promise<net.Socket | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await connectToElectron()
    } catch {
      if (i < attempts - 1) await sleep(delayMs * Math.pow(2, i))
    }
  }
  return null
}

function scheduleSubscriptionRetry(delayMs = 1000): void {
  if (subscriptionRetryTimer) return
  subscriptionRetryTimer = setTimeout(() => {
    subscriptionRetryTimer = null
    void ensureStateSubscription()
  }, delayMs)
}

function resetSubscription(): void {
  if (subscriptionSocket) {
    subscriptionSocket.destroy()
  }
  subscriptionSocket = null
  subscriptionBuffer = ''
}

function handleSubscriptionData(chunk: Buffer): void {
  subscriptionBuffer += chunk.toString('utf8')

  while (true) {
    const newline = subscriptionBuffer.indexOf('\n')
    if (newline === -1) return

    const line = subscriptionBuffer.slice(0, newline)
    subscriptionBuffer = subscriptionBuffer.slice(newline + 1)

    try {
      writeNativeMessage(JSON.parse(line) as NativeMessageFromElectron)
    } catch {
      writeNativeMessage(NO_SESSION_MSG)
    }
  }
}

async function ensureStateSubscription(): Promise<void> {
  if (subscriptionSocket) return

  const socket = await connectWithRetry()
  if (!socket) {
    scheduleSubscriptionRetry()
    return
  }

  subscriptionSocket = socket
  subscriptionBuffer = ''

  socket.on('data', handleSubscriptionData)
  socket.on('error', () => {
    resetSubscription()
    scheduleSubscriptionRetry()
  })
  socket.on('close', () => {
    resetSubscription()
    scheduleSubscriptionRetry()
  })

  socket.write(JSON.stringify({ type: 'subscribe_state' }) + '\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// MARK: - Main

async function main() {
  process.stdin.resume()
  void ensureStateSubscription()

  while (true) {
    let msgBuf: Buffer
    try {
      msgBuf = await readNativeMessage()
    } catch {
      // stdin closed — browser disconnected
      process.exit(0)
    }

    let msg: NativeMessageToElectron
    try {
      msg = JSON.parse(msgBuf.toString('utf8')) as NativeMessageToElectron
    } catch {
      writeNativeMessage({ type: 'error', error: 'Invalid JSON from browser' })
      continue
    }

    // Try to proxy to Electron
    const socket = await connectWithRetry()
    if (!socket) {
      writeNativeMessage(NO_SESSION_MSG)
      continue
    }

    try {
      const response = await proxyMessage(socket, msg)
      writeNativeMessage(response)
    } catch {
      writeNativeMessage(NO_SESSION_MSG)
    } finally {
      socket.destroy()
    }
  }
}

function proxyMessage(
  socket: net.Socket,
  msg: NativeMessageToElectron
): Promise<NativeMessageFromElectron> {
  return new Promise((resolve, reject) => {
    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      const newline = buf.indexOf('\n')
      if (newline !== -1) {
        try {
          const parsed = JSON.parse(buf.slice(0, newline)) as NativeMessageFromElectron
          resolve(parsed)
        } catch {
          reject(new Error('Invalid JSON from Electron'))
        }
      }
    })
    socket.on('error', reject)
    socket.write(JSON.stringify(msg) + '\n')
  })
}

main().catch((err) => {
  process.stderr.write(`nm-host error: ${err}\n`)
  process.exit(1)
})
