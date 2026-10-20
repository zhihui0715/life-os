import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '../../components/ui/Toast'
import { todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { TaskView } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useCreateTask, type TaskInput } from './api'

/** Defaults so a task added inside a view actually shows up in that view. */
export function defaultsForView(view: TaskView, timeZone: string): TaskInput {
  switch (view) {
    case 'today':
      return { status: 'todo', due_date: todayInZone(timeZone) }
    case 'inbox':
    case 'all':
      return { status: 'inbox' }
    default:
      return { status: 'todo' }
  }
}

interface Props {
  view: TaskView
  /** Extra fields for every task added here, e.g. { goal_id } on a goal page or { parent_task_id } for subtasks. */
  extra?: TaskInput
  label?: string
  placeholder?: string
  autoFocus?: boolean
  onAdded?: () => void
}

export function QuickAddInput({ view, extra, label, placeholder, autoFocus, onAdded }: Props) {
  const { t } = useTranslation('tasks')
  const me = useMe()
  const toast = useToast()
  const create = useCreateTask()
  const [title, setTitle] = useState('')

  // Clear immediately so the next task can be typed while this one saves; put the text back if saving fails.
  const submit = () => {
    const value = title.trim()
    if (!value) return
    setTitle('')
    create.mutate(
      { title: value, ...defaultsForView(view, me.settings.timezone), ...extra },
      {
        onSuccess: () => {
          toast(t('toast.created'))
          onAdded?.()
        },
        onError: (e) => {
          setTitle((current) => current || value)
          toast(errorMessage(t, e), 'error')
        },
      },
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="border-border bg-surface focus-within:border-accent flex items-center gap-2 rounded-lg border px-3"
    >
      <Plus size={18} className="text-subtle shrink-0" aria-hidden />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        autoFocus={autoFocus}
        data-autofocus={autoFocus || undefined}
        aria-label={label ?? t('quickAdd.label')}
        placeholder={placeholder ?? t('quickAdd.placeholder')}
        className="placeholder:text-subtle h-11 min-w-0 flex-1 bg-transparent focus:outline-none"
      />
    </form>
  )
}
