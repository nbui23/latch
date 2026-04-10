import { execFileSync } from 'child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, '..')
const repoRoot = resolve(desktopRoot, '..', '..')
const sharedRoot = join(repoRoot, 'packages', 'shared')
const helperRoot = join(repoRoot, 'apps', 'helper-mac')
const extensionRoot = join(repoRoot, 'apps', 'extension')
const nmHostRoot = join(repoRoot, 'apps', 'nm-host')
const helperResourcesRoot = join(desktopRoot, 'resources', 'helper-mac')
const iconPath = join(desktopRoot, 'resources', 'icon.icns')
const defaultElectronIcon = join(
  repoRoot,
  'node_modules',
  '.pnpm',
  'electron@29.4.6',
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'Resources',
  'electron.icns'
)

function run(command, args, cwd) {
  console.log(`[prepare-mac-build] ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

run('node', [join(repoRoot, 'scripts', 'generate-brand-assets.mjs')], repoRoot)

rmSync(join(desktopRoot, 'dist', 'mac'), { recursive: true, force: true })
rmSync(join(desktopRoot, 'dist', 'mac-arm64'), { recursive: true, force: true })
rmSync(join(desktopRoot, 'dist', 'mac-x64'), { recursive: true, force: true })

mkdirSync(helperResourcesRoot, { recursive: true })
if (existsSync(defaultElectronIcon) && !existsSync(iconPath)) {
  copyFileSync(defaultElectronIcon, iconPath)
}

run('pnpm', ['build'], sharedRoot)
run('swift', ['build', '-c', 'release'], helperRoot)

const compiledHelper = join(helperRoot, '.build', 'release', 'LatchHelper')
if (!existsSync(compiledHelper)) {
  throw new Error(`Missing compiled helper binary at ${compiledHelper}`)
}

copyFileSync(compiledHelper, join(helperResourcesRoot, 'latch-helper'))
chmodSync(join(helperResourcesRoot, 'latch-helper'), 0o755)
copyFileSync(
  join(helperRoot, 'com.latch.helper.plist'),
  join(helperResourcesRoot, 'com.latch.helper.plist')
)

run('pnpm', ['build:chrome'], extensionRoot)
run('pnpm', ['build'], nmHostRoot)
run('pnpm', ['run', 'pkg'], nmHostRoot)
