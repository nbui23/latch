/**
 * Session manager unit tests — covers the 6-state machine and write-ahead ordering.
 * The SessionManager has Electron + helper dependencies; we mock them all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoist mock fns so they are available inside vi.mock factories ──────────
const {
  mockWriteSessionAtomic,
  mockWriteBlock,
  mockRemoveBlock,
  mockIsHelperRunning,
} = vi.hoisted(() => ({
  mockWriteSessionAtomic: vi.fn(),
  mockWriteBlock: vi.fn().mockResolvedValue(undefined),
  mockRemoveBlock: vi.fn().mockResolvedValue(undefined),
  mockIsHelperRunning: vi.fn().mockResolvedValue(true),
}))

// ─── Mock session-store ────────────────────────────────────────────────────────
vi.mock('../../apps/desktop/src/main/session/session-store.js', () => ({
  writeSessionAtomic: mockWriteSessionAtomic,
  readSession: vi.fn(() => null),
  deleteSession: vi.fn(),
}))

// ─── Mock hosts-manager ───────────────────────────────────────────────────────
vi.mock('../../apps/desktop/src/main/hosts/hosts-manager.js', () => ({
  writeBlock: mockWriteBlock,
  removeBlock: mockRemoveBlock,
  hasActiveBlock: vi.fn(() => false),
}))

// ─── Mock helper-client ───────────────────────────────────────────────────────
vi.mock('../../apps/desktop/src/main/hosts/helper-client.js', () => ({
  isHelperRunning: mockIsHelperRunning,
  sendToHelper: vi.fn(),
}))


import { SessionManager } from '../../apps/desktop/src/main/session/session-manager.js'

describe('SessionManager', () => {
  let manager: SessionManager
  let stateChanges: Array<unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsHelperRunning.mockResolvedValue(true)
    mockWriteBlock.mockResolvedValue(undefined)
    mockRemoveBlock.mockResolvedValue(undefined)
    stateChanges = []
    manager = new SessionManager((s) => stateChanges.push(s), '/tmp/latch-test/session.json')
  })

  describe('startSession', () => {
    it('transitions idle → starting → active with write-ahead ordering', async () => {
      await manager.startSession(
        { blocklistId: 'list-1', durationMs: 60_000 },
        ['reddit.com']
      )

      // write-ahead: first writeSessionAtomic records 'starting' + intent BEFORE writeBlock
      const writes = mockWriteSessionAtomic.mock.calls
      expect(writes[0][1]?.status).toBe('starting')
      expect(writes[0][1]?.intent).toBe('will_write_hosts')

      // writeBlock called after first write, with the correct domains
      expect(mockWriteBlock).toHaveBeenCalledTimes(1)
      expect(mockWriteBlock.mock.calls[0][1]).toEqual(['reddit.com'])

      // Second writeSessionAtomic marks active, no intent
      expect(writes[1][1]?.status).toBe('active')
      expect(writes[1][1]?.intent).toBeUndefined()

      // onStateChange called twice (starting, active)
      expect(stateChanges).toHaveLength(2)

      // Final manager state is active
      expect(manager.isActive()).toBe(true)
      expect(manager.getSession()?.domains).toEqual(['reddit.com'])
    })

    it('indefinite session: sets durationMs=0, isIndefinite=true, skips timer', async () => {
      await manager.startSession(
        { blocklistId: 'list-1', durationMs: 0, isIndefinite: true },
        ['reddit.com']
      )

      const activeSession = manager.getSession()!
      expect(activeSession.durationMs).toBe(0)
      expect(activeSession.isIndefinite).toBe(true)
      expect(manager.isActive()).toBe(true)

      // write-ahead writes must use durationMs=0 and isIndefinite=true
      const writes = mockWriteSessionAtomic.mock.calls
      expect(writes[1][1]?.durationMs).toBe(0)
      expect(writes[1][1]?.isIndefinite).toBe(true)
    })

    it('rejects concurrent start when session already active', async () => {
      await manager.startSession({ blocklistId: 'list-1', durationMs: 60_000 }, ['reddit.com'])
      await expect(
        manager.startSession({ blocklistId: 'list-1', durationMs: 60_000 }, ['twitter.com'])
      ).rejects.toThrow(/already active/i)
    })

    it('throws when helper is not running', async () => {
      mockIsHelperRunning.mockResolvedValueOnce(false)
      await expect(
        manager.startSession({ blocklistId: 'list-1', durationMs: 60_000 }, ['reddit.com'])
      ).rejects.toThrow(/helper/i)
      // Session should remain null — no partial write was made
      expect(manager.getSession()).toBeNull()
      expect(mockWriteSessionAtomic).not.toHaveBeenCalled()
    })
  })

  describe('stopSession', () => {
    it('transitions active → stopping → idle with write-ahead ordering', async () => {
      await manager.startSession({ blocklistId: 'list-1', durationMs: 60_000 }, ['reddit.com'])
      stateChanges.length = 0
      mockWriteSessionAtomic.mockClear()

      await manager.stopSession()

      // First write: stopping intent
      const writes = mockWriteSessionAtomic.mock.calls
      expect(writes[0][1]?.status).toBe('stopping')
      expect(writes[0][1]?.intent).toBe('will_remove_hosts')

      // removeBlock called
      expect(mockRemoveBlock).toHaveBeenCalled()

      // Second write: null (idle)
      expect(writes[1][1]).toBeNull()

      // Final state event is null
      const lastChange = stateChanges[stateChanges.length - 1]
      expect(lastChange).toBeNull()

      expect(manager.getSession()).toBeNull()
      expect(manager.isActive()).toBe(false)
    })

    it('is a no-op when no active session', async () => {
      await manager.stopSession()
      expect(mockRemoveBlock).not.toHaveBeenCalled()
      expect(mockWriteSessionAtomic).not.toHaveBeenCalled()
    })
  })

  describe('resumeSession', () => {
    it('resumes a valid session with time remaining', async () => {
      const session = {
        id: 'recovered-id',
        blocklistId: 'list-1',
        domains: ['reddit.com'],
        startedAt: Date.now() - 10_000,
        durationMs: 60_000,
        status: 'active' as const,
        intent: undefined,
      }

      await manager.resumeSession(session)

      expect(manager.isActive()).toBe(true)
      const s = manager.getSession()!
      expect(s.status).toBe('active')
      expect(s.intent).toBeUndefined()
    })

    it('indefinite session: skips remainingMs check and restores active without timer', async () => {
      const session = {
        id: 'indefinite-id',
        blocklistId: 'list-1',
        domains: ['reddit.com'],
        startedAt: Date.now() - 999_999_000, // very old — would fail time check if not indefinite
        durationMs: 0,
        isIndefinite: true,
        status: 'active' as const,
        intent: undefined,
      }

      await manager.resumeSession(session)

      expect(manager.isActive()).toBe(true)
      const s = manager.getSession()!
      expect(s.isIndefinite).toBe(true)
      expect(s.durationMs).toBe(0)
    })

    it('stops immediately when session has expired', async () => {
      const session = {
        id: 'expired-id',
        blocklistId: 'list-1',
        domains: ['reddit.com'],
        startedAt: Date.now() - 120_000,
        durationMs: 60_000,
        status: 'active' as const,
        intent: undefined,
      }

      await manager.resumeSession(session)
      expect(manager.isActive()).toBe(false)
    })
  })

  describe('state queries', () => {
    it('isActive() returns false initially', () => {
      expect(manager.isActive()).toBe(false)
    })

    it('getSession() returns null initially', () => {
      expect(manager.getSession()).toBeNull()
    })

    it('isActive() returns true during active session', async () => {
      await manager.startSession({ blocklistId: 'list-1', durationMs: 60_000 }, ['reddit.com'])
      expect(manager.isActive()).toBe(true)
    })
  })
})
