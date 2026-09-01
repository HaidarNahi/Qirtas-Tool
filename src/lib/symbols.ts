/**
 * The symbol library.
 *
 * Everything a science paper needs and nothing else — the same restraint the
 * formatting toolbar keeps. Subscripts and superscripts get their own entries
 * because typing H₂SO₄ or Ca²⁺ through the sub/sup buttons is four taps per
 * character, and a chemistry teacher does it a hundred times a paper.
 */

export interface SymbolGroup {
  id: string
  /** Arabic label, since the interface is Arabic. */
  label: string
  symbols: string[]
}

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'math',
    label: 'رياضيات',
    symbols: [
      '×', '÷', '±', '∓', '≠', '≈', '≡', '≤', '≥', '<', '>',
      '√', '∛', '∞', 'π', '∑', '∏', '∫', '∂', '∆', '∇',
      '∈', '∉', '⊂', '⊆', '∪', '∩', '∅', '∀', '∃',
      '°', '′', '″', '∠', '⊥', '∥', '∝', '%', '‰',
      '½', '⅓', '¼', '¾', '⅔',
    ],
  },
  {
    id: 'chemistry',
    label: 'كيمياء',
    symbols: [
      '→', '⇌', '⇋', '↑', '↓', '⟶', '≡', '·', 'Δ', '°', 'Å',
      '₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉',
      '⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹',
      '⁺', '⁻', '⁄', 'μ', '‰',
    ],
  },
  {
    id: 'physics',
    label: 'فيزياء',
    symbols: [
      'α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'λ', 'μ', 'ν',
      'ξ', 'ρ', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω',
      'Γ', 'Δ', 'Θ', 'Λ', 'Σ', 'Φ', 'Ψ', 'Ω',
      'ħ', 'ℓ', '∮', '∇', '∝', '≈', '·', '×', '°', '∞',
    ],
  },
  {
    id: 'arrows',
    label: 'أسهم',
    symbols: [
      '→', '←', '↑', '↓', '↔', '↕',
      '⇒', '⇐', '⇑', '⇓', '⇔',
      '⇌', '⇋', '↦', '⟶', '⟵', '⟹', '⟸',
      '↗', '↘', '↙', '↖', '↺', '↻',
    ],
  },
]
