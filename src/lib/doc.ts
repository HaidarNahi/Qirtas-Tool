import type { Align, Branch, BranchStyle, Dir, DividerStyle, Doc, FontKey, Html, NumeralStyle, PagePadding, Question } from './types'
import { sanitizeHtml } from './richtext'

export const uid = () => Math.random().toString(36).slice(2, 10)

const DIRS: readonly Dir[] = ['rtl', 'ltr']
const FONTS: readonly FontKey[] = ['inter', 'arial', 'ibmArabic', 'times']
const NUMERALS: readonly NumeralStyle[] = ['arabic', 'latin']
const BRANCH_STYLES: readonly BranchStyle[] = ['abjad', 'latin']
const DIVIDERS: readonly DividerStyle[] = ['solid', 'dashed', 'none']
const ALIGNS: readonly Align[] = ['start', 'center', 'end']

/** Ceilings, not policy: they stop a malformed file from wedging the app. */
const MAX_QUESTIONS = 500
const MAX_BRANCHES = 100

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

export function toArabicDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)])
}

export function formatNumber(n: number, numerals: Doc['numerals']): string {
  return numerals === 'arabic' ? toArabicDigits(n) : String(n)
}

/** Abjad ordering as used on Iraqi exam sheets. */
const ABJAD = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل', 'م', 'ن', 'س', 'ع', 'ف', 'ص', 'ق', 'ر']
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function branchLabel(index: number, style: Doc['branchStyle']): string {
  const table = style === 'abjad' ? ABJAD : LATIN
  return table[index] ?? String(index + 1)
}

export function emptyBranch(): Branch {
  return { id: uid(), text: '', marks: '', showMarks: true }
}

export function emptyQuestion(divider: Doc['questions'][number]['divider'] = 'solid'): Question {
  return { id: uid(), text: '', marks: '', showMarks: true, branches: [], divider }
}

export function createDoc(): Doc {
  return {
    version: 1,
    dir: 'rtl',
    font: 'ibmArabic',
    fontSize: 14,
    lineHeight: 1.5,
    color: '#000000',
    numerals: 'arabic',
    branchStyle: 'abjad',
    questionPrefix: 'س',
    padding: { top: 14, right: 14, bottom: 12, left: 14 },
    header: {
      cells: ['', '', ''],
      align: ['center', 'center', 'start'],
      note: '',
      noteAlign: 'center',
      showNote: false,
      showRule: true,
      repeat: false,
    },
    footer: { cells: ['', ''], align: ['center', 'start'], showRule: false, repeat: false },
    questions: [emptyQuestion()],
    showPageNumbers: false,
  }
}

/** Mirrors the reference sheet so a first-time teacher sees the shape of the thing. */
export function sampleDoc(): Doc {
  const q = (text: string, marks: string, branches: [string, string][] = []): Question => ({
    id: uid(),
    text,
    marks,
    showMarks: marks.length > 0,
    branches: branches.map(([t, m]) => ({ id: uid(), text: t, marks: m, showMarks: m.length > 0 })),
    divider: 'solid',
  })

  return {
    ...createDoc(),
    header: {
      cells: [
        'إدارة تربية …<div>متوسطة …</div>',
        'إمتحانات نصف السنة<div>الدور الأول – العام الدراسي</div><div>٢٠٢٥ – ٢٠٢٦</div>',
        'المادة: الكيمياء<div>الصف: الثاني</div><div>الوقت: ساعة ونصف</div><div>الإسم:</div>',
      ],
      align: ['center', 'center', 'start'],
      note: 'ملاحظة: الإجابة عن خمسة أسئلة فقط (ولكل سؤال ٢٠ درجة)',
      noteAlign: 'center',
      showNote: true,
      showRule: true,
      repeat: false,
    },
    footer: {
      cells: ['نجاحكم غايتي وتفوقكم سعادتي', 'مُدرّس المادة:<div>………………</div>'],
      align: ['center', 'start'],
      showRule: false,
      repeat: false,
    },
    questions: [
      q(
        'عرّفي اربع من ما يأتي:<div>١- الايون&nbsp; ٢- العناصر النبيلة&nbsp; ٣- الرابطة التساهمية&nbsp; ٤- قوى فاندرفالز&nbsp; ٥- الرابطة الهيدروجينية&nbsp; ٦- التفاعل الكيميائي</div>',
        '٢٠ درجة',
      ),
      q('', '', [
        ['ماذا تعني الأرقام في المركب 5H<sub>3</sub>Po<sub>4</sub>', '١٠ درجات'],
        [
          'املئي الفراغات الآتية ولخمسٍ فقط:<ol><li>العدد 2 في جزيء الماء يمثل ……………</li><li>يذوب كثير من المركبات الايونية بسهولة في ……………</li><li>…………… هي المسؤولة عن تكوين الروابط.</li></ol>',
          '١٠ درجات',
        ],
      ]),
      q('', '', [
        ['قارني بين المركبات الايونية والمركبات التساهمية.', '١٠ درجات'],
        ['وضحي مع الرسم جزيئة من ملح الطعام NaCl إذا علمتِ ان العدد الذري لـ Na = 11 و Cl = 17 وما نوع الرابطة بينهما؟', '١٠ درجات'],
      ]),
      q('', '', [
        ['ما الذرة ومما تتكون؟', '١٠ درجات'],
        ['عددي انواع التفاعلات الكيميائية.', '١٠ درجات'],
      ]),
    ],
  }
}

