/**
 * A flat reading of a field's text, with a way back into the DOM.
 *
 * The spelling check works on plain text but has to draw underlines over real
 * glyphs and replace real words, so every offset in that string needs to map
 * back to a text node and an offset inside it.
 */

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'OL', 'UL'])

export interface TextMap {
  text: string
  segments: { node: Text; start: number }[]
}

function blockAncestor(node: Node, root: HTMLElement): Element | null {
  let el = node.parentElement
  while (el && el !== root) {
    if (BLOCK_TAGS.has(el.tagName)) return el
    el = el.parentElement
  }
  return null
}

/**
 * Block boundaries and `<br>` become newlines. Without them "a<div>b</div>"
 * reads as "ab" and the checker sees a word that was never typed.
 */
export function readTextMap(root: HTMLElement): TextMap {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  const segments: { node: Text; start: number }[] = []
  let text = ''
  let lastBlock: Element | null = null
  let seenText = false

  let node = walker.nextNode()
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).tagName === 'BR') text += '\n'
      node = walker.nextNode()
      continue
    }
    const textNode = node as Text
    const block = blockAncestor(textNode, root)
    if (seenText && block !== lastBlock) text += '\n'
    lastBlock = block
    seenText = true
    segments.push({ node: textNode, start: text.length })
    text += textNode.data
    node = walker.nextNode()
  }

  return { text, segments }
}

/**
 * `preferStart` decides which side of a segment boundary an offset belongs to:
 * the start of a range wants the segment that follows, the end wants the one
 * before, so a word split across two spans still yields one range.
 */
function locate(map: TextMap, offset: number, preferStart: boolean): { node: Text; offset: number } | null {
  let fallback: { node: Text; offset: number } | null = null
  for (const segment of map.segments) {
    const end = segment.start + segment.node.data.length
    if (offset < segment.start) continue
    if (offset < end || (offset === end && !preferStart)) {
      return { node: segment.node, offset: offset - segment.start }
    }
    if (offset === end) fallback = { node: segment.node, offset: offset - segment.start }
  }
  return fallback
}

export function rangeAt(map: TextMap, from: number, to: number): Range | null {
  const start = locate(map, from, true)
  const end = locate(map, to, false)
  if (!start || !end) return null
  try {
    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    return range
  } catch {
    return null
  }
}

/** The flat offset of a DOM position, for turning a caret into an index. */
export function offsetAt(map: TextMap, node: Node, offset: number): number | null {
  const target = node.nodeType === Node.TEXT_NODE ? node : node.childNodes[offset] ?? node
  for (const segment of map.segments) {
    if (segment.node === target) return segment.start + (node.nodeType === Node.TEXT_NODE ? offset : 0)
  }
  // The caret sits in an element rather than a text node — fall back to the
  // nearest segment that the position precedes.
  for (const segment of map.segments) {
    const position = target.compareDocumentPosition(segment.node)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return segment.start
  }
  const last = map.segments[map.segments.length - 1]
  return last ? last.start + last.node.data.length : null
}

/**
 * Letters, marks and digits in any script — the boundary test that keeps
 * "اربع" from matching inside "اربعة", and "an" from matching inside "answer".
 */
const WORD_CHAR = /[\p{L}\p{M}\p{N}_]/u

/**
 * The clitic strings Arabic actually glues onto the front of a word. A set, not
 * a character class: a run of those letters is not the same thing as a real
 * prefix, and matching any run turns "كلام" into a hit for "لام".
 */
const ARABIC_PREFIXES = new Set([
  'ال', 'و', 'ف', 'ب', 'ك', 'ل', 'وال', 'فال', 'بال', 'كال', 'لل', 'ولل', 'فلل', 'وب', 'ول', 'فب', 'فل', 'بالـ',
])

/** Short words are where a prefix match is most likely to be a coincidence. */
const MIN_PREFIXED_LENGTH = 4

/**
 * Every whole-word occurrence of `word`.
 *
 * The search is case-folded, which is safe for the two scripts in play here:
 * Latin and Arabic both keep their length under `toLowerCase`, so offsets in
 * the folded haystack are offsets in the original.
 *
 * The boundary test is what keeps "اربع" from matching inside "اربعة" and "an"
 * from matching inside "answer". It costs one thing: the checker sometimes
 * names the bare word where the text has a clitic glued on the front — it
 * reports "الرابطه" for "والرابطه" — so an occurrence preceded by a real prefix
 * counts too, and the match is widened to include it. The end boundary stays
 * strict either way, because an Arabic suffix makes it a different word.
 */
export function findWord(text: string, word: string): [number, number][] {
  const needle = word.trim().toLowerCase()
  if (!needle) return []

  const haystack = text.toLowerCase()
  if (haystack.length !== text.length) return []

  const found: [number, number][] = []
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) break
    from = at + Math.max(1, needle.length)

    const end = at + needle.length
    if (WORD_CHAR.test(end < haystack.length ? haystack[end] : '')) continue

    const before = at > 0 ? haystack[at - 1] : ''
    if (!WORD_CHAR.test(before)) {
      found.push([at, end])
      continue
    }
    if (needle.length < MIN_PREFIXED_LENGTH) continue

    // Walk back to the previous boundary and accept only a real prefix.
    let start = at
    while (start > 0 && WORD_CHAR.test(haystack[start - 1])) start--
    if (ARABIC_PREFIXES.has(haystack.slice(start, at))) found.push([start, end])
  }
  return found
}
