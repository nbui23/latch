import { areSessionSnapshotsEqual, type SessionSnapshot } from './session-state'

export type SessionTransitionAction = 'none' | 'sync-blocked-tabs' | 'restore-blocked-tabs'

export function isBlockingSnapshot(snapshot: SessionSnapshot): boolean {
  return snapshot.sessionActive && snapshot.blockedDomains.length > 0
}

export function shouldIgnoreNoSessionSnapshot(snapshot: SessionSnapshot): boolean {
  return isBlockingSnapshot(snapshot)
}

export function getSessionTransitionAction(
  previousSnapshot: SessionSnapshot,
  nextSnapshot: SessionSnapshot,
): SessionTransitionAction {
  if (areSessionSnapshotsEqual(previousSnapshot, nextSnapshot)) {
    return 'none'
  }

  if (isBlockingSnapshot(nextSnapshot)) {
    return 'sync-blocked-tabs'
  }

  if (isBlockingSnapshot(previousSnapshot)) {
    return 'restore-blocked-tabs'
  }

  return 'none'
}

export function shouldSkipBlockedRedirect(args: {
  currentUrl: string
  blockedUrl: string | null
  pendingBlockedUrl?: string
  isCurrentBlockedPage: boolean
}): boolean {
  if (!args.blockedUrl) return true
  if (args.isCurrentBlockedPage) return true
  if (args.currentUrl === args.blockedUrl) return true
  if (args.pendingBlockedUrl === args.blockedUrl) return true
  return false
}
