/**
 * Session store with explicit fsync + atomic rename.
 * session.json is the crash-recovery journal — must survive power failure.
 * Do NOT use lowdb for this file.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { Session } from '@latch/shared'
import { SessionSchema } from '@latch/shared'

export function writeSessionAtomic(filePath: string, data: Session | null): void {
  const dir = path.dirname(filePath)
  const tmp = filePath + '.tmp'
  const json = JSON.stringify(data ?? null, null, 2)

  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeSync(fd, json)
    fs.fsyncSync(fd) // flush data to disk
  } finally {
    fs.closeSync(fd)
  }

  fs.renameSync(tmp, filePath) // atomic on POSIX

  // fsync parent directory to make rename durable on POSIX
  const dirFd = fs.openSync(dir, 'r')
  try {
    fs.fsyncSync(dirFd)
  } finally {
    fs.closeSync(dirFd)
  }
}

export function readSession(filePath: string): Session | null {
  let parsed: unknown
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  // session.json may legitimately be `null` when the app last exited idle.
  if (parsed === null) return null
  const result = SessionSchema.safeParse(parsed)
  if (!result.success) {
    console.warn(
      `[session-store] Discarding invalid session file at ${filePath}:`,
      result.error.message,
    )
    return null
  }
  return result.data
}

export function deleteSession(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch {
    // ignore — file may not exist
  }
}
