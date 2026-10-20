import { Draggable } from '@fullcalendar/interaction'
import { AlertTriangle, CalendarCheck, Clock, GripVertical, MoveRight, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { formatInstant, formatMinutes } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { Overlap, WorkloadItem } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useTaskList } from '../tasks/api'
import { useEditOccurrence, useUpdateEvent } from './api'
import { useWhen } from './SuggestionDialog'

type FindTime = (task: { id: string; title: string }) => void

export function AttentionPanel({ overlaps, workload, onFindTime }: { overlaps: Overlap[]; workload: WorkloadItem[]; onFindTime: FindTime }) {
  const { t, i18n } = useTranslation('calendar')
  const tz = useMe().settings.timezone
  const when = useWhen()
  const toast = useToast()
  const editOne = useEditOccurrence()
  const editSeries = useUpdateEvent()
  const [move, setMove] = useState<Overlap['suggestion']>(null)

  // Apply a suggested move only after confirmation. A repeating block moves just this occurrence.
  const applyMove = () => {
    if (!move) return
    const o = move.occurrence
    const opts = {
      onSuccess: () => {
        toast(t('toast.moved'))
        setMove(null)
      },
      onError: (e: unknown) => toast(errorMessage(t, e), 'error'),
    }
    if (o.recurring) editOne.mutate({ eventId: o.event_id, originalStart: o.original_start, starts_at: move.starts_at, ends_at: move.ends_at }, opts)
    else editSeries.mutate({ id: o.event_id, starts_at: move.starts_at, ends_at: move.ends_at }, opts)
  }

  const empty = overlaps.length === 0 && workload.length === 0
  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <AlertTriangle size={16} aria-hidden className={empty ? 'text-subtle' : 'text-warning'} />
        {t('attention.title')}
      </h2>
      {empty && (
        <p className="text-subtle flex items-center gap-2 text-sm">
          <CalendarCheck size={16} aria-hidden className="text-success shrink-0" />
          {t('attention.empty')}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {overlaps.map((o) => (
          <li key={`${o.a.event_id}${o.a.original_start}${o.b.event_id}${o.b.original_start}`} className="text-sm">
            <p className="font-medium">{t('attention.overlap', { a: o.a.title, b: o.b.title })}</p>
            <p className="text-subtle text-xs">
              <span className={cn('mr-1.5 rounded px-1.5 py-0.5 font-medium', o.severity === 'hard' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                {t(`attention.${o.severity}`)}
              </span>
              {formatInstant(o.b.starts_at, i18n.language, tz, { weekday: 'short' })} · {t('attention.overlapMinutes', { minutes: o.overlap_minutes })}
            </p>
            {o.suggestion && (
              <Button size="sm" variant="ghost" className="text-accent -ml-2 h-auto py-1 whitespace-normal text-left" onClick={() => setMove(o.suggestion)}>
                <MoveRight size={14} aria-hidden className="shrink-0" />
                {t('attention.moveTo', { title: o.suggestion.occurrence.title, when: when(o.suggestion.starts_at, o.suggestion.ends_at) })}
              </Button>
            )}
          </li>
        ))}
        {workload.map((w) => (
          <li key={w.task_id} className="text-sm">
            <p className="flex items-center gap-2 font-medium">
              <span className={cn('rounded px-1.5 py-0.5 text-xs', w.status === 'at_risk' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                {t(w.status === 'at_risk' ? 'attention.atRisk' : 'attention.needsTime')}
              </span>
              <span className="min-w-0 truncate">{w.title}</span>
            </p>
            <p className="text-subtle mt-0.5 text-xs">
              {t('attention.workload', {
                remaining: formatMinutes(w.remaining_minutes, i18n.language),
                free: formatMinutes(w.free_minutes, i18n.language),
                due: formatInstant(w.due_by, i18n.language, tz, { weekday: 'short' }),
              })}
            </p>
            <Button size="sm" variant="ghost" className="text-accent -ml-2 h-auto py-1" onClick={() => onFindTime({ id: w.task_id, title: w.title })}>
              <Search size={14} aria-hidden />
              {t('toSchedule.findTime')}
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!move}
        title={t('move.title')}
        body={move ? t('move.body', { title: move.occurrence.title, when: when(move.starts_at, move.ends_at) }) : ''}
        confirmLabel={t('move.confirm')}
        busy={editOne.isPending || editSeries.isPending}
        onCancel={() => setMove(null)}
        onConfirm={applyMove}
      />
    </Card>
  )
}

/** Open tasks with no time on the calendar. On desktop they can be dragged onto the calendar. */
export function ToSchedulePanel({ onFindTime }: { onFindTime: FindTime }) {
  const { t, i18n } = useTranslation('calendar')
  const list = useTaskList({ needs_scheduling: 'true' }, 30)
  const tasks = list.data?.pages.flatMap((p) => p.items) ?? []
  const container = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!container.current) return
    const draggable = new Draggable(container.current, {
      itemSelector: '[data-task-id]',
      eventData: (el) => ({
        title: el.dataset.title,
        duration: { minutes: Number(el.dataset.minutes) || 60 },
        create: false, // the drop opens a form instead of silently creating an event
      }),
    })
    return () => draggable.destroy()
  }, [])

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Clock size={16} aria-hidden className="text-subtle" />
        {t('toSchedule.title')}
      </h2>
      <p className="text-subtle mb-3 text-xs">{tasks.length ? t('toSchedule.help') : t('toSchedule.empty')}</p>
      <ul ref={container} className="flex flex-col gap-1.5">
        {tasks.map((task) => (
          <li
            key={task.id}
            data-task-id={task.id}
            data-title={task.title}
            data-minutes={task.estimate_minutes ?? 60}
            className="border-border bg-surface hover:border-border-strong flex cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 text-sm active:cursor-grabbing"
          >
            <GripVertical size={14} aria-hidden className="text-subtle hidden shrink-0 md:block" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{task.title}</span>
              {task.estimate_minutes != null && (
                <span className="text-subtle text-xs">{t('toSchedule.estimate', { time: formatMinutes(task.estimate_minutes, i18n.language) })}</span>
              )}
            </span>
            <Button size="sm" variant="ghost" className="text-accent shrink-0" onClick={() => onFindTime({ id: task.id, title: task.title })}>
              {t('toSchedule.findTime')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
