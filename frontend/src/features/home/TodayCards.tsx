import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { useMe } from '../auth/AuthProvider'
import { useHabits } from '../habits/api'
import { CheckButton, StreakBadge } from '../habits/HabitParts'
import { useEntry, useSaveEntry } from '../journal/api'
import { MoodPicker } from '../journal/MoodPicker'

/** Habits scheduled today (or weekly-target habits still short of their target), with one-tap check-in. */
export function HabitsTodayCard() {
  const { t } = useTranslation()
  const habits = useHabits().data
  if (!habits?.length) return null
  const due = habits.filter((h) => h.scheduled_today && (h.schedule_type !== 'x_per_week' || h.today || (h.stats.target_this_week ?? 0) > h.stats.done_this_week))
  return (
    <Card className="overflow-hidden">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">{t('home.habits')}</h2>
        <Link to="/habits" className="text-accent inline-flex items-center gap-1 text-sm font-medium hover:underline">
          {t('home.viewAll')}
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
      {due.length === 0 ? (
        <p className="text-subtle px-4 py-3 text-sm">{t('home.noHabits')}</p>
      ) : (
        <ul className="divide-border divide-y">
          {due.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
              <CheckButton habit={h} />
              <Link to={`/habits/${h.id}`} className="min-w-0 flex-1">
                <span className="block truncate">{h.name}</span>
                <StreakBadge habit={h} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Quick mood / energy check-in; saved on today's journal entry. */
export function MoodCheckInCard() {
  const { t } = useTranslation()
  const me = useMe()
  const toast = useToast()
  const today = todayInZone(me.settings.timezone)
  const entry = useEntry(today)
  const save = useSaveEntry()
  const set = (field: 'mood' | 'energy', value: number | null) =>
    save.mutate({ date: today, [field]: value }, { onSuccess: () => toast(t('home.moodSaved')), onError: (e) => toast(errorMessage(t, e), 'error') })
  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">{t('home.checkIn')}</h2>
      <div className="flex flex-col gap-2">
        <MoodPicker compact kind="mood" value={entry.data?.mood ?? null} onChange={(v) => set('mood', v)} />
        <MoodPicker compact kind="energy" value={entry.data?.energy ?? null} onChange={(v) => set('energy', v)} />
      </div>
    </Card>
  )
}
