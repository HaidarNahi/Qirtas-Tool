import { useState } from 'react'
import type { BranchStyle, Dir, Doc, DividerStyle, FontKey, NumeralStyle, PagePadding } from '../lib/types'
import { FONT_LABELS, FONT_STACKS } from '../lib/types'
import { t } from '../lib/i18n'
import { Icons, Row, Segmented, Sheet, Toggle, haptic } from './ui'
import {
  APP_VERSION,
  COPYRIGHT_YEAR,
  DEVELOPER,
  DEVELOPER_URL,
  RATING_ENABLED,
} from '../lib/config'
import { spellcheckConfigured } from '../lib/spellcheck'

const SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24]
const SPACINGS = [1, 1.15, 1.3, 1.5, 1.8, 2, 2.5]
const DEFAULT_PADDING: PagePadding = { top: 14, right: 14, bottom: 12, left: 14 }
const MAX_PADDING = 40

interface Props {
  open: boolean
  onClose: () => void
  doc: Doc
  setDoc: (updater: (doc: Doc) => Doc) => void
  onNew: () => void
  onSample: () => void
  onExport: () => void
  onImport: (file: File) => void
  onPrint: () => void
  onRate: () => void
  onPrivacy: () => void
  alreadyRated: boolean
  storageWorks: boolean
  spellcheck: boolean
  onSpellcheck: (enabled: boolean) => void
}

