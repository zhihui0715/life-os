import { CalendarDays, ChevronRight, Play, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { GroupSection } from '../../components/ui/states'
import { addDays, formatInstant, formatMinutes, todayInZone, wallTimeToUtcIso } from '../../lib/dates'
import { useOnline } from '../../lib/offline'
import { useMe } from '../auth/AuthProvider'
import { useOccurrences } from '../calendar/api'
import { useCurrentFocus } from '../focus/api'
import { clock, useFocusClock } from '../focus/FocusTimer'
import { GoalProgress } from '../goals/GoalProgress'
import { useGoals } from '../goals/api'
import { useOverview } from '../insights/api'
import { Meter } from '../insights/BalanceCard'

export function ViewAll({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="text-accent pressable inline-flex items-center text-[15px] font-medium">
      {label}
      <ChevronRight size={17} aria-hidden />
    </Link>
  )
}

export function Section({ title, to, children }: { title: string; to?: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <GroupSection title={title} action={to && <ViewAll to={to} label={t('home.viewAll')} />}>
      {children}
    </GroupSection>
  )
}

export function ScheduleSection() {
  const { t, i18n } = useTranslation()
  const tz = useMe().settings.timezone
  const today = todayInZone(tz)
  const occ = useOccurrences({ start: wallTimeToUtcIso(`${today}T00:00`, tz), end: wallTimeToUtcIso(`${addDays(today, 1)}T00:00`, tz) })
  const items = (occ.data?.items ?? []).filter((o) => o.kind !== 'preference')
  const time = (iso: string) => formatInstant(iso, i18n.language, tz, { month: undefined, day: undefined })
  return (
    <Section title={t('home.schedule')} to="/calendar">
      {items.length === 0 ? (
        <p className="text-subtle flex items-center gap-2 px-4 py-3 text-sm"><CalendarDays size={15} aria-hidden />{t('home.noEvents')}</p>
      ) : (
        <ul className="divide-border divide-y">
          {items.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="text-subtle w-28 shrink-0 tabular-nums">{o.all_day ? t('calendar:fields.allDay') : `${time(o.starts_at)} – ${time(o.ends_at)}`}</span>
              <span className={o.kind === 'task_block' ? 'text-success min-w-0 truncate' : 'min-w-0 truncate'}>{o.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function FocusSection() {
  const { t } = useTranslation('focus')
  const current = useCurrentFocus()
  const { remaining, focused } = useFocusClock(current.data, current.dataUpdatedAt)
  const s = current.data
  return (
    <Section title={t('title')} to="/focus">
      <Link to="/focus" className="hover:bg-sunken flex items-center gap-3 px-4 py-3">
        {s ? (
          <>
            <Timer size={20} aria-hidden className="text-accent" />
            <span className="min-w-0 flex-1 truncate">{s.task_title ?? s.label ?? t('timer.noTask')}</span>
            <span className="text-accent font-display text-[22px] font-semibold tabular-nums">{clock(remaining > 0 ? remaining : focused)}</span>
          </>
        ) : (
          <>
            <Play size={18} aria-hidden className="text-accent" />
            <span className="font-medium">{t('timer.start')}</span>
          </>
        )}
      </Link>
    </Section>
  )
}

/** Shown in place of a card's content when it has no data because the app is offline. */
function NotOffline() {
  const { t } = useTranslation()
  return useOnline() ? null : <p className="text-subtle px-4 py-3 text-sm">{t('offline.notSaved')}</p>
}

export function BalanceSection() {
  const { t } = useTranslation()
  const { t: ti } = useTranslation('insights')
  const o = useOverview('week', 0).data
  return (
    <Section title={t('home.balance')} to="/insights">
      {!o && <NotOffline />}
      <div className="px-4 py-3">
        {!o ? null : o.score.value == null ? (
          <p className="text-subtle text-sm">{ti('score.noData')}</p>
        ) : (
          <>
            <p className="mb-1"><span className="font-display text-[44px] leading-none font-bold tracking-tight tabular-nums">{Math.round(o.score.value)}</span><span className="text-subtle"> / 100</span></p>
            <p className="text-subtle mb-2 text-xs">{ti('score.coverage', {
              used: o.score.components.filter((c) => c.has_data && c.enabled).length,
              total: o.score.components.filter((c) => c.enabled && c.weight > 0).length,
              coverage: Math.round(o.score.coverage),
            })}</p>
            <ul className="flex flex-col gap-1.5">
              {o.score.components.filter((c) => c.enabled).map((c) => (
                <li key={c.key} className="grid grid-cols-[8rem_1fr] items-center gap-2 text-xs">
                  <span className="text-muted truncate">{ti(`components.${c.key}`)}</span>
                  <Meter value={c.score} label={ti(`components.${c.key}`)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Section>
  )
}

export function GoalsSection() {
  const { t } = useTranslation()
  const data = useGoals('active').data
  const goals = (data ?? []).slice(0, 3)
  return (
    <Section title={t('home.goals')} to="/goals">
      {!data ? (
        <NotOffline /> // not loaded: never claim "no goals" when we simply couldn't ask
      ) : goals.length === 0 ? (
        <p className="text-subtle px-4 py-3 text-sm">{t('home.noGoals')}</p>
      ) : (
        <ul className="divide-border divide-y">
          {goals.map((g) => (
            <li key={g.id}>
              <Link to={`/goals/${g.id}`} className="hover:bg-sunken block px-4 py-2.5">
                <span className="mb-1 block truncate text-sm font-medium">{g.title}</span>
                <GoalProgress goal={g} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function LearningSection() {
  const { t, i18n } = useTranslation()
  const { t: ti } = useTranslation('insights')
  const o = useOverview('week', 0).data
  const gl = o?.components.goals_learning
  return (
    <Section title={t('home.learning')} to="/focus">
      {!o && <NotOffline />}
      <div className="px-4 py-3">
        {gl && (
          <>
            <p className="mb-1">
              <span className="text-2xl font-semibold">{formatMinutes(gl.learning_minutes, i18n.language)}</span>
              {gl.learning_target_minutes != null && <span className="text-subtle text-sm"> {ti('metrics.target', { target: formatMinutes(gl.learning_target_minutes, i18n.language) })}</span>}
            </p>
            {gl.learning_target_minutes != null ? <Meter value={gl.learning_rate} label={t('home.learning')} /> : (
              <p className="text-subtle text-xs">{ti('metrics.noTarget')} · <Link to="/settings" className="text-accent underline underline-offset-2">{ti('metrics.setTarget')}</Link></p>
            )}
          </>
        )}
      </div>
    </Section>
  )
}
