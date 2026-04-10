export interface SessionSnapshot {
  blockedDomains: string[]
  sessionActive: boolean
  startedAt: number
  durationMs: number
}

export interface SessionPayload {
  domains?: string[]
  status?: string
  startedAt?: number
  durationMs?: number
}

export const EMPTY_SESSION_SNAPSHOT: SessionSnapshot = {
  blockedDomains: [],
  sessionActive: false,
  startedAt: 0,
  durationMs: 0,
}

export function areSessionSnapshotsEqual(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return (
    a.sessionActive === b.sessionActive &&
    a.startedAt === b.startedAt &&
    a.durationMs === b.durationMs &&
    a.blockedDomains.length === b.blockedDomains.length &&
    a.blockedDomains.every((domain, index) => domain === b.blockedDomains[index])
  )
}

export function isBlockingSessionStatus(status: string | undefined): boolean {
  return status === 'starting' || status === 'active' || status === 'stopping'
}

export function sessionSnapshotFromPayload(payload: SessionPayload | null): SessionSnapshot {
  if (isBlockingSessionStatus(payload?.status) && Array.isArray(payload?.domains) && payload.domains.length > 0) {
    return {
      blockedDomains: payload.domains,
      sessionActive: true,
      startedAt: typeof payload.startedAt === 'number' ? payload.startedAt : 0,
      durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : 0,
    }
  }

  return { ...EMPTY_SESSION_SNAPSHOT }
}

export function sessionSnapshotFromCache(value: unknown): SessionSnapshot {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_SESSION_SNAPSHOT }
  }

  const cached = value as Partial<SessionSnapshot>
  const blockedDomains = Array.isArray(cached.blockedDomains)
    ? cached.blockedDomains.filter((domain): domain is string => typeof domain === 'string')
    : []

  return {
    blockedDomains,
    sessionActive: cached.sessionActive === true && blockedDomains.length > 0,
    startedAt: typeof cached.startedAt === 'number' ? cached.startedAt : 0,
    durationMs: typeof cached.durationMs === 'number' ? cached.durationMs : 0,
  }
}

export function getBlockedHostname(url: string, blockedDomains: string[]): string | null {
  try {
    const hostname = new URL(url).hostname
    const normalizedHost = hostname.replace(/^www\./, '')

    return blockedDomains.some((domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`))
      ? hostname
      : null
  } catch {
    return null
  }
}

export function buildBlockedUrlRegexFilter(domain: string): string {
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return `^https?://(?:[^/?#]+\\.)*${escapedDomain}(?::\\d+)?(?:[/?#].*)?$`
}

export function buildBlockedPageUrl(blockedPageUrl: string, domain: string, originalUrl: string): string {
  return `${blockedPageUrl}?domain=${encodeURIComponent(domain)}&original=${encodeURIComponent(originalUrl)}`
}
