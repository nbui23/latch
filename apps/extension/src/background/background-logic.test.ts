import { describe, expect, it } from 'vitest'

import {
  getSessionTransitionAction,
  isBlockingSnapshot,
  shouldSkipBlockedRedirect,
  shouldIgnoreNoSessionSnapshot,
} from './background-logic'
import type { SessionSnapshot } from './session-state'

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    blockedDomains: [],
    sessionActive: false,
    startedAt: 0,
    durationMs: 0,
    ...overrides,
  }
}

describe('isBlockingSnapshot', () => {
  it('requires both an active session flag and blocked domains', () => {
    expect(isBlockingSnapshot(snapshot({ sessionActive: true, blockedDomains: ['reddit.com'] }))).toBe(true)
    expect(isBlockingSnapshot(snapshot({ sessionActive: true }))).toBe(false)
    expect(isBlockingSnapshot(snapshot({ blockedDomains: ['reddit.com'] }))).toBe(false)
  })
})

describe('shouldIgnoreNoSessionSnapshot', () => {
  it('treats no_session as non-authoritative while a blocking snapshot is cached', () => {
    expect(
      shouldIgnoreNoSessionSnapshot(snapshot({ sessionActive: true, blockedDomains: ['reddit.com'] })),
    ).toBe(true)
  })

  it('allows no_session to remain a no-op when nothing is currently blocked', () => {
    expect(shouldIgnoreNoSessionSnapshot(snapshot())).toBe(false)
  })
})

describe('getSessionTransitionAction', () => {
  it('syncs blocked tabs when the extension learns about a new blocking session', () => {
    expect(
      getSessionTransitionAction(
        snapshot(),
        snapshot({ sessionActive: true, blockedDomains: ['reddit.com'], startedAt: 1, durationMs: 60_000 }),
      ),
    ).toBe('sync-blocked-tabs')
  })

  it('does nothing when the session snapshot is unchanged', () => {
    expect(
      getSessionTransitionAction(
        snapshot({ sessionActive: true, blockedDomains: ['reddit.com'], startedAt: 1, durationMs: 60_000 }),
        snapshot({ sessionActive: true, blockedDomains: ['reddit.com'], startedAt: 1, durationMs: 60_000 }),
      ),
    ).toBe('none')
  })

  it('restores blocked tabs only on a real transition from blocking to inactive', () => {
    expect(
      getSessionTransitionAction(
        snapshot({ sessionActive: true, blockedDomains: ['reddit.com'], startedAt: 1, durationMs: 60_000 }),
        snapshot(),
      ),
    ).toBe('restore-blocked-tabs')
  })
})

describe('shouldSkipBlockedRedirect', () => {
  it('skips duplicate redirects when the same tab already has that target pending', () => {
    expect(
      shouldSkipBlockedRedirect({
        currentUrl: 'https://reddit.com',
        blockedUrl: 'chrome-extension://extension-id/blocked.html?domain=reddit.com&original=https%3A%2F%2Freddit.com',
        pendingBlockedUrl:
          'chrome-extension://extension-id/blocked.html?domain=reddit.com&original=https%3A%2F%2Freddit.com',
        isCurrentBlockedPage: false,
      }),
    ).toBe(true)
  })

  it('allows a first redirect from an original blocked URL to the extension blocked page', () => {
    expect(
      shouldSkipBlockedRedirect({
        currentUrl: 'https://reddit.com',
        blockedUrl: 'chrome-extension://extension-id/blocked.html?domain=reddit.com&original=https%3A%2F%2Freddit.com',
        isCurrentBlockedPage: false,
      }),
    ).toBe(false)
  })
})
