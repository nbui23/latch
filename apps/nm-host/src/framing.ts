/**
 * Chromium native-messaging framing: 4-byte little-endian length prefix + JSON body.
 *
 * Kept in a separate module so main.ts (which has top-level side effects)
 * does not execute when these helpers are imported for testing.
 */

// Chromium caps native-messaging payloads at 1 MiB in each direction.
// A hostile or buggy caller could otherwise send a length prefix up to 4 GiB.
export const MAX_NM_MESSAGE_BYTES = 1 * 1024 * 1024

export function readNativeMessage(
  stdin: NodeJS.ReadableStream = process.stdin
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lenBuf = Buffer.alloc(4)
    let lenBytesRead = 0
    let msgLen = -1

    const cleanup = () => {
      stdin.removeListener('readable', onReadable)
      stdin.removeListener('error', onError)
      stdin.removeListener('end', onEnd)
    }

    const onError = (err: Error) => { cleanup(); reject(err) }
    const onEnd = () => { cleanup(); reject(new Error('stdin closed')) }

    const onReadable = () => {
      // Phase 1: read the 4-byte length prefix.
      while (lenBytesRead < 4) {
        const chunk = stdin.read(4 - lenBytesRead) as Buffer | null
        if (!chunk) return
        chunk.copy(lenBuf, lenBytesRead)
        lenBytesRead += chunk.length
      }
      if (msgLen === -1) {
        msgLen = lenBuf.readUInt32LE(0)
        if (msgLen === 0 || msgLen > MAX_NM_MESSAGE_BYTES) {
          cleanup()
          reject(
            new Error(
              `Invalid native message length: ${msgLen} (cap ${MAX_NM_MESSAGE_BYTES})`
            )
          )
          return
        }
      }

      // Phase 2: read the body.
      const body = stdin.read(msgLen) as Buffer | null
      if (!body) return
      cleanup()
      resolve(body)
    }

    stdin.on('readable', onReadable)
    stdin.on('error', onError)
    stdin.on('end', onEnd)
    onReadable()
  })
}

export function writeNativeMessage(
  msg: object,
  stdout: NodeJS.WritableStream = process.stdout
): void {
  const json = JSON.stringify(msg)
  const len = Buffer.byteLength(json, 'utf8')
  const buf = Buffer.alloc(4 + len)
  buf.writeUInt32LE(len, 0)
  buf.write(json, 4, 'utf8')
  stdout.write(buf)
}
