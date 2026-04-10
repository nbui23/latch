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
    if (this.currentSession?.status !== 'idle' && this.currentSession !== null) {
      throw new Error('A session is already active')
    }

    const helperOk = await isHelperRunning()
    if (!helperOk) {
      this.setState({ status: 'helper_unavailable' } as Partial<Session>)
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
    writeSessionAtomic(this.sessionPath, { ...session })
    this.currentSession = session
    this.onStateChange({ ...session })

    // Step 2: call helper
    await writeBlock(session.id, domains)

    // Step 3: mark active
    session.status = 'active'
    session.intent = undefined
    writeSessionAtomic(this.sessionPath, { ...session })
    this.onStateChange({ ...session })

    // Start countdown timer (timed sessions only)
    if (!session.isIndefinite) {
      this.timer = new SessionTimer(session.startedAt, session.durationMs)
      this.timer.start(
        (_remainingMs) => {
          this.onStateChange({ ...session, status: 'active' })
        },
        () => {
          void this.stopSession()
        }
      )
    }
  }

  async stopSession(): Promise<void> {
    if (!this.currentSession) return

    const session = { ...this.currentSession }
    this.timer?.stop()
    this.timer = null

    // Step 1: write stopping intent
    session.status = 'stopping'
    session.intent = 'will_remove_hosts'
    writeSessionAtomic(this.sessionPath, session)
    this.currentSession = session
    this.onStateChange(session)

    // Step 2: call helper
    try {
      await removeBlock(session.id)
    } catch (err) {
      console.error('Helper remove_block failed:', err)
    }

    // Step 3: mark idle
    this.currentSession = null
    writeSessionAtomic(this.sessionPath, null)
    this.onStateChange(null)
  }

  async resumeSession(session: Session): Promise<void> {
    if (!session.isIndefinite) {
      const remainingMs = (session.startedAt + session.durationMs) - Date.now()
      if (remainingMs <= 0) {
        await this.stopSession()
        return
      }
    }

    // Restore active state from recovered session
    session.status = 'active'
    session.intent = undefined
    writeSessionAtomic(this.sessionPath, session)
    this.currentSession = session
    this.onStateChange(session)

    if (!session.isIndefinite) {
      this.timer = new SessionTimer(session.startedAt, session.durationMs)
      this.timer.start(
        (_remainingMs) => this.onStateChange({ ...session, status: 'active' }),
        () => { void this.stopSession() }
      )
    }
  }

  setHelperUnavailable(): void {
    this.setState({ status: 'helper_unavailable' } as Partial<Session>)
  }

  private setState(partial: Partial<Session>): void {
    if (this.currentSession) {
      this.currentSession = { ...this.currentSession, ...partial }
      this.onStateChange(this.currentSession)
    }
  }
}
