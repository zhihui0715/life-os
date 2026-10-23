import { ArrowLeft, ArrowRight, CalendarArrowUp, Check, PartyPopper, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { CheckMark } from '../../components/ui/CheckMark'
import { cn } from '../../components/ui/cn'
import { Field, Input, Textarea } from '../../components/ui/Field'
import { Segmented, Stat } from '../../components/ui/Segments'
import { useToast } from '../../components/ui/Toast'
import { ErrorState, GroupSection, ListSkeleton } from '../../components/ui/states'
import { addDays, formatDay, formatMinutes, todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { confetti } from '../../lib/confetti'
import { play } from '../../lib/sound'
import { useMe } from '../auth/AuthProvider'
import { useTaskAction, useUpdateTask } from '../tasks/api'
import { useSaveReview, useWeek, type WeekSummary } from './api'

const STEPS = ['look', 'tidy', 'reflect', 'next'] as const
const LIST_PREVIEW = 6

/** Late in the week you review this week; early in the week, the one just finished. */
function defaultWeek(): 'this' | 'last' {
  const dow = new Date().getDay() // 0 Sunday … 6 Saturday
  return dow === 0 || dow >= 5 ? 'this' : 'last'
}

export function WeeklyReviewFlow() {
  const { t } = useTranslation('planning')
  const [week, setWeek] = useState<'this' | 'last'>(defaultWeek)
  const summary = useWeek(week)

  return (
    <>
      <div className="mb-4 max-w-xs">
        <Segmented items={['last', 'this'] as const} value={week} onChange={setWeek} label={t('week.which')} render={(w) => t(`week.${w}`)} />
      </div>
      {summary.isPending ? (
        <ListSkeleton rows={6} />
      ) : summary.isError ? (
        <ErrorState message={errorMessage(t, summary.error)} onRetry={() => summary.refetch()} />
      ) : (
        <Review key={summary.data.week.start} data={summary.data} />
      )}
    </>
  )
}

function Review({ data }: { data: WeekSummary }) {
  const { t, i18n } = useTranslation('planning')
  const lang = i18n.language
  const toast = useToast()
  const save = useSaveReview()
  const r = data.review
  const [step, setStep] = useState(0)
  const [editing, setEditing] = useState(!r?.completed_at)
  const [text, setText] = useState({ went_well: r?.went_well ?? '', to_improve: r?.to_improve ?? '', lesson: r?.lesson ?? '' })
  const [priorities, setPriorities] = useState<string[]>(() => [0, 1, 2].map((i) => r?.priorities[i] ?? ''))
  const range = t('week.range', { start: formatDay(data.week.start, lang), end: formatDay(data.week.end, lang) })

  const persist = (extra: { completed?: boolean } = {}, onDone?: () => void) =>
    save.mutate(
      { weekStart: data.week.start, ...text, priorities: priorities.filter((p) => p.trim()), ...extra },
      { onSuccess: onDone, onError: (e) => toast(errorMessage(t, e), 'error') },
    )

  const go = (n: number) => {
    play('tab')
    if (STEPS[step] === 'reflect' || STEPS[step] === 'next') persist() // keep what's typed, step by step
    setStep(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!editing && r?.completed_at) {
    return (
      <div className="flex flex-col gap-6">
        <div className="bg-surface shadow-card page-enter flex flex-col items-center rounded-[22px] px-6 py-10 text-center dark:shadow-none">
          <span className="bg-success-fill animate-pop mb-4 flex h-16 w-16 items-center justify-center rounded-full text-white">
            <PartyPopper size={28} aria-hidden />
          </span>
          <h2 className="font-display text-[22px] font-bold tracking-tight">{t('week.doneTitle')}</h2>
          <p className="text-subtle mt-1">{range}</p>
          <p className="text-subtle mt-3 max-w-sm text-[13px]">{t('week.doneBody')}</p>
          <Button className="mt-5" onClick={() => setEditing(true)}>
            <Pencil size={15} aria-hidden />
            {t('week.edit')}
          </Button>
        </div>
        {r.priorities.length > 0 && (
          <GroupSection title={t('week.nextTitle')}>
            <ol className="divide-border divide-y">
              {r.priorities.map((p, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="bg-accent-fill text-on-accent flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1 font-medium">{p}</span>
                </li>
              ))}
            </ol>
          </GroupSection>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Progress: four segments that fill as you go */}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <h2 className="font-display text-[20px] font-bold tracking-tight">{t(`week.steps.${STEPS[step]}`)}</h2>
          <span className="text-subtle text-[13px] font-medium">{t('week.step', { n: step + 1, total: STEPS.length })}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className="bg-fg/[0.08] h-1.5 overflow-hidden rounded-full">
              <span
                className="bg-accent-fill block h-full rounded-full transition-transform duration-500 ease-[var(--ease-out)]"
                style={{ transform: `scaleX(${i <= step ? 1 : 0})`, transformOrigin: 'left' }}
              />
            </span>
          ))}
        </div>
        <p className="text-subtle mt-2 px-1 text-[13px]">{range}</p>
      </div>

      <div key={step} className="page-enter flex flex-col gap-6">
        {STEPS[step] === 'look' && <LookBack data={data} />}
        {STEPS[step] === 'tidy' && <TidyUp data={data} />}
        {STEPS[step] === 'reflect' && (
          <GroupSection title={t('week.reflectTitle')}>
            <div className="flex flex-col gap-4 p-4">
              {(['went_well', 'to_improve', 'lesson'] as const).map((k) => (
                <Field key={k} label={t(`week.${k === 'went_well' ? 'wentWell' : k === 'to_improve' ? 'toImprove' : 'lesson'}`)}>
                  {(a) => (
                    <Textarea
                      {...a}
                      rows={k === 'lesson' ? 2 : 3}
                      maxLength={5000}
                      value={text[k]}
                      placeholder={t(`week.${k === 'went_well' ? 'wentWellPh' : k === 'to_improve' ? 'toImprovePh' : 'lessonPh'}`)}
                      onChange={(e) => setText({ ...text, [k]: e.target.value })}
                      onBlur={() => persist()}
                    />
                  )}
                </Field>
              ))}
            </div>
          </GroupSection>
        )}
        {STEPS[step] === 'next' && (
          <>
            {data.last_week_priorities.length > 0 && (
              <GroupSection title={t('week.lastPriorities')}>
                <ul className="flex flex-wrap gap-2 p-4">
                  {data.last_week_priorities.map((p, i) => (
                    <li key={i} className="bg-sunken rounded-full px-3 py-1.5 text-[13px] font-medium">{p}</li>
                  ))}
                </ul>
              </GroupSection>
            )}
            <GroupSection title={t('week.nextTitle')}>
              <p className="text-subtle px-4 pt-3 text-[13px]">{t('week.nextHelp')}</p>
              <div className="flex flex-col gap-3 p-4">
                {priorities.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-colors',
                        p.trim() ? 'bg-accent-fill text-on-accent' : 'bg-sunken text-subtle',
                      )}
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <Input
                      aria-label={t('week.priority', { n: i + 1 })}
                      placeholder={t('week.priority', { n: i + 1 })}
                      maxLength={200}
                      value={p}
                      onChange={(e) => setPriorities(priorities.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  </div>
                ))}
              </div>
            </GroupSection>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {step > 0 && (
          <Button onClick={() => go(step - 1)}>
            <ArrowLeft size={16} aria-hidden />
            {t('week.back')}
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => go(step + 1)}>
            {t('week.next')}
            <ArrowRight size={16} aria-hidden />
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() =>
              persist({ completed: true }, () => {
                play('complete')
                toast(t('week.saved'))
                confetti({ emoji: ['🎉', '⭐', '🌟', '🏆'] })
                setEditing(false)
              })
            }
          >
            <Check size={17} aria-hidden />
            {t('week.finish')}
          </Button>
        )}
      </div>
    </div>
  )
}

