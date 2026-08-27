import type { Align, Branch, Doc, DividerStyle, Question } from '../lib/types'
import { FONT_STACKS } from '../lib/types'
import { t } from '../lib/i18n'
import { branchLabel, emptyBranch, emptyQuestion, formatNumber, uid } from '../lib/doc'
import { stripHtml } from '../lib/richtext'
import RichText from './RichText'
import { Card, haptic, Icons, IconButton, Segmented, Toggle } from './ui'

interface Props {
  doc: Doc
  setDoc: (updater: (doc: Doc) => Doc) => void
  onFocusField: () => void
  onBlurField: () => void
  collapsed: Set<string>
  onToggleCollapse: (id: string) => void
  onCollapseAll: (collapse: boolean) => void
  onRemoveQuestion: (id: string) => void
  onRemoveBranch: (questionId: string, branchId: string) => void
}

export default function Editor({
  doc,
  setDoc,
  onFocusField,
  onBlurField,
  collapsed,
  onToggleCollapse,
  onCollapseAll,
  onRemoveQuestion,
  onRemoveBranch,
}: Props) {
  // Fields preview the sheet's own typography, with a floor so a 9pt exam is
  // still readable while editing on a phone.
  const fieldStyle: React.CSSProperties = {
    fontFamily: FONT_STACKS[doc.font],
    fontSize: `max(15px, ${doc.fontSize}pt)`,
    lineHeight: doc.lineHeight,
    color: doc.color,
  }
  const focusProps = { onFocus: onFocusField, onBlur: onBlurField, dir: doc.dir, style: fieldStyle }

  const patchQuestion = (id: string, patch: Partial<Question>) =>
    setDoc((current) => ({
      ...current,
      questions: current.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    }))

  const patchBranch = (questionId: string, branchId: string, patch: Partial<Branch>) =>
    setDoc((current) => ({
      ...current,
      questions: current.questions.map((q) =>
        q.id === questionId
          ? { ...q, branches: q.branches.map((b) => (b.id === branchId ? { ...b, ...patch } : b)) }
          : q,
      ),
    }))

  const moveQuestion = (index: number, delta: number) =>
    setDoc((current) => {
      const next = [...current.questions]
      const target = index + delta
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...current, questions: next }
    })

  const moveBranch = (questionId: string, index: number, delta: number) =>
    setDoc((current) => ({
      ...current,
      questions: current.questions.map((q) => {
        if (q.id !== questionId) return q
        const next = [...q.branches]
        const target = index + delta
        if (target < 0 || target >= next.length) return q
        ;[next[index], next[target]] = [next[target], next[index]]
        return { ...q, branches: next }
      }),
    }))

  const alignControl = (value: Align, onChange: (value: Align) => void) => (
    <Segmented<Align>
      compact
      label={t('headerPart')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'start', label: <AlignIcon variant="start" dir={doc.dir} />, title: doc.dir === 'rtl' ? t('right') : t('left') },
        { value: 'center', label: <AlignIcon variant="center" dir={doc.dir} />, title: 'وسط' },
        { value: 'end', label: <AlignIcon variant="end" dir={doc.dir} />, title: doc.dir === 'rtl' ? t('left') : t('right') },
      ]}
    />
  )

  const allCollapsed = doc.questions.length > 0 && doc.questions.every((q) => collapsed.has(q.id))

  return (
    <div className="editor">
      <Card tone="header" title={t('header')} badge={<span className="card-dot" aria-hidden />}>
        <p className="card-hint">{t('headerHint')}</p>
        <div className="header-grid">
          {doc.header.cells.map((cell, index) => (
            <div className="header-cell" key={index}>
              <div className="cell-bar">
                <span className="cell-tag">
                  {t('headerPart')} {formatNumber(index + 1, doc.numerals)}
                </span>
                {alignControl(doc.header.align[index], (value) =>
                  setDoc((current) => {
                    const align = [...current.header.align] as Doc['header']['align']
                    align[index] = value
                    return { ...current, header: { ...current.header, align } }
                  }),
                )}
              </div>
              <RichText
                {...focusProps}
                style={{ ...fieldStyle, textAlign: doc.header.align[index] }}
                html={cell}
                placeholder={t('headerPlaceholder')}
                className="field field--multiline"
                onChange={(html) =>
                  setDoc((current) => {
                    const cells = [...current.header.cells] as Doc['header']['cells']
                    cells[index] = html
                    return { ...current, header: { ...current.header, cells } }
                  })
                }
              />
            </div>
          ))}
        </div>

        {doc.header.showNote && (
          <div className="header-cell header-cell--note">
            <div className="cell-bar">
              <span className="cell-tag">{t('note')}</span>
              {alignControl(doc.header.noteAlign, (noteAlign) =>
                setDoc((c) => ({ ...c, header: { ...c.header, noteAlign } })),
              )}
            </div>
            <RichText
              {...focusProps}
              style={{ ...fieldStyle, textAlign: doc.header.noteAlign }}
              html={doc.header.note}
              placeholder={t('notePlaceholder')}
              className="field field--multiline"
              onChange={(note) => setDoc((c) => ({ ...c, header: { ...c.header, note } }))}
            />
          </div>
        )}

        <div className="toggle-list">
          <Toggle
            label={t('showNote')}
            checked={doc.header.showNote}
            onChange={(showNote) => setDoc((c) => ({ ...c, header: { ...c.header, showNote } }))}
          />
          <Toggle
            label={t('headerRule')}
            checked={doc.header.showRule}
            onChange={(showRule) => setDoc((c) => ({ ...c, header: { ...c.header, showRule } }))}
          />
          <Toggle
            label={t('repeatHeader')}
            checked={doc.header.repeat}
            onChange={(repeat) => setDoc((c) => ({ ...c, header: { ...c.header, repeat } }))}
          />
        </div>
      </Card>

      <div className="questions">
        <div className="section-bar">
          <span className="section-dot" aria-hidden />
          <h2 className="section-title">{t('questionsTitle')}</h2>
          <span className="section-count">{formatNumber(doc.questions.length, doc.numerals)}</span>
          {doc.questions.length > 1 && (
            <button type="button" className="link-btn" onClick={() => onCollapseAll(!allCollapsed)}>
              {allCollapsed ? t('expandAll') : t('collapseAll')}
            </button>
          )}
        </div>

        {doc.questions.length === 0 && (
          <div className="empty">
            <Icons.sparkle />
            <p className="empty-title">{t('emptyQuestions')}</p>
            <p className="empty-hint">{t('emptyQuestionsHint')}</p>
          </div>
        )}

        {doc.questions.map((question, index) => {
          const isCollapsed = collapsed.has(question.id)
          const summary = (stripHtml(question.text) || stripHtml(question.branches[0]?.text ?? '')).replace(/\n/g, ' · ')
          return (
            <Card
              key={question.id}
              tone="question"
              className={isCollapsed ? 'is-collapsed' : ''}
              badge={
                <button
                  type="button"
                  className="q-badge"
                  onClick={() => {
                    haptic(8)
                    onToggleCollapse(question.id)
                  }}
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? t('expand') : t('collapse')}
                >
                  <span>
                    {doc.questionPrefix}
                    {formatNumber(index + 1, doc.numerals)}
                  </span>
                  <span className={`q-badge-chevron ${isCollapsed ? 'is-closed' : ''}`} aria-hidden>
                    <Icons.chevron />
                  </span>
                </button>
              }
              title={
                isCollapsed ? (
                  <span className="q-summary">
                    <span className="q-summary-text">{summary || <em>{t('emptyQuestion')}</em>}</span>
                    {question.branches.length > 0 && (
                      <span className="q-summary-meta">
                        {question.branches.length === 1
                          ? t('branchCountOne')
                          : `${formatNumber(question.branches.length, doc.numerals)} ${t('branchCount')}`}
                      </span>
                    )}
                  </span>
                ) : null
              }
              actions={
                <>
                  <IconButton size="sm" label={t('moveUp')} disabled={index === 0} onClick={() => moveQuestion(index, -1)}>
                    <Icons.up />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={t('moveDown')}
                    disabled={index === doc.questions.length - 1}
                    onClick={() => moveQuestion(index, 1)}
                  >
                    <Icons.down />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={t('duplicate')}
                    onClick={() =>
                      setDoc((current) => {
                        const copy: Question = {
                          ...question,
                          id: uid(),
                          branches: question.branches.map((b) => ({ ...b, id: uid() })),
                        }
                        const next = [...current.questions]
                        next.splice(index + 1, 0, copy)
                        return { ...current, questions: next }
                      })
                    }
                  >
                    <Icons.copy />
                  </IconButton>
                  <IconButton size="sm" danger label={t('delete')} onClick={() => onRemoveQuestion(question.id)}>
                    <Icons.trash />
                  </IconButton>
                </>
              }
            >
              {!isCollapsed && (
                <>
                  <RichText
                    {...focusProps}
                    html={question.text}
                    placeholder={t('questionPlaceholder')}
                    className="field field--multiline"
                    onChange={(text) => patchQuestion(question.id, { text })}
                  />

                  <MarksField
                    focusProps={focusProps}
                    show={question.showMarks}
                    value={question.marks}
                    onToggle={(showMarks) => patchQuestion(question.id, { showMarks })}
                    onChange={(marks) => patchQuestion(question.id, { marks })}
                  />

                  {question.branches.length > 0 && (
                    <ul className="branches">
                      {question.branches.map((branch, branchIndex) => (
                        <li className="branch" key={branch.id}>
                          <div className="branch-head">
                            <span className="branch-badge">{branchLabel(branchIndex, doc.branchStyle)}</span>
                            <div className="branch-actions">
                              <IconButton
                                size="sm"
                                label={t('moveUp')}
                                disabled={branchIndex === 0}
                                onClick={() => moveBranch(question.id, branchIndex, -1)}
                              >
                                <Icons.up />
                              </IconButton>
                              <IconButton
                                size="sm"
                                label={t('moveDown')}
                                disabled={branchIndex === question.branches.length - 1}
                                onClick={() => moveBranch(question.id, branchIndex, 1)}
                              >
                                <Icons.down />
                              </IconButton>
                              <IconButton
                                size="sm"
                                danger
                                label={t('delete')}
                                onClick={() => onRemoveBranch(question.id, branch.id)}
                              >
                                <Icons.trash />
                              </IconButton>
                            </div>
                          </div>
                          <RichText
                            {...focusProps}
                            html={branch.text}
                            placeholder={t('branchPlaceholder')}
                            className="field field--multiline"
                            onChange={(text) => patchBranch(question.id, branch.id, { text })}
                          />
                          <MarksField
                            focusProps={focusProps}
                            show={branch.showMarks}
                            value={branch.marks}
                            onToggle={(showMarks) => patchBranch(question.id, branch.id, { showMarks })}
                            onChange={(marks) => patchBranch(question.id, branch.id, { marks })}
                          />
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="question-foot">
                    <button
                      type="button"
                      className="btn btn--soft"
                      onClick={() => {
                        haptic(8)
                        patchQuestion(question.id, { branches: [...question.branches, emptyBranch()] })
                      }}
                    >
                      <Icons.branch />
                      {t('addBranch')}
                    </button>

                    {index < doc.questions.length - 1 && (
                      <div className="divider-picker">
                        <span className="cell-tag">{t('divider')}</span>
                        <Segmented<DividerStyle>
                          compact
                          label={t('divider')}
                          value={question.divider}
                          onChange={(divider) => patchQuestion(question.id, { divider })}
                          options={[
                            { value: 'solid', label: <DividerIcon variant="solid" />, title: t('solid') },
                            { value: 'dashed', label: <DividerIcon variant="dashed" />, title: t('dashed') },
                            { value: 'none', label: <DividerIcon variant="none" />, title: t('none') },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </Card>
          )
        })}

        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          onClick={() => {
            haptic(12)
            setDoc((current) => ({ ...current, questions: [...current.questions, emptyQuestion()] }))
          }}
        >
          <Icons.plus />
          {t('addQuestion')}
        </button>
      </div>

      <Card tone="footer" title={t('footer')} badge={<span className="card-dot" aria-hidden />}>
        <p className="card-hint">{t('footerHint')}</p>
        <div className="footer-grid">
          {doc.footer.cells.map((cell, index) => (
            <div className="header-cell" key={index}>
              <div className="cell-bar">
                <span className="cell-tag">
                  {t('headerPart')} {formatNumber(index + 1, doc.numerals)}
                </span>
                {alignControl(doc.footer.align[index], (value) =>
                  setDoc((current) => {
                    const align = [...current.footer.align] as Doc['footer']['align']
                    align[index] = value
                    return { ...current, footer: { ...current.footer, align } }
                  }),
                )}
              </div>
              <RichText
                {...focusProps}
                style={{ ...fieldStyle, textAlign: doc.footer.align[index] }}
                html={cell}
                placeholder={t('footerPlaceholder')}
                className="field field--multiline"
                onChange={(html) =>
                  setDoc((current) => {
                    const cells = [...current.footer.cells] as Doc['footer']['cells']
                    cells[index] = html
                    return { ...current, footer: { ...current.footer, cells } }
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="toggle-list">
          <Toggle
            label={t('footerRule')}
            checked={doc.footer.showRule}
            onChange={(showRule) => setDoc((c) => ({ ...c, footer: { ...c.footer, showRule } }))}
          />
          <Toggle
            label={t('repeatFooter')}
            checked={doc.footer.repeat}
            onChange={(repeat) => setDoc((c) => ({ ...c, footer: { ...c.footer, repeat } }))}
          />
        </div>
      </Card>
    </div>
  )
}

function MarksField({
  focusProps,
  show,
  value,
  onToggle,
  onChange,
}: {
  focusProps: { onFocus: () => void; onBlur: () => void; dir: Doc['dir']; style: React.CSSProperties }
  show: boolean
  value: string
  onToggle: (show: boolean) => void
  onChange: (value: string) => void
}) {
  return (
    <div className="marks-row">
      <Toggle label={t('showMarks')} checked={show} onChange={onToggle} />
      {show && (
        <RichText
          {...focusProps}
          singleLine
          html={value}
          placeholder={t('marksPlaceholder')}
          className="field field--marks"
          onChange={onChange}
        />
      )}
    </div>
  )
}

function AlignIcon({ variant, dir }: { variant: Align; dir: Doc['dir'] }) {
  const widths = [14, 9, 12]
  const offset = (w: number) => (variant === 'start' ? 3 : variant === 'end' ? 17 - w : (20 - w) / 2)
  return (
    <svg
      viewBox="0 0 20 20"
      width="17"
      height="17"
      aria-hidden
      style={dir === 'rtl' ? { transform: 'scaleX(-1)' } : undefined}
    >
      {widths.map((w, i) => (
        <rect key={i} x={offset(w)} y={5 + i * 4} width={w} height="1.9" rx="0.95" fill="currentColor" />
      ))}
    </svg>
  )
}

function DividerIcon({ variant }: { variant: DividerStyle }) {
  if (variant === 'none') {
    return (
      <svg viewBox="0 0 24 20" width="24" height="17" aria-hidden>
        <path d="M4 10h16" stroke="currentColor" strokeWidth="1.7" strokeDasharray="0 4" strokeLinecap="round" opacity="0.3" />
        <path d="M7 6l10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 20" width="24" height="17" aria-hidden>
      <path
        d="M3 10h18"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeDasharray={variant === 'dashed' ? '4 3' : undefined}
      />
    </svg>
  )
}
