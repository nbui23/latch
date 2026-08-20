import { useCallback, useEffect, useState } from 'react'
import type { BlockList } from '@latch/shared'

/**
 * Loads the blocklists once and keeps the local copy in step with saves.
 * Both panels used to inline this fetch — including the cast that the typed
 * preload bridge now makes unnecessary.
 */
export function useBlocklists() {
  const [blocklists, setBlocklists] = useState<BlockList[]>([])
  const [selectedId, setSelectedId] = useState<string>('')

  useEffect(() => {
    if (typeof window.latch === 'undefined') return
    let cancelled = false

    void window.latch.blocklist.load().then((loaded) => {
      if (cancelled) return
      setBlocklists(loaded)
      const [first] = loaded
      if (first) {
        setSelectedId((current) => current || first.id)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback(async (blocklist: BlockList) => {
    const result = await window.latch.blocklist.save(blocklist)
    if (!result.ok) return result
    setBlocklists((prev) => prev.map((b) => (b.id === blocklist.id ? blocklist : b)))
    return result
  }, [])

  const selected = blocklists.find((b) => b.id === selectedId) ?? null

  return { blocklists, selected, selectedId, setSelectedId, save }
}
