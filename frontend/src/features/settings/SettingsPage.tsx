import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { Field, Select } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { Card, PageHeader } from '../../components/ui/states'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { LOCALES } from '../../lib/i18n'
import type { Me, UserSettings } from '../../lib/types'
import { ME_KEY, useAuth, useMe } from '../auth/AuthProvider'
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

      <WorkingHoursCard />
      <ScoreSettingsCard />
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
