import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { readSession, writeSessionAtomic } from '../../apps/desktop/src/main/session/session-store.js'

const tempDirs: string[] = []

function makeTempFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latch-session-store-'))
  tempDirs.push(dir)
  return path.join(dir, name)
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('readSession', () => {
  it('returns null for corrupt JSON on disk', () => {
    const filePath = makeTempFile('session.json')
    fs.writeFileSync(filePath, '{not-json')

    expect(readSession(filePath)).toBeNull()
  })

  it('returns null for schema-invalid persisted data', () => {
    const filePath = makeTempFile('session.json')
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        id: 'not-a-uuid',
        blocklistId: 'also-bad',
        domains: 'reddit.com',
      }),
    )

    expect(readSession(filePath)).toBeNull()
  })

  it('round-trips a valid session written atomically', () => {
    const filePath = makeTempFile('session.json')
    const session = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      blocklistId: '550e8400-e29b-41d4-a716-446655440001',
      domains: ['reddit.com'],
      startedAt: 1_700_000_000_000,
      durationMs: 60_000,
      isIndefinite: false,
      status: 'active' as const,
    }

    writeSessionAtomic(filePath, session)

    expect(readSession(filePath)).toEqual(session)
  })
})
