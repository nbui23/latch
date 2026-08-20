/**
 * Session state machine — 6 states.
 *
 * State transitions:
 *   idle → starting → active → stopping → idle
 *        ↓                              ↑
 *   helper_unavailable ────────────────→ (error path)
 *   recovering → idle (after cleanup)
 *
 * Write-ahead ordering:
 *   Start: write session(starting+intent) → helper.write_block → write session(active)
 *   Stop:  write session(stopping+intent) → helper.remove_block → write session(idle)
 */

import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import type { Session, IpcSessionStart } from '@latch/shared'
import { writeSessionAtomic } from './session-store.js'
import { SessionTimer } from './timer.js'
import { writeBlock, removeBlock } from '../hosts/hosts-manager.js'
import { isHelperRunning } from '../hosts/helper-client.js'

export type SessionEventHandler = (session: Session | null) => void

export class SessionManager {
  private sessionPath: string
  private currentSession: Session | null = null
  private timer: SessionTimer | null = null
  private onStateChange: SessionEventHandler

  constructor(onStateChange: SessionEventHandler, sessionPath?: string) {
    this.sessionPath = sessionPath ?? path.join(app.getPath('userData'), 'session.json')
    this.onStateChange = onStateChange
  }

  getSession(): Session | null {
    return this.currentSession
  }

  getSessionPath(): string {
    return this.sessionPath
  }

  isActive(): boolean {
    return this.currentSession?.status === 'active'
  }

  async startSession(opts: IpcSessionStart, domains: string[]): Promise<void> {
    if (this.currentSession !== null && this.currentSession.status !== 'idle') {
      throw new Error('A session is already active')
    }

    const helperOk = await isHelperRunning()
    if (!helperOk) {
      this.setState({ status: 'helper_unavailable' })
      throw new Error(
        'Focus helper is not running. Restart Latch to restore it.'
      )
    }

    const session: Session = {
      id: uuidv4(),
      blocklistId: opts.blocklistId,
      domains,
      startedAt: Date.now(),
      durationMs: opts.isIndefinite ? 0 : opts.durationMs,
      isIndefinite: opts.isIndefinite ?? false,
      status: 'starting',
      intent: 'will_write_hosts',
    }

    // Step 1: write intent BEFORE helper call (crash-safe)
    this.commit({ ...session })

    // Step 2: call helper
    await writeBlock(session.id, domains)

    // Step 3: mark active
    session.status = 'active'
    session.intent = undefined
    this.commit({ ...session })

    this.startCountdown(session)
  }

  async stopSession(): Promise<void> {
    if (!this.currentSession) return

    const session = { ...this.currentSession }
    this.clearCountdown()

    // Step 1: write stopping intent
    session.status = 'stopping'
    session.intent = 'will_remove_hosts'
    this.commit(session)

    // Step 2: call helper
    try {
      await removeBlock(session.id)
    } catch (err) {
      console.error('Helper remove_block failed:', err)
    }

    // Step 3: mark idle
    this.commit(null)
  }

  async resumeSession(session: Session): Promise<void> {
    if (!session.isIndefinite && this.remainingMs(session) <= 0) {
      await this.stopSession()
      return
    }

    // Restore active state from recovered session
    session.status = 'active'
    session.intent = undefined
    this.commit(session)

    this.startCountdown(session)
  }

  /** Persist the journal entry and publish the new state in one step, so the
   *  on-disk record and the in-memory state can never disagree. */
  private commit(session: Session | null): void {
    writeSessionAtomic(this.sessionPath, session)
    this.currentSession = session
    this.onStateChange(session)
  }

  private remainingMs(session: Session): number {
    return session.startedAt + session.durationMs - Date.now()
  }

  /** Timed sessions tick down to an automatic stop; indefinite ones do not. */
  private startCountdown(session: Session): void {
    if (session.isIndefinite) return

    this.timer = new SessionTimer(session.startedAt, session.durationMs)
    this.timer.start(
      () => this.onStateChange({ ...session, status: 'active' }),
      () => { void this.stopSession() },
    )
  }

  private clearCountdown(): void {
    this.timer?.stop()
    this.timer = null
  }

  private setState(partial: Partial<Session>): void {
    if (this.currentSession) {
      this.currentSession = { ...this.currentSession, ...partial }
      this.onStateChange(this.currentSession)
    }
  }
}
