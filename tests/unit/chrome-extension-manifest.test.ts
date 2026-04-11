import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  CHROME_ALLOWED_EXTENSION_IDS,
  CHROME_EXTENSION_ID,
  LEGACY_CHROME_EXTENSION_ID,
} from '../../apps/desktop/src/main/native-messaging/chrome-extension-id'

interface ChromeManifest {
  key?: string
  web_accessible_resources?: Array<{
    resources?: string[]
  }>
}

function deriveExtensionId(publicKey: string): string {
  const digest = createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('hex').slice(0, 32)
  return [...digest].map((char) => String.fromCharCode(parseInt(char, 16) + 97)).join('')
}

function readChromeManifest(): ChromeManifest {
  return JSON.parse(
    readFileSync(resolve(__dirname, '../../apps/extension/manifests/manifest.chrome.json'), 'utf8'),
  ) as ChromeManifest
}

describe('chrome extension manifest', () => {
  it('pins a stable extension id for native messaging', () => {
    const manifest = readChromeManifest()

    expect(manifest.key).toBeTruthy()
    expect(deriveExtensionId(manifest.key!)).toBe(CHROME_EXTENSION_ID)
    expect(CHROME_ALLOWED_EXTENSION_IDS).toContain(CHROME_EXTENSION_ID)
    expect(CHROME_ALLOWED_EXTENSION_IDS).toContain(LEGACY_CHROME_EXTENSION_ID)
  })

  it('keeps the blocked page web-accessible for redirect rules', () => {
    const manifest = readChromeManifest()
    const resources = manifest.web_accessible_resources?.flatMap((entry) => entry.resources ?? []) ?? []

    expect(resources).toContain('blocked.html')
    expect(resources).toContain('blocked.css')
  })
})
