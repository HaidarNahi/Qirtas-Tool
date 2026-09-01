/** Formatting primitives for the contenteditable fields. */

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'SUB', 'SUP', 'SPAN', 'DIV', 'P', 'BR', 'OL', 'UL', 'LI',
])

/** These are dropped with their contents; unwrapping them would leak code as text. */
const DROP_WITH_CONTENT = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT', 'SVG',
])

const ALLOWED_STYLES = new Set([
  'color', 'font-family', 'font-size', 'line-height', 'font-weight', 'font-style',
  'text-decoration', 'text-decoration-line', 'text-align',
])

/**
 * Strips anything we do not render, so pasted Word/Docs markup cannot smuggle in
 * scripts, images or layout that would break the A4 flow.
 */
export function sanitizeHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html

  const walk = (node: Node) => {
    // Live traversal: unwrapping an element promotes its children into this
    // list, and those children must themselves be checked. A snapshot taken up
    // front would let `<svg onload=…><circle/></svg>` smuggle the circle out.
    let child = node.firstChild
    while (child) {
      const next = child.nextSibling

      if (child.nodeType === Node.TEXT_NODE) {
        child = next
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove()
        child = next
        continue
      }

      const el = child as Element
      // SVG and other foreign elements report a lower-case tagName.
      const tag = el.tagName.toUpperCase()

      if (DROP_WITH_CONTENT.has(tag)) {
        el.remove()
        child = next
        continue
      }

      if (!ALLOWED_TAGS.has(tag)) {
        // Keep the words, drop the wrapper, then re-check what came out.
        const parent = el.parentNode
        const promoted = el.firstChild
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el)
          el.remove()
        }
        child = promoted ?? next
        continue
      }

      for (const attr of Array.from(el.attributes)) {
        if (attr.name !== 'style') el.removeAttribute(attr.name)
      }
      const style = el.getAttribute('style')
      if (style) {
        const kept = style
          .split(';')
          .map((rule) => rule.trim())
          .filter((rule) => {
            const prop = rule.split(':')[0]?.trim().toLowerCase()
            const value = rule.slice(rule.indexOf(':') + 1).toLowerCase()
            if (!prop || !ALLOWED_STYLES.has(prop)) return false
            return !value.includes('url(') && !value.includes('expression')
          })
        if (kept.length) el.setAttribute('style', kept.join('; '))
        else el.removeAttribute('style')
      }

      walk(el)
      child = next
    }
  }

  walk(template.content)
  return template.innerHTML
}

