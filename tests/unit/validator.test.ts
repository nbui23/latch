import { describe, it, expect } from 'vitest'
import { validateDomain } from '../../apps/desktop/src/main/blocklist/validator.js'

describe('validateDomain', () => {
  describe('valid domains', () => {
    it('accepts a simple domain', () => {
      const r = validateDomain('reddit.com')
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe('reddit.com')
    })

    it('normalizes to lowercase', () => {
      const r = validateDomain('Reddit.COM')
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe('reddit.com')
    })

    it('strips https:// scheme', () => {
      const r = validateDomain('https://reddit.com')
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe('reddit.com')
    })

    it('strips http:// scheme', () => {
      const r = validateDomain('http://example.com')
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe('example.com')
    })

    it('strips path after domain', () => {
      const r = validateDomain('https://reddit.com/r/programming')
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe('reddit.com')
    })

    it('strips port', () => {
      const r = validateDomain('example.com:8080')
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe('example.com')
    })

    it('accepts subdomain', () => {
      const r = validateDomain('news.ycombinator.com')
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe('news.ycombinator.com')
    })

    it('accepts two-part TLD', () => {
      const r = validateDomain('example.co.uk')
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe('example.co.uk')
    })

    it('strips www prefix (keeps it — www is valid)', () => {
      const r = validateDomain('www.reddit.com')
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe('www.reddit.com')
    })
  })

  describe('reserved / private addresses', () => {
    it('rejects localhost', () => {
      const r = validateDomain('localhost')
      expect(r.valid).toBe(false)
      expect(r.error).toBeTruthy()
    })

    it('rejects 127.0.0.1', () => {
      const r = validateDomain('127.0.0.1')
      expect(r.valid).toBe(false)
    })

    it('rejects 0.0.0.0', () => {
      const r = validateDomain('0.0.0.0')
      expect(r.valid).toBe(false)
    })

    it('rejects ::1', () => {
      const r = validateDomain('::1')
      expect(r.valid).toBe(false)
    })

    it('rejects RFC-1918 10.x.x.x', () => {
      const r = validateDomain('10.0.0.1')
      expect(r.valid).toBe(false)
    })

    it('rejects RFC-1918 192.168.x.x', () => {
      const r = validateDomain('192.168.1.1')
      expect(r.valid).toBe(false)
    })

    it('rejects RFC-1918 172.16.x.x', () => {
      const r = validateDomain('172.16.0.1')
      expect(r.valid).toBe(false)
    })
  })

  describe('invalid formats', () => {
    it('rejects empty string', () => {
      const r = validateDomain('')
      expect(r.valid).toBe(false)
    })

    it('rejects whitespace only', () => {
      const r = validateDomain('   ')
      expect(r.valid).toBe(false)
    })

    it('rejects domain without TLD', () => {
      const r = validateDomain('reddit')
      expect(r.valid).toBe(false)
      expect(r.error).toMatch(/TLD/i)
    })

    it('rejects wildcard', () => {
      const r = validateDomain('*.reddit.com')
      expect(r.valid).toBe(false)
      expect(r.error).toMatch(/wildcard/i)
    })

    it('rejects domain with spaces', () => {
      const r = validateDomain('red dit.com')
      expect(r.valid).toBe(false)
    })

    it('rejects domain with underscores', () => {
      const r = validateDomain('red_dit.com')
      expect(r.valid).toBe(false)
    })
  })
})
