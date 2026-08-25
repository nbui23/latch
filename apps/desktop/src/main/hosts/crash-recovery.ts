/**
 * Crash recovery — OR-semantics detection + policy table.
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
 *
 * The table is encoded as an exhaustive switch over `SessionStatus`: adding a
 * status to the shared schema fails this file at compile time until its
 * recovery behaviour is decided.
 */

import type { SessionStatus, StaleSessionInfo } from '@latch/shared'
import { isBlockingStatus } from '@latch/shared'
import { hasActiveBlock } from './hosts-manager.js'
import { readSession } from '../session/session-store.js'

export type RecoveryPolicy =
  | { action: 'auto-clean'; requiresDialog: false }
  | { action: 'reset'; requiresDialog: false }
  | { action: 'dialog'; requiresDialog: true }
  | { action: 'none'; requiresDialog: false }

// Frozen: these are shared instances handed straight back to every caller.
const AUTO_CLEAN = Object.freeze<RecoveryPolicy>({ action: 'auto-clean', requiresDialog: false })
const RESET = Object.freeze<RecoveryPolicy>({ action: 'reset', requiresDialog: false })
const DIALOG = Object.freeze<RecoveryPolicy>({ action: 'dialog', requiresDialog: true })
const NONE = Object.freeze<RecoveryPolicy>({ action: 'none', requiresDialog: false })

export interface StaleSessionDetection extends StaleSessionInfo {
  policy: RecoveryPolicy
}

export function detectStaleSession(sessionFilePath: string): StaleSessionDetection | null {
  const session = readSession(sessionFilePath)
  const hostsHasMarkers = hasActiveBlock()

  const status = session?.status ?? 'idle'

  // OR semantics: an interrupted status or leftover markers alone is enough.
  if (!isBlockingStatus(status) && !hostsHasMarkers) return null

  return { session, hostsHasMarkers, policy: getRecoveryPolicy(status, hostsHasMarkers) }
}

export function getRecoveryPolicy(
  status: SessionStatus,
  hostsHasMarkers: boolean,
): RecoveryPolicy {
  switch (status) {
    // Nothing was in flight — only leftover markers need cleaning up.
    case 'idle':
    case 'recovering':
    case 'helper_unavailable':
      return hostsHasMarkers ? AUTO_CLEAN : NONE

    // Crashed mid-start or mid-session: markers mean the user may still have a
    // session worth resuming, so ask before touching it.
    case 'starting':
    case 'active':
      return hostsHasMarkers ? DIALOG : RESET

    // The user already asked to stop — finish the job without prompting.
    case 'stopping':
      return hostsHasMarkers ? AUTO_CLEAN : RESET
  }
}
