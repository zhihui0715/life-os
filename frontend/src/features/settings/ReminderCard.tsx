import { BellRing } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { ChoiceChip } from '../../components/ui/Segments'
import { Switch } from '../../components/ui/Switch'
import { Card } from '../../components/ui/states'
import { notify, notifyBlocker, onPrefsChange, readPrefs, remindersSupported, setRemindersEnabled, writePrefs, type ReminderPrefs } from '../../lib/reminders'

const LEADS = [0, 5, 10, 15, 30]

/** Reminder settings for this device. Switching on asks the browser for notification permission. */
export function ReminderCard() {
  const { t } = useTranslation('settings')
  const [prefs, setPrefs] = useState(readPrefs)
  const [permission, setPermission] = useState(() => (remindersSupported() ? Notification.permission : 'denied'))
  useEffect(() => onPrefsChange(setPrefs), [])

  const change = (p: Partial<ReminderPrefs>) => writePrefs({ ...prefs, ...p })

  const toggle = async (on: boolean) => setPermission(await setRemindersEnabled(on))

  const active = prefs.enabled && permission === 'granted'
  const blocker = notifyBlocker()

  return (
    <Card className="mb-4 p-5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 id="reminders-label" className="text-[17px] font-semibold tracking-tight">{t('reminders.label')}</h2>
          <p className="text-subtle mt-0.5 text-[13px]">{t('reminders.help')}</p>
        </div>
        <Switch checked={active} onChange={toggle} labelledBy="reminders-label" disabled={!remindersSupported()} />
      </div>
      {blocker ? (
        <p className="bg-warning-soft text-warning mt-4 rounded-xl px-3.5 py-2.5 text-[13px]">{t(`reminders.blocked.${blocker}`)}</p>
      ) : permission === 'denied' ? (
        <p className="bg-warning-soft text-warning mt-4 rounded-xl px-3.5 py-2.5 text-[13px]">{t('reminders.denied')}</p>
      ) : null}

      {active && (
        <div className="page-enter mt-5 flex flex-col gap-5">
          <Row label={t('reminders.events')}>
            <div className="flex flex-wrap gap-2">
              {LEADS.map((m) => (
                <ChoiceChip key={m} selected={prefs.eventLead === m} onClick={() => change({ eventLead: m })}>
                  {m ? t('reminders.minutes', { count: m }) : t('reminders.off')}
                </ChoiceChip>
              ))}
            </div>
          </Row>
          <label className="flex items-center gap-4">
            <span id="deadlines-label" className="min-w-0 flex-1 text-[15px]">{t('reminders.deadlines')}</span>
            <Switch checked={prefs.deadlines} onChange={(v) => change({ deadlines: v })} labelledBy="deadlines-label" />
          </label>
          <TimeRow label={t('reminders.plan')} value={prefs.planAt} onChange={(v) => change({ planAt: v })} />
          <TimeRow label={t('reminders.habits')} value={prefs.habitsAt} onChange={(v) => change({ habitsAt: v })} />
          <TimeRow label={t('reminders.review')} value={prefs.reviewAt} onChange={(v) => change({ reviewAt: v })} />
          <div>
            <Button size="sm" onClick={() => void notify(t('reminders.testTitle'), t('reminders.testBody'), '/settings', 'test')}>
              <BellRing size={14} aria-hidden />
              {t('reminders.test')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-muted mb-2 text-[13px] font-medium">{label}</p>
      {children}
    </div>
  )
}

/** A daily time with an on/off switch; off stores "". */
function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation('settings')
  const id = `rem-${label.replace(/\W+/g, '-').toLowerCase()}`
  const [last, setLast] = useState(value || '08:00')
  return (
    <div className="flex items-center gap-3">
      <span id={id} className="min-w-0 flex-1 text-[15px]">{label}</span>
      {value && (
        <input
          type="time"
          aria-label={t('reminders.time', { what: label })}
          value={value}
          onChange={(e) => {
            if (!e.target.value) return
            setLast(e.target.value)
            onChange(e.target.value)
          }}
          className="bg-sunken text-fg h-9 rounded-lg px-2.5 text-[15px] tabular-nums"
        />
      )}
      <Switch checked={!!value} onChange={(on) => onChange(on ? last : '')} labelledBy={id} />
    </div>
  )
}
