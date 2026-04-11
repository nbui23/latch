/**
 * Native messaging host manifest registration.
 * macOS-only: called on first app launch to write the Chrome native messaging manifest.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'
import { CHROME_ALLOWED_EXTENSION_IDS } from './chrome-extension-id.js'

const NM_HOST_NAME = 'app.latch'

export type ChromeNativeMessagingManifestStatusReason =
  | 'ok'
  | 'missing'
  | 'invalid_json'
  | 'name_mismatch'
  | 'description_mismatch'
  | 'path_mismatch'
  | 'type_mismatch'
  | 'origins_mismatch'

interface ChromeNativeMessagingManifest {
  name: string
  description: string
  path: string
  type: 'stdio'
  allowed_origins: string[]
}

export interface ChromeNativeMessagingManifestStatus {
  ok: boolean
  reason: ChromeNativeMessagingManifestStatusReason
  manifestPath: string
  current: ChromeNativeMessagingManifest | null
  expected: ChromeNativeMessagingManifest
}

function getNMHostBinaryPath(): string {
  if (app?.isPackaged) {
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

function buildManifest(): ChromeNativeMessagingManifest {
  const binaryPath = getNMHostBinaryPath()
  return {
    name: NM_HOST_NAME,
    description: 'Latch focus blocker',
    path: binaryPath,
    type: 'stdio',
    allowed_origins: CHROME_ALLOWED_EXTENSION_IDS.map((extensionId) => `chrome-extension://${extensionId}/`),
  }
}

function writeManifest(filePath: string, manifest: ChromeNativeMessagingManifest): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf8')
}

function readManifest(filePath: string): ChromeNativeMessagingManifest | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ChromeNativeMessagingManifest
  } catch {
    return null
  }
}

function normalizeOrigins(origins: string[] | undefined): string[] {
  return [...new Set(Array.isArray(origins) ? origins.filter((origin) => typeof origin === 'string') : [])].sort()
}

export function getChromeNativeMessagingManifestStatus(): ChromeNativeMessagingManifestStatus {
  const manifestPath = getChromeNMPath()
  const expected = buildManifest()
  const current = readManifest(manifestPath)

  if (!fs.existsSync(manifestPath)) {
    return { ok: false, reason: 'missing', manifestPath, current: null, expected }
  }

  if (!current) {
    return { ok: false, reason: 'invalid_json', manifestPath, current: null, expected }
  }

  if (current.name !== expected.name) {
    return { ok: false, reason: 'name_mismatch', manifestPath, current, expected }
  }

  if (current.description !== expected.description) {
    return { ok: false, reason: 'description_mismatch', manifestPath, current, expected }
  }

  if (current.path !== expected.path) {
    return { ok: false, reason: 'path_mismatch', manifestPath, current, expected }
  }

  if (current.type !== expected.type) {
    return { ok: false, reason: 'type_mismatch', manifestPath, current, expected }
  }

  if (
    JSON.stringify(normalizeOrigins(current.allowed_origins)) !==
    JSON.stringify(normalizeOrigins(expected.allowed_origins))
  ) {
    return { ok: false, reason: 'origins_mismatch', manifestPath, current, expected }
  }

  return { ok: true, reason: 'ok', manifestPath, current, expected }
}

function logManifestRepair(status: ChromeNativeMessagingManifestStatus): void {
  const expectedOrigins = normalizeOrigins(status.expected.allowed_origins).join(', ')
  const currentOrigins = normalizeOrigins(status.current?.allowed_origins).join(', ') || '(none)'

  console.warn(
    `[nm-register] Native messaging host manifest ${status.reason}; repairing ${status.manifestPath}. ` +
      `Current origins: ${currentOrigins}. Expected origins: ${expectedOrigins}.`,
  )
}

export function registerNMHost(): void {
  const status = getChromeNativeMessagingManifestStatus()
  const { manifestPath, expected: expectedManifest } = status

  writeManifest(manifestPath, expectedManifest)

  if (status.reason === 'missing') {
    console.log('[nm-register] Registered Chrome native messaging host (macOS)')
    return
  }

  if (!status.ok) {
    logManifestRepair(status)
    return
  }

  console.log('[nm-register] Refreshed Chrome native messaging host manifest (macOS)')
}

export function ensureNMHostRegistered(): void {
  const status = getChromeNativeMessagingManifestStatus()
  if (status.ok) return
  registerNMHost()
}

export function isNMHostRegistered(): boolean {
  return getChromeNativeMessagingManifestStatus().ok
}

export function unregisterNMHost(): void {
  try { fs.unlinkSync(getChromeNMPath()) } catch { /* already removed */ }
}
