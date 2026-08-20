import type { Session } from '@latch/shared'
import { isBlockingSession } from '@latch/shared'

export type TrayVisualState = 'inactive' | 'active'

export function isBlockingVisibleInTray(session: Session | null): boolean {
  return isBlockingSession(session)
}

export function getTrayVisualState(session: Session | null): TrayVisualState {
  return isBlockingVisibleInTray(session) ? 'active' : 'inactive'
}

export function getTrayStatusLabel(session: Session | null, now = Date.now()): string {
  if (session === null) {
    return 'Latch — Idle'
  }

  switch (session.status) {
    case 'starting':
      return 'Latch — Starting block…'
    case 'stopping':
      return 'Latch — Ending block…'
    case 'recovering':
      return 'Latch — Recovering session…'
    case 'helper_unavailable':
      return 'Latch — Helper unavailable'
    case 'idle':
      return 'Latch — Idle'
    case 'active': {
      if (session.isIndefinite) {
        return 'Latch — Blocking active'
      }
      const remainingMs = Math.max(0, session.startedAt + session.durationMs - now)
      const mins = Math.max(1, Math.ceil(remainingMs / 60000))
      return `Latch — ${mins}m remaining`
    }
  }
}

export function getTrayMenuBarTitle(session: Session | null): string {
  return isBlockingVisibleInTray(session) ? '● L' : 'L'
}

export function createTraySvg(state: TrayVisualState): string {
  if (state === 'active') {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
        <rect x="4.15" y="2.35" width="3.85" height="13.1" rx="1.92" fill="#ffffff" />
        <rect x="4.15" y="11.65" width="10.15" height="3.8" rx="1.9" fill="#ffffff" />
      </svg>
    `
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <path
        d="M5.45 2.85V14.15H13.65"
        fill="none"
        stroke="#ffffff"
        stroke-width="2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `
}
