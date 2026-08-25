import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execSyncMock = vi.hoisted(() => vi.fn())

describe('elevation helpers', () => {
  let resourcesPath: string
  const originalResourcesPath = process.resourcesPath

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock('child_process', () => ({
      execSync: execSyncMock,
    }))
    resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'latch-elevation-'))
    fs.mkdirSync(path.join(resourcesPath, 'helper-mac'), { recursive: true })
    fs.writeFileSync(path.join(resourcesPath, 'helper-mac', 'latch-helper'), '#!/bin/sh\n')
    fs.writeFileSync(path.join(resourcesPath, 'helper-mac', 'com.latch.helper.plist'), '<plist/>')
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      writable: true,
      value: resourcesPath,
    })
    process.env.LATCH_RESOURCES_PATH = resourcesPath
  })

  afterEach(() => {
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      writable: true,
      value: originalResourcesPath,
    })
    delete process.env.LATCH_RESOURCES_PATH
    fs.rmSync(resourcesPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('installs helper via a unique temp script and cleans it up afterwards', async () => {
    let capturedCommand = ''
    let capturedScriptPath = ''
    let capturedScriptBody = ''

    execSyncMock.mockImplementation((command: string) => {
      capturedCommand = command
      const match = command.match(/quoted form of "([^"]+)"/)
      capturedScriptPath = match?.[1] ?? ''
      capturedScriptBody = fs.readFileSync(capturedScriptPath, 'utf8')
    })

    const elevation = await import('../../apps/desktop/src/main/hosts/elevation.js')
    elevation.installMacHelper()

    expect(capturedCommand).toContain('administrator privileges')
    expect(capturedScriptPath).toContain(`${path.sep}latch-install-`)
    expect(capturedScriptBody).toContain(`cp "${path.join(resourcesPath, 'helper-mac', 'latch-helper')}" /usr/local/bin/latch-helper`)
    expect(capturedScriptBody).toContain('launchctl bootstrap system /Library/LaunchDaemons/com.latch.helper.plist')
    expect(fs.existsSync(capturedScriptPath)).toBe(false)
    expect(fs.existsSync(path.dirname(capturedScriptPath))).toBe(false)
  })

  it('fails fast when packaged helper resources are missing', async () => {
    fs.rmSync(path.join(resourcesPath, 'helper-mac', 'latch-helper'))
    const elevation = await import('../../apps/desktop/src/main/hosts/elevation.js')

    expect(() => elevation.installMacHelper()).toThrow(/Missing helper binary/)
    expect(execSyncMock).not.toHaveBeenCalled()
  })
})
