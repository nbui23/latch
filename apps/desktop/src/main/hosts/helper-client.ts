/**
 * Privileged helper client
 * Communicates with the Latch macOS LaunchDaemon
 * via a local socket. Electron itself runs unprivileged.
 */

import * as net from 'net'
import type { HelperCommand, HelperResponse } from '@latch/shared'
import { HelperResponseSchema } from '@latch/shared'

const HELPER_SOCKET = '/var/run/latch.sock'

const TIMEOUT_MS = 5000

function connectToHelper(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(HELPER_SOCKET)
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

export async function sendToHelper(cmd: HelperCommand): Promise<HelperResponse> {
  let socket: net.Socket
  try {
    socket = await connectToHelper()
  } catch {
    throw new Error('Latch helper is not running. Please restart Latch.')
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Helper response timed out after 5s'))
    }, TIMEOUT_MS)

    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      const nl = buf.indexOf('\n')
      if (nl !== -1) {
        clearTimeout(timer)
        socket.destroy()
        let raw: unknown
        try {
          raw = JSON.parse(buf.slice(0, nl))
        } catch {
          reject(new Error('Invalid JSON from helper'))
          return
        }
        const parsed = HelperResponseSchema.safeParse(raw)
        if (!parsed.success) {
          reject(new Error('Malformed response from helper'))
          return
        }
        resolve(parsed.data)
      }
    })
    socket.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    socket.write(JSON.stringify(cmd) + '\n')
  })
}

export async function isHelperRunning(): Promise<boolean> {
  try {
    const resp = await sendToHelper({ cmd: 'ping' })
    return 'pong' in resp && resp.pong === true
  } catch {
    return false
  }
}
