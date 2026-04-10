import { describe, expect, it } from 'vitest'

import {
  EMPTY_SESSION_SNAPSHOT,
  areSessionSnapshotsEqual,
  buildBlockedUrlRegexFilter,
  buildBlockedPageUrl,
  getBlockedHostname,
  isBlockingSessionStatus,
  sessionSnapshotFromCache,
  sessionSnapshotFromPayload,
} from './session-state'

describe('sessionSnapshotFromPayload', () => {
  it('captures active session state including timer fields', () => {
    expect(
      sessionSnapshotFromPayload({
        status: 'active',
        domains: ['reddit.com'],
        startedAt: 123,
        durationMs: 456,
      }),
    ).toEqual({
      blockedDomains: ['reddit.com'],
      sessionActive: true,
      startedAt: 123,
      durationMs: 456,
    })
  })

  it('keeps stopping payloads blocking until native state fully clears', () => {
    expect(sessionSnapshotFromPayload({ status: 'stopping', domains: ['reddit.com'] })).toEqual(
      {
        blockedDomains: ['reddit.com'],
        sessionActive: true,
        startedAt: 0,
        durationMs: 0,
      },
    )
  })

  it('treats starting sessions as blocking-active immediately', () => {
    expect(sessionSnapshotFromPayload({ status: 'starting', domains: ['reddit.com'] })).toEqual(
      {
        blockedDomains: ['reddit.com'],
        sessionActive: true,
        startedAt: 0,
        durationMs: 0,
      },
    )
  })

  it('clears truly inactive payloads', () => {
    expect(sessionSnapshotFromPayload({ status: 'helper_unavailable', domains: ['reddit.com'] })).toEqual(
      EMPTY_SESSION_SNAPSHOT,
    )
  })
})

describe('isBlockingSessionStatus', () => {
  it('keeps starting, active, and stopping sessions in blocking mode', () => {
    expect(isBlockingSessionStatus('starting')).toBe(true)
    expect(isBlockingSessionStatus('active')).toBe(true)
    expect(isBlockingSessionStatus('stopping')).toBe(true)
    expect(isBlockingSessionStatus('idle')).toBe(false)
  })
})

describe('sessionSnapshotFromCache', () => {
  it('rehydrates a valid cached session snapshot', () => {
    expect(
      sessionSnapshotFromCache({
        blockedDomains: ['reddit.com'],
        sessionActive: true,
        startedAt: 100,
        durationMs: 200,
      }),
    ).toEqual({
      blockedDomains: ['reddit.com'],
      sessionActive: true,
      startedAt: 100,
      durationMs: 200,
    })
  })

  it('falls back to an empty snapshot for invalid cache data', () => {
    expect(sessionSnapshotFromCache({ blockedDomains: ['reddit.com', 42] })).toEqual({
      blockedDomains: ['reddit.com'],
      sessionActive: false,
      startedAt: 0,
      durationMs: 0,
    })
  })

  it('treats active-without-domains cache entries as inactive', () => {
    expect(
      sessionSnapshotFromCache({
        blockedDomains: [],
        sessionActive: true,
        startedAt: 100,
        durationMs: 200,
      }),
    ).toEqual({
      blockedDomains: [],
      sessionActive: false,
      startedAt: 100,
      durationMs: 200,
    })
  })
})

describe('getBlockedHostname', () => {
  it('matches apex domains and preserves the triggering hostname', () => {
    expect(getBlockedHostname('https://reddit.com/r/test', ['reddit.com'])).toBe('reddit.com')
  })

  it('matches nested subdomains for a blocked apex domain', () => {
    expect(getBlockedHostname('https://old.reddit.com/r/test', ['reddit.com'])).toBe('old.reddit.com')
  })

  it('returns null for non-blocked or invalid URLs', () => {
    expect(getBlockedHostname('https://news.ycombinator.com', ['reddit.com'])).toBeNull()
    expect(getBlockedHostname('not a url', ['reddit.com'])).toBeNull()
  })
})

describe('buildBlockedPageUrl', () => {
  it('encodes the triggering hostname and original URL into blocked.html', () => {
    expect(
      buildBlockedPageUrl(
        'chrome-extension://extension-id/blocked.html',
        'old.reddit.com',
        'https://old.reddit.com/r/test?x=1',
      ),
    ).toBe(
      'chrome-extension://extension-id/blocked.html?domain=old.reddit.com&original=https%3A%2F%2Fold.reddit.com%2Fr%2Ftest%3Fx%3D1',
    )
  })
})

describe('indefinite session (durationMs=0)', () => {
  it('sessionSnapshotFromPayload preserves durationMs=0 for indefinite sessions', () => {
    expect(
      sessionSnapshotFromPayload({
        status: 'active',
        domains: ['reddit.com'],
        startedAt: 1000,
        durationMs: 0,
      }),
    ).toEqual({
      blockedDomains: ['reddit.com'],
      sessionActive: true,
      startedAt: 1000,
      durationMs: 0,
    })
  })

  it('sessionSnapshotFromPayload treats missing durationMs as 0', () => {
    expect(
      sessionSnapshotFromPayload({
        status: 'active',
        domains: ['reddit.com'],
      }),
    ).toEqual({
      blockedDomains: ['reddit.com'],
      sessionActive: true,
      startedAt: 0,
      durationMs: 0,
    })
  })
})

describe('buildBlockedUrlRegexFilter', () => {
  it('matches the blocked domain plus nested subdomains', () => {
    const pattern = new RegExp(buildBlockedUrlRegexFilter('reddit.com'))

    expect(pattern.test('https://reddit.com')).toBe(true)
    expect(pattern.test('https://www.reddit.com/r/test')).toBe(true)
    expect(pattern.test('https://old.reddit.com/r/test')).toBe(true)
    expect(pattern.test('https://notreddit.com')).toBe(false)
  })
})

describe('areSessionSnapshotsEqual', () => {
  it('returns true for equivalent snapshots', () => {
    expect(
      areSessionSnapshotsEqual(
        {
          blockedDomains: ['reddit.com'],
          sessionActive: true,
          startedAt: 1,
          durationMs: 2,
        },
        {
          blockedDomains: ['reddit.com'],
          sessionActive: true,
          startedAt: 1,
          durationMs: 2,
        },
      ),
    ).toBe(true)
  })

  it('returns false when any snapshot field changes', () => {
    expect(
      areSessionSnapshotsEqual(
        {
          blockedDomains: ['reddit.com'],
          sessionActive: true,
          startedAt: 1,
          durationMs: 2,
        },
        {
          blockedDomains: ['reddit.com'],
          sessionActive: true,
          startedAt: 1,
          durationMs: 3,
        },
      ),
    ).toBe(false)
  })
})
