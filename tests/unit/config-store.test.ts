import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigStore } from '../../apps/desktop/src/main/config/config-store.js'

let tempDir = ''
let configPath = ''

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'latch-config-store-'))
  configPath = path.join(tempDir, 'config.json')
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('ConfigStore', () => {
  it('loads defaults when config on disk is invalid', () => {
    fs.writeFileSync(configPath, '{not-json')

    const store = new ConfigStore(configPath)
    const [blocklist] = store.getAllBlocklists()

    expect(blocklist.name).toBe('Default')
    expect(store.getPreferences().defaultDurationMs).toBe(2 * 60 * 60 * 1000)
  })

  it('writes config atomically and leaves no temp file behind on success', () => {
    const store = new ConfigStore(configPath)
    const createdAt = Date.now()

    store.saveBlocklist({
      id: '550e8400-e29b-41d4-a716-446655440010',
      name: 'Focus',
      domains: ['reddit.com'],
      createdAt,
    })

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))

    expect(parsed.blocklists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '550e8400-e29b-41d4-a716-446655440010',
          domains: ['reddit.com'],
          createdAt,
        }),
      ]),
    )
    expect(fs.existsSync(configPath + '.tmp')).toBe(false)
  })

  it('preserves the last committed config file if a temp write fails mid-save', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        blocklists: [],
        preferences: {
          defaultDurationMs: 12_345,
          showMenuBarIcon: false,
          showDockIconWhenMenuBarEnabled: true,
        },
      }),
    )
    fs.writeFileSync(configPath + '.tmp', 'locked')
    fs.chmodSync(configPath + '.tmp', 0o400)

    const store = new ConfigStore(configPath)

    expect(() =>
      store.saveBlocklist({
        id: '550e8400-e29b-41d4-a716-446655440011',
        name: 'Should Fail',
        domains: ['youtube.com'],
        createdAt: Date.now(),
      }),
    ).toThrow()

    const committed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    expect(committed).toEqual({
      blocklists: [],
      preferences: {
        defaultDurationMs: 12_345,
        showMenuBarIcon: false,
        showDockIconWhenMenuBarEnabled: true,
      },
    })
    expect(fs.existsSync(configPath + '.tmp')).toBe(false)
  })
})
