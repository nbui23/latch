import { afterEach, describe, expect, it, vi } from 'vitest'

type FakeElement = {
  style: { display: string }
  textContent: string
}

const FIXED_NOW = Date.parse('2026-04-09T12:00:00.000Z')

function createElement(): FakeElement {
  return {
    style: { display: '' },
    textContent: '',
  }
}

async function loadBlockedPage(response: unknown) {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  vi.resetModules()

  const replace = vi.fn()
  const elements: Record<string, FakeElement> = {
    domain: createElement(),
    timer: createElement(),
    'timer-wrap': createElement(),
  }

  vi.stubGlobal('document', {
    getElementById(id: string) {
      return elements[id] ?? null
    },
  })

  vi.stubGlobal('window', {
    location: {
      search: '?domain=reddit.com&original=https%3A%2F%2Freddit.com',
      hash: '',
      replace,
    },
  })

  vi.stubGlobal('chrome', {
    runtime: {
      lastError: null,
      sendMessage: vi.fn((_message: unknown, callback: (payload: unknown) => void) => {
        callback(response)
      }),
    },
  })

  await import('./blocked')

  return { replace }
}

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('blocked page timer sync', () => {
  it('keeps the blocked page stable when timer state is temporarily unavailable', async () => {
    const { replace } = await loadBlockedPage(null)

    expect(replace).not.toHaveBeenCalled()
  })

  it('restores the original url when the background explicitly reports that blocking ended', async () => {
    const { replace } = await loadBlockedPage({ sessionActive: false })

    expect(replace).toHaveBeenCalledWith('https://reddit.com')
  })

  it('still restores the original url when the timer has actually expired', async () => {
    const { replace } = await loadBlockedPage({
      startedAt: FIXED_NOW - 2_000,
      durationMs: 1_000,
    })

    expect(replace).toHaveBeenCalledWith('https://reddit.com')
  })
})
