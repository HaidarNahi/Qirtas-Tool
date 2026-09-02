import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { sanitizeHtml, isBlank } from '../lib/richtext'
import { registerField, updateField, type Issue, type IssueType } from '../lib/spellcheck'
import { findWord, rangeAt, readTextMap, offsetAt } from '../lib/textmap'
import { useSpellcheckSettings } from './SpellcheckProvider'
import { t } from '../lib/i18n'

interface Props {
  html: string
  onChange: (html: string) => void
  onFocus?: () => void
  onBlur?: () => void
  dir?: 'rtl' | 'ltr'
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  singleLine?: boolean
  ariaLabel?: string
  /** Layout role the wrapper has to take over from the field it wraps. */
  wrapClassName?: string
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

interface Mark {
  key: string
  type: IssueType
  word: string
  suggestion: string
  from: number
  to: number
  rects: Rect[]
}

/**
 * Uncontrolled contenteditable: React writes the DOM only when the field is not
 * focused, which is what keeps the caret from jumping while typing.
 *
 * The spelling marks are drawn in a sibling layer rather than injected into the
 * field. Wrapping words in `<span class="misspelled">` would put the checker's
 * opinion into the teacher's saved document, fight the caret on every edit, and
 * get stripped by the sanitiser on the next load anyway.
 */
export default function RichText({
  html,
  onChange,
  onFocus,
  onBlur,
  dir,
  placeholder,
  className,
  style,
  singleLine,
  ariaLabel,
  wrapClassName,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fieldId = useId()
  const { enabled } = useSpellcheckSettings()

  const [issues, setIssues] = useState<Issue[]>([])
  const [marks, setMarks] = useState<Mark[]>([])
  const [caret, setCaret] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.innerHTML !== html) el.innerHTML = html
    el.dataset.empty = isBlank(el.innerHTML) ? 'true' : 'false'
  }, [html])

  const handleInput = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.dataset.empty = isBlank(el.innerHTML) ? 'true' : 'false'
    onChange(el.innerHTML)
  }, [onChange])

  /* ---------------------------------------------------------- spellcheck */

  /**
   * The field joins a shared sweep rather than asking on its own — see
   * `sweep` in lib/spellcheck. It is handed the issues found across every
   * field on screen and keeps the ones whose words appear in its own text.
   */
  useEffect(() => {
    if (!enabled) {
      setIssues([])
      return
    }
    return registerField(fieldId, setIssues)
  }, [enabled, fieldId])

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    updateField(fieldId, readTextMap(el).text)
  }, [html, enabled, fieldId])

  /**
   * Marks are positioned from live client rects, so they follow the text
   * through wrapping, zooming and a font swapping in underneath them.
   */
  const measure = useCallback(() => {
    const el = ref.current
    const wrap = wrapRef.current
    if (!el || !wrap || issues.length === 0) {
      setMarks((current) => (current.length === 0 ? current : []))
      return
    }

    const map = readTextMap(el)
    const base = wrap.getBoundingClientRect()
    const found: Mark[] = []

    for (const issue of issues) {
      for (const [from, to] of findWord(map.text, issue.word)) {
        const range = rangeAt(map, from, to)
        if (!range) continue
        const rects = mergeLines(
          Array.from(range.getClientRects())
            .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
            .map((rect) => ({
              left: rect.left - base.left,
              top: rect.top - base.top,
              width: rect.width,
              height: rect.height,
            })),
        )
        if (rects.length === 0) continue
        found.push({ key: `${issue.type}:${from}:${to}`, ...issue, from, to, rects })
      }
    }
    setMarks(found)
  }, [issues])

  useLayoutEffect(() => {
    measure()
  }, [measure, html])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    window.addEventListener('resize', measure)
    // A font arriving late re-flows every line under it.
    void document.fonts?.ready.then(measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  /**
   * The suggestion follows the caret, so it appears as you type through a word.
   *
   * Whether this field owns the caret is read from `document.activeElement` at
   * the moment it matters, not from a React flag: focus can move without an
   * event this component sees, and a stale flag means the suggestion silently
   * stops appearing.
   */
  const readCaret = useCallback(() => {
    const el = ref.current
    if (!el || document.activeElement !== el) return setCaret(null)
    const selection = window.getSelection()
    if (!selection?.focusNode || !el.contains(selection.focusNode)) return setCaret(null)
    setCaret(offsetAt(readTextMap(el), selection.focusNode, selection.focusOffset))
  }, [])

  useEffect(() => {
    // Fields that do not hold the caret bail out on the first line, and
    // setCaret(null) on an already-null state is a no-op React drops.
    document.addEventListener('selectionchange', readCaret)
    return () => document.removeEventListener('selectionchange', readCaret)
  }, [readCaret])

  const active =
    caret === null
      ? null
      : marks.find((mark) => mark.type === 'spelling' && caret >= mark.from && caret <= mark.to) ?? null

  const applySuggestion = (mark: Mark) => {
    const el = ref.current
    if (!el || !mark.suggestion) return
    const map = readTextMap(el)
    const found = map.text.slice(mark.from, mark.to)
    // The offsets were measured against an earlier reading of the field, so
    // check they still point at the word before touching anything.
    //
    // The span can be wider than the word: findWord deliberately widens a bare
    // checker result like "الرابطه" to cover "والرابطه", so the match carries a
    // clitic the suggestion does not. Comparing the whole span against the word
    // rejected exactly the matches that widening exists to support — the prefix
    // is kept and the corrected word put after it.
    if (!found.toLowerCase().endsWith(mark.word.toLowerCase())) return
    const prefix = found.slice(0, found.length - mark.word.length)

    const range = rangeAt(map, mark.from, mark.to)
    if (!range) return
    range.deleteContents()
    const replacement = document.createTextNode(prefix + mark.suggestion)
    range.insertNode(replacement)

    const selection = window.getSelection()
    if (selection) {
      const next = document.createRange()
      next.setStartAfter(replacement)
      next.collapse(true)
      selection.removeAllRanges()
      selection.addRange(next)
    }
    el.focus({ preventScroll: true })
    // Drop it straight away rather than waiting out the debounce: the word is
    // fixed, and leaving the underline under it for a second reads as a failure.
    setIssues((current) => current.filter((issue) => issue.word !== mark.word))
    handleInput()
  }

  /**
   * Takes an obscenity out of the text, on request only.
   *
   * The mark itself never touches the document — a teacher who meant to write
   * the word keeps it, and the PDF is the same either way. This runs when the
   * warning above the word is tapped, and nothing else removes anything.
   */
  const removeWord = (mark: Mark) => {
    const el = ref.current
    if (!el) return
    const map = readTextMap(el)
    // The offsets were measured against an earlier reading of the field, so
    // check they still point at the word before deleting anything.
    if (!map.text.slice(mark.from, mark.to).toLowerCase().endsWith(mark.word.toLowerCase())) return

    // Swallow one neighbouring space too, or removing a word from the middle of
    // a sentence leaves a gap where it used to be.
    let from = mark.from
    let to = mark.to
    if (map.text[to] === ' ') to += 1
    else if (from > 0 && map.text[from - 1] === ' ') from -= 1

    const range = rangeAt(map, from, to)
    const selection = window.getSelection()
    if (!range || !selection) return

    selection.removeAllRanges()
    selection.addRange(range)
    el.focus({ preventScroll: true })
    // Deliberately execCommand rather than range.deleteContents(): it goes on
    // the browser's own undo stack, so a badge tapped by accident is one ⌘Z
    // away from being undone. A direct DOM mutation is not undoable at all,
    // and this button sits on top of the text it would remove.
    document.execCommand('delete')

    // The marks are re-measured from the new text, so the same word elsewhere
    // in the field keeps its own warning.
    handleInput()
  }

  /* -------------------------------------------------------------- editing */

  /** Shared by paste and drop — both bring in markup the app did not write. */
  const insertExternal = (data: DataTransfer | null) => {
    if (!data) return
    const raw = data.getData('text/html')
    const cleaned = raw
      ? sanitizeHtml(raw)
      : data
          .getData('text/plain')
          .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
          .replace(/\r?\n/g, '<br>')
    document.execCommand('insertHTML', false, cleaned)
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    insertExternal(event.clipboardData)
  }

  // Dropping is the other way markup gets in, and it used to skip the
  // sanitiser entirely — straight into a field that is rendered with
  // dangerouslySetInnerHTML.
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    insertExternal(event.dataTransfer)
    handleInput()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (singleLine && event.key === 'Enter') event.preventDefault()
  }

  const handleFocus = () => {
    readCaret()
    onFocus?.()
    // The on-screen keyboard and the toolbar both eat the bottom of the screen;
    // once they have settled, make sure the caret is still somewhere visible.
    window.setTimeout(() => {
      const el = ref.current
      if (!el || document.activeElement !== el) return
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const toolbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-h')) || 150
      const rect = el.getBoundingClientRect()
      if (rect.bottom > viewportHeight - toolbar - 16 || rect.top < 72) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }, 380)
  }

  return (
    <div ref={wrapRef} className={`rt-wrap ${wrapClassName ?? ''}`}>
      <div
        ref={ref}
        role="textbox"
        aria-label={ariaLabel ?? placeholder}
        aria-multiline={!singleLine}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        dir={dir}
        data-placeholder={placeholder}
        data-empty="true"
        className={`rt ${className ?? ''}`}
        style={style}
        onInput={handleInput}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={() => {
          setCaret(null)
          handleInput()
          onBlur?.()
        }}
      />

      {marks.length > 0 && (
        <div className="rt-marks">
          {marks.map((mark) => (
            <Fragment key={mark.key}>
              {mark.rects.map((rect, index) => (
                <span
                  key={index}
                  className={mark.type === 'profanity' ? 'rt-flag' : 'rt-underline'}
                  style={toStyle(rect)}
                  aria-hidden
                />
              ))}
              {/* One warning per word, not per line, so a word that wraps does
                  not sprout a second button on the line it wrapped onto. */}
              {mark.type === 'profanity' && mark.rects[0] && (
                <button
                  type="button"
                  className="rt-flag-del"
                  style={{
                    left: `${mark.rects[0].left + mark.rects[0].width / 2}px`,
                    top: `${mark.rects[0].top}px`,
                  }}
                  aria-label={`${t('removeWord')}: ${mark.word}`}
                  title={t('removeWord')}
                  // The field must not lose focus, or the button unmounts
                  // before the click meant for it lands.
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => removeWord(mark)}
                >
                  <IconWarn />
                </button>
              )}
            </Fragment>
          ))}
        </div>
      )}

      {active && active.rects[0] && (
        <button
          type="button"
          className="rt-suggest"
          style={{ left: `${active.rects[0].left}px`, top: `${active.rects[0].top}px` }}
          title={t('applySuggestion')}
          // Keeps the caret where it is; the field must not lose focus, or the
          // chip unmounts before the click that was meant for it lands.
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applySuggestion(active)}
        >
          <span className="rt-suggest-word">{active.suggestion}</span>
        </button>
      )}
    </div>
  )
}

