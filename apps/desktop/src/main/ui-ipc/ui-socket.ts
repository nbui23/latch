/**
 * UI socket server — used by NM host proxy to reach the Electron main process.
 * This is a separate socket from the privileged helper socket.
 * Unprivileged, owned by the current user.
 *
 * macOS: <os.tmpdir()>/latch-ui.sock  (recreated on every app startup)
 */

import * as net from 'net'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { NativeMessageToElectron, NativeMessageFromElectron, Session } from '@latch/shared'
import { NativeMessageToElectronSchema } from '@latch/shared'

// P0-7: /var/run is root-owned on modern macOS; unprivileged Electron cannot bind there.
// os.tmpdir() returns a per-user writable directory for the current macOS user.
// The nm-host proxy derives the same path using the same os.tmpdir() call.
const UI_SOCKET_ENV = 'LATCH_UI_SOCKET'

export type MessageHandler = (
  msg: NativeMessageToElectron
) => Promise<NativeMessageFromElectron>

let server: net.Server | null = null
const subscribers = new Set<net.Socket>()

export function getUISocketPath(): string {
  return process.env[UI_SOCKET_ENV] || path.join(os.tmpdir(), 'latch-ui.sock')
}

function listenWithRestrictedUmask(target: net.Server, socketPath: string): void {
  let previousUmask: number | null = null
  try {
    try {
      previousUmask = process.umask(0o177)
    } catch {
      target.listen(socketPath)
      return
    }
    target.listen(socketPath)
  } finally {
    if (previousUmask !== null) {
      process.umask(previousUmask)
    }
  }
}

function probeSocket(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createConnection(socketPath)
    probe.once('connect', () => {
      probe.end()
      resolve(true)
    })
    probe.once('error', () => resolve(false))
  })
}

function cleanupSocketFile(socketPath: string): void {
  try {
    fs.unlinkSync(socketPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[ui-socket] Failed to unlink socket:', err)
    }
  }
}

async function bindUISocket(target: net.Server, socketPath: string): Promise<void> {
  let staleCleanupAttempted = false

  while (true) {
    const listenResult = await new Promise<'listening' | NodeJS.ErrnoException>((resolve) => {
      const onListening = () => {
        target.off('error', onError)
        resolve('listening')
      }
      const onError = (err: NodeJS.ErrnoException) => {
        target.off('listening', onListening)
        resolve(err)
      }

      target.once('listening', onListening)
      target.once('error', onError)
      listenWithRestrictedUmask(target, socketPath)
    })

    if (listenResult === 'listening') {
      return
    }

    if (listenResult.code !== 'EADDRINUSE' || staleCleanupAttempted) {
      throw listenResult
    }

    const inUse = await probeSocket(socketPath)
    if (inUse) {
      throw listenResult
    }

    cleanupSocketFile(socketPath)
    staleCleanupAttempted = true
  }
}

export function startUISocket(onMessage: MessageHandler): void {
  if (server) return
  const socketPath = getUISocketPath()

  server = net.createServer((socket) => {
    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      const nl = buf.indexOf('\n')
      if (nl === -1) return
      const msgStr = buf.slice(0, nl)
      buf = buf.slice(nl + 1)

      let rawMsg: unknown
      try {
        rawMsg = JSON.parse(msgStr)
      } catch {
        socket.write(JSON.stringify({ type: 'error', error: 'Invalid JSON' }) + '\n')
        return
      }
      const parsed = NativeMessageToElectronSchema.safeParse(rawMsg)
      if (!parsed.success) {
        socket.write(
          JSON.stringify({ type: 'error', error: 'Unknown message type' }) + '\n'
        )
        return
      }
      const msg: NativeMessageToElectron = parsed.data

      if (msg.type === 'subscribe_state') {
        subscribers.add(socket)
      }

      onMessage(msg)
        .then((response) => {
          socket.write(JSON.stringify(response) + '\n')
        })
        .catch(() => {
          socket.write(JSON.stringify({ type: 'no_session' }) + '\n')
        })
    })
    socket.on('close', () => {
      subscribers.delete(socket)
    })
    socket.on('error', () => {
      subscribers.delete(socket)
    })
  })

  server.on('error', (err) => {
    if (!server?.listening && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      return
    }
    console.error('[ui-socket] Server error:', err)
  })

  void bindUISocket(server, socketPath)
    .then(() => {
      console.log(`[ui-socket] Listening on ${socketPath}`)
      try {
        fs.chmodSync(socketPath, 0o600)
      } catch {
        // best-effort
      }
    })
    .catch((err) => {
      console.error('[ui-socket] Failed to bind socket:', err)
      server?.close()
      server = null
    })
}

export function stopUISocket(): void {
  subscribers.clear()
  const socketPath = getUISocketPath()
  server?.close(() => {
    cleanupSocketFile(socketPath)
  })
  server = null
}

export function broadcastUISessionState(session: Session | null): void {
  const payload = JSON.stringify({ type: 'session_state', payload: session }) + '\n'

  for (const socket of subscribers) {
    if (socket.destroyed) {
      subscribers.delete(socket)
      continue
    }

    try {
      socket.write(payload)
    } catch {
      subscribers.delete(socket)
    }
  }
}
