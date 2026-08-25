import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerIpcHandlersWith } from '../../apps/desktop/src/main/ipc/handlers.js'
import { removeBlock } from '../../apps/desktop/src/main/hosts/hosts-manager.js'
import { writeSessionAtomic } from '../../apps/desktop/src/main/session/session-store.js'

// recovery:action reaches the helper and the journal for real; stub both so the
// test asserts the decision, not the side effects.
vi.mock('../../apps/desktop/src/main/hosts/hosts-manager.js', () => ({
  removeBlock: vi.fn(async () => undefined),
}))
vi.mock('../../apps/desktop/src/main/session/session-store.js', () => ({
  writeSessionAtomic: vi.fn(),
}))

const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>()

function invoke(channel: string, payload?: unknown) {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`)
  }
  return handler({}, payload)
}

describe('registerIpcHandlersWith integration', () => {
  const sessionManager = {
    getSession: vi.fn(() => null),
    startSession: vi.fn(async () => undefined),
    stopSession: vi.fn(async () => undefined),
    getSessionPath: vi.fn(() => '/tmp/latch-session.json'),
    resumeSession: vi.fn(async () => undefined),
    isActive: vi.fn(() => false),
  }

  const configStore = {
    getBlocklist: vi.fn(() => ({
      id: '550e8400-e29b-41d4-a716-446655440020',
      name: 'Focus',
      domains: ['reddit.com'],
      createdAt: 1_700_000_000_000,
    })),
    getAllBlocklists: vi.fn(() => []),
    saveBlocklist: vi.fn(),
    getPreferences: vi.fn(() => ({
      defaultDurationMs: 1,
      showMenuBarIcon: true,
      showDockIconWhenMenuBarEnabled: false,
    })),
    updatePreferences: vi.fn((patch: Record<string, unknown>) => ({
      defaultDurationMs: 1,
      showMenuBarIcon: true,
      showDockIconWhenMenuBarEnabled: false,
      ...patch,
    })),
  }

  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    registerIpcHandlersWith(
      {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        },
      },
      sessionManager as never,
      configStore as never,
    )
  })

  it('accepts a valid blocklist:save payload through the IPC boundary', async () => {
    const response = await invoke('blocklist:save', {
      id: '550e8400-e29b-41d4-a716-446655440021',
      name: 'Deep Work',
      domains: ['news.ycombinator.com'],
      createdAt: 1_700_000_000_001,
    })

    expect(configStore.saveBlocklist).toHaveBeenCalledWith({
      id: '550e8400-e29b-41d4-a716-446655440021',
      name: 'Deep Work',
      domains: ['news.ycombinator.com'],
      createdAt: 1_700_000_000_001,
    })
    expect(response).toEqual({ ok: true, data: undefined })
  })

  it('rejects an invalid blocklist:save payload without calling the store', async () => {
    const response = await invoke('blocklist:save', {
      id: 'not-a-uuid',
      name: 'Bad',
      domains: ['reddit.com'],
      createdAt: 1,
    })

    expect(configStore.saveBlocklist).not.toHaveBeenCalled()
    expect(response).toEqual({ ok: false, error: 'Invalid blocklist payload' })
  })

  it('rejects malformed session:start payloads before touching session state', async () => {
    const response = await invoke('session:start', {
      blocklistId: '',
      durationMs: -1,
    })

    expect(sessionManager.startSession).not.toHaveBeenCalled()
    expect(response).toEqual({ ok: false, error: 'Invalid session start parameters' })
  })

  it('accepts a valid session:start payload through the IPC boundary', async () => {
    const response = await invoke('session:start', {
      blocklistId: '550e8400-e29b-41d4-a716-446655440022',
      durationMs: 60_000,
    })

    expect(sessionManager.startSession).toHaveBeenCalledWith(
      {
        blocklistId: '550e8400-e29b-41d4-a716-446655440022',
        durationMs: 60_000,
      },
      ['reddit.com'],
    )
    expect(response).toEqual({ ok: true, data: undefined })
  })

  it('recovery cleanup removes the block and clears the journal', async () => {
    const response = await invoke('recovery:action', 'cleanup')

    expect(removeBlock).toHaveBeenCalledWith('recovery')
    expect(writeSessionAtomic).toHaveBeenCalledWith('/tmp/latch-session.json', null)
    expect(sessionManager.resumeSession).not.toHaveBeenCalled()
    expect(response).toEqual({ ok: true, data: undefined })
  })

  it('recovery resume restores the session without touching the block', async () => {
    const stale = {
      id: '550e8400-e29b-41d4-a716-446655440030',
      blocklistId: '550e8400-e29b-41d4-a716-446655440020',
      domains: ['reddit.com'],
      startedAt: 1_700_000_000_000,
      durationMs: 60_000,
      status: 'active' as const,
    }
    sessionManager.getSession.mockReturnValueOnce(stale as never)

    const response = await invoke('recovery:action', 'resume')

    expect(sessionManager.resumeSession).toHaveBeenCalledWith(stale)
    expect(removeBlock).not.toHaveBeenCalled()
    expect(writeSessionAtomic).not.toHaveBeenCalled()
    expect(response).toEqual({ ok: true, data: undefined })
  })

  it('rejects an unknown recovery action without acting on either path', async () => {
    const response = await invoke('recovery:action', 'destroy-everything')

    expect(removeBlock).not.toHaveBeenCalled()
    expect(writeSessionAtomic).not.toHaveBeenCalled()
    expect(sessionManager.resumeSession).not.toHaveBeenCalled()
    expect(response).toEqual({ ok: false, error: 'Unknown recovery action' })
  })
})
