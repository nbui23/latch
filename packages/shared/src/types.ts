/**
 * Static types for every Latch trust boundary.
 *
 * Everything that is validated at runtime is inferred from its schema in
 * `schema.ts` rather than declared twice — the schema is the source of truth.
 * Only shapes that never cross a validating boundary are declared by hand.
 */

import type { z } from 'zod'
import type {
  AppConfigSchema,
  AppPreferencesSchema,
  BlockListSchema,
  HelperCommandSchema,
  HelperResponseSchema,
  IpcSessionStartSchema,
  NativeMessageFromElectronSchema,
  NativeMessageToElectronSchema,
  RecoveryActionSchema,
  SessionIntentSchema,
  SessionSchema,
  SessionStatusSchema,
} from './schema.js'

export type SessionStatus = z.infer<typeof SessionStatusSchema>
export type SessionIntent = z.infer<typeof SessionIntentSchema>
export type Session = z.infer<typeof SessionSchema>
export type BlockList = z.infer<typeof BlockListSchema>

export type HelperCommand = z.infer<typeof HelperCommandSchema>
export type HelperResponse = z.infer<typeof HelperResponseSchema>

// Native messaging messages (extension <-> NM host <-> Electron)
export type NativeMessageToElectron = z.infer<typeof NativeMessageToElectronSchema>
export type NativeMessageFromElectron = z.infer<typeof NativeMessageFromElectronSchema>
export type NativeMessage = NativeMessageToElectron | NativeMessageFromElectron

// IPC messages (renderer <-> main)
export type IpcSessionStart = z.infer<typeof IpcSessionStartSchema>
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>

export type AppPreferences = z.infer<typeof AppPreferencesSchema>
export type AppConfig = z.infer<typeof AppConfigSchema>

/**
 * Result of validating user-entered domain text. A discriminated union so a
 * caller that has checked `valid` gets the matching field without a non-null
 * assertion — `{ valid: false, normalized: 'x' }` cannot be constructed.
 */
export type DomainValidationResult =
  | { valid: true; normalized: string }
  | { valid: false; error: string }

/** Crash-recovery snapshot handed to the renderer. Main → renderer only. */
export interface StaleSessionInfo {
  session: Session | null
  hostsHasMarkers: boolean
}
