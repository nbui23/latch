/**
 * `window.latch` is whatever the preload script exposed — no more, no less.
 * Typing it from `typeof latchApi` means the renderer cannot drift from the
 * bridge, and adding a channel in preload makes it available here for free.
 */

import type { LatchApi } from '../main/preload.js'

declare global {
  interface Window {
    latch: LatchApi
  }
}

export {}
