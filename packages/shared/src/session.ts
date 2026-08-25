/**
 * Session status predicates shared by the desktop app and the extension.
 *
 * "Is this session blocking?" was previously answered independently in the
 * tray, in crash recovery, and in the extension background worker. It is
 * defined once here so the three can never disagree.
 */

import type { Session, SessionStatus } from './types.js'

/** Statuses in which Latch owns (or is about to own) entries in /etc/hosts. */
export const BLOCKING_SESSION_STATUSES = ['starting', 'active', 'stopping'] as const

export type BlockingSessionStatus = (typeof BLOCKING_SESSION_STATUSES)[number]

export function isBlockingStatus(
  status: SessionStatus | undefined,
): status is BlockingSessionStatus {
  return BLOCKING_SESSION_STATUSES.includes(status as BlockingSessionStatus)
}

/**
 * A session counts as blocking only when it also has domains — a blocking
 * status with an empty domain list writes nothing to /etc/hosts.
 */
export function isBlockingSession(session: Session | null): boolean {
  return session !== null && session.domains.length > 0 && isBlockingStatus(session.status)
}
