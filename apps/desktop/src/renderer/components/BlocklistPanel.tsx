import React, { useState } from 'react'
import type { BlockList } from '@latch/shared'
import type { useBlocklists } from '../hooks/useBlocklists.js'

interface Props {
  sessionActive: boolean
  selectedList: BlockList | null
  save: ReturnType<typeof useBlocklists>['save']
}

export default function BlocklistPanel({ sessionActive, selectedList, save }: Props) {
  const [domainInput, setDomainInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleAddDomain = async () => {
    if (!selectedList || !domainInput.trim()) return
    setInputError(null)

    const result = await window.latch.domain.validate(domainInput)
    if (!result.valid) {
      setInputError(result.error)
      return
    }

    if (selectedList.domains.includes(result.normalized)) {
      setInputError('Already in the list')
      return
    }

    const updated: BlockList = {
      ...selectedList,
      domains: [...selectedList.domains, result.normalized],
    }

    setSaving(true)
    const saveResult = await save(updated)
    setSaving(false)
    if (!saveResult.ok) {
      setInputError(saveResult.error)
      return
    }
    setDomainInput('')
  }

  const handleRemoveDomain = async (domain: string) => {
    if (!selectedList) return
    await save({
      ...selectedList,
      domains: selectedList.domains.filter((d) => d !== domain),
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleAddDomain()
  }

  return (
    <div>
      <h2 className="panel-title">Block List</h2>
      {sessionActive && (
        <div className="callout callout--warn">
          A session is active — the block list is read-only until it ends.
        </div>
      )}

      <div className="domain-form">
        <input
          className={inputError ? 'domain-input is-invalid' : 'domain-input'}
          type="text"
          value={domainInput}
          onChange={(e) => { setDomainInput(e.target.value); setInputError(null) }}
          onKeyDown={handleKeyDown}
          placeholder="reddit.com"
          disabled={sessionActive}
        />
        <button
          className={`btn btn--primary btn--add${sessionActive || saving ? ' is-dimmed' : ''}`}
          onClick={() => void handleAddDomain()}
          disabled={sessionActive || saving || !domainInput.trim()}
        >
          Add
        </button>
      </div>

      {inputError && <div className="field-error">{inputError}</div>}

      {selectedList && selectedList.domains.length === 0 && (
        <div className="empty-state">No sites blocked yet. Add a domain above.</div>
      )}

      <ul className="domain-list">
        {selectedList?.domains.map((domain) => (
          <li key={domain} className="domain-row">
            <span className="domain-row__name">{domain}</span>
            {!sessionActive && (
              <button
                className="domain-row__remove"
                onClick={() => void handleRemoveDomain(domain)}
                title="Remove"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {selectedList && (
        <p className="list-footnote">
          {selectedList.domains.length} site{selectedList.domains.length !== 1 ? 's' : ''} blocked.
          Both domain.com and www.domain.com are blocked automatically.
        </p>
      )}
    </div>
  )
}