export function stripHtml(html: string): string {
  const div = document.createElement('div')
  // Break before each block-level tag, not after its closer, so the first line
  // of "a<div>b</div>" is "a" rather than "ab".
  div.innerHTML = html.replace(/<(div|p|li|h[1-6]|br)\b[^>]*>/gi, '\n$&')
  return (div.textContent ?? '')
    .replace(/\n{2,}/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

export function isBlank(html: string): boolean {
  return stripHtml(html).length === 0 && !/<(br|img|hr)\b/i.test(html)
}

function currentRange(): Range | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  return sel.getRangeAt(0)
}

/** The editable host that owns the current selection, if any. */
export function activeEditor(): HTMLElement | null {
  const el = document.activeElement
  if (el instanceof HTMLElement && el.isContentEditable) return el
  return null
}

export function exec(command: string, value?: string) {
  document.execCommand('styleWithCSS', false, 'false')
  document.execCommand(command, false, value)
}

export function queryState(command: string): boolean {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
}

/**
 * Nothing selected: style the whole field.
 *
 * The value has to land *inside* the field's own markup. `editor.style` lives
 * on the host element, which is never part of `innerHTML` — so a style set
 * there shows up in the editor, is never saved, never reaches the sheet or the
 * PDF, and disappears on the next reload.
 */
function styleWholeField(editor: HTMLElement, property: string, value: string, block: boolean) {
  const tag = block ? 'DIV' : 'SPAN'
  const onlyChild = editor.childNodes.length === 1 ? editor.firstChild : null

  if (onlyChild instanceof HTMLElement && onlyChild.tagName === tag) {
    // Re-use the shell an earlier whole-field style left behind: nothing moves,
    // so the caret never has to be rebuilt and the wrappers cannot stack up.
    onlyChild.style.setProperty(property, value)
    onlyChild.querySelectorAll<HTMLElement>('[style]').forEach((el) => el.style.removeProperty(property))
    editor.style.removeProperty(property)
    return
  }

  // A marker holds the caret's place across the re-wrap.
  const caret = document.createElement('span')
  const range = currentRange()
  if (range && editor.contains(range.startContainer)) range.insertNode(caret)
  else editor.appendChild(caret)

  const wrapper = document.createElement(block ? 'div' : 'span')
  wrapper.style.setProperty(property, value)
  while (editor.firstChild) wrapper.appendChild(editor.firstChild)
  wrapper.querySelectorAll<HTMLElement>('[style]').forEach((el) => el.style.removeProperty(property))
  editor.appendChild(wrapper)

  const sel = window.getSelection()
  if (sel) {
    const next = document.createRange()
    next.setStartBefore(caret)
    next.collapse(true)
    sel.removeAllRanges()
    sel.addRange(next)
  }
  caret.remove()
  editor.style.removeProperty(property)
}

/**
 * Wraps the selection in a span carrying one CSS property, clearing the same
 * property from anything inside so the newest choice wins.
 */
export function applyInlineStyle(property: string, value: string) {
  const editor = activeEditor()
  const range = currentRange()
  if (!editor) return

  if (!range || range.collapsed) {
    styleWholeField(editor, property, value, false)
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }

  const fragment = range.extractContents()
  fragment.querySelectorAll?.('[style]').forEach((el) => (el as HTMLElement).style.removeProperty(property))
  const span = document.createElement('span')
  span.style.setProperty(property, value)
  span.appendChild(fragment)
  range.insertNode(span)

  const sel = window.getSelection()
  if (sel) {
    const next = document.createRange()
    next.selectNodeContents(span)
    sel.removeAllRanges()
    sel.addRange(next)
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Line spacing reads wrong on inline spans, so it is applied to whole blocks. */
export function applyBlockStyle(property: string, value: string) {
  const editor = activeEditor()
  const range = currentRange()
  if (!editor) return

  const blocks = blocksInRange(editor, range)
  if (blocks.length === 0) {
    // No block to hang it on yet — make one, rather than styling the host.
    styleWholeField(editor, property, value, true)
  } else {
    for (const block of blocks) block.style.setProperty(property, value)
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }))
}

function blocksInRange(editor: HTMLElement, range: Range | null): HTMLElement[] {
  const candidates = Array.from(editor.querySelectorAll<HTMLElement>('div, p, li'))
  if (!range) return candidates
  const inRange = candidates.filter((el) => range.intersectsNode(el))
  return inRange.length ? inRange : candidates
}

export function clearFormatting() {
  const editor = activeEditor()
  const range = currentRange()
  if (!editor) return
  if (range && !range.collapsed) {
    document.execCommand('removeFormat')
    // removeFormat only unwinds inline formatting, so line spacing applied to a
    // block survives it. Strip what is left from the *live* elements the
    // selection covers: a cloned fragment gets thrown away with the styles
    // still on it, which is how this used to do nothing at all.
    const after = currentRange() ?? range
    for (const el of Array.from(editor.querySelectorAll<HTMLElement>('[style]'))) {
      if (after.intersectsNode(el)) el.removeAttribute('style')
    }
  } else {
    // The host's style attribute belongs to React (the field's typography) and
    // is not the teacher's formatting — only what is inside the field is.
    editor.querySelectorAll<HTMLElement>('[style]').forEach((el) => el.removeAttribute('style'))
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Reads back the property in force at the caret, for toolbar state. */
export function currentStyleValue(property: string): string | null {
  const editor = activeEditor()
  const sel = window.getSelection()
  if (!editor) return null
  let node: Node | null = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : editor
  if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode
  if (!(node instanceof HTMLElement)) return null
  return getComputedStyle(node).getPropertyValue(property) || null
}

let saved: { editor: HTMLElement; range: Range } | null = null

/** Native selects steal focus; these keep the caret alive across that round trip. */
export function saveSelection() {
  const editor = activeEditor()
  const sel = window.getSelection()
  if (editor && sel && sel.rangeCount) {
    saved = { editor, range: sel.getRangeAt(0).cloneRange() }
  }
}

export function restoreSelection(): boolean {
  if (!saved || !saved.editor.isConnected) return false
  saved.editor.focus({ preventScroll: true })
  const sel = window.getSelection()
  if (!sel) return false
  sel.removeAllRanges()
  sel.addRange(saved.range)
  return true
}

/** Drops one string in at the caret, keeping the browser's own undo stack. */
export function insertText(text: string) {
  const editor = activeEditor()
  if (!editor) return
  document.execCommand('insertText', false, text)
  editor.dispatchEvent(new Event('input', { bubbles: true }))
}

export function withSelection(action: () => void) {
  if (!activeEditor()) restoreSelection()
  action()
  saveSelection()
}


function toPt(value: string): number | null {
  const amount = parseFloat(value)
  if (!Number.isFinite(amount)) return null
  if (value.endsWith('pt')) return Math.round(amount)
  if (value.endsWith('px')) return Math.round(amount * 0.75)
  return null
}

/**
 * Only an explicitly applied size counts. The computed value would report the
 * editor card's own UI size, which has nothing to do with the printed sheet.
 */
export function explicitFontSizePt(): number | null {
  const editor = activeEditor()
  const sel = window.getSelection()
  if (!editor) return null

  let node: Node | null = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null
  if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode
  let el = node instanceof HTMLElement ? node : null
  while (el && el !== editor) {
    const size = el.style?.fontSize
    if (size) return toPt(size)
    el = el.parentElement
  }
  return editor.style.fontSize ? toPt(editor.style.fontSize) : null
}
