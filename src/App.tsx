import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Doc } from './lib/types'
import { createDoc, migrate, sampleDoc } from './lib/doc'
import { loadLatest, loadPrefs, requestPersistence, saveNow, savePrefs } from './lib/storage'
import { t } from './lib/i18n'
import { A4_WIDTH_MM, invalidatePxPerMm, measurePxPerMm } from './lib/paginate'
import { downloadSheetPdf, sheetFileName } from './lib/pdf'
import { stripHtml } from './lib/richtext'
import { RATING_ENABLED } from './lib/config'
import { flushRatingQueue } from './lib/rating'
import Editor from './components/Editor'
import PrivacySheet from './components/PrivacySheet'
import RatingSheet from './components/RatingSheet'
import SettingsPanel from './components/SettingsPanel'
import Sheet from './components/Sheet'
import Toolbar from './components/Toolbar'
import {
  ConfirmDialog,
  Icons,
  Toasts,
  haptic,
  type ConfirmRequest,
  type ToastMessage,
} from './components/ui'

type Tab = 'edit' | 'preview'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function App() {
  const [doc, setDocState] = useState<Doc>(() => createDoc())
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('edit')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [rated, setRated] = useState(false)
  const promptShown = useRef(false)
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [pageCount, setPageCount] = useState(1)
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [fitScale, setFitScale] = useState(1)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [exporting, setExporting] = useState<{ page: number; total: number } | null>(null)

  const previewRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const blurTimer = useRef<number>()
  const saveTimer = useRef<number>()
  const savedStateTimer = useRef<number>()
  const latestDoc = useRef(doc)
  const dirty = useRef(false)
  latestDoc.current = doc

  const setDoc = useCallback((updater: (doc: Doc) => Doc) => {
    dirty.current = true
    setDocState((current) => updater(current))
  }, [])

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>, ttl = 6000) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-2), { ...toast, id }])
    window.setTimeout(() => {
      setToasts((current) => {
        if (current.some((item) => item.id === id)) toast.onDismiss?.()
        return current.filter((item) => item.id !== id)
      })
    }, ttl)
  }, [])

  /* ------------------------------------------------------------- startup */

  useEffect(() => {
    let alive = true
    ;(async () => {
      const found = await loadLatest()
      if (!alive) return
      if (found) {
        const restored = migrate(found.snapshot.doc)
        setDocState(restored)
        // Write straight back so both stores hold the sheet again — otherwise a
        // recovery from one store leaves the other empty until the next edit.
        saveNow(restored)
        if (found.recovered) pushToast({ text: t('restored') })
      }
      const prefs = loadPrefs()
      setCollapsed(new Set(prefs.collapsed))
      setRated(prefs.rated)
      setReady(true)
      void requestPersistence()
      // Anything written while offline goes out now that we are running again.
      if (RATING_ENABLED) void flushRatingQueue()
    })()
    return () => {
      alive = false
    }
  }, [pushToast])

  /* ------------------------------------------------------------ autosave */

  const flush = useCallback(() => {
    if (!dirty.current) return
    const { ok } = saveNow(latestDoc.current)
    dirty.current = false
    setSaveState(ok ? 'saved' : 'error')
    if (ok) {
      window.clearTimeout(savedStateTimer.current)
      savedStateTimer.current = window.setTimeout(() => setSaveState('idle'), 2200)
    }
  }, [])

  useEffect(() => {
    if (!ready || !dirty.current) return
    setSaveState('saving')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(flush, 500)
    return () => window.clearTimeout(saveTimer.current)
  }, [doc, ready, flush])

  // The tab can vanish without warning; these are the last moments we get.
  useEffect(() => {
    if (!ready) return
    const onHide = () => flush()
    const onVisibility = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', onHide)
    window.addEventListener('beforeunload', onHide)
    window.addEventListener('blur', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('beforeunload', onHide)
      window.removeEventListener('blur', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ready, flush])

  // Collapsed ids for questions that no longer exist would accumulate forever.
  useEffect(() => {
    if (!ready) return
    const live = new Set(doc.questions.map((question) => question.id))
    const prefs = loadPrefs()
    savePrefs({ ...prefs, collapsed: [...collapsed].filter((id) => live.has(id)), rated })
  }, [collapsed, ready, doc.questions, rated])

  useEffect(() => {
    if (!RATING_ENABLED) return
    const onOnline = () => void flushRatingQueue()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  /* --------------------------------------------------------------- fit */

  const measureFit = useCallback(() => {
    const container = previewRef.current
    if (!container) return
    const available = container.clientWidth - 24
    const paperWidth = A4_WIDTH_MM * measurePxPerMm()
    if (paperWidth <= 0) return
    const next = Math.min(1, Math.max(0.2, available / paperWidth))
    setFitScale((current) => (Math.abs(current - next) < 0.005 ? current : next))
  }, [])

  useLayoutEffect(() => {
    measureFit()
    const observer = new ResizeObserver(measureFit)
    if (previewRef.current) observer.observe(previewRef.current)
    const onResize = () => {
      invalidatePxPerMm()
      measureFit()
    }
    window.addEventListener('resize', onResize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [measureFit])

  /* ------------------------------------------------------------ toolbar */

  const handleFieldFocus = () => {
    window.clearTimeout(blurTimer.current)
    setToolbarVisible(true)
  }

  const handleFieldBlur = () => {
    window.clearTimeout(blurTimer.current)
    blurTimer.current = window.setTimeout(() => {
      const active = document.activeElement
      const inToolbar = active instanceof HTMLElement && active.closest('[data-toolbar="true"]')
      const inEditor = active instanceof HTMLElement && active.isContentEditable
      if (!inToolbar && !inEditor) setToolbarVisible(false)
    }, 250)
  }

  /* ---------------------------------------------------- delete with undo */

  const removeQuestion = (id: string) => {
    const index = doc.questions.findIndex((question) => question.id === id)
    if (index < 0) return
    const removed = doc.questions[index]
    haptic([8, 24])
    setDoc((current) => ({ ...current, questions: current.questions.filter((q) => q.id !== id) }))
    pushToast({
      text: t('deleted'),
      action: {
        label: t('undo'),
        run: () =>
          setDoc((current) => {
            const next = [...current.questions]
            next.splice(Math.min(index, next.length), 0, removed)
            return { ...current, questions: next }
          }),
      },
    })
  }

  const removeBranch = (questionId: string, branchId: string) => {
    const question = doc.questions.find((item) => item.id === questionId)
    const index = question?.branches.findIndex((branch) => branch.id === branchId) ?? -1
    if (!question || index < 0) return
    const removed = question.branches[index]
    haptic([8, 24])
    setDoc((current) => ({
      ...current,
      questions: current.questions.map((q) =>
        q.id === questionId ? { ...q, branches: q.branches.filter((b) => b.id !== branchId) } : q,
      ),
    }))
    pushToast({
      text: t('deleted'),
      action: {
        label: t('undo'),
        run: () =>
          setDoc((current) => ({
            ...current,
            questions: current.questions.map((q) => {
              if (q.id !== questionId) return q
              const next = [...q.branches]
              next.splice(Math.min(index, next.length), 0, removed)
              return { ...q, branches: next }
            }),
          })),
      },
    })
  }

  /* ------------------------------------------------------------ actions */

  // The first line of the first filled header cell names the file.
  const sheetTitle = useMemo(() => {
    const fromHeader = doc.header.cells.map(stripHtml).find((cell) => cell.length > 0)
    return (fromHeader ?? '').split('\n')[0].trim().slice(0, 40)
  }, [doc.header.cells])

  const handleDownload = async () => {
    if (exporting) return
    flush()
    setTab('preview')
    setToolbarVisible(false)
    haptic(12)
    // Give the preview a frame to lay out before we start rasterising.
    await new Promise((resolve) => setTimeout(resolve, 180))
    const container = pagesRef.current
    const pages = container ? Array.from(container.querySelectorAll<HTMLElement>('.page')) : []
    if (pages.length === 0) {
      pushToast({ text: t('pdfFailed'), tone: 'error' })
      return
    }
    setExporting({ page: 0, total: pages.length })
    try {
      await downloadSheetPdf(pages, sheetFileName(sheetTitle), setExporting)
      haptic([10, 40, 10])
      noteDownload()
    } catch {
      pushToast({ text: `${t('pdfFailed')} — ${t('pdfFailedHint')}`, tone: 'error' })
    } finally {
      setExporting(null)
    }
  }

  /** Asks for a rating only after the tool has actually proved useful twice. */
  const noteDownload = () => {
    const prefs = loadPrefs()
    const downloads = prefs.downloads + 1
    savePrefs({ ...prefs, downloads })
    if (!RATING_ENABLED || prefs.rated || prefs.ratePromptDismissed) return
    if (downloads < 2 || promptShown.current) return
    promptShown.current = true
    window.setTimeout(
      () =>
        pushToast(
          {
            text: t('ratePromptText'),
            action: { label: t('ratePromptAction'), run: () => setRatingOpen(true) },
            onDismiss: () => savePrefs({ ...loadPrefs(), ratePromptDismissed: true }),
          },
          9000,
        ),
      1200,
    )
  }

  const handlePrint = () => {
    flush()
    setSettingsOpen(false)
    setTab('preview')
    setToolbarVisible(false)
    window.setTimeout(() => window.print(), 200)
  }

  const handleExport = () => {
    flush()
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${sheetTitle || 'ورقة-اختبار'}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  const handleImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Doc
      if (!parsed || !Array.isArray(parsed.questions)) throw new Error('bad shape')
      setConfirm({
        title: t('importTitle'),
        body: t('importBody'),
        confirmLabel: t('confirmReplace'),
        onConfirm: () => {
          setDoc(() => migrate(parsed))
          setCollapsed(new Set())
          setSettingsOpen(false)
        },
      })
    } catch {
      pushToast({ text: t('importFailed'), tone: 'error' })
    }
  }

  const scale = zoom === 'fit' ? fitScale : zoom
  const zoomOut = () => setZoom(Math.max(0.25, (zoom === 'fit' ? fitScale : zoom) - 0.15))
  const zoomIn = () => setZoom(Math.min(2, (zoom === 'fit' ? fitScale : zoom) + 0.15))

  return (
    <div className={`app ${toolbarVisible ? 'is-toolbar-open' : ''}`} dir="rtl" data-numerals={doc.numerals}>
      <header className="app-bar">
        <div className="brand">
          <img src="./logo.svg" alt="" className="brand-logo" width={40} height={40} />
          <div className="brand-text">
            <span className="brand-name">{t('appName')}</span>
            <span className="brand-tag">{t('tagline')}</span>
          </div>
        </div>

        <div className="app-bar-actions">
          <SaveBadge state={saveState} />
          <button
            type="button"
            className="icon-btn icon-btn--bar"
            onClick={() => {
              haptic(8)
              setSettingsOpen(true)
            }}
            aria-label={t('settings')}
            title={t('settings')}
          >
            <Icons.gear />
          </button>
          <button
            type="button"
            className="btn btn--onbar"
            onClick={handleDownload}
            disabled={!!exporting}
            aria-label={t('download')}
          >
            <Icons.download />
            <span className="btn-label">{t('download')}</span>
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'edit'}
          className={`tab ${tab === 'edit' ? 'is-active' : ''}`}
          onClick={() => setTab('edit')}
        >
          {t('edit')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preview'}
          className={`tab ${tab === 'preview' ? 'is-active' : ''}`}
          onClick={() => setTab('preview')}
        >
          {t('preview')}
          <span className="tab-badge">{pageCount}</span>
        </button>
      </nav>

      <main className="panes">
        <div className={`pane pane--edit ${tab === 'edit' ? '' : 'is-offscreen'}`}>
          <Editor
            doc={doc}
            setDoc={setDoc}
            onFocusField={handleFieldFocus}
            onBlurField={handleFieldBlur}
            collapsed={collapsed}
            onToggleCollapse={(id) =>
              setCollapsed((current) => {
                const next = new Set(current)
                next.has(id) ? next.delete(id) : next.add(id)
                return next
              })
            }
            onCollapseAll={(collapse) =>
              setCollapsed(collapse ? new Set(doc.questions.map((q) => q.id)) : new Set())
            }
            onRemoveQuestion={removeQuestion}
            onRemoveBranch={removeBranch}
          />
        </div>

        <div className={`pane pane--preview ${tab === 'preview' ? '' : 'is-offscreen'}`} ref={previewRef}>
          <div className="preview-bar">
            <span className="preview-count">
              {t('pageCount')}: {pageCount}
            </span>
            <div className="zoom-controls">
              <button type="button" className="icon-btn icon-btn--sm" aria-label="−" onClick={zoomOut}>
                −
              </button>
              <button type="button" className="chip" onClick={() => setZoom('fit')}>
                {zoom === 'fit' ? t('fitWidth') : `${Math.round(scale * 100)}%`}
              </button>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="+" onClick={zoomIn}>
                +
              </button>
            </div>
          </div>
          <div className="preview-scroll">
            <Sheet doc={doc} scale={scale} onPageCount={setPageCount} pagesRef={pagesRef} />
          </div>
        </div>
      </main>

      <Toolbar visible={toolbarVisible} defaultSize={doc.fontSize} />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        doc={doc}
        setDoc={setDoc}
        storageWorks={saveState !== 'error'}
        onPrint={handlePrint}
        onNew={() =>
          setConfirm({
            title: t('newSheetTitle'),
            body: t('newSheetBody'),
            confirmLabel: t('confirmDelete'),
            danger: true,
            onConfirm: () => {
              setDoc(() => createDoc())
              setCollapsed(new Set())
              setSettingsOpen(false)
            },
          })
        }
        onSample={() =>
          setConfirm({
            title: t('loadSampleTitle'),
            body: t('loadSampleBody'),
            confirmLabel: t('confirmReplace'),
            onConfirm: () => {
              setDoc(() => sampleDoc())
              setCollapsed(new Set())
              setSettingsOpen(false)
            },
          })
        }
        onExport={handleExport}
        onImport={handleImport}
        onRate={() => {
          setSettingsOpen(false)
          setRatingOpen(true)
        }}
        onPrivacy={() => {
          setSettingsOpen(false)
          setPrivacyOpen(true)
        }}
        alreadyRated={rated}
      />

      <RatingSheet
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
        alreadyRated={rated}
        onRated={() => {
          setRated(true)
          savePrefs({ ...loadPrefs(), rated: true })
        }}
      />

      <PrivacySheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} />

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <Toasts
        items={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))}
      />

      {exporting && (
        <div className="scrim is-open scrim--center">
          <div className="progress-card" role="status" aria-live="polite">
            <span className="spinner" aria-hidden />
            <strong>{t('preparingPdf')}</strong>
            <span className="progress-detail">
              {t('preparingPage')} {exporting.page} / {exporting.total}
            </span>
            <div className="progress-track" aria-hidden>
              <div
                className="progress-fill"
                style={{ width: `${(exporting.page / Math.max(exporting.total, 1)) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  return (
    <span className={`save-badge save-badge--${state}`} role="status">
      {state === 'saving' && <span className="save-dot" aria-hidden />}
      {state === 'saved' && <Icons.check />}
      {state === 'error' && <Icons.cloudOff />}
      <span className="save-text">
        {state === 'saving' ? t('saving') : state === 'saved' ? t('savedAt') : t('saveFailed')}
      </span>
    </span>
  )
}
