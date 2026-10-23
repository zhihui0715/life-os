import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { cn } from '../../components/ui/cn'
import { Card, PageHeader } from '../../components/ui/states'
import { useToast } from '../../components/ui/Toast'
import { useAllDone } from '../../lib/celebrate'
import { play } from '../../lib/sound'
import type { Task, TaskFilters, TaskView } from '../../lib/types'
import { useCategories } from './api'
import { QuickAddInput } from './QuickAddInput'
import { TaskDrawer } from './TaskDrawer'
import { TaskList, useTaskTotal } from './TaskList'

const VIEWS: TaskView[] = ['inbox', 'today', 'upcoming', 'overdue', 'unscheduled', 'all', 'completed', 'archived']

export function TasksPage() {
  const { t } = useTranslation('tasks')
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.includes(params.get('view') as TaskView) ? params.get('view') : 'today') as TaskView
  const tag = params.get('tag') ?? ''
  // The URL is the single source of truth for the search, so links (e.g. #tag chips), refresh and
  // back/forward always agree with what's shown. `search` is just the text box while typing.
  const urlQ = params.get('q') ?? ''
  const q = urlQ.trim()
  const [search, setSearch] = useState(urlQ)
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const categories = useCategories().data ?? []
  const [open, setOpen] = useState<Task | null>(null)

  useEffect(() => setSearch(urlQ), [urlQ]) // URL changed from outside (link, back button)
  useEffect(() => () => clearTimeout(typingTimer.current), [])

  const update = (change: (p: URLSearchParams) => void, replace = false) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      change(next)
      return next
    }, { replace })

  // Wait until typing pauses before searching, instead of one request per keystroke.
  const onSearchChange = (value: string) => {
    setSearch(value)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => update((p) => (value.trim() ? p.set('q', value) : p.delete('q')), true), 300)
  }
  const pickView = (v: TaskView) => {
    clearTimeout(typingTimer.current)
    update((p) => {
      p.set('view', v)
      p.delete('q')
    })
  }
  const clearTag = () => update((p) => p.delete('tag'))

  // Search looks through every (non-archived) task, whatever tab was open.
  const filters: TaskFilters = { view: q ? 'all' : view, q: q || undefined, tag: tag || undefined }
  const total = useTaskTotal(filters)
  const toast = useToast()
  useAllDone(view === 'today' || view === 'overdue' ? total ?? undefined : undefined, () => toast(t('common:celebrate.allDone')))

  const subtitle = total == null ? undefined : q ? t('search.results', { count: total, q }) : t('count', { count: total })

  return (
    <>
      <PageHeader title={t('title')} subtitle={subtitle} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="bg-fg/[0.07] focus-within:bg-fg/[0.09] flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 transition-colors sm:max-w-sm">
          <Search size={16} className="text-subtle shrink-0" aria-hidden />
          <span className="sr-only">{t('search.label')}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('search.placeholder')}
            maxLength={200}
            className="placeholder:text-subtle min-w-0 flex-1 bg-transparent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button type="button" onClick={() => onSearchChange('')} aria-label={t('search.clear')} className="text-subtle hover:text-fg">
              <X size={16} aria-hidden />
            </button>
          )}
        </label>
        {tag && (
          <button
            type="button"
            onClick={clearTag}
            aria-label={t('tagFilter.clear')}
            className="bg-accent-soft text-accent inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium"
          >
            {t('tagFilter.active', { tag })}
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {/* View tabs: the URL keeps the view, so refresh and back/forward work */}
      <div role="tablist" aria-label={t('views.label')} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
        {VIEWS.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={!q && v === view}
            onClick={() => {
              play('tab')
              pickView(v)
            }}
            className={cn(
              'pressable h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold',
              !q && v === view ? 'bg-accent-fill text-on-accent shadow-[0_2px_8px_-2px_color-mix(in_srgb,var(--accent)_55%,transparent)]' : 'bg-surface text-muted hover:text-fg shadow-card dark:shadow-none',
            )}
          >
            {t(`views.${v}`)}
          </button>
        ))}
      </div>

      {view !== 'completed' && view !== 'archived' && !q && (
        <div className="mb-5">
          <QuickAddInput view={view} extra={tag ? { tags: [tag] } : undefined} />
        </div>
      )}

      <Card className="overflow-hidden">
        <TaskList filters={filters} categories={categories} onOpen={setOpen} />
      </Card>

      <TaskDrawer task={open} categories={categories} onClose={() => setOpen(null)} onOpenTask={setOpen} />
    </>
  )
}
