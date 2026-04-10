import { describe, expect, it } from 'vitest'
import { getTrayMenuBarTitle, getTrayStatusLabel, getTrayVisualState } from '../../apps/desktop/src/main/tray-state.js'
import type { Session } from '@latch/shared'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    blocklistId: 'blocklist-1',
    domains: ['reddit.com'],
    startedAt: 1_000,
    durationMs: 10 * 60_000,
    status: 'active',
    intent: undefined,
    isIndefinite: false,
    ...overrides,
  }
}

describe('tray-state helpers', () => {
  it('uses the inactive tray state when there is no session', () => {
    expect(getTrayVisualState(null)).toBe('inactive')
    expect(getTrayStatusLabel(null)).toBe('Latch — Idle')
  })

  it('treats starting sessions as active and labels them as starting', () => {
    const session = makeSession({ status: 'starting', intent: 'will_write_hosts' })
    expect(getTrayVisualState(session)).toBe('active')
    expect(getTrayStatusLabel(session)).toBe('Latch — Starting block…')
  })

  it('treats stopping sessions as active and labels them as ending', () => {
    const session = makeSession({ status: 'stopping', intent: 'will_remove_hosts' })
    expect(getTrayVisualState(session)).toBe('active')
    expect(getTrayStatusLabel(session)).toBe('Latch — Ending block…')
  })

  it('shows remaining time for timed active sessions', () => {
    const session = makeSession({ startedAt: 60_000, durationMs: 5 * 60_000 })
    expect(getTrayStatusLabel(session, 61_000)).toBe('Latch — 5m remaining')
  })

  it('shows the active blocking label for indefinite sessions', () => {
    const session = makeSession({ isIndefinite: true, durationMs: 0 })
    expect(getTrayStatusLabel(session)).toBe('Latch — Blocking active')
  })

  it('provides a visible menu bar title fallback for inactive and active states', () => {
    expect(getTrayMenuBarTitle(null)).toBe('L')
    expect(getTrayMenuBarTitle(makeSession())).toBe('● L')
  })
})
