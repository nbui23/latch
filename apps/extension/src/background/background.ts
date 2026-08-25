// Latch background service worker (Chrome MV3)
// Primary: webNavigation.onErrorOccurred intercepts failed connections and redirects
// Belt-and-suspenders: declarativeNetRequest dynamic rules block before connection (Chrome only)

import {
  EMPTY_SESSION_SNAPSHOT,
  buildBlockedUrlRegexFilter,
  buildBlockedPageUrl,
  getBlockedHostname,
  sessionSnapshotFromCache,
  sessionSnapshotFromPayload,
  type SessionSnapshot,
} from './session-state'
import {
  getSessionTransitionAction,
  shouldIgnoreNoSessionSnapshot,
  shouldSkipBlockedRedirect,
} from './background-logic'
import { parseNMMessage } from '../nm-client/client'

const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html')
const NM_HOST_ID = 'app.latch'
const SESSION_CACHE_KEY = 'sessionSnapshot'

/**
 * One snapshot object, not four parallel `let`s that every writer had to
 * remember to update together.
 */
let session: SessionSnapshot = { ...EMPTY_SESSION_SNAPSHOT }
const pendingBlockedRedirects = new Map<number, string>()

let restoreSessionPromise: Promise<void> | null = null

function isBlockedPageUrl(url: string): boolean {
  return url.startsWith(BLOCKED_PAGE)
}

function applySessionSnapshot(snapshot: SessionSnapshot): void {
  session = { ...snapshot, blockedDomains: [...snapshot.blockedDomains] }
}

function getSessionSnapshot(): SessionSnapshot {
  return { ...session, blockedDomains: [...session.blockedDomains] }
}

async function persistSessionSnapshot(): Promise<void> {
  if (typeof chrome.storage?.local === 'undefined') return
  await chrome.storage.local.set({ [SESSION_CACHE_KEY]: getSessionSnapshot() })
}

async function restoreSessionSnapshot(): Promise<void> {
  if (typeof chrome.storage?.local === 'undefined') return

  const cached = await chrome.storage.local.get(SESSION_CACHE_KEY)
  applySessionSnapshot(sessionSnapshotFromCache(cached[SESSION_CACHE_KEY]))

  if (session.sessionActive && session.blockedDomains.length > 0) {
    await updateDnrRules()
  }
}

function ensureSessionSnapshot(): Promise<void> {
  if (!restoreSessionPromise) {
    restoreSessionPromise = restoreSessionSnapshot().catch((err) => {
      console.warn('[Latch] Failed to restore cached session state:', err)
    })
  }
  return restoreSessionPromise
}

function buildTabBlockedPageUrl(originalUrl: string): string | null {
  if (isBlockedPageUrl(originalUrl)) return null
  const hostname = getBlockedHostname(originalUrl, session.blockedDomains)
  if (!hostname) return null
  return buildBlockedPageUrl(BLOCKED_PAGE, hostname, originalUrl)
}

async function getBlockedPageUrlForNavigation(url: string): Promise<string | null> {
  await ensureSessionSnapshot()
  return buildTabBlockedPageUrl(url)
}

async function redirectTabToBlockedPage(tabId: number, url: string): Promise<boolean> {
  if (tabId < 0) return false
  if (isBlockedPageUrl(url)) {
    pendingBlockedRedirects.delete(tabId)
    return false
  }

  const blockedUrl = await getBlockedPageUrlForNavigation(url)
  if (!blockedUrl) return false
  const pendingBlockedUrl = pendingBlockedRedirects.get(tabId)
  if (shouldSkipBlockedRedirect({
    currentUrl: url,
    blockedUrl,
    pendingBlockedUrl,
    isCurrentBlockedPage: false,
  })) {
    if (blockedUrl && url === blockedUrl) {
      pendingBlockedRedirects.delete(tabId)
    }
    return false
  }

  try {
    pendingBlockedRedirects.set(tabId, blockedUrl)
    await chrome.tabs.update(tabId, { url: blockedUrl })
    return true
  } catch (err) {
    pendingBlockedRedirects.delete(tabId)
    console.warn('[Latch] Failed to redirect blocked tab:', err)
    return false
  }
}

async function syncOpenBlockedTabs(): Promise<void> {
  if (!session.sessionActive || session.blockedDomains.length === 0) return

  try {
    const tabs = await chrome.tabs.query({})
    await Promise.all(
      tabs.map(async (tab) => {
        if (typeof tab.id !== 'number' || typeof tab.url !== 'string') return
        await redirectTabToBlockedPage(tab.id, tab.url)
      }),
    )
  } catch (err) {
    console.warn('[Latch] Failed to sync open blocked tabs:', err)
  }
}

function getOriginalUrlFromBlockedPageUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!isBlockedPageUrl(parsed.href)) return null
    return (new URLSearchParams(parsed.search).get('original') ?? parsed.hash.slice(1)) || null
  } catch {
    return null
  }
}

async function restoreOpenBlockedTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({})
    await Promise.all(
      tabs.map(async (tab) => {
        if (typeof tab.id !== 'number' || typeof tab.url !== 'string') return
        const originalUrl = getOriginalUrlFromBlockedPageUrl(tab.url)
        if (!originalUrl) return
        await chrome.tabs.update(tab.id, { url: originalUrl })
      }),
    )
  } catch (err) {
    console.warn('[Latch] Failed to restore blocked tabs:', err)
  }
}

async function handleMainFrameNavigation(tabId: number, url: string): Promise<void> {
  await redirectTabToBlockedPage(tabId, url)
}

// ─── Native Messaging ────────────────────────────────────────────────────────

let nmPort: chrome.runtime.Port | null = null
let nmReconnectTimer: ReturnType<typeof setTimeout> | null = null
let nmRetryCount = 0
const NM_RETRY_BASE_MS = 1000
const NM_RETRY_MAX_MS = 60_000

/**
 * Never stop retrying: nothing polls any more, so giving up would be a
 * permanent blocking outage. Exactly one attempt may ever be pending —
 * connectNative hands back a port even when the host fails to spawn, so a
 * second caller arriving during that one-task window would start a rival
 * reconnect chain, and the chains accumulate instead of replacing each other.
 */
function scheduleNMReconnect(): void {
  if (nmReconnectTimer) return
  const delay = Math.min(NM_RETRY_BASE_MS * Math.pow(2, nmRetryCount), NM_RETRY_MAX_MS)
  nmRetryCount++
  nmReconnectTimer = setTimeout(() => {
    nmReconnectTimer = null
    connectNativeHost()
  }, delay)
}

function connectNativeHost(): void {
  // One live port is the whole bridge: a second connectNative spawns a second
  // nm-host process and orphans the first. A pending backoff counts as an
  // attempt in flight — jumping ahead of it is what multiplies the spawns.
  if (nmPort || nmReconnectTimer) return
  try {
    nmPort = chrome.runtime.connectNative(NM_HOST_ID)

    nmPort.onMessage.addListener((msg: unknown) => {
      // A message proves the host is really up, which a returned port does not
      // — connectNative resolves even when the host fails to spawn.
      nmRetryCount = 0
      void handleNativeMessage(msg)
    })

    nmPort.onDisconnect.addListener(() => {
      nmPort = null
      const err = chrome.runtime.lastError
      if (err) {
        console.warn('[Latch] NM host disconnected:', err.message)
      }
      scheduleNMReconnect()
    })
  } catch (err) {
    nmPort = null
    console.warn('[Latch] Failed to connect native host:', err)
  }
}

async function handleNativeMessage(msg: unknown): Promise<void> {
  // Validate every inbound NM payload against the shared Zod schema. A
  // malformed/unknown message (e.g. from a stale NM host binary) is silently
  // dropped instead of being coerced through an unsafe cast.
  const validated = parseNMMessage(msg)
  if (!validated) return
  const previousSnapshot = getSessionSnapshot()

  if (validated.type === 'session_state') {
    const nextSnapshot = sessionSnapshotFromPayload(validated.payload)
    const transitionAction = getSessionTransitionAction(previousSnapshot, nextSnapshot)
    if (transitionAction === 'none') return

    applySessionSnapshot(nextSnapshot)
    await Promise.all([persistSessionSnapshot(), updateDnrRules()])
    if (transitionAction === 'sync-blocked-tabs') {
      await syncOpenBlockedTabs()
    } else if (transitionAction === 'restore-blocked-tabs') {
      pendingBlockedRedirects.clear()
      await restoreOpenBlockedTabs()
    }
    return
  }

  if (validated.type === 'no_session') {
    // The NM bridge also emits no_session for transient transport failures.
    // Do not tear down an already-blocking tab until we receive an explicit
    // inactive session snapshot from the desktop app.
    if (shouldIgnoreNoSessionSnapshot(previousSnapshot)) {
      console.warn('[Latch] Ignoring transient no_session while cached blocking state is still active')
      return
    }

    if (getSessionTransitionAction(previousSnapshot, EMPTY_SESSION_SNAPSHOT) === 'none') return

    applySessionSnapshot({ ...EMPTY_SESSION_SNAPSHOT })
    await Promise.all([persistSessionSnapshot(), updateDnrRules()])
    pendingBlockedRedirects.clear()
    return
  }

  if (validated.type === 'error') {
    // The desktop app or the NM proxy could not understand something we sent.
    // Leave blocking state alone — a reported failure is not a session update.
    console.warn('[Latch] Native messaging error:', validated.error)
    return
  }

}

