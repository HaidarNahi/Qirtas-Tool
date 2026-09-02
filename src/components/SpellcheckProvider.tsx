import { createContext, useContext, useMemo, type ReactNode } from 'react'

interface SpellcheckValue {
  enabled: boolean
}

const SpellcheckContext = createContext<SpellcheckValue>({ enabled: false })

/**
 * Carries the one setting every field needs, without threading it through the
 * whole editor tree.
 *
 * It used to also hold which obscenities had been uncovered, back when they
 * were hidden behind a blur. They are framed in place now — the word stays
 * readable and editable, and the warning above it removes it on request — so
 * there is no reveal state left to share.
 */
export function SpellcheckProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ enabled }), [enabled])
  return <SpellcheckContext.Provider value={value}>{children}</SpellcheckContext.Provider>
}

export function useSpellcheckSettings() {
  return useContext(SpellcheckContext)
}
