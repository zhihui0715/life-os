import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { Habit, HabitScheduleType } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useGoals } from '../goals/api'
import { useCreateHabit, useUpdateHabit, WEEKDAY_BITS } from './api'

interface FormState {
  name: string
  description: string
  schedule_type: HabitScheduleType
  weekday_mask: number
  times_per_week: number
  target_value: string
  target_unit: string
  start_date: string
  goal_id: string
}

/** Weekday names in the current language, Monday first (2024-01-01 was a Monday). */
export function weekdayNames(lang: string, style: 'short' | 'narrow' | 'long' = 'short') {
  return WEEKDAY_BITS.map((_, i) => new Intl.DateTimeFormat(lang, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))))
}

export function HabitFormDialog({ open, onClose, habit }: { open: boolean; onClose: () => void; habit?: Habit }) {
  const { t, i18n } = useTranslation('habits')
  const me = useMe()
  const toast = useToast()
  const navigate = useNavigate()
  const create = useCreateHabit()
  const update = useUpdateHabit()
  const goals = (useGoals('active').data ?? []).filter((g) => !g.archived_at)
  const [f, setF] = useState<FormState | null>(null)

  useEffect(() => {
    if (!open) return
    setF(
      habit
        ? {
            name: habit.name, description: habit.description ?? '', schedule_type: habit.schedule_type,
            weekday_mask: habit.weekday_mask, times_per_week: habit.times_per_week,
            target_value: habit.target_value?.toString() ?? '', target_unit: habit.target_unit ?? '',
            start_date: habit.start_date, goal_id: habit.goal_id ?? '',
          }
        : {
            name: '', description: '', schedule_type: 'daily', weekday_mask: 31, times_per_week: 3,
            target_value: '', target_unit: '', start_date: todayInZone(me.settings.timezone), goal_id: '',
          },
    )
    create.reset()
    update.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the dialog opens
  }, [open, habit?.id])

  if (!open || !f) return null
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => (x ? { ...x, [k]: v } : x))
  const busy = create.isPending || update.isPending
  const invalid = !f.name.trim() || (f.schedule_type === 'weekdays' && f.weekday_mask === 0)
  const days = weekdayNames(i18n.language)

  const save = () => {
    if (invalid) return
    const body = {
      name: f.name.trim(),
      description: f.description.trim() || null,
      schedule_type: f.schedule_type,
      ...(f.schedule_type === 'weekdays' ? { weekday_mask: f.weekday_mask } : {}),
      ...(f.schedule_type === 'x_per_week' ? { times_per_week: f.times_per_week } : {}),
      target_value: f.target_value ? Number(f.target_value) : null,
      target_unit: f.target_unit.trim() || null,
      goal_id: f.goal_id || null,
    }
    const fail = (e: unknown) => toast(errorMessage(t, e), 'error')
    if (habit) {
      update.mutate({ id: habit.id, ...body }, { onSuccess: () => { toast(t('toast.updated')); onClose() }, onError: fail })
    } else {
      create.mutate({ ...body, start_date: f.start_date }, {
        onSuccess: (h) => { toast(t('toast.created')); onClose(); navigate(`/habits/${h.id}`) },
        onError: fail,
      })
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={habit ? t('edit') : t('new')}
      placement="side"
      footer={
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={busy || invalid}>
            {busy ? t('common:actions.saving') : t('common:actions.save')}
          </Button>
        </div>
      }
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label={t('fields.name')}>
          {(a) => <Input {...a} data-autofocus maxLength={120} value={f.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field label={t('fields.schedule')} help={habit ? t('schedule.changeNote') : undefined}>
          {(a) => (
            <Select {...a} value={f.schedule_type} onChange={(e) => set('schedule_type', e.target.value as HabitScheduleType)}>
              {(['daily', 'weekdays', 'x_per_week'] as const).map((s) => (
                <option key={s} value={s}>{t(`schedule.${s}`)}</option>
              ))}
            </Select>
          )}
        </Field>
        {f.schedule_type === 'weekdays' && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{t('fields.days')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_BITS.map((bit, i) => {
                const on = (f.weekday_mask & bit) !== 0
                return (
                  <button
                    key={bit}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('weekday_mask', f.weekday_mask ^ bit)}
                    className={cn('pressable h-10 w-10 rounded-full text-[14px] font-semibold', on ? 'bg-accent-fill text-on-accent' : 'bg-sunken text-muted hover:text-fg')}
                  >
                    {days[i]}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}
        {f.schedule_type === 'x_per_week' && (
          <Field label={t('fields.timesPerWeek')}>
            {(a) => <Input {...a} type="number" min={1} max={7} value={f.times_per_week} onChange={(e) => set('times_per_week', Math.min(7, Math.max(1, Number(e.target.value) || 1)))} />}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fields.target')}>
            {(a) => <Input {...a} type="number" min={0} step="any" value={f.target_value} onChange={(e) => set('target_value', e.target.value)} />}
          </Field>
          <Field label={t('fields.unit')}>
            {(a) => <Input {...a} maxLength={20} value={f.target_unit} onChange={(e) => set('target_unit', e.target.value)} />}
          </Field>
        </div>
        {!habit && (
          <Field label={t('fields.startDate')}>
            {(a) => <Input {...a} type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />}
          </Field>
        )}
        <Field label={t('fields.goal')}>
          {(a) => (
            <Select {...a} value={f.goal_id} onChange={(e) => set('goal_id', e.target.value)}>
              <option value="">{t('tasks:fields.noGoal')}</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t('fields.description')}>
          {(a) => <Textarea {...a} rows={3} maxLength={5000} value={f.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
