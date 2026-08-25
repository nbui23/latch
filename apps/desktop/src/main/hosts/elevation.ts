/**
 * macOS privileged helper installation.
 * Runs ONCE on first launch via a single osascript call.
 * One password dialog — never per-session.
 */

import { execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { app } from 'electron'

export function getResourcesPath(): string {
  const override = process.env.LATCH_RESOURCES_PATH
  if (override) {
    return override
  }
  if (app?.isPackaged) {
    return process.resourcesPath
  }
  // dev: resources/ dir relative to apps/desktop
  return path.join(__dirname, '..', '..', '..', 'resources')
}

function requireExistingPath(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label} at ${filePath}`)
  }
}

function createTempScript(prefix: string, lines: string[]): { tempDir: string; scriptPath: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  const scriptPath = path.join(tempDir, 'run.sh')
  fs.writeFileSync(scriptPath, lines.join('\n') + '\n', { mode: 0o700 })
  return { tempDir, scriptPath }
}

function runPrivilegedScript(prefix: string, lines: string[]): void {
  const { tempDir, scriptPath } = createTempScript(prefix, lines)
  try {
    execSync(`osascript -e 'do shell script quoted form of "${scriptPath}" with administrator privileges'`)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

export function installMacHelper(): void {
  const src = getResourcesPath()

  // P0-1: electron-builder copies helper into helper-mac/ subdirectory inside Resources.
  // Packaged layout:  Contents/Resources/helper-mac/latch-helper
  //                   Contents/Resources/helper-mac/com.latch.helper.plist
  // Dev layout:       resources/helper-mac/latch-helper
  const helperBin = path.join(src, 'helper-mac', 'latch-helper')
  const plist = path.join(src, 'helper-mac', 'com.latch.helper.plist')
  requireExistingPath(helperBin, 'helper binary')
  requireExistingPath(plist, 'helper plist')

  // P0-5: bootout before bootstrap so reinstall/upgrade is idempotent.
  // P0-6: Write commands to a temp shell script — no inline osascript quoting needed.
  const scriptLines = [
    '#!/bin/sh',
    `cp "${helperBin}" /usr/local/bin/latch-helper`,
    `xattr -d com.apple.quarantine /usr/local/bin/latch-helper 2>/dev/null || true`,
    `chmod 755 /usr/local/bin/latch-helper`,
    `cp "${plist}" /Library/LaunchDaemons/com.latch.helper.plist`,
    // Bootout first so re-install / upgrade is idempotent (exit 37 when not loaded — ignore)
    `launchctl bootout system /Library/LaunchDaemons/com.latch.helper.plist 2>/dev/null || true`,
    `launchctl bootstrap system /Library/LaunchDaemons/com.latch.helper.plist`,
  ]

  runPrivilegedScript('latch-install', scriptLines)
}

export function isHelperInstalled(): boolean {
  return fs.existsSync('/usr/local/bin/latch-helper') &&
    fs.existsSync('/Library/LaunchDaemons/com.latch.helper.plist')
}

export function uninstallMacHelper(): void {
  const plist = '/Library/LaunchDaemons/com.latch.helper.plist'
  const binary = '/usr/local/bin/latch-helper'
  const scriptLines = [
    '#!/bin/sh',
    `launchctl bootout system "${plist}" 2>/dev/null || true`,
    `rm -f "${plist}"`,
    `rm -f "${binary}"`,
  ]
  runPrivilegedScript('latch-uninstall', scriptLines)
}
