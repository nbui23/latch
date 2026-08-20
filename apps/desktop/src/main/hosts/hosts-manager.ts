/**
 * Hosts file manager
 * Delegates actual writes to the privileged helper via helper-client.
 * hasActiveBlock() reads /etc/hosts directly (unprivileged read).
 */

import * as fs from 'fs'
import type { HelperCommand, HelperResponse } from '@latch/shared'
import { sendToHelper } from './helper-client.js'

const HOSTS_PATH = '/etc/hosts'

const BLOCK_START = '# Latch block start'
const BLOCK_END = '# Latch block end'

/**
 * `HelperResponse` is a union of `{ ok }` and `{ pong }` shapes, so `in`
 * narrowing — not a cast — is what tells the compiler which arm we have.
 */
function describeHelperFailure(response: HelperResponse): string | null {
  if (!('ok' in response)) return 'Unexpected response from helper'
  if (response.ok) return null
  return response.error
}

type BlockCommand = Extract<HelperCommand, { cmd: 'write_block' | 'remove_block' }>

async function runBlockCommand(command: BlockCommand): Promise<void> {
  const failure = describeHelperFailure(await sendToHelper(command))
  if (failure !== null) {
    throw new Error(`Helper ${command.cmd} failed: ${failure}`)
  }
}

export async function writeBlock(sessionId: string, domains: string[]): Promise<void> {
  await runBlockCommand({ cmd: 'write_block', domains, sessionId })
}

export async function removeBlock(sessionId: string): Promise<void> {
  await runBlockCommand({ cmd: 'remove_block', sessionId })
}

export function hasActiveBlock(): boolean {
  try {
    const content = fs.readFileSync(HOSTS_PATH, 'utf8')
    return content.includes(BLOCK_START) && content.includes(BLOCK_END)
  } catch {
    return false
  }
}
