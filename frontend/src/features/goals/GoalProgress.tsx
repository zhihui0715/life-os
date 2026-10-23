import { useTranslation } from 'react-i18next'

import { cn } from '../../components/ui/cn'
import { ProgressBar } from '../../components/ui/ProgressBar'
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
  const tone = goal.status === 'completed' ? 'var(--success-fill)' : goal.status === 'active' ? 'var(--accent-fill)' : 'var(--text-subtle)'

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={cn('font-semibold tabular-nums', size === 'md' ? 'font-display text-[32px] leading-none font-bold tracking-tight' : 'text-[15px]')}>
          {value === null ? <span className="text-subtle text-sm font-medium">{t('progress.noData')}</span> : `${value}%`}
        </span>
        {size === 'md' && <span className="text-subtle text-right text-xs">{progressSource(t, goal)}</span>}
      </div>
      <ProgressBar
        value={value}
        size={size}
        color={tone}
        celebrate={goal.status !== 'abandoned'}
        label={value === null ? undefined : t('progress.aria', { value })}
      />
    </div>
  )
}
