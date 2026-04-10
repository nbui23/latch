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

// P0-7: /var/run is root-owned on modern macOS; unprivileged Electron cannot bind there.
// os.tmpdir() returns a per-user writable directory for the current macOS user.
// The nm-host proxy derives the same path using the same os.tmpdir() call.
const UI_SOCKET = path.join(os.tmpdir(), 'latch-ui.sock')

export type MessageHandler = (
  msg: NativeMessageToElectron
) => Promise<NativeMessageFromElectron>

let server: net.Server | null = null
const subscribers = new Set<net.Socket>()

export function startUISocket(onMessage: MessageHandler): void {
  // Remove stale socket (tmpfs is cleared on reboot, but clean for dev)
  try {
    fs.unlinkSync(UI_SOCKET)
  } catch {
    // ignore — may not exist
  }

  server = net.createServer((socket) => {
    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      const nl = buf.indexOf('\n')
      if (nl === -1) return
      const msgStr = buf.slice(0, nl)
      buf = buf.slice(nl + 1)

      let msg: NativeMessageToElectron
      try {
        msg = JSON.parse(msgStr) as NativeMessageToElectron
      } catch {
        socket.write(JSON.stringify({ type: 'error', error: 'Invalid JSON' }) + '\n')
        return
      }

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

  server.listen(UI_SOCKET, () => {
    console.log(`[ui-socket] Listening on ${UI_SOCKET}`)
    try {
      fs.chmodSync(UI_SOCKET, 0o600)
    } catch {
      // best-effort
    }
  })

  server.on('error', (err) => {
    console.error('[ui-socket] Server error:', err)
  })
}

export function stopUISocket(): void {
  subscribers.clear()
  server?.close()
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
