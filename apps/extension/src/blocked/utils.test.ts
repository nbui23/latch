import { describe, expect, it } from 'vitest'

import { getBlockedDomain, getOriginalUrl, hasActiveTimer, isExplicitlyInactive } from './utils'

describe('getOriginalUrl', () => {
  it('prefers the original query param when present', () => {
    expect(getOriginalUrl('?original=https%3A%2F%2Freddit.com%2Fr%2Ftest', '#ignored')).toBe(
      'https://reddit.com/r/test',
    )
  })

  it('falls back to the hash when query param is absent', () => {
    expect(getOriginalUrl('', '#https://old.reddit.com/r/test')).toBe('https://old.reddit.com/r/test')
  })
})

describe('getBlockedDomain', () => {
  it('prefers the explicit domain query param', () => {
    expect(getBlockedDomain('?domain=reddit.com', 'https://old.reddit.com/r/test')).toBe('reddit.com')
  })

  it('derives the hostname from the original URL when needed', () => {
    expect(getBlockedDomain('', 'https://old.reddit.com/r/test')).toBe('old.reddit.com')
  })

  it('returns an empty string for invalid original URLs', () => {
    expect(getBlockedDomain('', 'not a url')).toBe('')
  })
})

describe('hasActiveTimer', () => {
  it('returns true only when both startedAt and durationMs are present', () => {
    expect(hasActiveTimer({ startedAt: 1, durationMs: 2 })).toBe(true)
    expect(hasActiveTimer({ startedAt: 1 })).toBe(false)
    expect(hasActiveTimer(null)).toBe(false)
  })
})

describe('isExplicitlyInactive', () => {
  it('only restores when the background explicitly confirms the session ended', () => {
    expect(isExplicitlyInactive({ sessionActive: false })).toBe(true)
    expect(isExplicitlyInactive({ sessionActive: true })).toBe(false)
    expect(isExplicitlyInactive(null)).toBe(false)
  })
})
