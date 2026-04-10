/**
 * Domain validator
 * Rejects reserved IP addresses and normalizes URLs to bare domains.
 */

const RESERVED_EXACT = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '::',
  'ip6-localhost',
  'ip6-loopback',
])

// RFC-1918 private ranges — simple prefix checks for MVP
const PRIVATE_PREFIXES = [
  '10.',
  '192.168.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
]

export interface ValidationResult {
  valid: boolean
  normalized?: string
  error?: string
}

export function validateDomain(input: string): ValidationResult {
  if (!input || !input.trim()) {
    return { valid: false, error: 'Domain cannot be empty' }
  }

  let domain = input.trim().toLowerCase()

  // Strip scheme (http://, https://)
  domain = domain.replace(/^https?:\/\//i, '')

  // Strip path, query, fragment
  const slashIdx = domain.indexOf('/')
  if (slashIdx !== -1) domain = domain.slice(0, slashIdx)

  // Strip port
  const colonIdx = domain.lastIndexOf(':')
  if (colonIdx !== -1) {
    const maybePort = domain.slice(colonIdx + 1)
    if (/^\d+$/.test(maybePort)) {
      domain = domain.slice(0, colonIdx)
    }
  }

  if (!domain) {
    return { valid: false, error: 'Could not parse domain from input' }
  }

  // Reject reserved addresses
  if (RESERVED_EXACT.has(domain)) {
    return { valid: false, error: 'This address cannot be blocked' }
  }

  // Reject private IP ranges
  for (const prefix of PRIVATE_PREFIXES) {
    if (domain.startsWith(prefix)) {
      return { valid: false, error: 'This address cannot be blocked' }
    }
  }

  // Reject wildcards (MVP)
  if (domain.includes('*')) {
    return { valid: false, error: 'Wildcard domains are not supported yet' }
  }

  // Basic domain format check
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(domain)) {
    return { valid: false, error: 'Invalid domain format' }
  }

  // Must have at least one dot (TLD required)
  if (!domain.includes('.')) {
    return { valid: false, error: 'Domain must include a TLD (e.g. reddit.com)' }
  }

  return { valid: true, normalized: domain }
}
