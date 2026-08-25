/**
 * Boot smoke test — the one test that fails when the app is dead.
 *
 * The rest of the suite runs against source (vitest aliases `@latch/shared` to
 * `packages/shared/src`), so a throw inside `app.whenReady()` stayed invisible:
 * live process, no window, no IPC, exit code 0. This launches the BUILT main
 * bundle under the real electron binary and asserts the two things a booted app
 * has — a window, and the IPC handlers behind it.
 *
 * Skipped unless the bundle has been built, which is why CI builds it first.
 */

import { describe, it, expect, afterAll } from 'vitest'
import { execFile } from 'child_process'
import { createRequire } from 'module'
import { promisify } from 'util'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const DESKTOP_DIR = path.resolve(__dirname, '../../apps/desktop')
const MAIN_BUNDLE = path.join(DESKTOP_DIR, 'dist/main/index.js')
const ENTRY = path.resolve(__dirname, '../fixtures/boot-smoke-entry.cjs')

const IPC_CHANNELS = [
  'session:get-state',
  'session:start',
  'session:stop',
  'blocklist:load',
  'blocklist:save',
  'preferences:get',
  'preferences:update',
  'domain:validate',
  'recovery:action',
  'helper:uninstall',
]

const canRun = process.platform === 'darwin' && fs.existsSync(MAIN_BUNDLE)
const tempDir = canRun ? fs.mkdtempSync(path.join(os.tmpdir(), 'latch-boot-')) : ''

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
})

describe.skipIf(!canRun)('built main process', () => {
  it('boots to a window with the IPC handlers registered', async () => {
    // electron lives in the desktop package, not the workspace root.
    const electronBinary: string = createRequire(path.join(DESKTOP_DIR, 'package.json'))('electron')

    const home = path.join(tempDir, 'home')
    fs.mkdirSync(home, { recursive: true })

    // Every path the app writes to is redirected into tempDir: --user-data-dir
    // also scopes the single-instance lock, so a running copy of Latch can
    // neither hijack this boot nor be disturbed by it.
    const run = promisify(execFile)(electronBinary, [ENTRY, `--user-data-dir=${path.join(tempDir, 'userData')}`], {
      env: {
        ...process.env,
        LATCH_SMOKE_MAIN: MAIN_BUNDLE,
        LATCH_UI_SOCKET: path.join(tempDir, 'ui.sock'),
        HOME: home,
      },
      timeout: 30_000,
    })

    // A dead boot shows up as a nonzero exit, a timeout, or a missing line —
    // keep the output either way so the failure message says which.
    const { stdout = '', stderr = '' } = await run.catch(
      (err: { stdout?: string; stderr?: string }) => err,
    )

    const line = /^LATCH_SMOKE (.*)$/m.exec(stdout)
    expect(line, `no smoke line.\nstdout:\n${stdout}\nstderr:\n${stderr}`).toBeTruthy()

    const smoke = JSON.parse(line![1]) as { windows: number; channels: string[] }
    expect(smoke.windows).toBeGreaterThan(0)
    expect(smoke.channels).toEqual(expect.arrayContaining(IPC_CHANNELS))
  }, 45_000)
})
