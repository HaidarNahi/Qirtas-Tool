import { useEffect, useRef, useState } from 'react'
import type { FontKey } from '../lib/types'
import { FONT_LABELS, FONT_STACKS } from '../lib/types'
import { t } from '../lib/i18n'
import {
  applyBlockStyle,
  applyInlineStyle,
  clearFormatting,
  currentStyleValue,
  exec,
  explicitFontSizePt,
  insertText,
  queryState,
  saveSelection,
  withSelection,
} from '../lib/richtext'
import { SYMBOL_GROUPS } from '../lib/symbols'

const COLORS = ['#000000', '#3F3F46', '#B91C1C', '#1D4ED8', '#2B6640', '#B45309', '#6D28D9']
const SPACINGS = [1, 1.15, 1.3, 1.5, 1.8, 2, 2.5]
const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32]

interface Props {
  visible: boolean
  defaultSize: number
}

export default function Toolbar({ visible, defaultSize }: Props) {
  const [, force] = useState(0)
  const [panel, setPanel] = useState<'color' | 'spacing' | 'symbols' | null>(null)
  const [group, setGroup] = useState(SYMBOL_GROUPS[0].id)
  const rootRef = useRef<HTMLDivElement>(null)

  // The toolbar grows when a popover opens; the editor needs to know by how
  // much so the field being edited never ends up underneath it.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const publish = () =>
      document.documentElement.style.setProperty('--toolbar-h', `${el.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Toolbar state has to follow the caret, which React cannot observe directly.
  useEffect(() => {
    if (!visible) return
    const refresh = () => force((n) => n + 1)
    document.addEventListener('selectionchange', refresh)
    return () => document.removeEventListener('selectionchange', refresh)
  }, [visible])

  useEffect(() => {
    if (!visible) setPanel(null)
  }, [visible])

  const hold = (event: React.PointerEvent | React.MouseEvent) => {
    event.preventDefault()
    saveSelection()
  }

  const run = (fn: () => void) => () => withSelection(fn)

  const currentSize = () => explicitFontSizePt() ?? defaultSize

  const currentFont = (): FontKey | '' => {
    const value = (currentStyleValue('font-family') ?? '').toLowerCase()
    if (!value) return ''
    if (value.includes('times')) return 'times'
    if (value.includes('arial') || value.includes('helvetica')) return 'arial'
    if (value.includes('plex')) return 'ibmArabic'
    if (value.includes('inter')) return 'inter'
    return ''
  }

  const size = currentSize()

  const cmd = (command: string, label: string, icon: React.ReactNode, active?: boolean) => (
    <button
      type="button"
      className={`tb-btn ${active ? 'is-active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onPointerDown={hold}
      onClick={run(() => exec(command))}
    >
      {icon}
    </button>
  )

  return (
    <div
      ref={rootRef}
      className={`toolbar ${visible ? 'is-visible' : ''}`}
      data-toolbar="true"
      role="toolbar"
      aria-label={t('formatting')}
    >
      {panel === 'color' && (
        <div className="tb-panel" data-toolbar="true">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="tb-swatch"
              style={{ background: color }}
              aria-label={color}
              onPointerDown={hold}
              onClick={run(() => applyInlineStyle('color', color))}
            />
          ))}
          <label className="tb-swatch tb-swatch--custom" title={t('textColor')}>
            <input
              type="color"
              onPointerDown={() => saveSelection()}
              onChange={(e) => withSelection(() => applyInlineStyle('color', e.target.value))}
            />
          </label>
        </div>
      )}

      {panel === 'spacing' && (
        <div className="tb-panel" data-toolbar="true">
          {SPACINGS.map((value) => (
            <button
              key={value}
              type="button"
              className="tb-chip"
              onPointerDown={hold}
              onClick={run(() => applyBlockStyle('line-height', String(value)))}
            >
              {value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}
            </button>
          ))}
        </div>
      )}

      {panel === 'symbols' && (
        <div className="tb-panel tb-panel--symbols" data-toolbar="true">
          <div className="tb-tabs" role="tablist" aria-label={t('symbols')}>
            {SYMBOL_GROUPS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={group === item.id}
                className={`tb-chip ${group === item.id ? 'is-active' : ''}`}
                onPointerDown={hold}
                onClick={() => setGroup(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="tb-symbols">
            {(SYMBOL_GROUPS.find((item) => item.id === group) ?? SYMBOL_GROUPS[0]).symbols.map((symbol) => (
              <button
                key={symbol}
                type="button"
                className="tb-sym"
                aria-label={symbol}
                onPointerDown={hold}
                onClick={run(() => insertText(symbol))}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="tb-row tb-row--main">
        {cmd('bold', t('bold'), <strong>B</strong>, queryState('bold'))}
        {cmd('italic', t('italic'), <em>I</em>, queryState('italic'))}
        {cmd('underline', t('underline'), <u>U</u>, queryState('underline'))}
        <span className="tb-sep" />
        {cmd('subscript', t('subscript'), <span>X<sub>2</sub></span>, queryState('subscript'))}
        {cmd('superscript', t('superscript'), <span>X<sup>2</sup></span>, queryState('superscript'))}
        <span className="tb-sep" />
        {cmd('insertOrderedList', t('orderedList'), <IconOrdered />, queryState('insertOrderedList'))}
        {cmd('insertUnorderedList', t('unorderedList'), <IconUnordered />, queryState('insertUnorderedList'))}
        <span className="tb-sep" />
        <button
          type="button"
          className="tb-btn"
          title={t('clearFormat')}
          aria-label={t('clearFormat')}
          onPointerDown={hold}
          onClick={run(clearFormatting)}
        >
          <IconClear />
        </button>
      </div>

      <div className="tb-row tb-row--secondary">
        {/* First in the row, so RTL puts it under the thumb rather than off the
            left edge — this row overflows and scrolls on a 375px phone. */}
        <button
          type="button"
          className={`tb-btn tb-btn--wide ${panel === 'symbols' ? 'is-active' : ''}`}
          title={t('symbols')}
          aria-label={t('symbols')}
          onPointerDown={hold}
          onClick={() => setPanel(panel === 'symbols' ? null : 'symbols')}
        >
          <IconSymbols />
        </button>

        <select
          className="tb-select"
          value={currentFont()}
          aria-label={t('font')}
          onPointerDown={() => saveSelection()}
          onChange={(e) => {
            const key = e.target.value as FontKey
            if (key) withSelection(() => applyInlineStyle('font-family', FONT_STACKS[key]))
          }}
        >
          <option value="">{t('font')}</option>
          {(Object.keys(FONT_LABELS) as FontKey[]).map((key) => (
            <option key={key} value={key} style={{ fontFamily: FONT_STACKS[key] }}>
              {FONT_LABELS[key]}
            </option>
          ))}
        </select>

        <div className="tb-stepper" aria-label={t('textSize')}>
          <button
            type="button"
            className="tb-btn tb-btn--sm"
            aria-label="−"
            onPointerDown={hold}
            onClick={run(() => {
              const next = SIZES.filter((s) => s < size).pop() ?? SIZES[0]
              applyInlineStyle('font-size', `${next}pt`)
            })}
          >
            −
          </button>
          <span className="tb-size">{size}</span>
          <button
            type="button"
            className="tb-btn tb-btn--sm"
            aria-label="+"
            onPointerDown={hold}
            onClick={run(() => {
              const next = SIZES.find((s) => s > size) ?? SIZES[SIZES.length - 1]
              applyInlineStyle('font-size', `${next}pt`)
            })}
          >
            +
          </button>
        </div>

        <button
          type="button"
          className={`tb-btn tb-btn--wide ${panel === 'spacing' ? 'is-active' : ''}`}
          title={t('lineSpacing')}
          onPointerDown={hold}
          onClick={() => setPanel(panel === 'spacing' ? null : 'spacing')}
        >
          <IconSpacing />
        </button>

        <button
          type="button"
          className={`tb-btn tb-btn--wide ${panel === 'color' ? 'is-active' : ''}`}
          title={t('textColor')}
          onPointerDown={hold}
          onClick={() => setPanel(panel === 'color' ? null : 'color')}
        >
          <IconColor />
        </button>
      </div>
    </div>
  )
}

const stroke = { stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, fill: 'none' }

function IconOrdered() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <g {...stroke}>
        <path d="M8 5h9M8 10h9M8 15h9" />
      </g>
      <text x="1.5" y="7" fontSize="6" fill="currentColor">1</text>
      <text x="1.5" y="12" fontSize="6" fill="currentColor">2</text>
      <text x="1.5" y="17" fontSize="6" fill="currentColor">3</text>
    </svg>
  )
}

function IconUnordered() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <g {...stroke}>
        <path d="M8 5h9M8 10h9M8 15h9" />
      </g>
      <g fill="currentColor">
        <circle cx="3.5" cy="5" r="1.5" />
        <circle cx="3.5" cy="10" r="1.5" />
        <circle cx="3.5" cy="15" r="1.5" />
      </g>
    </svg>
  )
}

function IconSpacing() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <g {...stroke}>
        <path d="M8 4h9M8 10h9M8 16h9" />
        <path d="M3.5 5.5V14.5" />
        <path d="M1.8 7.2 3.5 5.4l1.7 1.8M1.8 12.8l1.7 1.8 1.7-1.8" />
      </g>
    </svg>
  )
}

function IconColor() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <path d="M5 13 9.6 3.5h.8L15 13" {...stroke} />
      <path d="M6.6 10h6.8" {...stroke} />
      <rect x="3" y="15" width="14" height="3" rx="1.2" fill="currentColor" />
    </svg>
  )
}

function IconSymbols() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <text x="10" y="14" fontSize="13" textAnchor="middle" fill="currentColor" fontWeight="600">
        π
      </text>
      <path d="M2.5 3.2h4M4.5 1.2v4" {...stroke} strokeWidth={1.4} />
      <path d="M13.6 17h4M15.6 15v4" {...stroke} strokeWidth={1.4} />
    </svg>
  )
}

function IconClear() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <g {...stroke}>
        <path d="M7 4h9M10.5 4 7.5 16" />
        <path d="M3 16h6" />
        <path d="M13 11.5 17 15.5M17 11.5 13 15.5" />
      </g>
    </svg>
  )
}