/* ------------------------------------------------------- import hardening */

const MAX_PADDING_MM = 40
const MIN_FONT_PT = 6
const MAX_FONT_PT = 72

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function number(value: unknown, min: number, max: number, fallback: number): number {
  // A missing value takes the default; only a real number gets clamped. Without
  // the guard `Number(null)` is 0, so an absent margin would silently become
  // zero rather than the margin the sheet was designed with.
  if (value === null || value === undefined || value === '') return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/** Anything CSS will accept as a colour, but nothing that can carry a payload. */
function color(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/]+\))$/i.test(trimmed)
    ? trimmed
    : fallback
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Fills in fields added after a document was first saved, and re-sanitises every
 * rich-text field. Documents arrive from `Open a saved sheet`, which is a file
 * the app did not write — and every one of these fields ends up in
 * dangerouslySetInnerHTML.
 *
 * The numbers and enums get the same treatment as the HTML, and for the same
 * reason: this is the trust boundary. A file carrying `padding: { top: 5000 }`
 * or a 10⁶pt font renders a sheet with nothing on it, and autosave writes that
 * straight over the teacher's own work before they can undo it.
 */
export function migrate(doc: Doc): Doc {
  const base = createDoc()
  const clean = (html: unknown): string => (typeof html === 'string' ? sanitizeHtml(html) : '')
  const align = (value: unknown, fallback: Align): Align => oneOf(value, ALIGNS, fallback)

  const padding = (doc?.padding ?? {}) as Partial<PagePadding>

  return {
    ...base,
    ...doc,
    version: 1,
    dir: oneOf(doc?.dir, DIRS, base.dir),
    font: oneOf(doc?.font, FONTS, base.font),
    numerals: oneOf(doc?.numerals, NUMERALS, base.numerals),
    branchStyle: oneOf(doc?.branchStyle, BRANCH_STYLES, base.branchStyle),
    fontSize: number(doc?.fontSize, MIN_FONT_PT, MAX_FONT_PT, base.fontSize),
    lineHeight: number(doc?.lineHeight, 0.5, 4, base.lineHeight),
    color: color(doc?.color, base.color),
    questionPrefix: typeof doc?.questionPrefix === 'string' ? doc.questionPrefix.slice(0, 6) : base.questionPrefix,
    showPageNumbers: boolean(doc?.showPageNumbers, base.showPageNumbers),
    padding: {
      top: number(padding.top, 0, MAX_PADDING_MM, base.padding.top),
      right: number(padding.right, 0, MAX_PADDING_MM, base.padding.right),
      bottom: number(padding.bottom, 0, MAX_PADDING_MM, base.padding.bottom),
      left: number(padding.left, 0, MAX_PADDING_MM, base.padding.left),
    },
    header: {
      ...base.header,
      ...doc.header,
      cells: fixed(doc.header?.cells, 3, base.header.cells).map(clean) as [Html, Html, Html],
      note: clean(doc.header?.note),
      noteAlign: align(doc.header?.noteAlign, base.header.noteAlign),
      align: fixed(doc.header?.align, 3, base.header.align).map((a) => align(a, 'start')) as Doc['header']['align'],
      showNote: boolean(doc.header?.showNote, base.header.showNote),
      showRule: boolean(doc.header?.showRule, base.header.showRule),
      repeat: boolean(doc.header?.repeat, base.header.repeat),
    },
    footer: {
      ...base.footer,
      ...doc.footer,
      cells: fixed(doc.footer?.cells, 2, base.footer.cells).map(clean) as [Html, Html],
      align: fixed(doc.footer?.align, 2, base.footer.align).map((a) => align(a, 'start')) as Doc['footer']['align'],
      showRule: boolean(doc.footer?.showRule, base.footer.showRule),
      repeat: boolean(doc.footer?.repeat, base.footer.repeat),
    },
    questions: (Array.isArray(doc?.questions) ? doc.questions : []).slice(0, MAX_QUESTIONS).map((q) => ({
      ...emptyQuestion(),
      ...q,
      id: typeof q?.id === 'string' && q.id ? q.id : uid(),
      text: clean(q?.text),
      marks: clean(q?.marks),
      showMarks: boolean(q?.showMarks, true),
      divider: oneOf(q?.divider, DIVIDERS, 'solid'),
      branches: (Array.isArray(q?.branches) ? q.branches : []).slice(0, MAX_BRANCHES).map((b) => ({
        ...emptyBranch(),
        ...b,
        id: typeof b?.id === 'string' && b.id ? b.id : uid(),
        text: clean(b?.text),
        marks: clean(b?.marks),
        showMarks: boolean(b?.showMarks, true),
      })),
    })),
  }
}

/** Keeps a tuple field exactly the length the model promises. */
function fixed<T>(value: unknown, length: number, fallback: readonly T[]): T[] {
  const source = Array.isArray(value) ? value : fallback
  return Array.from({ length }, (_, i) => (source[i] ?? fallback[i]) as T)
}
