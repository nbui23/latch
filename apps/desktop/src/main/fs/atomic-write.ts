/**
 * Crash-safe file writes: temp file + fsync + atomic rename.
 *
 * Both on-disk stores (session.json, config.json) need the same guarantee — a
 * reader must never observe a half-written file, even after a power loss — so
 * the sequence lives here once instead of being re-implemented per store.
 */

import * as fs from 'fs'
import * as path from 'path'

export interface AtomicWriteOptions {
  /** Mode for the temp file, inherited by the destination through rename. */
  mode?: number
}

export function writeFileAtomicSync(
  filePath: string,
  contents: string,
  options: AtomicWriteOptions = {},
): void {
  const tmp = filePath + '.tmp'

  try {
    const fd = fs.openSync(tmp, 'w', options.mode)
    try {
      if (options.mode !== undefined) {
        // openSync applies `mode` only when it *creates* the file. A temp file
        // left behind by an earlier crash keeps its old — possibly wider — mode
        // straight through the rename, so narrow it explicitly. Guarded because
        // chmod ignores umask: defaulting this would publish 0666.
        fs.fchmodSync(fd, options.mode)
      }
      fs.writeSync(fd, contents)
      fs.fsyncSync(fd) // flush data to disk before it becomes reachable
    } finally {
      fs.closeSync(fd)
    }

    fs.renameSync(tmp, filePath) // atomic on POSIX
  } catch (error) {
    // Leave the previous committed file untouched and drop the partial temp.
    try {
      fs.unlinkSync(tmp)
    } catch {
      // ignore cleanup failures — the temp file may not exist
    }
    throw error
  }

  // fsync the parent directory so the rename itself survives a power loss.
  // Best-effort by design: the data is already committed at this point, and
  // some filesystems refuse fsync on directories. Throwing here would tell the
  // caller the write failed when it actually landed.
  try {
    const dirFd = fs.openSync(path.dirname(filePath), 'r')
    try {
      fs.fsyncSync(dirFd)
    } finally {
      fs.closeSync(dirFd)
    }
  } catch {
    // best-effort
  }
}
