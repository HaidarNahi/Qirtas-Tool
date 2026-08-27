import { useEffect, useRef, type ReactNode } from 'react'
import { t } from '../lib/i18n'

/** Short buzz for actions with consequences; ignored where unsupported. */
export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported */
  }
}

export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
  compact,
  block,
}: {
  value: V
  options: { value: V; label: ReactNode; title?: string }[]
  onChange: (value: V) => void
  label?: string
  compact?: boolean
  block?: boolean
}) {
  return (
    <div className={`seg ${compact ? 'seg--compact' : ''} ${block ? 'seg--block' : ''}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-label={option.title}
          className={`seg-btn ${value === option.value ? 'is-active' : ''}`}
          aria-pressed={value === option.value}
          onClick={() => {
            if (value !== option.value) haptic(8)
            onChange(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          haptic(8)
          onChange(e.target.checked)
        }}
      />
      <span className="toggle-track" aria-hidden>
        <span className="toggle-thumb" />
      </span>
    </label>
  )
}

export function IconButton({
  onClick,
  label,
  children,
  disabled,
  danger,
  size,
}: {
  onClick: () => void
  label: string
  children: ReactNode
  disabled?: boolean
  danger?: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${danger ? 'icon-btn--danger' : ''} ${size === 'sm' ? 'icon-btn--sm' : ''}`}
      onClick={() => {
        haptic(8)
        onClick()
      }}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  )
}

export function Card({
  tone,
  title,
  badge,
  actions,
  children,
  className,
}: {
  tone?: 'header' | 'question' | 'footer'
  title?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${tone ? `card--${tone}` : ''} ${className ?? ''}`}>
      {(title || actions || badge) && (
        <div className="card-head">
          {badge}
          {title && <h2 className="card-title">{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Row({ label, hint, children }: { label?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="row">
      {label && (
        <span className="row-label">
          {label}
          {hint && <span className="row-hint">{hint}</span>}
        </span>
      )}
      <div className="row-body">{children}</div>
    </div>
  )
}

/** Bottom sheet on phones, side drawer on wide screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div className={`scrim ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden />
      <aside className={`panel ${open ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-grip" aria-hidden />
        <header className="panel-head">
          <h2>{title}</h2>
          <IconButton label={t('close')} onClick={onClose}>
            <Icons.close />
          </IconButton>
        </header>
        <div className="panel-body">{children}</div>
        {footer && <div className="panel-foot">{footer}</div>}
      </aside>
    </>
  )
}

export interface ConfirmRequest {
  title: string
  body?: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (request) confirmRef.current?.focus()
  }, [request])

  if (!request) return null
  return (
    <div className="scrim is-open scrim--center" onClick={onClose}>
      <div className="dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-body">
          <h2>{request.title}</h2>
          {request.body && <p>{request.body}</p>}
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${request.danger ? 'btn--danger-solid' : 'btn--primary'}`}
            onClick={() => {
              haptic([10, 30, 10])
              request.onConfirm()
              onClose()
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export interface ToastMessage {
  id: number
  text: string
  action?: { label: string; run: () => void }
  tone?: 'default' | 'error'
  /** Called when the toast goes away without its action being used. */
  onDismiss?: () => void
}

export function Toasts({ items, onDismiss }: { items: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.tone === 'error' ? 'toast--error' : ''}`}>
          <span className="toast-text">{item.text}</span>
          {item.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                haptic(8)
                item.action!.run()
                onDismiss(item.id)
              }}
            >
              {item.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

const line = {
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
}

const GEAR_TEETH = [0, 45, 90, 135, 180, 225, 270, 315]

export const Icons = {
  up: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M12 19V5m0 0-5.5 5.5M12 5l5.5 5.5" {...line} />
    </svg>
  ),
  down: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M12 5v14m0 0 5.5-5.5M12 19l-5.5-5.5" {...line} />
    </svg>
  ),
  copy: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.6" {...line} />
      <path d="M15.5 5.5H7A2.5 2.5 0 0 0 4.5 8v8.5" {...line} />
    </svg>
  ),
  trash: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M4.5 7h15M9.5 7V5.6A1.6 1.6 0 0 1 11 4h2a1.6 1.6 0 0 1 1.6 1.6V7M7 7l.9 11.5A1.6 1.6 0 0 0 9.5 20h5a1.6 1.6 0 0 0 1.6-1.5L17 7" {...line} />
    </svg>
  ),
  plus: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M12 5.5v13M5.5 12h13" {...line} />
    </svg>
  ),
  gear: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      {GEAR_TEETH.map((angle) => (
        <rect
          key={angle}
          x="11"
          y="2.2"
          width="2"
          height="3.4"
          rx="1"
          fill="currentColor"
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="6.1" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="2.3" fill="currentColor" />
    </svg>
  ),
  download: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M12 3.5v10.5m0 0 4-4M12 14l-4-4M4.5 16.5v2A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 2-2v-2" {...line} />
    </svg>
  ),
  close: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M6.5 6.5l11 11m0-11-11 11" {...line} />
    </svg>
  ),
  branch: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M6 4.5v8a3.5 3.5 0 0 0 3.5 3.5H18" {...line} />
      <path d="M15 12.5l3.5 3.5L15 19.5" {...line} />
    </svg>
  ),
  file: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" {...line} />
      <path d="M13.5 3.5V9H19" {...line} />
    </svg>
  ),
  save: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h9L20 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 18.5z" {...line} />
      <path d="M8.5 4v5h7M8.5 20v-5.5h7V20" {...line} />
    </svg>
  ),
  open: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h3.2l2 2.2h7.8a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" {...line} />
    </svg>
  ),
  chevron: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M8 10l4 4 4-4" {...line} />
    </svg>
  ),
  check: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M5.5 12.5l4 4 9-9" {...line} />
    </svg>
  ),
  cloudOff: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M7 18.5h10a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.5-1A3.75 3.75 0 0 0 7 18.5z" {...line} />
      <path d="M4 4l16 16" {...line} />
    </svg>
  ),
  printer: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M7 9V4.5h10V9" {...line} />
      <path d="M5 9h14a2 2 0 0 1 2 2v5h-4M7 16H3v-5a2 2 0 0 1 2-2z" {...line} />
      <rect x="7" y="13.5" width="10" height="6" rx="1.4" {...line} />
    </svg>
  ),
  star: ({ filled }: { filled?: boolean }) => (
    <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden>
      <path
        d="M12 3.2l2.7 5.6 6.1.86-4.42 4.3 1.05 6.06L12 17.16l-5.43 2.86 1.05-6.06L3.2 9.66l6.1-.86z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  ),
  shield: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M12 3.5l7 2.6v5.3c0 4-2.9 7.6-7 8.9-4.1-1.3-7-4.9-7-8.9V6.1z" {...line} />
      <path d="M9 12.2l2.1 2.1 4-4.2" {...line} />
    </svg>
  ),
  sparkle: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" {...line} />
    </svg>
  ),
}
