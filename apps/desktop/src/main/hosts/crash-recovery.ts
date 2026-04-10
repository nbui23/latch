/**
 * Crash recovery — OR-semantics detection + 7-row policy table.
 *
 * Recovery policy table (from plan Section 2.2):
 *
 * | session.json status | hosts markers | Action            | User prompt? |
 * |---------------------|---------------|-------------------|-------------|
 * | idle or missing     | present       | auto-clean + toast | No          |
 * | starting            | absent        | reset to idle      | No          |
 * | starting            | present       | dialog             | Yes         |
 * | active              | present       | dialog             | Yes         |
 * | active              | absent        | reset to idle      | No          |
 * | stopping            | present       | auto-clean + toast | No          |
 * | stopping            | absent        | reset to idle      | No          |
 */

import type { StaleSessionInfo } from '@latch/shared'
import { hasActiveBlock } from './hosts-manager.js'
import { readSession } from '../session/session-store.js'

export type RecoveryPolicy =
  | { action: 'auto-clean'; requiresDialog: false }
  | { action: 'reset'; requiresDialog: false }
  | { action: 'dialog'; requiresDialog: true }
  | { action: 'none'; requiresDialog: false }

export interface StaleSessionDetection extends StaleSessionInfo {
  policy: RecoveryPolicy
}

export function detectStaleSession(sessionFilePath: string): StaleSessionDetection | null {
  const session = readSession(sessionFilePath)
  const hostsHasMarkers = hasActiveBlock()

  const status = session?.status ?? 'idle'

  // OR semantics: either condition alone triggers recovery
  const isStale =
    status === 'starting' ||
    status === 'active' ||
    status === 'stopping' ||
    hostsHasMarkers

  if (!isStale) return null

  const policy = getRecoveryPolicy(status, hostsHasMarkers)

  return { session, hostsHasMarkers, policy }
}

export function getRecoveryPolicy(
  status: string,
  hostsHasMarkers: boolean
): RecoveryPolicy {
  if (status === 'idle' || status === 'recovering' || status === 'helper_unavailable') {
    if (hostsHasMarkers) return { action: 'auto-clean', requiresDialog: false }
    return { action: 'none', requiresDialog: false }
  }

  if (status === 'starting') {
    if (!hostsHasMarkers) return { action: 'reset', requiresDialog: false }
    return { action: 'dialog', requiresDialog: true }
  }

  if (status === 'active') {
    if (!hostsHasMarkers) return { action: 'reset', requiresDialog: false }
    return { action: 'dialog', requiresDialog: true }
  }

  if (status === 'stopping') {
    if (hostsHasMarkers) return { action: 'auto-clean', requiresDialog: false }
    return { action: 'reset', requiresDialog: false }
  }

  // Fallback — unknown status with markers
  if (hostsHasMarkers) return { action: 'auto-clean', requiresDialog: false }
  return { action: 'reset', requiresDialog: false }
}
