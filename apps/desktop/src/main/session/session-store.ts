/**
 * Session store — session.json is the crash-recovery journal, so every write
 * goes through the atomic write helper and every read is schema-validated.
 * Do NOT swap this for a general-purpose JSON store.
 */

import * as fs from 'fs'
import type { Session } from '@latch/shared'
import { SessionSchema } from '@latch/shared'
import { writeFileAtomicSync } from '../fs/atomic-write.js'

export function writeSessionAtomic(filePath: string, data: Session | null): void {
  writeFileAtomicSync(filePath, JSON.stringify(data ?? null, null, 2))
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
