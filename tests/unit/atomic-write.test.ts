/**
 * Both on-disk stores commit through writeFileAtomicSync, so a reader must
 * never see a partial file and a failed write must leave the previous contents
 * untouched. (The permission-failure path is covered by config-store.test.ts —
 * it needs an unprivileged process to be meaningful.)
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFileAtomicSync } from '../../apps/desktop/src/main/fs/atomic-write.js'

let tempDir = ''
let target = ''

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'latch-atomic-write-'))
  target = path.join(tempDir, 'store.json')
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('writeFileAtomicSync', () => {
  it('creates the file with the requested contents', () => {
    writeFileAtomicSync(target, '{"a":1}')
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}')
  })

  it('replaces existing contents rather than appending', () => {
    writeFileAtomicSync(target, 'first write, longer')
    writeFileAtomicSync(target, 'second')
    expect(fs.readFileSync(target, 'utf8')).toBe('second')
  })

  it('applies the requested mode to the committed file', () => {
    writeFileAtomicSync(target, 'private', { mode: 0o600 })
    expect(fs.statSync(target).mode & 0o777).toBe(0o600)
  })

  it('narrows a temp file left wide open by an earlier crash', () => {
    // A crash between open and rename leaves store.json.tmp on disk; openSync's
    // mode argument would not touch it, and the rename would publish 0644.
    fs.writeFileSync(target + '.tmp', 'interrupted')
    fs.chmodSync(target + '.tmp', 0o644)

    writeFileAtomicSync(target, 'private', { mode: 0o600 })

    expect(fs.readFileSync(target, 'utf8')).toBe('private')
    expect(fs.statSync(target).mode & 0o777).toBe(0o600)
  })

  it('leaves a default-mode write to the umask', () => {
    writeFileAtomicSync(target, 'public')
    expect(fs.statSync(target).mode & 0o002).toBe(0) // never world-writable
  })

  it('leaves no temp file behind on success', () => {
    writeFileAtomicSync(target, 'done')
    expect(fs.existsSync(target + '.tmp')).toBe(false)
  })

  it('throws instead of creating anything when the directory is missing', () => {
    const missing = path.join(tempDir, 'no-such-dir', 'store.json')
    expect(() => writeFileAtomicSync(missing, 'nope')).toThrow()
    expect(fs.existsSync(missing)).toBe(false)
  })
})