function LookBack({ data }: { data: WeekSummary }) {
  const { t, i18n } = useTranslation('planning')
  const lang = i18n.language
  const [all, setAll] = useState(false)
  const pct = (v: number | null) => (v == null ? t('week.noData') : `${Math.round(v)}%`)
  const shown = all ? data.completed : data.completed.slice(0, LIST_PREVIEW)

  return (
    <>
      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat value={data.tasks.completed} label={t('week.stats.completed')} tone="var(--tint-tasks)" />
        <Stat value={pct(data.tasks.rate)} label={t('week.stats.onTime')} />
        <Stat value={pct(data.habits_rate)} label={t('week.stats.habits')} tone="var(--tint-habits)" />
        <Stat value={data.focus.minutes ? formatMinutes(data.focus.minutes, lang) : t('week.noData')} label={t('week.stats.focus')} tone="var(--tint-focus)" />
        <Stat value={data.mood.average_mood == null ? t('week.noData') : `${data.mood.average_mood.toFixed(1)}/5`} label={t('week.stats.mood')} />
        <Stat value={data.score == null ? t('week.noData') : Math.round(data.score)} label={t('week.stats.score')} tone="var(--tint-insights)" />
      </div>

      <GroupSection title={t('week.completedTitle')} count={data.completed.length}>
        {data.completed.length === 0 ? (
          <p className="text-subtle px-4 py-4 text-[14px]">{t('week.noneCompleted')}</p>
        ) : (
          <>
            <ul className="divide-border stagger divide-y">
              {shown.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-4 py-2.5">
                  <CheckMark checked shape="square" size={19} color="var(--success-fill)" />
                  <span className="text-muted min-w-0 flex-1 truncate">{x.title}</span>
                </li>
              ))}
            </ul>
            {!all && data.completed.length > LIST_PREVIEW && (
              <button type="button" onClick={() => setAll(true)} className="text-accent border-border w-full border-t px-4 py-3 text-left text-[15px] font-medium">
                {t('week.showAll', { count: data.completed.length })}
              </button>
            )}
          </>
        )}
      </GroupSection>

      {data.goals.length > 0 && (
        <GroupSection title={t('week.goalsTitle')}>
          <ul className="divide-border divide-y">
            {data.goals.map((g) => (
              <li key={g.id} className="px-4 py-3">
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{g.title}</span>
                  <span className="text-subtle text-[13px] tabular-nums">{pct(g.progress)}</span>
                </div>
                <div className="bg-sunken h-1.5 overflow-hidden rounded-full">
                  <div className="bg-accent-fill h-full rounded-full transition-[width] duration-700" style={{ width: `${g.progress ?? 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </GroupSection>
      )}

      {data.habits.length > 0 && (
        <GroupSection title={t('week.habitsTitle')}>
          <ul className="divide-border divide-y">
            {data.habits.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                <span className="text-warning text-[13px] font-semibold tabular-nums">{t(`week.streak_${h.unit}`, { count: h.current_streak })}</span>
              </li>
            ))}
          </ul>
        </GroupSection>
      )}
    </>
  )
}

function TidyUp({ data }: { data: WeekSummary }) {
  const { t } = useTranslation('planning')
  const toast = useToast()
  const tz = useMe().settings.timezone
  const update = useUpdateTask()
  const action = useTaskAction()
  const [handled, setHandled] = useState<Record<string, 'moved' | 'dropped'>>({})
  const today = todayInZone(tz)
  // "Next week" = the first day of the next week that hasn't started yet
  let nextWeek = addDays(data.week.start, 7)
  while (nextWeek <= today) nextWeek = addDays(nextWeek, 7)
  const target = (when: 'tomorrow' | 'next') => (when === 'tomorrow' ? addDays(today, 1) : nextWeek)

  const reschedule = (id: string, when: 'tomorrow' | 'next') =>
    update.mutate(
      { id, due_date: target(when) },
      {
        onSuccess: () => {
          play('tap')
          setHandled({ ...handled, [id]: 'moved' })
        },
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )
  const drop = (id: string, title: string) =>
    action.mutate(
      { id, action: 'archive', title },
      {
        onSuccess: () => {
          play('uncheck')
          setHandled({ ...handled, [id]: 'dropped' })
        },
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )

  return (
    <GroupSection title={t('week.tidyTitle')} count={data.carry_over.length - Object.keys(handled).length}>
      {data.carry_over.length === 0 ? (
        <p className="text-subtle px-4 py-4 text-[14px]">{t('week.tidyEmpty')}</p>
      ) : (
        <>
          <p className="text-subtle px-4 pt-3 text-[13px]">{t('week.tidyHelp')}</p>
          <ul className="divide-border stagger divide-y">
            {data.carry_over.map((task) => {
              const state = handled[task.id]
              return (
                <li key={task.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-opacity duration-300', state && 'opacity-55')}>
                  <span className={cn('min-w-0 flex-1 basis-40 font-medium break-words', state === 'dropped' && 'line-through')}>{task.title}</span>
                  {state ? (
                    <span className="text-success text-[13px] font-semibold">{t(state === 'moved' ? 'week.rescheduled' : 'week.dropped')}</span>
                  ) : (
                    <span className="flex gap-1.5">
                      <Button size="sm" onClick={() => reschedule(task.id, 'next')}>
                        <CalendarArrowUp size={14} aria-hidden />
                        {t('week.toNextWeek')}
                      </Button>
                      <Button size="sm" onClick={() => reschedule(task.id, 'tomorrow')}>{t('week.toTomorrow')}</Button>
                      <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => drop(task.id, task.title)}>
                        <Trash2 size={14} aria-hidden />
                        {t('week.drop')}
                      </Button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </GroupSection>
  )
}
