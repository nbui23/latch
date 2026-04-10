/**
 * Native messaging host manifest registration.
 * macOS-only: called on first app launch to write the Chrome native messaging manifest.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'

const NM_HOST_NAME = 'app.latch'

function getNMHostBinaryPath(): string {
  if (app.isPackaged) {
    // P0-3: electron-builder copies the binary into nm-host/ subdirectory inside Resources.
    // Packaged layout: Contents/Resources/nm-host/latch-nm-host
    return path.join(process.resourcesPath, 'nm-host', 'latch-nm-host')
  }
  // dev: point to compiled nm-host
  return path.join(__dirname, '..', '..', '..', '..', 'nm-host', 'dist', 'latch-nm-host')
}

function getChromeNMPath(): string {
  const home = os.homedir()
  return path.join(
    home,
    'Library/Application Support/Google/Chrome/NativeMessagingHosts',
    `${NM_HOST_NAME}.json`
  )
}

// Derived from the public key in apps/extension/manifests/manifest.chrome.json via:
//   echo "<key>" | base64 -d | sha256sum → first 32 hex chars → map each nibble n → chr(n+97)
const CHROME_EXTENSION_ID = 'biofljeflbemigfbngaiknophgchchfo'

function buildManifest(): object {
  const binaryPath = getNMHostBinaryPath()
  return {
    name: NM_HOST_NAME,
    description: 'Latch focus blocker',
    path: binaryPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${CHROME_EXTENSION_ID}/`],
  }
}

function writeManifest(filePath: string, manifest: object): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf8')
}

export function registerNMHost(): void {
  writeManifest(getChromeNMPath(), buildManifest())
  console.log('[nm-register] Registered Chrome native messaging host (macOS)')
}

export function isNMHostRegistered(): boolean {
  return fs.existsSync(getChromeNMPath())
}

export function unregisterNMHost(): void {
  try { fs.unlinkSync(getChromeNMPath()) } catch { /* already removed */ }
}
