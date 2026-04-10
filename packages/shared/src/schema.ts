import { z } from 'zod'

export const BlockedSiteSchema = z.object({
  domain: z.string().min(1),
})

export const BlockListSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  domains: z.array(z.string()),
  createdAt: z.number(),
})

export const SessionStatusSchema = z.enum([
  'idle',
  'starting',
  'active',
  'stopping',
  'recovering',
  'helper_unavailable',
])

export const SessionSchema = z.object({
  id: z.string().uuid(),
  blocklistId: z.string().uuid(),
  domains: z.array(z.string()),
  startedAt: z.number(),
  durationMs: z.number().nonnegative(),
  isIndefinite: z.boolean().optional(),
  status: SessionStatusSchema,
  intent: z.enum(['will_write_hosts', 'will_remove_hosts']).optional(),
})

export const HelperCommandSchema = z.discriminatedUnion('cmd', [
  z.object({ cmd: z.literal('write_block'), domains: z.array(z.string()), sessionId: z.string() }),
  z.object({ cmd: z.literal('remove_block'), sessionId: z.string() }),
  z.object({ cmd: z.literal('ping') }),
])

export const NativeMessageToElectronSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('get_state') }),
  z.object({ type: z.literal('subscribe_state') }),
])

export const NativeMessageFromElectronSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session_state'), payload: SessionSchema.nullable() }),
  z.object({ type: z.literal('no_session') }),
  z.object({
    type: z.literal('timer_state'),
    payload: z.object({
      remainingMs: z.number(),
      totalMs: z.number(),
      startedAt: z.number(),
    }),
  }),
])

export const AppPreferencesSchema = z.object({
  defaultDurationMs: z.number().default(2 * 60 * 60 * 1000),
  showMenuBarIcon: z.boolean().default(true),
  showDockIconWhenMenuBarEnabled: z.boolean().default(false),
})

export const AppConfigSchema = z.object({
  blocklists: z.array(BlockListSchema),
  preferences: AppPreferencesSchema.default({
    defaultDurationMs: 2 * 60 * 60 * 1000,
    showMenuBarIcon: true,
    showDockIconWhenMenuBarEnabled: false,
  }),
})

export type AppPreferences = z.infer<typeof AppPreferencesSchema>
export type AppConfig = z.infer<typeof AppConfigSchema>
