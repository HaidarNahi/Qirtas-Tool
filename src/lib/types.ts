export type Dir = 'rtl' | 'ltr'
export type DividerStyle = 'solid' | 'dashed' | 'none'
export type FontKey = 'inter' | 'arial' | 'ibmArabic' | 'times'
export type NumeralStyle = 'arabic' | 'latin'
export type BranchStyle = 'abjad' | 'latin'
export type Align = 'start' | 'center' | 'end'

/** Rich-text content, stored as sanitized HTML. */
export type Html = string

export interface Branch {
  id: string
  text: Html
  marks: Html
  showMarks: boolean
}

export interface Question {
  id: string
  /** Stem shown next to the question number. May be empty when the question is only branches. */
  text: Html
  marks: Html
  showMarks: boolean
  branches: Branch[]
  /** Divider drawn after this question. */
  divider: DividerStyle
}

export interface PagePadding {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Doc {
  version: 1
  /** Direction of the exam sheet itself (independent of the UI language). */
  dir: Dir
  font: FontKey
  fontSize: number
  lineHeight: number
  color: string
  numerals: NumeralStyle
  branchStyle: BranchStyle
  /** Label placed before the question number, e.g. "س" or "Q". */
  questionPrefix: string
  padding: PagePadding
  header: {
    cells: [Html, Html, Html]
    align: [Align, Align, Align]
    note: Html
    noteAlign: Align
    showNote: boolean
    showRule: boolean
    /** Repeat the header on every page instead of the first only. */
    repeat: boolean
  }
  footer: {
    cells: [Html, Html]
    align: [Align, Align]
    showRule: boolean
    repeat: boolean
  }
  questions: Question[]
  showPageNumbers: boolean
}

export const FONT_STACKS: Record<FontKey, string> = {
  inter: "'Inter', 'IBM Plex Sans Arabic', system-ui, sans-serif",
  arial: "Arial, 'IBM Plex Sans Arabic', Helvetica, sans-serif",
  ibmArabic: "'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif",
  times: "'Times New Roman', 'IBM Plex Sans Arabic', Times, serif",
}

export const FONT_LABELS: Record<FontKey, string> = {
  inter: 'Inter',
  arial: 'Arial',
  ibmArabic: 'IBM Plex Sans Arabic',
  times: 'Times New Roman',
}
