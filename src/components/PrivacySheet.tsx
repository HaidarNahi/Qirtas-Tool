import { t } from '../lib/i18n'
import { Icons, Sheet } from './ui'

const POINTS = [
  { title: 'privacyPoint1Title', body: 'privacyPoint1Body' },
  { title: 'privacyPoint2Title', body: 'privacyPoint2Body' },
  { title: 'privacyPoint3Title', body: 'privacyPoint3Body' },
  { title: 'privacyPoint4Title', body: 'privacyPoint4Body' },
  { title: 'privacyPoint5Title', body: 'privacyPoint5Body' },
] as const

export default function PrivacySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={t('privacyTitle')}>
      <p className="privacy-lead">{t('privacyLead')}</p>

      {POINTS.map((point) => (
        <section className="panel-section privacy-point" key={point.title}>
          <h3>{t(point.title)}</h3>
          <p>{t(point.body)}</p>
        </section>
      ))}

      <p className="panel-foot-note">
        <Icons.cloudOff />
        {t('privacyOffline')}
      </p>
    </Sheet>
  )
}
