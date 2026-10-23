import { AlertCircle, CalendarClock, Clock, Flag, ListChecks, Target } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { CheckMark } from '../../components/ui/CheckMark'
import { cn } from '../../components/ui/cn'
import { useToast } from '../../components/ui/Toast'
import { formatDay, formatInstant, formatMinutes } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { isQueued } from '../../lib/offline'
import { play } from '../../lib/sound'
import type { Category, Goal, Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useTaskAction } from './api'

const PRIORITY_COLOR = { 1: 'text-p1', 2: 'text-p2', 3: 'text-p3', 4: 'text-p4' } as const

interface Props {
  task: Task
  category?: Category
  goal?: Goal
  onOpen: (task: Task) => void
}

export function TaskRow({ task, category, goal, onOpen }: Props) {
  const { t, i18n } = useTranslation('tasks')
  const me = useMe()
  const toast = useToast()
  const action = useTaskAction()
  const done = task.status === 'done'
  const lang = i18n.language
  const [celebrate, setCelebrate] = useState(false)

  const toggle = () => {
    setCelebrate(!done)
    play(done ? 'uncheck' : 'complete')
    action.mutate(
      { id: task.id, action: done ? 'reopen' : 'complete', title: task.title },
      {
        onSuccess: (r) => toast(isQueued(r) ? t('common:offline.queued') : t(done ? 'toast.reopened' : 'toast.completed')),
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )
  }

  return (
    <li className="group hover:bg-sunken/50 flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3.5 py-3 transition-colors duration-[var(--duration-fast)] sm:flex-nowrap sm:px-4">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={t(done ? 'actions.reopen' : 'actions.complete', { title: task.title })}
        onClick={toggle}
        disabled={!!task.archived_at}
        className={cn(
          'group/check pressable relative mt-px flex shrink-0 items-center justify-center',
          'before:absolute before:-m-3 before:h-11 before:w-11', // 44px touch target
        )}
      >
        <CheckMark checked={done} celebrate={celebrate} shape="square" size={21} />
      </button>

      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
        <span className={cn('block text-[15.5px] break-words transition-colors duration-[var(--duration-base)]', done && 'text-subtle line-through decoration-border-strong')}>{task.title}</span>
        <span className="text-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {task.is_overdue && (
            <span className="text-danger inline-flex items-center gap-1 font-medium">
              <AlertCircle size={12} aria-hidden />
              {t('meta.overdue')}
            </span>
          )}
          {task.due_date && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={12} aria-hidden />
              {t('meta.due', { date: formatDay(task.due_date, lang, { weekday: 'short' }) })}
            </span>
          )}
          {task.deadline && (
            <span className="inline-flex items-center gap-1">
              <Flag size={12} aria-hidden />
              {t('meta.deadline', { date: formatInstant(task.deadline, lang, me.settings.timezone) })}
            </span>
          )}
          {(task.tracked_minutes > 0 || (task.estimate_minutes != null && task.estimate_minutes > 0)) && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden />
              {/* time logged so far / estimate */}
              {task.tracked_minutes > 0 && formatMinutes(task.tracked_minutes, lang)}
              {task.tracked_minutes > 0 && task.estimate_minutes ? ' / ' : ''}
              {task.estimate_minutes ? formatMinutes(task.estimate_minutes, lang) : ''}
            </span>
          )}
          {task.subtasks_total > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks size={12} aria-hidden />
              {t('subtasks.progress', { done: task.subtasks_done, total: task.subtasks_total })}
            </span>
          )}
          {category && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: category.color }} aria-hidden />
              {category.name}
            </span>
          )}
        </span>
      </button>

      {(goal || task.tags.length > 0) && (
        <span className="order-last flex w-full flex-wrap items-center gap-1.5 pl-8 text-xs sm:order-none sm:w-auto sm:max-w-[40%] sm:justify-end sm:pt-0.5 sm:pl-0">
          {goal && (
            <Link to={`/goals/${goal.id}`} className="bg-accent-soft text-accent inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 font-medium hover:underline">
              <Target size={11} aria-hidden className="shrink-0" />
              <span className="truncate">{goal.title}</span>
            </Link>
          )}
          {task.tags.map((tag) => (
            <Link key={tag} to={`/tasks?view=all&tag=${encodeURIComponent(tag)}`} className="bg-sunken text-muted hover:text-fg rounded-full px-2 py-0.5">
              #{tag}
            </Link>
          ))}
        </span>
      )}

      {task.priority < 3 && !done && (
        <span className={cn('mt-0.5 shrink-0 text-xs font-medium', PRIORITY_COLOR[task.priority])}>
          {t(`priority.${task.priority}`)}
        </span>
      )}
    </li>
  )
}
