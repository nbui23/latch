import { createHash } from 'node:crypto'

export const LEGACY_CHROME_EXTENSION_ID = 'biofljeflbemigfbngaiknophgchchfo'

// Stable public key for the bundled Chromium extension. This keeps the unpacked
// extension ID deterministic across reloads and app updates so native messaging
// and blocked-page redirects do not silently break.
export const LATCH_EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyCirAzg8JXuHoVndPDOKlvBmBiBMhnGTbUElM4gdOI3mcQVUDrmAPK/aMVc6du0R7xYTA3nOMXF2ToFVn0goR5R4jWJ62rlzGjQl4UMyaU0ud37OYQuAQ7zwiXBQVqsM8mdn3bzt5efypEGU2pfgNQYRCdBc1hX+GXaEx2Lw2itXU5JBYwxA6GTOwmi4T+Pmvo1iDClF9p9uBn8rLwC1jiXSu6SWurC8C5PvBoOWn+2c8I857cfi3JoHP2zeknQojOUdj1kTrE3Z6CAWU4l4InMWScP2tBRalvRJb6+qEBujnClHjiNXBdo0eZYgTgJikaxx6Gls2dc5DPaLVN+XQQIDAQAB'

export function deriveChromeExtensionIdFromKey(key: string): string {
  const der = Buffer.from(key, 'base64')
  const digest = createHash('sha256').update(der).digest('hex').slice(0, 32)
  const alphabet = 'abcdefghijklmnop'

  return Array.from(digest, (char) => alphabet[parseInt(char, 16)]).join('')
}

export const CHROME_EXTENSION_ID = deriveChromeExtensionIdFromKey(LATCH_EXTENSION_PUBLIC_KEY)

// Keep the historical unpacked-extension ID authorized so existing local
// Chrome profiles keep working until the user reloads the extension with the
// new manifest key.
export const CHROME_ALLOWED_EXTENSION_IDS = [CHROME_EXTENSION_ID, LEGACY_CHROME_EXTENSION_ID] as const
