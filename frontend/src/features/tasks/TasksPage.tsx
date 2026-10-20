import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { cn } from '../../components/ui/cn'
import { Card, PageHeader } from '../../components/ui/states'
import type { Task, TaskView } from '../../lib/types'
import { useCategories } from './api'
import { QuickAddInput } from './QuickAddInput'
import { TaskDrawer } from './TaskDrawer'
import { TaskList, useTaskTotal } from './TaskList'

const VIEWS: TaskView[] = ['inbox', 'today', 'upcoming', 'overdue', 'unscheduled', 'all', 'completed', 'archived']

export function TasksPage() {
  const { t } = useTranslation('tasks')
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.includes(params.get('view') as TaskView) ? params.get('view') : 'today') as TaskView
  const categories = useCategories().data ?? []
  const [open, setOpen] = useState<Task | null>(null)
  const total = useTaskTotal(view)

  return (
    <>
      <PageHeader title={t('title')} subtitle={total != null ? t('count', { count: total }) : undefined} />

      {/* View tabs: the URL keeps the view, so refresh and back/forward work */}
      <div role="tablist" aria-label={t('views.label')} className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {VIEWS.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={v === view}
            onClick={() => setParams({ view: v })}
            className={cn(
              'h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors',
              v === view ? 'bg-fg text-bg' : 'text-muted hover:bg-sunken hover:text-fg',
            )}
          >
            {t(`views.${v}`)}
          </button>
        ))}
      </div>

      {view !== 'completed' && view !== 'archived' && (
        <div className="mb-4">
          <QuickAddInput view={view} />
        </div>
      )}

      <Card className="overflow-hidden">
        <TaskList view={view} categories={categories} onOpen={setOpen} />
      </Card>

      <TaskDrawer task={open} categories={categories} onClose={() => setOpen(null)} />
    </>
  )
}
