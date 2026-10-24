import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { Button } from '../../components/ui/Button'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { Segmented } from '../../components/ui/Segments'
import { cn } from '../../components/ui/cn'
import { Card, ErrorState, ListSkeleton, PageHeader } from '../../components/ui/states'
import { formatDay, formatMinutes } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { Overview } from '../../lib/types'
import { useOverview, useTrend, type PeriodKind } from './api'
import { BalanceCard, Delta, Meter } from './BalanceCard'
import { MinutesBars, MoodChart, ScoreTrendChart } from './charts'

function MetricCard({ title, formula, children, className }: { title: string; formula?: string; children: ReactNode; className?: string }) {
  const { t } = useTranslation('insights')
  return (
    <Card className={cn('p-4', className)}>
      <h2 className="mb-2 text-[17px] font-semibold tracking-tight">{title}</h2>
      {children}
      {formula && (
        <details className="mt-2">
          <summary className="text-subtle hover:text-fg inline-flex cursor-pointer items-center gap-1 text-xs select-none">
            <Info size={12} aria-hidden />{t('metrics.how')}
          </summary>
          <p className="text-muted mt-1 text-xs">{formula}</p>
        </details>
      )}
    </Card>
  )
}

function Big({ value, suffix, children }: { value: string; suffix?: string; children?: ReactNode }) {
  return (
    <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
      <span className="font-display text-[34px] leading-none font-bold tracking-tight tabular-nums">{value}</span>
      {suffix && <span className="text-subtle text-sm">{suffix}</span>}
      {children}
    </div>
  )
}

export function InsightsPage() {
  const { t, i18n } = useTranslation('insights')
  const [params, setParams] = useSearchParams()
  const period = (params.get('period') === 'month' ? 'month' : 'week') as PeriodKind
  const offset = Math.min(0, Number(params.get('offset')) || 0)
  const overview = useOverview(period, offset)
  const trend = useTrend(8)
  const lang = i18n.language

  const setPeriod = (p: PeriodKind, o: number) => setParams(p === 'week' && o === 0 ? {} : { period: p, ...(o ? { offset: String(o) } : {}) })

  return (
    <>
      <PageHeader title={t('title')} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented items={['week', 'month'] as const} value={period} onChange={(p) => setPeriod(p, 0)} label={t('period.label')} render={(p) => t(`period.${p}`)} />
        <div className="flex items-center gap-1 sm:ml-auto">
          <Button size="icon" variant="ghost" aria-label={t('period.prev')} onClick={() => setPeriod(period, offset - 1)}>
            <ChevronLeft size={18} aria-hidden />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">
            {overview.data && `${formatDay(overview.data.period.start, lang)} – ${formatDay(overview.data.period.end, lang, { year: 'numeric' })}`}
          </span>
          <Button size="icon" variant="ghost" aria-label={t('period.next')} disabled={offset >= 0} onClick={() => setPeriod(period, offset + 1)}>
            <ChevronRight size={18} aria-hidden />
          </Button>
        </div>
      </div>

      {overview.isPending ? (
        <ListSkeleton rows={6} />
      ) : overview.isError ? (
        <ErrorState message={errorMessage(t, overview.error)} onRetry={() => overview.refetch()} />
      ) : (
        <Body data={overview.data} trendWeeks={trend.data} />
      )}
    </>
  )
}

