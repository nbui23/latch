import React, { useState, useEffect } from 'react'
import type { BlockList } from '@latch/shared'

interface Props {
  sessionActive: boolean
}

export default function BlocklistPanel({ sessionActive }: Props) {
  const [blocklists, setBlocklists] = useState<BlockList[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [domainInput, setDomainInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (typeof window.latch === 'undefined') return
    window.latch.blocklist.load().then((bls) => {
      const typed = bls as BlockList[]
      setBlocklists(typed)
      if (typed.length > 0) setSelectedId(typed[0].id)
    })
  }, [])

  const selectedList = blocklists.find((b) => b.id === selectedId) ?? null

  const handleAddDomain = async () => {
    if (!selectedList || !domainInput.trim()) return
    setInputError(null)

    const result = await window.latch.domain.validate(domainInput)
    if (!result.valid) {
      setInputError(result.error ?? 'Invalid domain')
      return
    }

    const domain = result.normalized!
    if (selectedList.domains.includes(domain)) {
      setInputError('Already in the list')
      return
    }

    const updated: BlockList = {
      ...selectedList,
      domains: [...selectedList.domains, domain],
    }

    setSaving(true)
    await window.latch.blocklist.save(updated)
    setSaving(false)
    setBlocklists((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
    setDomainInput('')
  }

  const handleRemoveDomain = async (domain: string) => {
    if (!selectedList) return
    const updated: BlockList = {
      ...selectedList,
      domains: selectedList.domains.filter((d) => d !== domain),
    }
    await window.latch.blocklist.save(updated)
    setBlocklists((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleAddDomain()
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: '#e5e5e5' }}>Block List</h2>
      {sessionActive && (
        <div style={{ background: '#2a1f00', border: '1px solid #78350f', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: '#fbbf24' }}>
          A session is active — the block list is read-only until it ends.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, marginTop: 16 }}>
        <input
          type="text"
          value={domainInput}
          onChange={(e) => { setDomainInput(e.target.value); setInputError(null) }}
          onKeyDown={handleKeyDown}
          placeholder="reddit.com"
          disabled={sessionActive}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 6,
            border: `1px solid ${inputError ? '#7f1d1d' : '#2c2c2c'}`,
            fontSize: 14, outline: 'none',
            background: sessionActive ? '#111111' : '#1a1a1a',
            color: '#e5e5e5',
          }}
        />
        <button
          onClick={() => void handleAddDomain()}
          disabled={sessionActive || saving || !domainInput.trim()}
          style={{
            padding: '8px 16px', background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
            opacity: sessionActive || saving ? 0.4 : 1,
          }}
        >
          Add
        </button>
      </div>

      {inputError && (
        <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{inputError}</div>
      )}

      {selectedList && selectedList.domains.length === 0 && (
        <div style={{ color: '#555555', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
          No sites blocked yet. Add a domain above.
        </div>
      )}

      <ul style={{ listStyle: 'none' }}>
        {selectedList?.domains.map((domain) => (
          <li
            key={domain}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: '#1a1a1a', borderRadius: 6,
              border: '1px solid #2c2c2c', marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 14, color: '#e5e5e5' }}>{domain}</span>
            {!sessionActive && (
              <button
                onClick={() => void handleRemoveDomain(domain)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#555555', fontSize: 18, lineHeight: 1, padding: '0 4px',
                }}
                title="Remove"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {selectedList && (
        <p style={{ marginTop: 12, fontSize: 12, color: '#555555' }}>
          {selectedList.domains.length} site{selectedList.domains.length !== 1 ? 's' : ''} blocked.
          Both domain.com and www.domain.com are blocked automatically.
        </p>
      )}
    </div>
  )
}
