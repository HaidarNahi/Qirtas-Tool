import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Doc, Question } from '../lib/types'
import { FONT_STACKS } from '../lib/types'
import { branchLabel, formatNumber } from '../lib/doc'
import { isBlank } from '../lib/richtext'
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  PAGE_GAP_MM,
  PAGE_NUMBER_RESERVE_MM,
  buildFlow,
  measurePxPerMm,
  paginate,
  type FlowItem,
  type Pagination,
} from '../lib/paginate'

interface Props {
  doc: Doc
  /** Scale applied to the on-screen paper; printing always renders at 1. */
  scale?: number
  onPageCount?: (count: number) => void
  className?: string
  /** Handed to the PDF exporter so it can rasterise each page element. */
  pagesRef?: React.MutableRefObject<HTMLDivElement | null>
}

export default function Sheet({ doc, scale = 1, onPageCount, className, pagesRef }: Props) {
  const measureRef = useRef<HTMLDivElement>(null)
  const headerProbe = useRef<HTMLDivElement>(null)
  const footerProbe = useRef<HTMLDivElement>(null)
  const [pagination, setPagination] = useState<Pagination>({ pages: [[]], overflowing: new Set() })
  const [fontsReady, setFontsReady] = useState(false)

  const flow = useMemo(() => buildFlow(doc), [doc])
  const hasHeader = doc.header.cells.some((cell) => !isBlank(cell)) || (doc.header.showNote && !isBlank(doc.header.note))
  const hasFooter = doc.footer.cells.some((cell) => !isBlank(cell))
  // No marks anywhere means no reason to reserve the marks gutter.
  const hasMarks = doc.questions.some(
    (question) =>
      (question.showMarks && !isBlank(question.marks)) ||
      question.branches.some((branch) => branch.showMarks && !isBlank(branch.marks)),
  )

  useEffect(() => {
    let alive = true
    document.fonts?.ready.then(() => alive && setFontsReady(true))
    return () => {
      alive = false
    }
  }, [])

  useLayoutEffect(() => {
    const container = measureRef.current
    if (!container) return

    const compute = () => {
      const pxPerMm = measurePxPerMm()
      const heights = new Map<string, number>()
      container.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((el) => {
        heights.set(el.dataset.flowId!, el.getBoundingClientRect().height)
      })

      const reserve = doc.showPageNumbers ? PAGE_NUMBER_RESERVE_MM : 0
      // 1mm of slack absorbs sub-pixel rounding between measure and render.
      const bodyHeight = (A4_HEIGHT_MM - doc.padding.top - doc.padding.bottom - reserve - 1) * pxPerMm

      setPagination(
        paginate(flow, heights, {
          bodyHeight,
          headerHeight: hasHeader ? (headerProbe.current?.getBoundingClientRect().height ?? 0) : 0,
          footerHeight: hasFooter ? (footerProbe.current?.getBoundingClientRect().height ?? 0) : 0,
          repeatHeader: doc.header.repeat,
          repeatFooter: doc.footer.repeat,
        }),
      )
    }

    compute()
  }, [doc, flow, hasHeader, hasFooter, fontsReady])

  useEffect(() => {
    onPageCount?.(pagination.pages.length)
  }, [pagination.pages.length, onPageCount])

  const contentWidth = A4_WIDTH_MM - doc.padding.left - doc.padding.right
  const paperStyle: React.CSSProperties = {
    fontFamily: FONT_STACKS[doc.font],
    fontSize: `${doc.fontSize}pt`,
    lineHeight: doc.lineHeight,
    color: doc.color,
  }

  return (
    <div className={`sheet ${hasMarks ? 'has-marks' : ''} ${className ?? ''}`} dir={doc.dir}>
      {/* Off-screen pass: identical width and typography, measured before paging. */}
      <div className="sheet-measure" aria-hidden style={{ width: `${contentWidth}mm`, ...paperStyle }}>
        <div ref={headerProbe}>{hasHeader && <HeaderBlock doc={doc} />}</div>
        <div ref={measureRef}>
          {flow.map((item) => (
            <FlowRow key={item.id} doc={doc} item={item} />
          ))}
        </div>
        <div ref={footerProbe}>{hasFooter && <FooterBlock doc={doc} />}</div>
      </div>

      {/* Scaled with a transform, not zoom: zoom re-rounds line boxes and would
          drift from the heights the paginator measured at 1:1. */}
      <div
        className="pages-frame"
        style={{
          width: `calc(${A4_WIDTH_MM}mm * ${scale})`,
          height: `calc((${A4_HEIGHT_MM * pagination.pages.length + PAGE_GAP_MM * (pagination.pages.length - 1)}mm) * ${scale})`,
        }}
      >
        <div className="pages" ref={pagesRef} style={{ transform: `scale(${scale})` }}>
        {pagination.pages.map((items, pageIndex) => {
          const showHeader = hasHeader && (pageIndex === 0 || doc.header.repeat)
          const showFooter =
            hasFooter && (doc.footer.repeat || pageIndex === pagination.pages.length - 1)
          return (
            <div
              key={pageIndex}
              className="page"
              style={{
                width: `${A4_WIDTH_MM}mm`,
                height: `${A4_HEIGHT_MM}mm`,
                paddingTop: `${doc.padding.top}mm`,
                paddingBottom: `${doc.padding.bottom}mm`,
                paddingInlineStart: `${doc.dir === 'rtl' ? doc.padding.right : doc.padding.left}mm`,
                paddingInlineEnd: `${doc.dir === 'rtl' ? doc.padding.left : doc.padding.right}mm`,
                ...paperStyle,
              }}
            >
              {showHeader && <HeaderBlock doc={doc} />}
              <div className="page-flow">
                {items.map((item) => (
                  <FlowRow
                    key={item.id}
                    doc={doc}
                    item={item}
                    overflowing={pagination.overflowing.has(item.id)}
                  />
                ))}
              </div>
              {showFooter && <FooterBlock doc={doc} />}
              {doc.showPageNumbers && (
                <div className="page-number">
                  {formatNumber(pageIndex + 1, doc.numerals)} / {formatNumber(pagination.pages.length, doc.numerals)}
                </div>
              )}
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}

function FlowRow({ doc, item, overflowing }: { doc: Doc; item: FlowItem; overflowing?: boolean }) {
  if (item.kind === 'divider') {
    const style = doc.questions[item.questionIndex]?.divider ?? 'solid'
    return (
      <div className="flow-item flow-item--divider" data-flow-id={item.id}>
        <hr className={`q-divider q-divider--${style}`} />
      </div>
    )
  }

  const question = doc.questions[item.questionIndex]
  if (!question) return null

  const source = item.branchIndex === null ? question : question.branches[item.branchIndex]
  if (!source) return null

  return (
    <div className={`flow-item q-row ${overflowing ? 'is-overflowing' : ''}`} data-flow-id={item.id}>
      <div className="q-label">{rowLabel(doc, question, item.questionIndex, item.branchIndex)}</div>
      <div className="q-text" dangerouslySetInnerHTML={{ __html: source.text }} />
      <div className="q-marks">
        {source.showMarks && !isBlank(source.marks) ? (
          <span dangerouslySetInnerHTML={{ __html: source.marks }} />
        ) : null}
      </div>
    </div>
  )
}

export function rowLabel(doc: Doc, _question: Question, questionIndex: number, branchIndex: number | null): string {
  const number = formatNumber(questionIndex + 1, doc.numerals)
  const base = `${doc.questionPrefix}${number}`
  if (branchIndex === null) return `${base}/`
  return `${base} / ${branchLabel(branchIndex, doc.branchStyle)} /`
}

function HeaderBlock({ doc }: { doc: Doc }) {
  return (
    <header className="sheet-header">
      <div className={`sheet-header-inner ${doc.header.showRule ? 'has-rule' : ''}`}>
        <div className="sheet-header-cells">
          {doc.header.cells.map((cell, index) => (
            <div
              key={index}
              className="sheet-cell"
              style={{ textAlign: doc.header.align[index] ?? 'start' }}
              dangerouslySetInnerHTML={{ __html: cell }}
            />
          ))}
        </div>
        {doc.header.showNote && !isBlank(doc.header.note) && (
          <div
            className="sheet-note"
            style={{ textAlign: doc.header.noteAlign ?? 'start' }}
            dangerouslySetInnerHTML={{ __html: doc.header.note }}
          />
        )}
      </div>
    </header>
  )
}

function FooterBlock({ doc }: { doc: Doc }) {
  return (
    <footer className="sheet-footer">
      <div className={`sheet-footer-inner ${doc.footer.showRule ? 'has-rule' : ''}`}>
        {doc.footer.cells.map((cell, index) => (
          <div
            key={index}
            className="sheet-cell"
            style={{ textAlign: doc.footer.align[index] ?? 'start' }}
            dangerouslySetInnerHTML={{ __html: cell }}
          />
        ))}
      </div>
    </footer>
  )
}
