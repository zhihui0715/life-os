import { CheckSquare } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, ListSkeleton } from '../../components/ui/states'
import { errorMessage } from '../../lib/errors'
import type { Category, Task, TaskView } from '../../lib/types'
import { useTaskList } from './api'
import { TaskRow } from './TaskRow'

interface Props {
  view: TaskView
  categories: Category[]
  onOpen: (task: Task) => void
  limit?: number
  /** Compact lists (e.g. on Home) hide the empty state and "load more". */
  compact?: boolean
}

export function TaskList({ view, categories, onOpen, limit, compact }: Props) {
  const { t } = useTranslation('tasks')
  const query = useTaskList(view, limit)
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  if (query.isPending) return <ListSkeleton rows={compact ? 2 : 4} />
  if (query.isError) return <ErrorState message={errorMessage(t, query.error)} onRetry={() => query.refetch()} />

  const tasks = query.data.pages.flatMap((p) => p.items)
  if (tasks.length === 0) {
    return compact ? null : (
      <EmptyState icon={CheckSquare} title={t(`empty.${view}.title`)} body={t(`empty.${view}.body`)} />
    )
  }

  return (
    <>
      <ul className="divide-border divide-y">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} category={task.category_id ? byId.get(task.category_id) : undefined} onOpen={onOpen} />
        ))}
      </ul>
      {!compact && query.hasNextPage && (
        <div className="border-border flex justify-center border-t p-3">
          <Button variant="ghost" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {t('common:actions.loadMore')}
          </Button>
        </div>
      )}
    </>
  )
}

export function useTaskTotal(view: TaskView) {
  const query = useTaskList(view)
  return query.data?.pages[0]?.total
}
