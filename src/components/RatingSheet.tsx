import { useEffect, useState } from 'react'
import { t, type StringKey } from '../lib/i18n'
import { buildRating, submitRating } from '../lib/rating'
import { Icons, Sheet, haptic } from './ui'

type State = 'idle' | 'sending' | 'sent' | 'queued' | 'failed'

const SCORE_LABELS: StringKey[] = ['rateScore1', 'rateScore2', 'rateScore3', 'rateScore4', 'rateScore5']

export default function RatingSheet({
  open,
  onClose,
  alreadyRated,
  onRated,
}: {
  open: boolean
  onClose: () => void
  alreadyRated: boolean
  onRated: () => void
}) {
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [state, setState] = useState<State>('idle')

  useEffect(() => {
    if (open) {
      setScore(0)
      setComment('')
      setState('idle')
    }
  }, [open])

  const send = async () => {
    if (score < 1 || state === 'sending') return
    setState('sending')
    haptic(12)
    const result = await submitRating(buildRating(score, comment))
    setState(result === 'sent' ? 'sent' : 'queued')
    onRated()
    haptic([10, 40, 10])
  }

  const done = state === 'sent' || state === 'queued'

  return (
    <Sheet open={open} onClose={onClose} title={t('rate')}>
      {done ? (
        <section className="panel-section rate-done">
          <span className="rate-done-icon" aria-hidden>
            <Icons.check />
          </span>
          <h3>{t('rateThanks')}</h3>
          <p>{state === 'sent' ? t('rateThanksBody') : t('rateQueued')}</p>
          <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
            {t('close')}
          </button>
        </section>
      ) : (
        <section className="panel-section">
          <h3>{t('rateTitle')}</h3>

          {alreadyRated && <p className="panel-hint">{t('rateAlready')}</p>}

          <div className="stars" role="radiogroup" aria-label={t('rateStars')}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={score === value}
                aria-label={t(SCORE_LABELS[value - 1])}
                className={`star ${value <= score ? 'is-on' : ''}`}
                onClick={() => {
                  haptic(10)
                  setScore(value)
                }}
              >
                <Icons.star filled={value <= score} />
              </button>
            ))}
          </div>
          <p className="stars-label">{score > 0 ? t(SCORE_LABELS[score - 1]) : t('rateStars')}</p>

          <label className="field-label" htmlFor="rate-comment">
            {t('rateComment')}
          </label>
          <textarea
            id="rate-comment"
            className="textarea"
            rows={4}
            maxLength={2000}
            value={comment}
            placeholder={t('rateCommentPlaceholder')}
            onChange={(e) => setComment(e.target.value)}
          />

          <p className="panel-explain panel-explain--quiet">{t('ratePrivacy')}</p>

          {state === 'failed' && <p className="notice notice--warn">{t('rateFailed')}</p>}

          <button
            type="button"
            className="btn btn--primary btn--block btn--lg"
            disabled={score < 1 || state === 'sending'}
            onClick={send}
          >
            {state === 'sending' ? (
              <>
                <span className="spinner spinner--sm" aria-hidden />
                {t('rateSending')}
              </>
            ) : (
              t('rateSend')
            )}
          </button>
        </section>
      )}
    </Sheet>
  )
}
