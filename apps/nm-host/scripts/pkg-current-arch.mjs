import { spawnSync } from 'child_process'
import { existsSync } from 'fs'

const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const target = `node18-macos-${arch}`
const output = 'dist/latch-nm-host'

console.log(`[nm-host] Packaging ${target}`)
const pkgResult = spawnSync('pkg', ['dist/main.js', '--target', target, '--output', output], {
  stdio: 'inherit',
})

if (existsSync(output)) {
  const signResult = spawnSync('codesign', ['-f', '--sign', '-', output], { stdio: 'inherit' })
  if (signResult.status !== 0) {
    throw new Error(`codesign failed for ${output}`)
  }
}

if (pkgResult.status !== 0 && !existsSync(output)) {
  throw new Error(`pkg failed for ${target}`)
}
