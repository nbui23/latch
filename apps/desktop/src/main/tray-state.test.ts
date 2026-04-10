import { describe, expect, it } from 'vitest'
import type { Session } from '@latch/shared'
import { getTrayMenuBarTitle, getTrayStatusLabel, getTrayVisualState, isBlockingVisibleInTray } from './tray-state.js'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    blocklistId: 'blocklist-1',
    domains: ['example.com'],
    startedAt: 1_000,
    durationMs: 30 * 60 * 1000,
    status: 'active',
    ...overrides,
  }
}

describe('tray state helpers', () => {
  it('treats starting and active sessions as visible tray blocking states', () => {
    expect(isBlockingVisibleInTray(makeSession({ status: 'starting' }))).toBe(true)
    expect(isBlockingVisibleInTray(makeSession({ status: 'active' }))).toBe(true)
  })

  it('treats sessions without blocked domains as inactive', () => {
    const session = makeSession({ status: 'active', domains: [] })
    expect(isBlockingVisibleInTray(session)).toBe(false)
    expect(getTrayVisualState(session)).toBe('inactive')
  })

  it('returns native-facing status labels for active, stopping, and idle states', () => {
    expect(
      getTrayStatusLabel(
        makeSession({ status: 'active', startedAt: 0, durationMs: 10 * 60 * 1000 }),
        4 * 60 * 1000,
      ),
    ).toBe('Latch — 6m remaining')
    expect(getTrayStatusLabel(makeSession({ status: 'stopping' }))).toBe('Latch — Ending block…')
    expect(getTrayStatusLabel(null)).toBe('Latch — Idle')
  })

  it('shows always-on sessions as blocking active', () => {
    expect(getTrayStatusLabel(makeSession({ isIndefinite: true, durationMs: 0 }))).toBe('Latch — Blocking active')
  })

  it('exposes a visible menu bar title fallback', () => {
    expect(getTrayMenuBarTitle(null)).toBe('L')
    expect(getTrayMenuBarTitle(makeSession({ status: 'active' }))).toBe('● L')
  })
})
