/**
 * Config store — blocklists and preferences, persisted to config.json.
 * This is NOT the session store: losing a preference edit is survivable,
 * losing the session journal is not.
 */

import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import type { BlockList, AppConfig, AppPreferences } from '@latch/shared'
import { AppConfigSchema, AppPreferencesSchema } from '@latch/shared'
import { writeFileAtomicSync } from '../fs/atomic-write.js'

function createDefaultConfig(): AppConfig {
  return {
    blocklists: [
      {
        id: uuidv4(),
        name: 'Default',
        domains: [],
        createdAt: Date.now(),
      },
    ],
    preferences: {
      defaultDurationMs: 2 * 60 * 60 * 1000,
      showMenuBarIcon: true,
      showDockIconWhenMenuBarEnabled: false,
    },
  }
}

export class ConfigStore {
  private configPath: string
  private data: AppConfig

  constructor(configPath?: string) {
    this.configPath = configPath ?? path.join(app.getPath('userData'), 'config.json')
    this.data = this.load()
  }

  private load(): AppConfig {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8')
      const parsed = JSON.parse(raw)
      return AppConfigSchema.parse(parsed)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return createDefaultConfig()
      }

      this.preserveInvalidConfig(error)
      return createDefaultConfig()
    }
  }

  private preserveInvalidConfig(error: unknown): void {
    const backupPath = `${this.configPath}.invalid-${Date.now()}`

    try {
      fs.renameSync(this.configPath, backupPath)
      console.warn(
        `[config-store] Invalid config at ${this.configPath}; moved to ${backupPath}:`,
        error,
      )
    } catch (renameError) {
      console.warn(
        `[config-store] Invalid config at ${this.configPath}; failed to preserve bad file:`,
        error,
        renameError,
      )
    }
  }

  private save(): void {
    // config.json is written through the same atomic path as session.json so a
    // crash mid-write can never leave a truncated file behind (see
    // ../fs/atomic-write.ts). 0o600: preferences are per-user data.
    writeFileAtomicSync(this.configPath, JSON.stringify(this.data, null, 2), { mode: 0o600 })
  }

  getAllBlocklists(): BlockList[] {
    return this.data.blocklists
  }

  getBlocklist(id: string): BlockList | undefined {
    return this.data.blocklists.find((blocklist) => blocklist.id === id)
  }

  saveBlocklist(blocklist: BlockList): void {
    const idx = this.data.blocklists.findIndex((existing) => existing.id === blocklist.id)
    if (idx >= 0) {
      this.data.blocklists[idx] = blocklist
    } else {
      this.data.blocklists.push(blocklist)
    }
    this.save()
  }

  getPreferences(): AppPreferences {
    return { ...this.data.preferences }
  }

  updatePreferences(patch: Partial<AppPreferences>): AppPreferences {
    this.data.preferences = AppPreferencesSchema.parse({
      ...this.data.preferences,
      ...patch,
    })
    this.save()
    return this.getPreferences()
  }
}
