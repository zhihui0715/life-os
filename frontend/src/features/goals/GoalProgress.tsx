import { useTranslation } from 'react-i18next'

import { cn } from '../../components/ui/cn'
import type { Goal } from '../../lib/types'

/** Explains where the number comes from, e.g. "3 of 4 linked tasks done". */
export function progressSource(t: (key: string, opts?: Record<string, unknown>) => string, goal: Goal): string {
  if (goal.progress === null) return t(`progress.noDataHelp_${goal.progress_mode}`)
  const d = goal.progress_detail
  if (goal.progress_mode === 'tasks') return t('progress.source_tasks', { done: d.tasks_done, total: d.tasks_total })
  if (goal.progress_mode === 'milestones') return t('progress.source_milestones', { done: d.milestones_done, total: d.milestones_total })
  return t('progress.source_manual')
}

/** Progress bar that never pretends: no data is shown as "No data yet", not as an empty 0% bar. */
export function GoalProgress({ goal, size = 'md' }: { goal: Goal; size?: 'sm' | 'md' }) {
  const { t } = useTranslation('goals')
  const value = goal.progress
  const tone = goal.status === 'completed' ? 'bg-success-fill' : goal.status === 'active' ? 'bg-accent-fill' : 'bg-subtle'

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={cn('font-semibold tabular-nums', size === 'md' ? 'font-display text-[32px] leading-none font-bold tracking-tight' : 'text-[15px]')}>
          {value === null ? <span className="text-subtle text-sm font-medium">{t('progress.noData')}</span> : `${value}%`}
        </span>
        {size === 'md' && <span className="text-subtle text-right text-xs">{progressSource(t, goal)}</span>}
      </div>
      <div
        role={value === null ? undefined : 'progressbar'}
        aria-valuenow={value ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={value === null ? undefined : t('progress.aria', { value })}
        className={cn('overflow-hidden rounded-full', size === 'md' ? 'h-2' : 'h-1.5', value === null ? 'border-border-strong border border-dashed' : 'bg-sunken')}
      >
        {value !== null && (
          <div className={cn('h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out)]', tone)} style={{ width: `${value}%` }} />
        )}
      </div>
    </div>
  )
}
