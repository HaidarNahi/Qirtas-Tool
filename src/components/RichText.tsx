import { useEffect, useRef } from 'react'
import { sanitizeHtml, isBlank } from '../lib/richtext'

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
}

/**
 * Uncontrolled contenteditable: React writes the DOM only when the field is not
 * focused, which is what keeps the caret from jumping while typing.
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
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.innerHTML !== html) el.innerHTML = html
    el.dataset.empty = isBlank(el.innerHTML) ? 'true' : 'false'
  }, [html])

  const handleInput = () => {
    const el = ref.current
    if (!el) return
    el.dataset.empty = isBlank(el.innerHTML) ? 'true' : 'false'
    onChange(el.innerHTML)
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const clipboard = event.clipboardData
    const raw = clipboard.getData('text/html')
    const cleaned = raw
      ? sanitizeHtml(raw)
      : clipboard
          .getData('text/plain')
          .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
          .replace(/\r?\n/g, '<br>')
    document.execCommand('insertHTML', false, cleaned)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (singleLine && event.key === 'Enter') event.preventDefault()
  }

  const handleFocus = () => {
    onFocus?.()
    // The on-screen keyboard and the toolbar both eat the bottom of the screen;
    // once they have settled, make sure the caret is still somewhere visible.
    window.setTimeout(() => {
      const el = ref.current
      if (!el || document.activeElement !== el) return
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const rect = el.getBoundingClientRect()
      if (rect.bottom > viewportHeight - 150 || rect.top < 72) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }, 380)
  }

  return (
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
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={() => {
        handleInput()
        onBlur?.()
      }}
    />
  )
}