export default function SettingsPanel({
  open,
  onClose,
  doc,
  setDoc,
  onNew,
  onSample,
  onExport,
  onImport,
  onPrint,
  onRate,
  onPrivacy,
  alreadyRated,
  storageWorks,
  spellcheck,
  onSpellcheck,
}: Props) {
  const [linked, setLinked] = useState(true)

  const setPadding = (patch: Partial<PagePadding>) =>
    setDoc((current) => ({ ...current, padding: { ...current.padding, ...patch } }))
  const setAll = (value: number) => setPadding({ top: value, right: value, bottom: value, left: value })
  const clamp = (value: number) => Math.min(MAX_PADDING, Math.max(0, Math.round(value)))

  const step = (key: keyof PagePadding, delta: number) => {
    haptic(6)
    const next = clamp(doc.padding[key] + delta)
    if (linked) setAll(next)
    else setPadding({ [key]: next })
  }

  const paddingInput = (key: keyof PagePadding, label: string) => (
    <div className="pad-input">
      <span className="pad-label">{label}</span>
      <div className="stepper">
        <button type="button" onClick={() => step(key, -1)} aria-label={`${label} −`}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_PADDING}
          value={doc.padding[key]}
          aria-label={label}
          onChange={(e) => {
            const value = clamp(Number(e.target.value) || 0)
            if (linked) setAll(value)
            else setPadding({ [key]: value })
          }}
        />
        <button type="button" onClick={() => step(key, 1)} aria-label={`${label} +`}>
          +
        </button>
      </div>
    </div>
  )

  return (
    <Sheet open={open} onClose={onClose} title={t('settings')}>
      {!storageWorks && (
        <div className="notice notice--warn">
          <strong>{t('saveFailed')}</strong>
          <span>{t('saveFailedHint')}</span>
        </div>
      )}

      <section className="panel-section">
        <h3>{t('textDirection')}</h3>
        <Segmented<Dir>
          block
          value={doc.dir}
          onChange={(dir) => setDoc((c) => ({ ...c, dir }))}
          options={[
            { value: 'rtl', label: `${t('rtlShort')} ←` },
            { value: 'ltr', label: `→ ${t('ltrShort')}` },
          ]}
        />
        <p className="panel-hint">{doc.dir === 'rtl' ? t('rtl') : t('ltr')}</p>
      </section>

      <section className="panel-section">
        <h3>{t('defaults')}</h3>
        <Row label={t('font')}>
          <select
            className="select"
            value={doc.font}
            onChange={(e) => setDoc((c) => ({ ...c, font: e.target.value as FontKey }))}
          >
            {(Object.keys(FONT_LABELS) as FontKey[]).map((key) => (
              <option key={key} value={key} style={{ fontFamily: FONT_STACKS[key] }}>
                {FONT_LABELS[key]}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('textSize')}>
          <select
            className="select"
            value={doc.fontSize}
            onChange={(e) => setDoc((c) => ({ ...c, fontSize: Number(e.target.value) }))}
          >
            {SIZES.map((size) => (
              <option key={size} value={size}>
                {size} pt
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('lineSpacing')}>
          <select
            className="select"
            value={doc.lineHeight}
            onChange={(e) => setDoc((c) => ({ ...c, lineHeight: Number(e.target.value) }))}
          >
            {SPACINGS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('textColor')}>
          <input
            className="color-input"
            type="color"
            value={doc.color}
            aria-label={t('textColor')}
            onChange={(e) => setDoc((c) => ({ ...c, color: e.target.value }))}
          />
        </Row>
      </section>

      <section className="panel-section">
        <h3>{t('pageSetup')}</h3>
        <p className="panel-hint">A4 · ٢١٠ × ٢٩٧ {t('millimeter')}</p>
        <div className="toggle-list">
          <Toggle label={t('linkSides')} checked={linked} onChange={setLinked} />
        </div>
        <div className="pad-grid">
          {paddingInput('top', t('top'))}
          {paddingInput('bottom', t('bottom'))}
          {paddingInput('right', t('right'))}
          {paddingInput('left', t('left'))}
        </div>
        <div className="panel-buttons">
          <button type="button" className="btn btn--ghost" onClick={() => setAll(0)}>
            {t('removePadding')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setPadding(DEFAULT_PADDING)}>
            {t('resetPadding')}
          </button>
        </div>
        <div className="toggle-list">
          <Toggle
            label={t('pageNumbers')}
            checked={doc.showPageNumbers}
            onChange={(showPageNumbers) => setDoc((c) => ({ ...c, showPageNumbers }))}
          />
        </div>
      </section>

      <section className="panel-section">
        <h3>{t('numbering')}</h3>
        <Row label={t('numerals')}>
          <Segmented<NumeralStyle>
            compact
            value={doc.numerals}
            onChange={(numerals) => setDoc((c) => ({ ...c, numerals }))}
            options={[
              { value: 'arabic', label: t('numeralsArabic') },
              { value: 'latin', label: t('numeralsLatin') },
            ]}
          />
        </Row>
        <Row label={t('branchLabels')}>
          <Segmented<BranchStyle>
            compact
            value={doc.branchStyle}
            onChange={(branchStyle) => setDoc((c) => ({ ...c, branchStyle }))}
            options={[
              { value: 'abjad', label: t('branchAbjad') },
              { value: 'latin', label: t('branchLatin') },
            ]}
          />
        </Row>
        <Row label={t('questionPrefix')}>
          <input
            className="text-input text-input--sm"
            type="text"
            maxLength={6}
            value={doc.questionPrefix}
            aria-label={t('questionPrefix')}
            onChange={(e) => setDoc((c) => ({ ...c, questionPrefix: e.target.value }))}
          />
        </Row>
        <Row label={t('defaultDivider')}>
          <Segmented<DividerStyle>
            compact
            value={doc.questions[0]?.divider ?? 'solid'}
            onChange={(divider) =>
              setDoc((c) => ({ ...c, questions: c.questions.map((q) => ({ ...q, divider })) }))
            }
            options={[
              { value: 'solid', label: t('solid') },
              { value: 'dashed', label: t('dashed') },
              { value: 'none', label: t('none') },
            ]}
          />
        </Row>
      </section>

      <section className="panel-section">
        <h3>{t('spellcheckTitle')}</h3>
        {spellcheckConfigured ? (
          <>
            <div className="toggle-list">
              <Toggle label={t('spellcheck')} checked={spellcheck} onChange={onSpellcheck} />
            </div>
            <p className="panel-explain">{t('spellcheckHint')}</p>
          </>
        ) : (
          <>
            <p className="panel-explain">{t('spellcheckHint')}</p>
            <p className="panel-hint">{t('spellcheckUnavailable')}</p>
          </>
        )}
      </section>

      <section className="panel-section">
        <h3>{t('myFiles')}</h3>
        <p className="panel-explain">{t('filesExplain')}</p>

        <button type="button" className="action" onClick={onExport}>
          <span className="action-icon">
            <Icons.save />
          </span>
          <span className="action-text">
            <strong>{t('exportFile')}</strong>
            <span>{t('exportFileHint')}</span>
          </span>
        </button>

        <label className="action">
          <span className="action-icon">
            <Icons.open />
          </span>
          <span className="action-text">
            <strong>{t('importFile')}</strong>
            <span>{t('importFileHint')}</span>
          </span>
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImport(file)
              e.target.value = ''
            }}
          />
        </label>

        <button type="button" className="action" onClick={onPrint}>
          <span className="action-icon">
            <Icons.printer />
          </span>
          <span className="action-text">
            <strong>{t('printInstead')}</strong>
            <span>{t('printHint')}</span>
          </span>
        </button>
      </section>

      <section className="panel-section">
        <h3>{t('startOver')}</h3>
        <div className="panel-buttons panel-buttons--stack">
          <button type="button" className="btn btn--ghost" onClick={onSample}>
            <Icons.sparkle />
            {t('loadSample')}
          </button>
          <button type="button" className="btn btn--danger" onClick={onNew}>
            <Icons.trash />
            {t('newSheet')}
          </button>
        </div>
      </section>

      <section className="panel-section">
        <h3>{t('appSection')}</h3>

        <button type="button" className="action" onClick={onPrivacy}>
          <span className="action-icon">
            <Icons.shield />
          </span>
          <span className="action-text">
            <strong>{t('privacy')}</strong>
            <span>{t('privacyHint')}</span>
          </span>
        </button>

        {RATING_ENABLED && (
          <button type="button" className="action" onClick={onRate}>
            <span className="action-icon">
              <Icons.star filled />
            </span>
            <span className="action-text">
              <strong>{alreadyRated ? t('rateAgain') : t('rate')}</strong>
              <span>{t('rateHint')}</span>
            </span>
          </button>
        )}
      </section>

      <p className="panel-foot-note">
        <Icons.cloudOff />
        {t('offlineReady')}
      </p>

      <footer className="panel-credit">
        <p className="panel-credit-by">
          {t('developedBy')}{' '}
          <a href={DEVELOPER_URL} target="_blank" rel="noopener noreferrer">
            {DEVELOPER}
          </a>
        </p>
        <p className="panel-credit-legal">
          {t('allRightsReserved')} · <bdi>© {COPYRIGHT_YEAR} {DEVELOPER}</bdi>
        </p>
        <p className="panel-credit-legal">
          {t('version')} <bdi>{APP_VERSION}</bdi>
        </p>
      </footer>
    </Sheet>
  )
}
