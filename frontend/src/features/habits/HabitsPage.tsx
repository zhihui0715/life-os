import { Flame, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { Button } from '../../components/ui/Button'
import { Segmented } from '../../components/ui/Segments'
import { SproutArt } from '../../components/ui/Illustrations'
import { Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '../../components/ui/states'
import { errorMessage } from '../../lib/errors'
import { useHabits } from './api'
import { HabitFormDialog } from './HabitFormDialog'
import { CheckButton, StreakBadge, useScheduleSummary, WeekDots } from './HabitParts'

export function HabitsPage() {
  const { t } = useTranslation('habits')
  const [params, setParams] = useSearchParams()
  const archived = params.get('show') === 'archived'
  const habits = useHabits(archived)
  const summary = useScheduleSummary()
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

      <div className="mb-5 max-w-xs">
        <Segmented
          items={['active', 'archived'] as const}
          value={archived ? 'archived' : 'active'}
          onChange={(v) => setParams(v === 'archived' ? { show: 'archived' } : {})}
          label={t('title')}
          render={(v) => t(v === 'archived' ? 'showArchived' : 'showActive')}
        />
      </div>

      {habits.isPending ? (
        <Card><ListSkeleton rows={3} /></Card>
      ) : habits.isError ? (
        <Card><ErrorState message={errorMessage(t, habits.error)} onRetry={() => habits.refetch()} /></Card>
      ) : habits.data.length === 0 ? (
        <Card>
          {archived ? (
            <p className="text-subtle p-6 text-center">{t('archivedEmpty')}</p>
          ) : (
            <EmptyState
              art={<SproutArt />}
              icon={Flame}
              title={t('empty.title')}
              body={t('empty.body')}
              action={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden />{t('new')}</Button>}
            />
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-border stagger divide-y">
            {habits.data.map((h) => (
              <li key={h.id} className="flex items-center gap-3.5 px-4 py-3.5">
                {!archived && <CheckButton habit={h} />}
                <Link to={`/habits/${h.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{h.name}</span>
                  <span className="text-subtle mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span>{summary(h)}</span>
                    <StreakBadge habit={h} />
                    {h.stats.unit === 'weeks' && h.stats.target_this_week != null && (
                      <span>{t('stats.thisWeek', { done: h.stats.done_this_week, target: h.stats.target_this_week })}</span>
                    )}
                    {h.stats.consistency != null && <span>{t('stats.consistency', { value: Math.round(h.stats.consistency * 100) })}</span>}
                  </span>
                </Link>
                <span className="hidden sm:block">
                  <WeekDots habit={h} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <HabitFormDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
