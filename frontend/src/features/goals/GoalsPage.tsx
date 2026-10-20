import { CalendarClock, Plus, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '../../components/ui/states'
import { formatDay } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { Category, Goal } from '../../lib/types'
import { useCategories } from '../tasks/api'
import { useGoals, type GoalListFilter } from './api'
import { GoalFormDialog } from './GoalFormDialog'
import { GoalProgress } from './GoalProgress'

const FILTERS: GoalListFilter[] = ['active', 'paused', 'completed', 'abandoned', 'archived']

export function GoalsPage() {
  const { t } = useTranslation('goals')
  const [params, setParams] = useSearchParams()
  const filter = (FILTERS.includes(params.get('filter') as GoalListFilter) ? params.get('filter') : 'active') as GoalListFilter
  const goals = useGoals(filter)
  const categories = useCategories().data ?? []
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const [creating, setCreating] = useState(false)

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden />
            {t('new')}
          </Button>
        }
      />

      <div role="tablist" aria-label={t('filters.label')} className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={f === filter}
            onClick={() => setParams({ filter: f })}
            className={cn(
              'h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors',
              f === filter ? 'bg-fg text-bg' : 'text-muted hover:bg-sunken hover:text-fg',
            )}
          >
            {t(`filters.${f}`)}
          </button>
        ))}
      </div>

      {goals.isPending ? (
        <Card>
          <ListSkeleton rows={3} />
        </Card>
      ) : goals.isError ? (
        <Card>
          <ErrorState message={errorMessage(t, goals.error)} onRetry={() => goals.refetch()} />
        </Card>
      ) : goals.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title={t(`empty.${filter}.title`)}
            body={t(`empty.${filter}.body`)}
            action={
              filter === 'active' && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus size={16} aria-hidden />
                  {t('new')}
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {goals.data.map((g) => (
            <li key={g.id}>
              <GoalCard goal={g} category={g.category_id ? categoryById.get(g.category_id) : undefined} />
            </li>
          ))}
        </ul>
      )}

      <GoalFormDialog open={creating} onClose={() => setCreating(false)} categories={categories} />
    </>
  )
}

function GoalCard({ goal, category }: { goal: Goal; category?: Category }) {
  const { t, i18n } = useTranslation('goals')
  return (
    <Link
      to={`/goals/${goal.id}`}
      className="border-border bg-surface shadow-card hover:border-border-strong flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-subtle mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span>{t(`horizon.${goal.horizon}`)}</span>
          {category && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: category.color }} aria-hidden />
              {category.name}
            </span>
          )}
          {goal.status !== 'active' && <span className="bg-sunken rounded px-1.5 py-0.5">{t(`status.${goal.status}`)}</span>}
        </p>
        <h2 className="font-semibold break-words">{goal.title}</h2>
        {goal.success_criteria && <p className="text-muted mt-1 line-clamp-2 text-sm">{goal.success_criteria}</p>}
      </div>
      <div className="mt-auto">
        <GoalProgress goal={goal} size="sm" />
        {goal.target_date && (
          <p className="text-subtle mt-2 inline-flex items-center gap-1 text-xs">
            <CalendarClock size={12} aria-hidden />
            {t('meta.target', { date: formatDay(goal.target_date, i18n.language, { year: 'numeric' }) })}
          </p>
        )}
      </div>
    </Link>
  )
}
