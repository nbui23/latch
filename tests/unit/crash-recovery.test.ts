/**
 * Crash recovery unit tests — covers all 7 rows of the recovery policy table
 * and all 4 crash windows (AC-17–20):
 *
 * AC-17: crash between write-ahead intent and helper.write_block   → status=starting, no markers
 * AC-18: crash between helper.write_block and write-active         → status=starting, markers present
 * AC-19: crash between write-stopping intent and helper.remove_block → status=stopping, markers present
 * AC-20: crash between helper.remove_block and write-idle           → status=stopping, no markers
 */

import { describe, it, expect } from 'vitest'
import { getRecoveryPolicy } from '../../apps/desktop/src/main/hosts/crash-recovery.js'

describe('getRecoveryPolicy — 7-row policy table', () => {
  // Row 1: idle + markers → auto-clean
  it('idle status + markers present → auto-clean (no dialog)', () => {
    const p = getRecoveryPolicy('idle', true)
    expect(p.action).toBe('auto-clean')
    expect(p.requiresDialog).toBe(false)
  })

  // Row 2: idle + no markers → none
  it('idle status + no markers → none (no-op)', () => {
    const p = getRecoveryPolicy('idle', false)
    expect(p.action).toBe('none')
    expect(p.requiresDialog).toBe(false)
  })

  // Row 3: starting + no markers → reset  [AC-17: crash before helper.write_block]
  it('starting + no markers → reset to idle (AC-17: crash before write_block)', () => {
    const p = getRecoveryPolicy('starting', false)
    expect(p.action).toBe('reset')
    expect(p.requiresDialog).toBe(false)
  })

  // Row 4: starting + markers → dialog  [AC-18: crash after write_block but before active]
  it('starting + markers present → dialog (AC-18: crash after write_block)', () => {
    const p = getRecoveryPolicy('starting', true)
    expect(p.action).toBe('dialog')
    expect(p.requiresDialog).toBe(true)
  })

  // Row 5: active + markers → dialog
  it('active + markers present → dialog (mid-session crash)', () => {
    const p = getRecoveryPolicy('active', true)
    expect(p.action).toBe('dialog')
    expect(p.requiresDialog).toBe(true)
  })

  // Row 6: active + no markers → reset (markers removed externally)
  it('active + no markers → reset to idle', () => {
    const p = getRecoveryPolicy('active', false)
    expect(p.action).toBe('reset')
    expect(p.requiresDialog).toBe(false)
  })

  // Row 7: stopping + markers → auto-clean  [AC-19: crash before helper.remove_block]
  it('stopping + markers present → auto-clean (AC-19: crash before remove_block)', () => {
    const p = getRecoveryPolicy('stopping', true)
    expect(p.action).toBe('auto-clean')
    expect(p.requiresDialog).toBe(false)
  })

  // Row 8: stopping + no markers → reset  [AC-20: crash after remove_block but before idle]
  it('stopping + no markers → reset to idle (AC-20: crash after remove_block)', () => {
    const p = getRecoveryPolicy('stopping', false)
    expect(p.action).toBe('reset')
    expect(p.requiresDialog).toBe(false)
  })

  // Edge: recovering + markers → auto-clean
  it('recovering + markers → auto-clean', () => {
    const p = getRecoveryPolicy('recovering', true)
    expect(p.action).toBe('auto-clean')
    expect(p.requiresDialog).toBe(false)
  })

  // Edge: helper_unavailable + no markers → none
  it('helper_unavailable + no markers → none', () => {
    const p = getRecoveryPolicy('helper_unavailable', false)
    expect(p.action).toBe('none')
    expect(p.requiresDialog).toBe(false)
  })
})

describe('OR-semantics: either condition alone triggers recovery', () => {
  it('idle + markers alone is treated as stale (auto-clean)', () => {
    const p = getRecoveryPolicy('idle', true)
    expect(p.action).toBe('auto-clean')
  })

  it('starting alone (no markers) is treated as stale (reset)', () => {
    const p = getRecoveryPolicy('starting', false)
    expect(p.action).toBe('reset')
  })
})
