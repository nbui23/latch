import { describe, expect, it } from 'vitest'
import { parseNMMessage, parseNMOutboundMessage } from './client'

describe('parseNMMessage', () => {
  it('accepts a valid no_session host response', () => {
    expect(parseNMMessage({ type: 'no_session' })).toEqual({ type: 'no_session' })
  })

  it('rejects a malformed session_state payload', () => {
    expect(
      parseNMMessage({
        type: 'session_state',
        payload: { id: 'not-a-uuid' },
      }),
    ).toBeNull()
  })

  it('rejects an unknown message type', () => {
    expect(parseNMMessage({ type: 'drop_tables' })).toBeNull()
  })
})

describe('parseNMOutboundMessage', () => {
  it('accepts subscribe_state', () => {
    expect(parseNMOutboundMessage({ type: 'subscribe_state' })).toEqual({
      type: 'subscribe_state',
    })
  })

  it('rejects malformed outbound payloads', () => {
    expect(parseNMOutboundMessage({ type: 'unknown' })).toBeNull()
  })
})
