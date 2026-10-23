import { CalendarCheck, CalendarClock, Clock, Flame, Sparkle, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button } from '../../components/ui/Button'
import { CheckMark } from '../../components/ui/CheckMark'
import { cn } from '../../components/ui/cn'
import { ChoiceChip } from '../../components/ui/Segments'
import { useToast } from '../../components/ui/Toast'
import { EmptyState, ErrorState, GroupSection, ListSkeleton } from '../../components/ui/states'
import { addDays, formatInstant, formatMinutes, todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { play } from '../../lib/sound'
import type { Occurrence } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useUpdateTask } from '../tasks/api'
import { useAddBlocks, useDayPlan, useSchedule, type DayPlan, type PlanDay, type PlannedBlock, type Reason } from './api'

const REASON_TONE: Record<Reason, string> = {
  overdue: 'bg-danger-soft text-danger',
  due_today: 'bg-warning-soft text-warning',
  deadline_soon: 'bg-warning-soft text-warning',
  in_progress: 'bg-accent-soft text-accent',
  high_priority: 'bg-accent-soft text-accent',
  due_soon: 'bg-sunken text-muted',
}

/**
 * Plan my day, in three steps: pick what matters (suggestions pre-ticked) → see it fitted into the free time
 * around your events → add the blocks you keep to the calendar.
 */
export function DayPlanner() {
  const { t } = useTranslation('planning')
  const [day, setDay] = useState<PlanDay>('today')
  const plan = useDayPlan(day)

  return (
    <>
      <div className="mb-4 flex gap-2" role="group" aria-label={t('day.which')}>
        {(['today', 'tomorrow'] as const).map((d) => (
          <ChoiceChip key={d} selected={day === d} onClick={() => setDay(d)}>
            {t(`day.${d}`)}
          </ChoiceChip>
        ))}
      </div>
      {plan.isPending ? (
        <ListSkeleton rows={5} />
      ) : plan.isError ? (
        <ErrorState message={errorMessage(t, plan.error)} onRetry={() => plan.refetch()} />
      ) : (
        // Keyed by date so switching days starts the flow afresh
        <Flow key={plan.data.date} day={day} plan={plan.data} />
      )}
    </>
  )
}