// ─── webNavigation.onErrorOccurred (primary) ─────────────────────────────────
// Fires when the browser gets a connection error — hosts-file-blocked sites
// produce net::ERR_NAME_NOT_RESOLVED or net::ERR_CONNECTION_REFUSED.

const BLOCKED_ERROR_CODES = new Set([
  'net::ERR_NAME_NOT_RESOLVED',
  'net::ERR_NAME_RESOLUTION_FAILED',
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_ADDRESS_UNREACHABLE',
])

chrome.webNavigation.onErrorOccurred.addListener((details) => {
  void (async () => {
    if (details.frameId !== 0) return
    if (!BLOCKED_ERROR_CODES.has(details.error)) return
    await handleMainFrameNavigation(details.tabId, details.url)
  })().catch((err) => {
    console.warn('[Latch] Blocked navigation handler failed:', err)
  })
})

chrome.webNavigation.onCommitted.addListener((details) => {
  void (async () => {
    if (details.frameId !== 0) return
    await handleMainFrameNavigation(details.tabId, details.url)
  })().catch((err) => {
    console.warn('[Latch] Committed navigation handler failed:', err)
  })
})

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  void (async () => {
    if (details.frameId !== 0) return
    await handleMainFrameNavigation(details.tabId, details.url)
  })().catch((err) => {
    console.warn('[Latch] SPA navigation handler failed:', err)
  })
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void (async () => {
    const tab = await chrome.tabs.get(tabId)
    if (typeof tab.url !== 'string') return
    await handleMainFrameNavigation(tabId, tab.url)
  })().catch((err) => {
    console.warn('[Latch] Active-tab refresh handler failed:', err)
  })
})

if (typeof chrome.windows !== 'undefined') {
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return

    void (async () => {
      await syncOpenBlockedTabs()
    })().catch((err) => {
      console.warn('[Latch] Window-focus refresh handler failed:', err)
    })
  })
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || (message as { type?: string }).type !== 'get_timer') {
    return false
  }

  void (async () => {
    await ensureSessionSnapshot()

    if (!session.sessionActive) {
      sendResponse({ sessionActive: false })
    } else if (session.durationMs === 0) {
      sendResponse({ sessionActive: true, isIndefinite: true })
    } else {
      sendResponse({
        sessionActive: true,
        startedAt: session.startedAt,
        durationMs: session.durationMs,
      })
    }
  })().catch((err) => {
    console.warn('[Latch] Failed to answer blocked-page timer request:', err)
    sendResponse(null)
  })

  return true
})

// ─── declarativeNetRequest (belt-and-suspenders, Chrome MV3 only) ─────────────
// Adds dynamic redirect rules so the blocked page shows even before DNS resolution.

const DNR_RULE_ID_BASE = 1000

async function updateDnrRules(): Promise<void> {
  if (typeof chrome.declarativeNetRequest === 'undefined') return

  const existing = await chrome.declarativeNetRequest.getDynamicRules()
  const removeIds = existing.map((r) => r.id)

  if (!session.sessionActive || session.blockedDomains.length === 0) {
    if (removeIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds })
    }
    return
  }

  const addRules: chrome.declarativeNetRequest.Rule[] = session.blockedDomains.map((domain, i) => ({
    id: DNR_RULE_ID_BASE + i,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      redirect: {
        regexSubstitution: `${BLOCKED_PAGE}#\\0`,
      },
    },
    condition: {
      regexFilter: buildBlockedUrlRegexFilter(domain),
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
    },
  }))

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules,
  })
}

// ─── Service worker keep-alive (Chrome MV3) ──────────────────────────────────

if (typeof chrome.alarms !== 'undefined') {
  chrome.alarms.create('keepalive', { periodInMinutes: 0.1 })
  chrome.alarms.onAlarm.addListener((alarm) => {
    // A wake, not a poll: nm-host pushes every state change, so the only useful
    // thing a tick can do is notice a dead bridge and reconnect.
    if (alarm.name === 'keepalive' && !nmPort) {
      connectNativeHost()
    }
  })
}

// ─── Startup ─────────────────────────────────────────────────────────────────

void ensureSessionSnapshot()

chrome.runtime.onInstalled.addListener(() => {
  connectNativeHost()
})

chrome.runtime.onStartup.addListener(() => {
  connectNativeHost()
})

connectNativeHost()
