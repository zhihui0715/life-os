import { CalendarClock, Plus, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { Button } from '../../components/ui/Button'
import { ChipTabs } from '../../components/ui/Segments'
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

      <ChipTabs items={FILTERS} value={filter} onChange={(f) => setParams({ filter: f })} label={t('filters.label')} render={(f) => t(`filters.${f}`)} />

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
        <ul className="stagger grid gap-3 sm:grid-cols-2">
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
      className="pressable bg-surface shadow-card flex h-full flex-col gap-4 rounded-[18px] p-5 hover:shadow-float dark:shadow-none"
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
          {goal.status !== 'active' && <span className="bg-sunken rounded-full px-2 py-0.5 font-medium">{t(`status.${goal.status}`)}</span>}
        </p>
        <h2 className="font-display text-[19px] leading-snug font-bold tracking-tight break-words">{goal.title}</h2>
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
