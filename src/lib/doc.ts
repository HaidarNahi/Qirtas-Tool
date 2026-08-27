import type { Branch, Doc, Question } from './types'
import { sanitizeHtml } from './richtext'

export const uid = () => Math.random().toString(36).slice(2, 10)

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

/**
 * Fills in fields added after a document was first saved, and re-sanitises every
 * rich-text field. Documents arrive from `Open a saved sheet`, which is a file
 * the app did not write — and every one of these fields ends up in
 * dangerouslySetInnerHTML.
 */
export function migrate(doc: Doc): Doc {
  const base = createDoc()
  const clean = (html: unknown): string => (typeof html === 'string' ? sanitizeHtml(html) : '')

  return {
    ...base,
    ...doc,
    padding: { ...base.padding, ...doc.padding },
    header: {
      ...base.header,
      ...doc.header,
      cells: (doc.header?.cells ?? base.header.cells).slice(0, 3).map(clean) as [string, string, string],
      note: clean(doc.header?.note),
      align: (doc.header?.align ?? base.header.align).slice(0, 3) as Doc['header']['align'],
    },
    footer: {
      ...base.footer,
      ...doc.footer,
      cells: (doc.footer?.cells ?? base.footer.cells).slice(0, 2).map(clean) as [string, string],
      align: (doc.footer?.align ?? base.footer.align).slice(0, 2) as Doc['footer']['align'],
    },
    questions: (doc.questions ?? []).map((q) => ({
      ...emptyQuestion(),
      ...q,
      text: clean(q?.text),
      marks: clean(q?.marks),
      branches: (q?.branches ?? []).map((b) => ({
        ...emptyBranch(),
        ...b,
        text: clean(b?.text),
        marks: clean(b?.marks),
      })),
    })),
  }
}
