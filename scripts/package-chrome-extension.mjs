import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extensionDir = join(ROOT, 'apps', 'extension', 'dist', 'chrome')
const outputDir = join(ROOT, 'apps', 'extension', 'dist')
const outputZip = join(outputDir, 'Latch-chrome-extension.zip')

if (!existsSync(extensionDir)) {
  throw new Error(`Missing built Chromium extension at ${extensionDir}`)
}

mkdirSync(outputDir, { recursive: true })
rmSync(outputZip, { force: true })

execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', extensionDir, outputZip], {
  stdio: 'inherit',
})

console.log(`[Latch] Packaged Chromium extension → ${outputZip}`)
