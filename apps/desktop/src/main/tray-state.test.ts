import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@latch/shared'
import { getTrayMenuBarTitle, getTrayStatusLabel, getTrayVisualState } from './tray-state.js'
import { TrayController } from './app/tray-controller.js'

// Enough of Electron for TrayController to run headless; the assertions are all
// about how often it touches the tray, not about what Electron does with it.
const trayStub = vi.hoisted(() => ({
  setImage: vi.fn(),
  setTitle: vi.fn(),
  setPressedImage: vi.fn(),
  setContextMenu: vi.fn(),
  setToolTip: vi.fn(),
  setIgnoreDoubleClickEvents: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('electron', () => {
  const image = { isEmpty: () => false, resize: () => image }
  return {
    Tray: vi.fn(() => trayStub),
    Menu: { buildFromTemplate: vi.fn((template: unknown) => template) },
    nativeImage: {
      createFromPath: () => image,
      createFromDataURL: () => image,
      createEmpty: () => image,
    },
  }
})

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
    expect(getTrayVisualState(makeSession({ status: 'starting' }))).toBe('active')
    expect(getTrayVisualState(makeSession({ status: 'active' }))).toBe('active')
    expect(getTrayMenuBarTitle(makeSession({ status: 'starting' }))).toBe('● L')
  })

  it('treats sessions without blocked domains as inactive', () => {
    const session = makeSession({ status: 'active', domains: [] })
    expect(getTrayVisualState(session)).toBe('inactive')
    expect(getTrayMenuBarTitle(session)).toBe('L')
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

describe('TrayController render gate', () => {
  const actions = {
    openApp: vi.fn(),
    stopSession: vi.fn(),
    enableAlwaysBlock: vi.fn(),
    quit: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function timedSession(): Session {
    return makeSession({ startedAt: 0, durationMs: 10 * 60 * 1000 })
  }

  it('touches the tray once for repeated pushes of the same state', () => {
    const controller = new TrayController(actions)

    controller.sync(timedSession(), true)
    expect(trayStub.setContextMenu).toHaveBeenCalledTimes(1)
    expect(trayStub.setToolTip).toHaveBeenLastCalledWith('Latch — 10m remaining')

    controller.update(timedSession())
    controller.update(timedSession())

    expect(trayStub.setContextMenu).toHaveBeenCalledTimes(1)
    expect(trayStub.setImage).toHaveBeenCalledTimes(1)
    expect(trayStub.setTitle).toHaveBeenCalledTimes(1)
  })

  it('rebuilds the menu when the minute label changes', () => {
    const controller = new TrayController(actions)
    controller.sync(timedSession(), true)

    vi.advanceTimersByTime(60_000)

    expect(trayStub.setContextMenu).toHaveBeenCalledTimes(2)
    expect(trayStub.setToolTip).toHaveBeenLastCalledWith('Latch — 9m remaining')
  })

  it('stops refreshing once the session ends', () => {
    const controller = new TrayController(actions)
    controller.sync(timedSession(), true)
    controller.update(null)

    const callsAfterIdle = trayStub.setContextMenu.mock.calls.length
    vi.advanceTimersByTime(10 * 60_000)

    expect(vi.getTimerCount()).toBe(0)
    expect(trayStub.setContextMenu).toHaveBeenCalledTimes(callsAfterIdle)
  })

  it('leaves no refresh timer behind when the tray is destroyed', () => {
    const controller = new TrayController(actions)
    controller.sync(timedSession(), true)
    expect(vi.getTimerCount()).toBe(1)

    controller.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('arms no refresh timer while the menu-bar icon is disabled', () => {
    const controller = new TrayController(actions)
    controller.sync(timedSession(), false)
    controller.update(timedSession())

    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not refresh for an indefinite session', () => {
    const controller = new TrayController(actions)
    controller.sync(makeSession({ isIndefinite: true, durationMs: 0 }), true)

    expect(vi.getTimerCount()).toBe(0)
    expect(trayStub.setToolTip).toHaveBeenLastCalledWith('Latch — Blocking active')
  })
})