function Body({ data, trendWeeks }: { data: Overview; trendWeeks?: { start: string; score: number | null }[] }) {
  const { t, i18n } = useTranslation('insights')
  const lang = i18n.language
  const c = data.components
  const total = (new Date(`${data.period.end}T00:00:00Z`).getTime() - new Date(`${data.period.start}T00:00:00Z`).getTime()) / 86_400_000 + 1
  const inProgress = data.period.elapsed_days < total
  const pct = (v: number | null) => (v == null ? t('metrics.noData') : `${Math.round(v)}%`)

  return (
    <>
      {inProgress && <p className="text-subtle mb-3 text-xs">{t('period.inProgress', { days: data.period.elapsed_days, total })}</p>}
      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <BalanceCard data={data} />

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-4">
            <h2 className="mb-1 text-[17px] font-semibold tracking-tight">{t('trend.title')}</h2>
            <p className="text-subtle mb-2 text-xs">{t('trend.gap')}</p>
            {trendWeeks && trendWeeks.some((w) => w.score != null) ? <ScoreTrendChart data={trendWeeks} /> : <p className="text-subtle text-sm">{t('trend.noData')}</p>}
          </Card>

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <MetricCard title={t('metrics.tasksTitle')} formula={t('formula.tasks')}>
              <Big value={pct(c.tasks.rate)} suffix={c.tasks.rate == null ? undefined : t('metrics.onTime')}>
                <Delta now={c.tasks.rate} before={data.previous.components.tasks} unit="%" />
              </Big>
              {c.tasks.due > 0 && (
                <p className="text-muted text-xs">{t('metrics.dueBreakdown', { onTime: c.tasks.on_time, late: c.tasks.late, missed: c.tasks.missed, due: c.tasks.due })}</p>
              )}
              <p className="text-subtle mt-1 text-xs">{t('metrics.completed')}: {c.tasks.completed} · {t('metrics.created')}: {c.tasks.created}</p>
            </MetricCard>

            <MetricCard title={t('metrics.habitsTitle')} formula={t('formula.habits')}>
              <Big value={pct(c.habits.rate)} suffix={c.habits.rate == null ? undefined : t('metrics.consistency')}>
                <Delta now={c.habits.rate} before={data.previous.components.habits} unit="%" />
              </Big>
              {c.habits.eligible > 0 && <p className="text-muted text-xs">{t('metrics.habitBreakdown', { done: c.habits.done, eligible: c.habits.eligible })}</p>}
            </MetricCard>

            <MetricCard title={t('metrics.learningTitle')} formula={t('formula.goals_learning')}>
              <Big value={formatMinutes(c.goals_learning.learning_minutes, lang)}
                suffix={c.goals_learning.learning_target_minutes ? t('metrics.target', { target: formatMinutes(c.goals_learning.learning_target_minutes, lang) }) : undefined} />
              {c.goals_learning.learning_target_minutes ? (
                <Meter value={c.goals_learning.learning_rate} label={t('metrics.learningTime')} />
              ) : (
                <p className="text-subtle text-xs">{t('metrics.noTarget')} · <Link to="/settings" className="text-accent underline underline-offset-2">{t('metrics.setTarget')}</Link></p>
              )}
              {c.goals_learning.learning_minutes > 0 && (
                <div className="mt-3"><MinutesBars data={c.goals_learning.daily_learning} name={t('metrics.learningTime')} /></div>
              )}
            </MetricCard>

            <MetricCard title={t('metrics.goalsTitle')}>
              {c.goals_learning.goals.length === 0 ? (
                <p className="text-subtle text-sm">{t('metrics.noGoals')}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {c.goals_learning.goals.map((g) => (
                    <li key={g.goal_id} className="text-sm">
                      <Link to={`/goals/${g.goal_id}`} className="font-medium hover:underline">{g.title}</Link>
                      <p className="text-subtle mb-1 text-xs">{t('metrics.goalLine', { progress: Math.round(g.progress), expected: Math.round(g.expected) })}</p>
                      <Meter value={g.on_track} label={g.title} />
                    </li>
                  ))}
                </ul>
              )}
            </MetricCard>

            <MetricCard title={t('metrics.moodTitle')} formula={t('formula.wellbeing')} className="sm:col-span-2">
              <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span>{t('metrics.mood')}: <strong>{c.wellbeing.average_mood ?? '—'}</strong>/5</span>
                <span>{t('metrics.energy')}: <strong>{c.wellbeing.average_energy ?? '—'}</strong>/5</span>
                {c.wellbeing.check_in_days < c.wellbeing.min_days && (
                  <span className="text-subtle text-xs">{t('metrics.moodNeedsDays', { count: c.wellbeing.check_in_days, min: c.wellbeing.min_days })}</span>
                )}
              </div>
              {c.wellbeing.daily.length > 0 && <MoodChart data={c.wellbeing.daily} />}
            </MetricCard>

            <MetricCard title={t('metrics.timeTitle')}>
              {data.time.total_minutes === 0 ? (
                <p className="text-subtle text-sm">{t('metrics.timeNone')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.time.by_category.map((row) => (
                    <li key={row.category_id ?? 'none'} className="text-sm">
                      <div className="mb-0.5 flex justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color ?? 'var(--border-strong)' }} aria-hidden />
                          <span className="truncate">{row.name ?? t('metrics.uncategorised')}</span>
                        </span>
                        <span className="text-muted tabular-nums">{formatMinutes(row.minutes, lang)}</span>
                      </div>
                      {/* magnitude → one hue for every bar; the dot carries the category's identity */}
                      <ProgressBar value={(100 * row.minutes) / data.time.total_minutes} celebrate={false} />
                    </li>
                  ))}
                </ul>
              )}
            </MetricCard>

            <div className="flex flex-col gap-4">
              <MetricCard title={t('metrics.focusTitle')}>
                <Big value={formatMinutes(data.focus.minutes, lang)} />
                <p className="text-muted text-xs">{t('metrics.focusLine', { completed: data.focus.completed, interrupted: data.focus.interrupted })}</p>
              </MetricCard>
              <MetricCard title={t('metrics.estimatesTitle')}>
                {data.estimates.ratio == null ? (
                  <p className="text-subtle text-sm">{t('metrics.estimatesNone')}</p>
                ) : (
                  <>
                    <Big value={t('metrics.ratio', { ratio: data.estimates.ratio })} />
                    <p className="text-muted text-xs">{t('metrics.estimatesLine', {
                      actual: formatMinutes(data.estimates.actual_minutes, lang),
                      estimated: formatMinutes(data.estimates.estimated_minutes, lang),
                      tasks: data.estimates.tasks,
                    })}</p>
                  </>
                )}
              </MetricCard>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
