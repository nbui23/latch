/**
 * Hosts file manager
 * Delegates actual writes to the privileged helper via helper-client.
 * hasActiveBlock() reads /etc/hosts directly (unprivileged read).
 */

import * as fs from 'fs'
import { sendToHelper } from './helper-client.js'

const HOSTS_PATH = '/etc/hosts'

const BLOCK_START = '# Latch block start'
const BLOCK_END = '# Latch block end'

export async function writeBlock(sessionId: string, domains: string[]): Promise<void> {
  const resp = await sendToHelper({ cmd: 'write_block', domains, sessionId })
  if (!('ok' in resp) || !(resp as { ok: boolean }).ok) {
    const err = (resp as { ok: boolean; error?: string }).error ?? 'Unknown error'
    throw new Error(`Helper write_block failed: ${err}`)
  }
}

export async function removeBlock(sessionId: string): Promise<void> {
  const resp = await sendToHelper({ cmd: 'remove_block', sessionId })
  if (!('ok' in resp) || !(resp as { ok: boolean }).ok) {
    const err = (resp as { ok: boolean; error?: string }).error ?? 'Unknown error'
    throw new Error(`Helper remove_block failed: ${err}`)
  }
}

export function hasActiveBlock(): boolean {
  try {
    const content = fs.readFileSync(HOSTS_PATH, 'utf8')
    return content.includes(BLOCK_START) && content.includes(BLOCK_END)
  } catch {
    return false
  }
}
