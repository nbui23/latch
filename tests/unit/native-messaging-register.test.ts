import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  homeDir: '',
}))

function getManifestPath(homeDir: string): string {
  return join(
    homeDir,
    'Library',
    'Application Support',
    'Google',
    'Chrome',
    'NativeMessagingHosts',
    'app.latch.json',
  )
}

describe('native messaging host registration', () => {
  let tempHomeDir = ''
  const originalResourcesPath = process.resourcesPath

  beforeEach(() => {
    vi.resetModules()
    vi.doMock('os', async () => {
      const actual = await vi.importActual<typeof import('os')>('os')
      return {
        ...actual,
        homedir: () => mockState.homeDir,
      }
    })
    tempHomeDir = mkdtempSync(join(tmpdir(), 'latch-nm-register-'))
    mockState.homeDir = tempHomeDir
    mkdirSync(join(tempHomeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'), {
      recursive: true,
    })
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      writable: true,
      value: '/Applications/Latch.app/Contents/Resources',
    })
  })

  afterEach(() => {
    rmSync(tempHomeDir, { recursive: true, force: true })
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      writable: true,
      value: originalResourcesPath,
    })
    vi.restoreAllMocks()
  })

  it('registers a clean-install manifest with the stable and legacy origins', async () => {
    const registerModule = await import('../../apps/desktop/src/main/native-messaging/register.js')
    const expectedPath = registerModule.getChromeNativeMessagingManifestStatus().expected.path

    expect(registerModule.getChromeNativeMessagingManifestStatus().reason).toBe('missing')
    expect(registerModule.isNMHostRegistered()).toBe(false)

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    registerModule.ensureNMHostRegistered()

    const manifest = JSON.parse(readFileSync(getManifestPath(tempHomeDir), 'utf8')) as {
      path: string
      allowed_origins: string[]
    }

    expect(manifest.path).toBe(expectedPath)
    expect(manifest.allowed_origins).toEqual([
      'chrome-extension://jhoadmodojdokpajmhboahbpdknnjjpg/',
      'chrome-extension://biofljeflbemigfbngaiknophgchchfo/',
    ])
    expect(registerModule.isNMHostRegistered()).toBe(true)
    expect(logSpy).toHaveBeenCalledWith('[nm-register] Registered Chrome native messaging host (macOS)')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('repairs an upgraded stale manifest that still allows only the broken legacy origin', async () => {
    const registerModule = await import('../../apps/desktop/src/main/native-messaging/register.js')
    const manifestPath = getManifestPath(tempHomeDir)
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          name: 'app.latch',
          description: 'Latch focus blocker',
          path: registerModule.getChromeNativeMessagingManifestStatus().expected.path,
          type: 'stdio',
          allowed_origins: ['chrome-extension://biofljeflbemigfbngaiknophgchchfo/'],
        },
        null,
        2,
      ),
      'utf8',
    )

    const status = registerModule.getChromeNativeMessagingManifestStatus()

    expect(status.ok).toBe(false)
    expect(status.reason).toBe('origins_mismatch')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    registerModule.ensureNMHostRegistered()

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { allowed_origins: string[] }
    expect(manifest.allowed_origins).toEqual([
      'chrome-extension://jhoadmodojdokpajmhboahbpdknnjjpg/',
      'chrome-extension://biofljeflbemigfbngaiknophgchchfo/',
    ])
    expect(registerModule.isNMHostRegistered()).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[nm-register] Native messaging host manifest origins_mismatch; repairing'),
    )
  })
})
