/**
 * The result envelope every `ipcRenderer.invoke` command handler returns.
 *
 * Handlers used to return bare `{ ok: true }` / `{ error: '…' }` objects typed
 * in the renderer as `{ ok?: boolean; error?: string }` — a shape where `{}` is
 * legal and success is indistinguishable from a dropped field. `IpcResult` is a
 * discriminated union instead: checking `ok` narrows to exactly one of a value
 * or an error message.
 */

export interface IpcSuccess<T> {
  ok: true
  data: T
}

export interface IpcFailure {
  ok: false
  error: string
}

export type IpcResult<T = undefined> = IpcSuccess<T> | IpcFailure

export function ipcOk(): IpcSuccess<undefined>
export function ipcOk<T>(data: T): IpcSuccess<T>
export function ipcOk(data?: unknown): IpcSuccess<unknown> {
  return { ok: true, data }
}

export function ipcFail(error: unknown): IpcFailure {
  return { ok: false, error: toErrorMessage(error) }
}

/**
 * Anything can be thrown in JS, so a caught value is `unknown`. Reading
 * `.message` off it via a cast throws a second time when the thrown value is
 * a string, `undefined`, or a rejected non-Error.
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message: unknown }
    if (typeof message === 'string') return message
  }
  return String(error)
}
