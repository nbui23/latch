import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, '..')
const repoRoot = resolve(desktopRoot, '..', '..')

const packagedExtensionRoot = join(
  desktopRoot,
  'dist',
  'mac-arm64',
  'Latch.app',
  'Contents',
  'Resources',
  'extensions',
  'chrome',
)
const packagedManifestPath = join(packagedExtensionRoot, 'manifest.json')
const extensionZipPath = join(repoRoot, 'apps', 'extension', 'dist', 'Latch-chrome-extension.zip')

function fail(message) {
  throw new Error(`[verify-release-artifacts] ${message}`)
}

function readManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    fail(`Missing manifest at ${manifestPath}`)
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

function ensureManifestIsReleaseSafe(manifest, sourceLabel) {
  const permissions = new Set(Array.isArray(manifest.permissions) ? manifest.permissions : [])
  const webAccessibleResources = new Set(
    Array.isArray(manifest.web_accessible_resources)
      ? manifest.web_accessible_resources.flatMap((entry) =>
          Array.isArray(entry?.resources) ? entry.resources.filter((resource) => typeof resource === 'string') : [],
        )
      : [],
  )

  if (typeof manifest.key !== 'string' || manifest.key.length === 0) {
    fail(`${sourceLabel} manifest is missing stable key`)
  }

  for (const permission of [
    'nativeMessaging',
    'declarativeNetRequest',
    'declarativeNetRequestWithHostAccess',
    'webNavigation',
  ]) {
    if (!permissions.has(permission)) {
      fail(`${sourceLabel} manifest missing required permission "${permission}"`)
    }
  }

  for (const resource of ['blocked.html', 'blocked.css']) {
    if (!webAccessibleResources.has(resource)) {
      fail(`${sourceLabel} manifest missing web_accessible_resource "${resource}"`)
    }
  }
}

function ensurePackagedAppContainsBlockedPageAssets() {
  for (const file of ['background.js', 'blocked.js', 'blocked.html', 'blocked.css']) {
    if (!existsSync(join(packagedExtensionRoot, file))) {
      fail(`Packaged app is missing Chromium extension file ${file}`)
    }
  }
}

function ensureExtensionZipContainsBlockedPageAssets() {
  if (!existsSync(extensionZipPath)) {
    fail(`Missing packaged Chromium extension zip at ${extensionZipPath}`)
  }

  const zipListing = execFileSync('unzip', ['-l', extensionZipPath], { encoding: 'utf8' })
  for (const file of [
    'chrome/manifest.json',
    'chrome/background.js',
    'chrome/blocked.js',
    'chrome/blocked.html',
    'chrome/blocked.css',
  ]) {
    if (!zipListing.includes(file)) {
      fail(`Packaged Chromium extension zip is missing ${file}`)
    }
  }

  const zippedManifest = JSON.parse(execFileSync('unzip', ['-p', extensionZipPath, 'chrome/manifest.json'], { encoding: 'utf8' }))
  ensureManifestIsReleaseSafe(zippedManifest, 'Packaged Chromium extension zip')
}

const packagedManifest = readManifest(packagedManifestPath)
ensureManifestIsReleaseSafe(packagedManifest, 'Packaged app Chromium extension')
ensurePackagedAppContainsBlockedPageAssets()
ensureExtensionZipContainsBlockedPageAssets()

console.log('[verify-release-artifacts] Packaged Chromium extension manifest and blocked-page assets verified')
