import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Field, Select } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { Card, PageHeader } from '../../components/ui/states'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { LOCALES } from '../../lib/i18n'
import { onSoundChange, setSoundEnabled, soundEnabled } from '../../lib/sound'
import type { Me, UserSettings } from '../../lib/types'
import { ME_KEY, useAuth, useMe } from '../auth/AuthProvider'
import { AiSettingsCard } from './AiSettingsCard'
import { BackupCard } from './BackupCard'
import { ScoreSettingsCard } from './ScoreSettingsCard'
import { WorkingHoursCard } from './WorkingHoursCard'

function timezones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return all.includes(current) ? all : [current, ...all]
}

export function SettingsPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const { logout } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const zones = useMemo(() => timezones(me.settings.timezone), [me.settings.timezone])

  // Every change saves immediately; the account's settings (and so language/theme) update everywhere.
  const save = useMutation({
    mutationFn: (changes: Partial<UserSettings>) => api<UserSettings>('/settings', { method: 'PATCH', body: changes }),
    onSuccess: (settings) => {
      qc.setQueryData<Me>(ME_KEY, (old) => old && { ...old, settings })
      qc.invalidateQueries({ queryKey: ['tasks'] }) // "today" may change with the timezone
      toast(t('common:state.saved'))
    },
    onError: (e) => toast(errorMessage(t, e), 'error'),
  })
  const s = me.settings

  return (
    <>
      <PageHeader title={t('title')} />

      <Card className="mb-4 p-5">
        <h2 className="mb-4 font-semibold">{t('sections.preferences')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common:language.label')}>
            {(a) => (
              <Select {...a} value={s.locale} onChange={(e) => save.mutate({ locale: e.target.value as UserSettings['locale'] })}>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {t(`common:language.${l}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('theme.label')}>
            {(a) => (
              <Select {...a} value={s.theme} onChange={(e) => save.mutate({ theme: e.target.value as UserSettings['theme'] })}>
                {(['system', 'light', 'dark'] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`theme.${v}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('timezone.label')} help={t('timezone.help')}>
            {(a) => (
              <Select {...a} value={s.timezone} onChange={(e) => save.mutate({ timezone: e.target.value })}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('weekStart.label')}>
            {(a) => (
              <Select {...a} value={s.week_start} onChange={(e) => save.mutate({ week_start: Number(e.target.value) })}>
                {[1, 7].map((d) => (
                  <option key={d} value={d}>
                    {t(`weekStart.${d}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Card>

      <SoundCard />
      <WorkingHoursCard />
      <ScoreSettingsCard />
      <AiSettingsCard />
      <BackupCard />

      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{t('sections.account')}</h2>
        <p className="text-muted mb-4">{t('signedInAs', { email: me.user.email })}</p>
        <Button onClick={() => logout()}>
          <LogOut size={16} aria-hidden />
          {t('common:actions.logout')}
        </Button>
      </Card>
    </>
  )
}

/** Sounds and vibration are a per-device choice (a phone in a meeting vs. a desktop), so they live in this browser. */
function SoundCard() {
  const { t } = useTranslation('settings')
  const [on, setOn] = useState(soundEnabled)
  useEffect(() => {
    const off = onSoundChange(setOn)
    return () => void off()
  }, [])
  return (
    <Card className="mb-4 flex items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        <h2 id="sound-label" className="font-semibold">{t('sound.label')}</h2>
        <p className="text-subtle mt-0.5 text-[13px]">{t('sound.help')}</p>
      </div>
      <Switch checked={on} onChange={setSoundEnabled} labelledBy="sound-label" />
    </Card>
  )
}

/** An iOS switch: a real checkbox role, a knob that slides with a spring. */
export function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-[var(--duration-base)]',
        checked ? 'bg-success-fill' : 'bg-fg/[0.14]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)]',
          'transition-transform duration-[380ms] ease-[var(--ease-spring)]',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}
