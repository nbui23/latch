import {
  getBlockedDomain,
  getOriginalUrl,
  hasActiveTimer,
  isExplicitlyInactive,
  type TimerResponse,
} from './utils'

const originalUrl = getOriginalUrl(window.location.search, window.location.hash)
const domain = getBlockedDomain(window.location.search, originalUrl)

const domainEl = document.getElementById('domain')
if (domainEl) domainEl.textContent = domain

function updateTimer(remainingMs: number): void {
  const timerEl = document.getElementById('timer')
  const wrapEl = document.getElementById('timer-wrap')
  if (!timerEl || !wrapEl) return

  if (remainingMs <= 0) {
    wrapEl.style.display = 'none'
    return
  }

  const totalSecs = Math.ceil(remainingMs / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60

  if (h > 0) {
    timerEl.textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  } else {
    timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`
  }
}

let startedAt = 0
let durationMs = 0
let refreshIntervalId: ReturnType<typeof setInterval> | undefined
let tickIntervalId: ReturnType<typeof setInterval> | undefined

function ensureTimerRefreshLoop(): void {
  if (!refreshIntervalId) {
    refreshIntervalId = setInterval(requestTimerState, 5000)
  }
}

function restoreOriginalUrl(): void {
  if (!originalUrl) return
  window.location.replace(originalUrl)
}

function tick(): void {
  if (startedAt > 0 && durationMs > 0) {
    const remaining = Math.max(0, startedAt + durationMs - Date.now())
    updateTimer(remaining)
    if (remaining === 0) {
      restoreOriginalUrl()
    }
  }
}

function syncTimerState(response: TimerResponse | null): void {
  if (response?.isIndefinite) {
    const wrapEl = document.getElementById('timer-wrap')
    if (wrapEl) wrapEl.style.display = 'none'
    ensureTimerRefreshLoop()
    return
  }

  if (isExplicitlyInactive(response)) {
    restoreOriginalUrl()
    return
  }

  if (!hasActiveTimer(response)) {
    ensureTimerRefreshLoop()
    return
  }

  startedAt = response.startedAt
  durationMs = response.durationMs
  tick()

  if (!tickIntervalId) {
    tickIntervalId = setInterval(tick, 1000)
  }

  ensureTimerRefreshLoop()
}

function requestTimerState(): void {
  chrome.runtime.sendMessage({ type: 'get_timer' }, (response: unknown) => {
    if (chrome.runtime.lastError) {
      setTimeout(requestTimerState, 500)
      return
    }
    syncTimerState(response && typeof response === 'object' ? (response as TimerResponse) : null)
  })
}

requestTimerState()
