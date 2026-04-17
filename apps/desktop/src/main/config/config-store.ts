/**
 * Config store using lowdb (pure JS JSON).
 * Stores blocklists and preferences in config.json.
 * This is NOT the session store — no crash-safety required here.
 */

import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import type { BlockList, AppConfig, AppPreferences } from '@latch/shared'
import { AppConfigSchema, AppPreferencesSchema } from '@latch/shared'

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
    } catch {
      return createDefaultConfig()
    }
  }

  private save(): void {
    // Atomic write: temp file + fsync + rename. Prevents partial/corrupt
    // config.json if the process crashes mid-write. Matches the pattern
    // used for session.json (see session-store.ts).
    const dir = path.dirname(this.configPath)
    const tmp = this.configPath + '.tmp'
    const json = JSON.stringify(this.data, null, 2)

    try {
      const fd = fs.openSync(tmp, 'w', 0o600)
      try {
        fs.writeSync(fd, json)
        fs.fsyncSync(fd)
      } finally {
        fs.closeSync(fd)
      }

      fs.renameSync(tmp, this.configPath)

      try {
        const dirFd = fs.openSync(dir, 'r')
        try {
          fs.fsyncSync(dirFd)
        } finally {
          fs.closeSync(dirFd)
        }
      } catch {
        // best-effort: some filesystems refuse fsync on directories
      }
    } catch (error) {
      try {
        fs.unlinkSync(tmp)
      } catch {
        // ignore cleanup failures
      }
      throw error
    }
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

  deleteBlocklist(id: string): void {
    this.data.blocklists = this.data.blocklists.filter((blocklist) => blocklist.id !== id)
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
