import { Archive, ArchiveRestore, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Dialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { BackLink, Stat } from '../../components/ui/Segments'
import { Card, ErrorState, ListSkeleton } from '../../components/ui/states'
import { formatDay } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { HabitDayState, HabitDetail } from '../../lib/types'
import { useArchiveHabit, useCheckIn, useHabit } from './api'
import { HabitFormDialog, weekdayNames } from './HabitFormDialog'
import { CheckButton, HistoryDot, useScheduleSummary } from './HabitParts'

type Day = HabitDetail['history'][number]

export function HabitDetailPage() {
  const { habitId } = useParams()
  const { t, i18n } = useTranslation('habits')
  const query = useHabit(habitId)
  const summary = useScheduleSummary()
  const toast = useToast()
  const archive = useArchiveHabit()
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<Day | null>(null)

  if (query.isPending) return <ListSkeleton rows={5} />
  if (query.isError) return <ErrorState message={errorMessage(t, query.error)} onRetry={() => query.refetch()} />
  const h = query.data
  const s = h.stats

  return (
    <>
      <BackLink to="/habits">{t('back')}</BackLink>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {!h.archived_at && <CheckButton habit={h} size="lg" />}
          <div className="min-w-0">
            <h1 className="font-display text-[30px] leading-tight font-bold tracking-[-0.025em] break-words">{h.name}</h1>
            <p className="text-subtle text-sm">
              {summary(h)}
              {h.target_value != null && ` · ${h.target_value} ${h.target_unit ?? ''}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} aria-hidden />
            {t('edit')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              archive.mutate(
                { id: h.id, archive: !h.archived_at },
                { onSuccess: () => toast(t(h.archived_at ? 'toast.restored' : 'toast.archived')), onError: (e) => toast(errorMessage(t, e), 'error') },
              )
            }
          >
            {h.archived_at ? <ArchiveRestore size={14} aria-hidden /> : <Archive size={14} aria-hidden />}
            {t(h.archived_at ? 'common:actions.restore' : 'common:actions.archive')}
          </Button>
        </div>
      </div>

      {h.description && <p className="text-muted mb-4 whitespace-pre-line">{h.description}</p>}

      <div className="stagger mb-6 grid grid-cols-3 gap-3">
        <Stat label={t(`stats.streak_${s.unit}`, { count: s.current_streak })} value={String(s.current_streak)} />
        <Stat label={t(`stats.best_${s.unit}`, { count: s.best_streak })} value={String(s.best_streak)} />
        <Stat
          label={s.consistency == null ? t('stats.noData') : t('stats.consistency', { value: Math.round(s.consistency * 100) })}
          value={s.consistency == null ? '—' : `${Math.round(s.consistency * 100)}%`}
          help={t(`stats.consistencyHelp_${s.unit}`, { count: s.eligible })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Card className="p-4">
          <h2 className="text-[17px] font-semibold tracking-tight">{t('history.title')}</h2>
          <p className="text-subtle mb-3 text-xs">{t('history.help')}</p>
          <HistoryGrid history={h.history} lang={i18n.language} onPick={setPicked} />
          <div className="text-subtle mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {(['done', 'skipped', 'missed', 'open', 'rest'] as const).map((st) => (
              <span key={st} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3"><HistoryDot status={st} /></span>
                {t(`state.${st}`)}
              </span>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-[17px] font-semibold tracking-tight">{t('rules.title')}</h2>
          <ul className="text-muted list-disc space-y-1.5 pl-4 text-sm">
            {(t('rules.items', { returnObjects: true }) as string[]).map((r) => <li key={r}>{r}</li>)}
          </ul>
        </Card>
      </div>

      <HabitFormDialog open={editing} onClose={() => setEditing(false)} habit={h} />
      <DayDialog habit={h} day={picked} onClose={() => setPicked(null)} />
    </>
  )
}

/** GitHub-style grid: one column per week, one row per weekday (Monday on top). */
function HistoryGrid({ history, lang, onPick }: { history: Day[]; lang: string; onPick: (d: Day) => void }) {
  const { t } = useTranslation('habits')
  const names = weekdayNames(lang, 'narrow')
  const weeks = useMemo(() => {
    if (!history.length) return []
    const firstDow = (new Date(`${history[0].date}T00:00:00Z`).getUTCDay() + 6) % 7
    const cells: (Day | null)[] = [...Array(firstDow).fill(null), ...history]
    const out: (Day | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7))
    return out
  }, [history])

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      <div className="text-subtle grid shrink-0 grid-rows-7 gap-1 pr-1 text-[10px] leading-4">
        {names.map((n, i) => <span key={i} className="h-4">{i % 2 === 0 ? n : ''}</span>)}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid shrink-0 grid-rows-7 gap-1">
          {Array.from({ length: 7 }, (_, di) => {
            const d = week[di]
            if (!d) return <span key={di} className="h-4 w-4" />
            return (
              <button
                key={di}
                type="button"
                onClick={() => onPick(d)}
                aria-label={`${formatDay(d.date, lang, { weekday: 'short' })} · ${t(`state.${d.status}`)}`}
                className="hover:ring-accent h-4 w-4 rounded-[4px] transition-transform hover:scale-125 hover:ring-2"
              >
                <HistoryDot status={d.status} />
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Correct a past day: done, skipped (rest) or cleared. */
function DayDialog({ habit, day, onClose }: { habit: HabitDetail; day: Day | null; onClose: () => void }) {
  const { t, i18n } = useTranslation('habits')
  const toast = useToast()
  const checkIn = useCheckIn()
  if (!day) return null
  const set = (state: HabitDayState | null) =>
    checkIn.mutate(
      { id: habit.id, date: day.date, state, value: state === 'done' ? habit.target_value : undefined },
      {
        onSuccess: () => {
          toast(t(state === 'done' ? 'toast.checked' : state === 'skipped' ? 'toast.skipped' : 'toast.cleared'))
          onClose()
        },
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )
  return (
    <Dialog open onClose={onClose} title={formatDay(day.date, i18n.language, { weekday: 'long', year: 'numeric', month: 'long' })}>
      <p className="text-muted mb-4 text-sm">{t(`state.${day.status}`)}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant={day.status === 'done' ? 'primary' : 'secondary'} onClick={() => set('done')} disabled={checkIn.isPending}>
          {t('state.done')}
        </Button>
        <Button variant={day.status === 'skipped' ? 'primary' : 'secondary'} onClick={() => set('skipped')} disabled={checkIn.isPending}>
          {t('actions.skip')}
        </Button>
        <Button variant="ghost" className={cn(!['done', 'skipped'].includes(day.status) && 'hidden')} onClick={() => set(null)} disabled={checkIn.isPending}>
          {t('actions.clear')}
        </Button>
      </div>
    </Dialog>
  )
}
