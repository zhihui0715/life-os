import { Activity, CheckCircle2, Repeat, Timer, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Skeleton } from '../../components/ui/states'
import { Ring, Sparkline } from '../../components/ui/Sparkline'
import { formatMinutes } from '../../lib/dates'
import { useOverview, useTrend } from '../insights/api'
import { Delta } from '../insights/BalanceCard'

/**
 * The week in four numbers, at the top of Home: balance score with its eight-week trend, tasks on time and habit
 * consistency as rings, and focus time. Each tile opens Insights for the detail. Same data as the Insights page
 * (cached, so it costs nothing extra there).
 */
export function PulseStrip() {
  const { t, i18n } = useTranslation()
  const overview = useOverview('week', 0)
  const trend = useTrend(8)
  const o = overview.data

  if (!o) {
    return overview.isPending ? (
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-[20px]" />)}
      </div>
    ) : null
  }
  const c = o.components
  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`)

  return (
    <section aria-label={t('home.pulse.label')} className="stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile icon={Activity} tint="var(--tint-insights)" label={t('home.pulse.balance')} value={o.score.value == null ? '—' : String(Math.round(o.score.value))} suffix="/100"
        foot={<Delta now={o.score.value} before={o.previous.score} />}>
        <Sparkline values={(trend.data ?? []).map((w) => w.score)} max={100} className="h-9 w-full" />
      </Tile>
      <Tile icon={CheckCircle2} tint="var(--tint-tasks)" label={t('home.pulse.tasks')} value={pct(c.tasks.rate)}
        foot={<span className="text-subtle text-xs">{t('home.pulse.completed', { count: c.tasks.completed })}</span>}
        aside={<Ring value={c.tasks.rate} color="var(--series-1)" />} />
      <Tile icon={Repeat} tint="var(--tint-habits)" label={t('home.pulse.habits')} value={pct(c.habits.rate)}
        foot={<span className="text-subtle text-xs">{c.habits.eligible ? t('home.pulse.checks', { done: c.habits.done, eligible: c.habits.eligible }) : t('home.pulse.noData')}</span>}
        aside={<Ring value={c.habits.rate} color="var(--series-2)" />} />
      <Tile icon={Timer} tint="var(--tint-focus)" label={t('home.pulse.focus')} value={formatMinutes(o.focus.minutes, i18n.language)}
        foot={<span className="text-subtle text-xs">{t('home.pulse.sessions', { count: o.focus.completed })}</span>}>
        <Sparkline values={c.goals_learning.daily_learning.map((d) => d.minutes)} color="var(--tint-focus)" className="h-9 w-full" />
      </Tile>
    </section>
  )
}

function Tile({ icon: Icon, tint, label, value, suffix, foot, aside, children }: {
  icon: LucideIcon
  tint: string
  label: string
  value: string
  suffix?: string
  foot?: ReactNode
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    <Link to="/insights" className="glass-card bg-surface shadow-card pressable flex min-w-0 flex-col gap-1 rounded-[20px] p-3.5 hover:-translate-y-0.5 dark:shadow-none">
      <span className="text-muted flex items-center gap-1.5 text-[12.5px] font-semibold">
        <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${tint} 18%, transparent)`, color: tint }}>
          <Icon size={13} strokeWidth={2.4} aria-hidden />
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="font-display text-[28px] leading-none font-bold tracking-tight tabular-nums">{value}</span>
          {suffix && <span className="text-subtle ml-0.5 text-[13px] font-medium">{suffix}</span>}
        </span>
        {aside}
      </span>
      {children}
      {foot && <span className="mt-auto">{foot}</span>}
    </Link>
  )
}
