export interface TimerResponse {
  durationMs?: number
  startedAt?: number
  isIndefinite?: boolean
  sessionActive?: boolean
}

export function getOriginalUrl(search: string, hash: string): string {
  const params = new URLSearchParams(search)
  return params.get('original') ?? hash.slice(1)
}

export function getBlockedDomain(search: string, originalUrl: string): string {
  const params = new URLSearchParams(search)
  const explicitDomain = params.get('domain')
  if (explicitDomain) return explicitDomain

  if (!originalUrl) return ''

  try {
    return new URL(originalUrl).hostname
  } catch {
    return ''
  }
}

export function hasActiveTimer(response: TimerResponse | null): response is Required<TimerResponse> {
  return Boolean(response && response.startedAt && response.durationMs)
}

export function isExplicitlyInactive(response: TimerResponse | null): boolean {
  return response?.sessionActive === false
}
