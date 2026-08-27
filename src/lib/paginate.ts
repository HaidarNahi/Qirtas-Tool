import type { Doc } from './types'
import { isBlank } from './richtext'

export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297
export const PAGE_NUMBER_RESERVE_MM = 8
/** Visual gap between pages in the preview, in the unscaled layout. */
export const PAGE_GAP_MM = 5

export type FlowItem =
  | { id: string; kind: 'divider'; questionIndex: number; keepWithNext: true }
  | { id: string; kind: 'row'; questionIndex: number; branchIndex: number | null; keepWithNext?: boolean }

/** Flattens the document into the atomic units the paginator packs into pages. */
export function buildFlow(doc: Doc): FlowItem[] {
  const items: FlowItem[] = []
  const last = doc.questions.length - 1

  doc.questions.forEach((question, questionIndex) => {
    const hasStem = !isBlank(question.text) || question.branches.length === 0
    if (hasStem) {
      items.push({ id: `q:${question.id}`, kind: 'row', questionIndex, branchIndex: null, keepWithNext: question.branches.length > 0 })
    }
    question.branches.forEach((branch, branchIndex) => {
      items.push({ id: `b:${branch.id}`, kind: 'row', questionIndex, branchIndex })
    })
    if (questionIndex < last && question.divider !== 'none') {
      items.push({ id: `d:${question.id}`, kind: 'divider', questionIndex, keepWithNext: true })
    }
  })

  return items
}

interface PaginateOptions {
  /** Usable height of one page in px, i.e. A4 minus vertical padding. */
  bodyHeight: number
  headerHeight: number
  footerHeight: number
  repeatHeader: boolean
  repeatFooter: boolean
}

export interface Pagination {
  pages: FlowItem[][]
  /** Items that cannot fit on any page even alone. */
  overflowing: Set<string>
}

export function paginate(items: FlowItem[], heights: Map<string, number>, options: PaginateOptions): Pagination {
  const { bodyHeight, headerHeight, footerHeight, repeatHeader, repeatFooter } = options
  const overflowing = new Set<string>()

  // keepWithNext chains travel together so a divider never ends a page alone.
  const chunks: FlowItem[][] = []
  let chunk: FlowItem[] = []
  for (const item of items) {
    chunk.push(item)
    if (!item.keepWithNext) {
      chunks.push(chunk)
      chunk = []
    }
  }
  if (chunk.length) chunks.push(chunk)

  const heightOf = (chunkItems: FlowItem[]) =>
    chunkItems.reduce((total, item) => total + (heights.get(item.id) ?? 0), 0)

  const capacity = (pageIndex: number) => {
    let available = bodyHeight
    if (pageIndex === 0 || repeatHeader) available -= headerHeight
    if (repeatFooter) available -= footerHeight
    return Math.max(available, 0)
  }

  const pages: FlowItem[][] = [[]]
  let remaining = capacity(0)

  for (const group of chunks) {
    const height = heightOf(group)
    if (height > capacity(pages.length - 1) && pages[pages.length - 1].length === 0) {
      // Taller than an empty page: place it anyway and flag it.
      group.forEach((item) => overflowing.add(item.id))
      pages[pages.length - 1].push(...group)
      remaining = 0
      continue
    }
    if (height > remaining && pages[pages.length - 1].length > 0) {
      pages.push([])
      remaining = capacity(pages.length - 1)
      if (height > remaining) group.forEach((item) => overflowing.add(item.id))
    }
    pages[pages.length - 1].push(...group)
    remaining -= height
  }

  // A divider only earns its keep between two questions on the same page.
  const lastPage = pages[pages.length - 1]
  while (lastPage.length && lastPage[lastPage.length - 1].kind === 'divider') lastPage.pop()
  for (let index = 1; index < pages.length; index++) {
    while (pages[index].length && pages[index][0].kind === 'divider') pages[index].shift()
  }

  if (!repeatFooter && footerHeight > 0 && remaining < footerHeight && lastPage.length > 0) {
    pages.push([])
  }

  return { pages, overflowing }
}

let pxPerMmCache: number | null = null

/**
 * Browsers only give us px, so we ask one for the current mm→px factor. The probe
 * is fixed-position and the result cached: a probe that grows the document would
 * feed straight back into the ResizeObserver watching the preview.
 */
export function measurePxPerMm(): number {
  if (pxPerMmCache !== null) return pxPerMmCache
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;height:100mm;width:1mm;'
  document.body.appendChild(probe)
  const value = probe.getBoundingClientRect().height / 100
  probe.remove()
  pxPerMmCache = value || 96 / 25.4
  return pxPerMmCache
}

/** Browser zoom changes the factor, so drop the cache when the window resizes. */
export function invalidatePxPerMm() {
  pxPerMmCache = null
}
