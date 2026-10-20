import { CheckSquare } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, ListSkeleton } from '../../components/ui/states'
import { errorMessage } from '../../lib/errors'
import type { Category, Task, TaskFilters } from '../../lib/types'
import { useGoals } from '../goals/api'
import { useTaskList } from './api'
import { TaskRow } from './TaskRow'

interface Props {
  filters: TaskFilters
  categories: Category[]
  onOpen: (task: Task) => void
  limit?: number
  /** Compact lists (e.g. on Home) hide the empty state and "load more". */
  compact?: boolean
  empty?: { title: string; body?: string }
  /** Hide the goal chip, e.g. on a goal's own page where it would repeat the obvious. */
  hideGoal?: boolean
}

export function TaskList({ filters, categories, onOpen, limit, compact, empty, hideGoal }: Props) {
  const { t } = useTranslation('tasks')
  const query = useTaskList(filters, limit)
  const goals = useGoals().data
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const goalById = useMemo(() => new Map((goals ?? []).map((g) => [g.id, g])), [goals])

  if (query.isPending) return <ListSkeleton rows={compact ? 2 : 4} />
  if (query.isError) return <ErrorState message={errorMessage(t, query.error)} onRetry={() => query.refetch()} />

  const tasks = query.data.pages.flatMap((p) => p.items)
  if (tasks.length === 0) {
    if (compact) return null
    const view = filters.view ?? 'all'
    return (
      <EmptyState
        icon={CheckSquare}
        title={empty?.title ?? t(`empty.${view}.title`)}
        body={empty ? empty.body : t(`empty.${view}.body`)}
      />
    )
  }

  return (
    <>
      <ul className="divide-border divide-y">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            category={task.category_id ? categoryById.get(task.category_id) : undefined}
            goal={!hideGoal && task.goal_id ? goalById.get(task.goal_id) : undefined}
            onOpen={onOpen}
          />
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

export function useTaskTotal(filters: TaskFilters) {
  const query = useTaskList(filters)
  return query.data?.pages[0]?.total
}
