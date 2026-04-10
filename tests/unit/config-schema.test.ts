import { describe, expect, it } from 'vitest'
import { AppConfigSchema } from '../../packages/shared/src/schema.js'

describe('AppConfigSchema', () => {
  it('defaults showMenuBarIcon to true for legacy configs', () => {
    const config = AppConfigSchema.parse({
      blocklists: [],
      preferences: {
        defaultDurationMs: 30_000,
      },
    })

    expect(config.preferences.showMenuBarIcon).toBe(true)
    expect(config.preferences.showDockIconWhenMenuBarEnabled).toBe(false)
  })

  it('defaults the entire preferences object when missing', () => {
    const config = AppConfigSchema.parse({
      blocklists: [],
    })

    expect(config.preferences.defaultDurationMs).toBe(2 * 60 * 60 * 1000)
    expect(config.preferences.showMenuBarIcon).toBe(true)
    expect(config.preferences.showDockIconWhenMenuBarEnabled).toBe(false)
  })

  it('preserves an explicit false menu bar preference', () => {
    const config = AppConfigSchema.parse({
      blocklists: [],
      preferences: {
        defaultDurationMs: 45_000,
        showMenuBarIcon: false,
        showDockIconWhenMenuBarEnabled: true,
      },
    })

    expect(config.preferences.showMenuBarIcon).toBe(false)
    expect(config.preferences.showDockIconWhenMenuBarEnabled).toBe(true)
  })
})