function Flow({ day, plan }: { day: PlanDay; plan: DayPlan }) {
  const { t, i18n } = useTranslation('planning')
  const toast = useToast()
  const tz = useMe().settings.timezone
  const lang = i18n.language
  const schedule = useSchedule()
  const add = useAddBlocks()
  const update = useUpdateTask()
  const [chosen, setChosen] = useState(() => new Set(plan.suggested))
  const [blocks, setBlocks] = useState<PlannedBlock[] | null>(null)
  const [unplaced, setUnplaced] = useState<string[]>([])
  const [moved, setMoved] = useState<Set<string>>(new Set())
  const [done, setDone] = useState(false)
  const byId = new Map(plan.candidates.map((c) => [c.task.id, c.task]))
  const time = (iso: string) => formatInstant(iso, lang, tz, { month: undefined, day: undefined })

  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) {
      next.delete(id)
      play('uncheck')
    } else {
      next.add(id)
      play('tap')
    }
    setChosen(next)
  }

  const fit = () =>
    schedule.mutate(
      { day, task_ids: plan.candidates.filter((c) => chosen.has(c.task.id)).map((c) => c.task.id) },
      {
        onSuccess: (r) => {
          play('open')
          setBlocks(r.blocks)
          setUnplaced(r.unplaced)
        },
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )

  const commit = () =>
    add.mutate(blocks ?? [], {
      onSuccess: (n) => {
        play('success')
        toast(t('day.added', { count: n }))
        setDone(true)
      },
      onError: (e) => toast(errorMessage(t, e), 'error'),
    })

  const moveToTomorrow = (id: string) =>
    update.mutate(
      { id, due_date: addDays(todayInZone(tz), 1) },
      {
        onSuccess: () => {
          setMoved(new Set(moved).add(id))
          toast(t('day.moved'))
        },
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )

  const timed = plan.events.filter((e) => !e.all_day)
  const allDay = plan.events.filter((e) => e.all_day)

  const summary = (
    <div className="stagger flex flex-wrap gap-2">
      <SummaryPill icon={Clock} text={plan.free_minutes ? t('day.free', { time: formatMinutes(plan.free_minutes, lang) }) : t('day.noFree')} />
      <SummaryPill icon={CalendarClock} text={t('day.events', { count: plan.events.length })} />
      {plan.habits.length > 0 && <SummaryPill icon={Flame} text={t('day.habits', { count: plan.habits.length })} />}
    </div>
  )

  if (done) {
    return (
      <div className="bg-surface shadow-card page-enter flex flex-col items-center rounded-[22px] px-6 py-12 text-center dark:shadow-none">
        <span className="bg-success-fill animate-pop mb-4 flex h-16 w-16 items-center justify-center rounded-full text-white">
          <CalendarCheck size={30} aria-hidden />
        </span>
        <h2 className="font-display text-[22px] font-bold tracking-tight">{t('day.doneTitle')}</h2>
        <p className="text-subtle mt-1 max-w-sm">{t('day.doneBody')}</p>
        <div className="mt-6 flex gap-2">
          <Link to="/calendar" className="pressable bg-accent-fill text-on-accent inline-flex h-11 items-center rounded-full px-5 font-semibold">
            {t('day.openCalendar')}
          </Link>
          <Button onClick={() => { setDone(false); setBlocks(null) }}>{t('day.again')}</Button>
        </div>
      </div>
    )
  }

  if (blocks) {
    const rows: ({ kind: 'event'; at: string; e: Occurrence } | { kind: 'block'; at: string; b: PlannedBlock })[] = [
      ...timed.map((e) => ({ kind: 'event' as const, at: e.starts_at, e })),
      ...blocks.map((b) => ({ kind: 'block' as const, at: b.starts_at, b })),
    ].sort((a, b) => a.at.localeCompare(b.at))
    return (
      <div className="page-enter flex flex-col gap-6">
        {summary}
        <GroupSection title={t('day.planTitle')}>
          <p className="text-subtle px-4 pt-3 text-[13px]">{t('day.planHelp')}</p>
          {allDay.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
              {allDay.map((e) => (
                <span key={e.id} className="bg-sunken text-muted rounded-full px-2.5 py-1 text-xs font-medium">{e.title}</span>
              ))}
            </div>
          )}
          <ol className="stagger flex flex-col gap-1.5 p-3">
            {rows.map((r) =>
              r.kind === 'event' ? (
                <li key={`e${r.e.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <span className="text-subtle w-16 shrink-0 text-[13px] leading-tight tabular-nums"><span className="block">{time(r.e.starts_at)}</span>{time(r.e.ends_at)}</span>
                  <span className="bg-border-strong h-2 w-2 shrink-0 rounded-full" aria-hidden />
                  <span className="text-muted min-w-0 flex-1 truncate">{r.e.title}</span>
                  <span className="text-subtle text-xs">{t('day.event')}</span>
                </li>
              ) : (
                <li key={`b${r.b.task_id}`} className="bg-accent-soft flex items-center gap-3 rounded-xl px-2 py-2.5">
                  <span className="text-accent w-16 shrink-0 text-[13px] leading-tight font-semibold tabular-nums"><span className="block">{time(r.b.starts_at)}</span><span className="font-normal">{time(r.b.ends_at)}</span></span>
                  <span className="bg-accent-fill h-2 w-2 shrink-0 rounded-full" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.b.title}</span>
                    <span className="text-subtle text-xs">{r.b.estimated ? formatMinutes(r.b.minutes, lang) : t('day.noEstimate')}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-subtle h-8 w-8"
                    aria-label={t('day.remove', { title: r.b.title })}
                    onClick={() => {
                      play('uncheck')
                      setBlocks(blocks.filter((x) => x !== r.b))
                    }}
                  >
                    <X size={16} aria-hidden />
                  </Button>
                </li>
              ),
            )}
          </ol>
        </GroupSection>

        {unplaced.length > 0 && (
          <GroupSection title={t('day.unplaced')} tone="danger">
            <p className="text-subtle px-4 pt-3 text-[13px]">{t('day.unplacedHelp')}</p>
            <ul className="divide-border divide-y">
              {unplaced.map((id) => (
                <li key={id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate">{byId.get(id)?.title}</span>
                  {day === 'today' &&
                    (moved.has(id) ? (
                      <span className="text-success text-[13px] font-medium">{t('day.moved')}</span>
                    ) : (
                      <Button size="sm" onClick={() => moveToTomorrow(id)} disabled={update.isPending}>
                        {t('day.moveTomorrow')}
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
          </GroupSection>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!blocks.length || add.isPending} onClick={commit}>
            <CalendarCheck size={17} aria-hidden />
            {t('day.add', { count: blocks.length })}
          </Button>
          <Button onClick={() => setBlocks(null)}>{t('day.back')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {summary}
      <GroupSection
        title={t('day.pickTitle')}
        action={<span className="text-subtle text-[13px] font-medium">{t('day.picked', { count: chosen.size })}</span>}
      >
        {plan.candidates.length === 0 ? (
          <EmptyState icon={Sparkle} title={t('day.empty')} />
        ) : (
          <>
            <p className="text-subtle px-4 pt-3 text-[13px]">{t('day.pickHelp')}</p>
            <ul className="divide-border stagger divide-y">
              {plan.candidates.map(({ task, reasons, scheduled }) => {
                const on = chosen.has(task.id)
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={scheduled}
                      onClick={() => toggle(task.id)}
                      className="group/check hover:bg-sunken/50 flex w-full items-start gap-3 px-4 py-3 text-left transition-colors disabled:opacity-55"
                    >
                      <span className="mt-px">
                        <CheckMark checked={on} celebrate={on} size={22} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15.5px] break-words">{task.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          {scheduled ? (
                            <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[11.5px] font-semibold">{t('day.scheduledAlready')}</span>
                          ) : (
                            reasons.slice(0, 2).map((r) => (
                              <span key={r} className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', REASON_TONE[r])}>
                                {t(`day.reasons.${r}`)}
                              </span>
                            ))
                          )}
                          {task.estimate_minutes != null && (
                            <span className="text-subtle inline-flex items-center gap-1 text-xs">
                              <Clock size={12} aria-hidden />
                              {formatMinutes(task.estimate_minutes, lang)}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </GroupSection>

      {plan.habits.length > 0 && (
        <GroupSection title={t('day.habitsTitle')}>
          <ul className="flex flex-wrap gap-2 p-4">
            {plan.habits.map((h) => (
              <li key={h.id}>
                <Link to={`/habits/${h.id}`} className="bg-sunken pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium">
                  <Flame size={14} className="text-[var(--tint-habits)]" aria-hidden />
                  {h.name}
                </Link>
              </li>
            ))}
          </ul>
        </GroupSection>
      )}

      {plan.candidates.length > 0 && (
        <div>
          <Button variant="primary" disabled={!chosen.size || schedule.isPending} onClick={fit}>
            <Sparkle size={17} aria-hidden />
            {schedule.isPending ? t('day.fitting') : t('day.fit')}
          </Button>
        </div>
      )}
    </div>
  )
}

function SummaryPill({ icon: Icon, text }: { icon: typeof Clock; text: string }) {
  return (
    <span className="bg-surface shadow-card inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold dark:shadow-none">
      <Icon size={14} className="text-accent" aria-hidden />
      {text}
    </span>
  )
}
