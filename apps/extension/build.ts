// Extension build script — bundles TypeScript sources and copies Chromium assets

import { build } from 'esbuild'
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const outDir = join(process.cwd(), 'dist', 'chrome')

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

ensureDir(outDir)
ensureDir(join(outDir, 'icons'))

await build({
  entryPoints: ['src/background/background.ts'],
  bundle: true,
  outfile: join(outDir, 'background.js'),
  format: 'iife',
  platform: 'browser',
  target: ['chrome112'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})

await build({
  entryPoints: ['src/blocked/blocked.ts'],
  bundle: true,
  outfile: join(outDir, 'blocked.js'),
  format: 'iife',
  platform: 'browser',
})

const staticFiles = [
  ['src/blocked/blocked.html', 'blocked.html'],
  ['src/blocked/blocked.css', 'blocked.css'],
]

for (const [src, dest] of staticFiles) {
  copyFileSync(join(process.cwd(), src), join(outDir, dest))
}

const manifestSrc = join(process.cwd(), 'manifests', 'manifest.chrome.json')
const manifestDest = join(outDir, 'manifest.json')
const manifestContent = readFileSync(manifestSrc, 'utf8')
writeFileSync(manifestDest, manifestContent)

const iconSizes = [16, 48, 128]
const iconSrcDir = join(process.cwd(), 'icons')

for (const size of iconSizes) {
  const iconFile = `icon${size}.png`
  const iconSrc = join(iconSrcDir, iconFile)
  const iconDest = join(outDir, 'icons', iconFile)
  if (existsSync(iconSrc)) {
    copyFileSync(iconSrc, iconDest)
  }
}

console.log('[Latch] Extension built for chrome → dist/chrome/')
