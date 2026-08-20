/**
 * The blocking-status predicate is shared by the tray, crash recovery, and the
 * extension background worker. These tests pin the one definition they all use.
 */

import { describe, expect, it } from 'vitest'
import type { Session, SessionStatus } from '../../packages/shared/src/index.js'
import {
  BLOCKING_SESSION_STATUSES,
  isBlockingSession,
  isBlockingStatus,
} from '../../packages/shared/src/index.js'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    blocklistId: '550e8400-e29b-41d4-a716-446655440001',
    domains: ['reddit.com'],
    startedAt: 1_000,
    durationMs: 60_000,
    status: 'active',
    ...overrides,
  }
}

describe('isBlockingStatus', () => {
  it('is true exactly for the statuses that own hosts entries', () => {
    expect(isBlockingStatus('starting')).toBe(true)
    expect(isBlockingStatus('active')).toBe(true)
    expect(isBlockingStatus('stopping')).toBe(true)
  })

  it('is false for every non-blocking status', () => {
    expect(isBlockingStatus('idle')).toBe(false)
    expect(isBlockingStatus('recovering')).toBe(false)
    expect(isBlockingStatus('helper_unavailable')).toBe(false)
    expect(isBlockingStatus(undefined)).toBe(false)
  })

  it('covers every status in the shared schema', () => {
    const all: SessionStatus[] = [
      'idle',
      'starting',
      'active',
      'stopping',
      'recovering',
      'helper_unavailable',
    ]
    const blocking = all.filter((status) => isBlockingStatus(status))
    expect(blocking).toEqual([...BLOCKING_SESSION_STATUSES])
  })
})

describe('isBlockingSession', () => {
  it('requires both a blocking status and at least one domain', () => {
    expect(isBlockingSession(makeSession())).toBe(true)
    expect(isBlockingSession(makeSession({ domains: [] }))).toBe(false)
    expect(isBlockingSession(makeSession({ status: 'idle' }))).toBe(false)
    expect(isBlockingSession(null)).toBe(false)
  })
})
