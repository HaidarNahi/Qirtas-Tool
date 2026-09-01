import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface SpellcheckValue {
  enabled: boolean
  /** Obscenities the teacher has tapped to uncover, for this session only. */
  revealed: ReadonlySet<string>
  toggleRevealed: (word: string) => void
}

const SpellcheckContext = createContext<SpellcheckValue>({
  enabled: false,
  revealed: new Set(),
  toggleRevealed: () => {},
})

/**
 * Reveal state is shared rather than per-field on purpose: uncovering a word
 * once uncovers it everywhere it appears, so a teacher reviewing a paper does
 * not have to tap the same word in six questions.
 *
 * It is deliberately not persisted — every reload starts covered again.
 */
export function SpellcheckProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set())

  const toggleRevealed = useCallback((word: string) => {
    setRevealed((current) => {
      const next = new Set(current)
      const key = word.toLowerCase()
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const value = useMemo(() => ({ enabled, revealed, toggleRevealed }), [enabled, revealed, toggleRevealed])
  return <SpellcheckContext.Provider value={value}>{children}</SpellcheckContext.Provider>
}

export function useSpellcheckSettings() {
  return useContext(SpellcheckContext)
}
