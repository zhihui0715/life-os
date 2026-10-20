import { Check, Flame, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../components/ui/cn'
import { useToast } from '../../components/ui/Toast'
import { todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { Habit } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useCheckIn, WEEKDAY_BITS } from './api'
import { weekdayNames } from './HabitFormDialog'

/** "Every day", "Mon, Wed, Fri" or "3× per week" in the current language. */
export function useScheduleSummary() {
  const { t, i18n } = useTranslation('habits')
  return (h: Pick<Habit, 'schedule_type' | 'weekday_mask' | 'times_per_week'>) => {
    if (h.schedule_type === 'x_per_week') return t('schedule.summary_x_per_week', { count: h.times_per_week })
    if (h.schedule_type === 'daily' || h.weekday_mask === 127) return t('schedule.summary_daily')
    const names = weekdayNames(i18n.language)
    const list = WEEKDAY_BITS.flatMap((bit, i) => (h.weekday_mask & bit ? [names[i]] : []))
    return t('schedule.summary_weekdays', { days: new Intl.ListFormat(i18n.language, { style: 'narrow' }).format(list) })
  }
}

/** One-tap check-in for today: tap to mark done, tap again to undo. */
export function CheckButton({ habit, size = 'md' }: { habit: Habit; size?: 'md' | 'lg' }) {
  const { t } = useTranslation('habits')
  const me = useMe()
  const toast = useToast()
  const checkIn = useCheckIn()
  const state = habit.today?.state ?? null
  const today = todayInZone(me.settings.timezone)

  const toggle = () =>
    checkIn.mutate(
      { id: habit.id, date: today, state: state === 'done' ? null : 'done', value: habit.target_value },
      {
        onSuccess: () => toast(t(state === 'done' ? 'toast.cleared' : 'toast.checked')),
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'done'}
      aria-label={t(state === 'done' ? 'actions.undo' : 'actions.done', { name: habit.name })}
      disabled={checkIn.isPending}
      onClick={toggle}
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        size === 'lg' ? 'h-11 w-11' : 'h-9 w-9',
        state === 'done' ? 'border-success bg-success text-white' : state === 'skipped' ? 'border-border bg-sunken text-subtle' : 'border-border-strong hover:border-success text-transparent hover:text-success/40',
      )}
    >
      {state === 'skipped' ? <Moon size={16} aria-hidden /> : <Check size={size === 'lg' ? 22 : 18} strokeWidth={3} aria-hidden />}
    </button>
  )
}

export function StreakBadge({ habit }: { habit: Habit }) {
  const { t } = useTranslation('habits')
  const s = habit.stats
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', s.current_streak > 0 ? 'text-warning' : 'text-subtle')}>
      <Flame size={13} aria-hidden />
      {t(`stats.streak_${s.unit}`, { count: s.current_streak })}
    </span>
  )
}

const DOT: Record<string, string> = {
  done: 'bg-success',
  skipped: 'bg-subtle/40',
  missed: 'bg-danger/70',
  open: 'border border-border-strong',
  rest: 'bg-sunken',
}

/** The last 7 days as small dots (oldest first). */
export function WeekDots({ habit }: { habit: Habit }) {
  const { t, i18n } = useTranslation('habits')
  const names = weekdayNames(i18n.language, 'narrow')
  const lastIndex = habit.last7.length - 1
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {habit.last7.map((d, i) => {
        const status = d.state ?? (d.scheduled ? (i === lastIndex ? 'open' : 'missed') : 'rest')
        const dow = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7
        return (
          <span key={d.date} title={`${d.date} · ${t(`state.${status}`)}`} className="flex flex-col items-center gap-0.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', DOT[status])} />
            <span className="text-subtle text-[9px] leading-none">{names[dow]}</span>
          </span>
        )
      })}
    </span>
  )
}

export function HistoryDot({ status }: { status: string }) {
  return <span className={cn('block h-full w-full rounded-[3px]', DOT[status])} />
}
