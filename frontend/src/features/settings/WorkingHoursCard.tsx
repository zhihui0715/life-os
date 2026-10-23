import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import type { Me, UserSettings, Weekday, WorkingHours } from '../../lib/types'
import { ME_KEY, useMe } from '../auth/AuthProvider'

const DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

interface Row {
  on: boolean
  start: string
  end: string
}

/** One time range per day here; the API also accepts split days, which this simple editor keeps as the first range. */
function toRows(hours: WorkingHours): Record<Weekday, Row> {
  return Object.fromEntries(
    DAYS.map((d) => {
      const first = hours[d]?.[0]
      return [d, first ? { on: true, start: first[0], end: first[1] } : { on: false, start: '09:00', end: '18:00' }]
    }),
  ) as Record<Weekday, Row>
}

export function WorkingHoursCard() {
  const { t, i18n } = useTranslation('calendar')
  const me = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const [rows, setRows] = useState(() => toRows(me.settings.working_hours))
  useEffect(() => setRows(toRows(me.settings.working_hours)), [me.settings.working_hours])

  const save = useMutation({
    mutationFn: (working_hours: WorkingHours) => api<UserSettings>('/settings', { method: 'PATCH', body: { working_hours } }),
    onSuccess: (settings) => {
      qc.setQueryData<Me>(ME_KEY, (old) => old && { ...old, settings })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      toast(t('workingHours.saved'))
    },
    onError: (e) => toast(errorMessage(t, e), 'error'),
  })

  // 2024-01-01 was a Monday: format real dates so weekday names follow the language.
  const dayName = (i: number) => new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)))
  const invalid = DAYS.some((d) => rows[d].on && rows[d].end <= rows[d].start)

  return (
    <Card className="mb-4 p-5">
      <h2 className="text-[17px] font-semibold tracking-tight">{t('workingHours.title')}</h2>
      <p className="text-subtle mt-1 mb-4 text-sm">{t('workingHours.help')}</p>
      <div className="flex flex-col gap-2">
        {DAYS.map((d, i) => {
          const r = rows[d]
          const set = (patch: Partial<Row>) => setRows((all) => ({ ...all, [d]: { ...all[d], ...patch } }))
          return (
            <div key={d} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="flex w-36 items-center gap-2 text-sm">
                <input type="checkbox" checked={r.on} onChange={(e) => set({ on: e.target.checked })} />
                {dayName(i)}
              </label>
              {r.on ? (
                <span className="flex items-center gap-2">
                  <Input type="time" aria-label={`${dayName(i)} start`} className="h-9 w-32" value={r.start} onChange={(e) => set({ start: e.target.value })} />
                  <span className="text-subtle">–</span>
                  <Input
                    type="time"
                    aria-label={`${dayName(i)} end`}
                    aria-invalid={r.end <= r.start || undefined}
                    className="h-9 w-32"
                    value={r.end}
                    onChange={(e) => set({ end: e.target.value })}
                  />
                </span>
              ) : (
                <span className="text-subtle text-sm">{t('workingHours.off')}</span>
              )}
            </div>
          )
        })}
      </div>
      <Button
        variant="primary"
        className="mt-4"
        disabled={invalid || save.isPending}
        onClick={() => save.mutate(Object.fromEntries(DAYS.map((d) => [d, rows[d].on ? [[rows[d].start, rows[d].end]] : []])) as WorkingHours)}
      >
        {save.isPending ? t('common:actions.saving') : t('common:actions.save')}
      </Button>
    </Card>
  )
}