/**
 * One box per line, not one per glyph.
 *
 * `Range.getClientRects()` hands back a rect per character here — bidi text in a
 * contenteditable splits into that many runs — which drew a separate underline
 * segment under every letter. Rects on the same line get folded into the span
 * they cover; a word that wraps still gets one box per line, which is what the
 * underline and the obscenity frame both want.
 */
function mergeLines(rects: Rect[]): Rect[] {
  if (rects.length < 2) return rects
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: Rect[] = []

  for (const rect of sorted) {
    const line = lines[lines.length - 1]
    // Same line when the vertical overlap is most of the glyph height.
    if (line && rect.top < line.top + line.height * 0.5) {
      const left = Math.min(line.left, rect.left)
      const right = Math.max(line.left + line.width, rect.left + rect.width)
      line.left = left
      line.width = right - left
      line.top = Math.min(line.top, rect.top)
      line.height = Math.max(line.height, rect.height)
    } else {
      lines.push({ ...rect })
    }
  }
  return lines
}

function toStyle(rect: Rect): React.CSSProperties {
  return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }
}

/** The badge that sits above a flagged word and removes it when tapped. */
function IconWarn() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
      <path
        d="M8 1.6 15 14H1z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8 5.6v3.6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="1" fill="#fff" />
    </svg>
  )
}
