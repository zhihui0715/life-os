import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Maximize2, Minus, Orbit, Plus, Search, Waypoints, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Select } from '../../components/ui/Field'
import { EmptyState, ErrorState, PageHeader } from '../../components/ui/states'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { formatDay } from '../../lib/dates'
import { play } from '../../lib/sound'
import type { Task } from '../../lib/types'
import { useCategories } from '../tasks/api'
import { TaskDrawer } from '../tasks/TaskDrawer'
import { useGraph, type GraphNode, type NodeKind, type Urgency } from './api'
import { filterGraph, type Layout, type PriorityFilter } from './filter'
import { GraphCanvas, type SimNode } from './GraphCanvas'
import { URGENCY_VAR } from './style'

const URGENCIES: Urgency[] = ['overdue', 'today', 'week', 'later', 'none']
const TOGGLES: NodeKind[] = ['tag', 'habit', 'hub']
const HUB_VIEW: Record<string, string> = { overdue: 'overdue', today: 'today', week: 'upcoming', later: 'upcoming' }
const PRIORITIES: PriorityFilter[] = ['all', 'p1', 'p12']
const LAYOUTS: { id: Layout; icon: typeof Orbit }[] = [
  { id: 'web', icon: Waypoints },
  { id: 'orbits', icon: Orbit },
]
const LAYOUT_KEY = 'lifeos.graphLayout'

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'orbits' ? 'orbits' : 'web'
  } catch {
    return 'web'
  }
}

/**
 * Graph: everything still to do as a living network, like Obsidian's graph view. Goals are the big nodes, tasks
 * cluster round them, tags and due-date hubs pull related work together, and colour shows urgency: overdue tasks
 * glow red and pulse. Tap a node to light up its neighbours; open it from the card underneath. Two layouts: the web
 * (everything pulled together by its links) and orbits (tasks circling "now" on rings by urgency). Filters narrow it
 * to one goal's or tag's system, a priority, or hide subtasks.
 */
export function GraphPage() {
  const { t, i18n } = useTranslation('graph')
  const navigate = useNavigate()
  const graph = useGraph()
  const qc = useQueryClient()
  const categories = useCategories().data ?? []
  const [hidden, setHidden] = useState<Set<NodeKind>>(new Set())
  const [only, setOnly] = useState<Urgency | null>(null)
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<string | null>(null)
  const [priority, setPriority] = useState<PriorityFilter>('all')
  const [subtasks, setSubtasks] = useState(true)
  const [layout, setLayoutState] = useState<Layout>(readLayout)
  const [selected, setSelected] = useState<SimNode | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const openTask = useQuery({ queryKey: ['tasks', 'one', openTaskId], queryFn: () => api<Task>(`/tasks/${openTaskId}`), enabled: !!openTaskId }).data ?? null
  const controls = useRef<{ zoom: (f: number) => void; fit: () => void } | null>(null)

  // Nodes keep their positions between filter changes: one object per id for the page's lifetime
  const pool = useRef(new Map<string, SimNode>())
  const { nodes, links } = useMemo(() => {
    const data = graph.data
    if (!data) return { nodes: [] as SimNode[], links: [] }
    const shown = filterGraph(data, { focus, priority, subtasks, hidden, layout })
    const nodes = shown.nodes.map((n) => {
      const prev = pool.current.get(n.id)
      const shown = n.kind === 'hub' ? { ...n, label: t(`urgency.${n.ref}`) } : n // hubs carry their key; show the name
      const node: SimNode = prev ? Object.assign(prev, shown) : { ...shown }
      pool.current.set(n.id, node)
      return node
    })
    return { nodes, links: shown.links }
  }, [graph.data, hidden, focus, priority, subtasks, layout, t])
  const goals = useMemo(() => (graph.data?.nodes ?? []).filter((n) => n.kind === 'goal').sort((a, b) => a.label.localeCompare(b.label)), [graph.data])
  const tags = useMemo(() => (graph.data?.nodes ?? []).filter((n) => n.kind === 'tag').sort((a, b) => a.label.localeCompare(b.label)), [graph.data])
  const ringLabels = useMemo(() => ({ ...Object.fromEntries(URGENCIES.map((u) => [u, t(`urgency.${u}`)])), now: t('now') }) as Record<Urgency | 'now', string>, [t])
  const setLayout = (next: Layout) => {
    play('tap')
    setLayoutState(next)
    setSelected(null)
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      /* ignore */
    }
  }

  // Refresh when the graph is opened again (tasks may have changed elsewhere)
  useEffect(() => () => void qc.invalidateQueries({ queryKey: ['graph'] }), [qc])

  const q = query.trim().toLowerCase()
  const dimmed = (n: SimNode) => {
    if (q && !n.label.toLowerCase().includes(q)) return true
    if (only && !(n.kind === 'task' ? n.urgency === only : n.kind === 'hub' ? n.ref === only : false)) return true
    return false
  }

  const open = (n: GraphNode) => {
    play('tap')
    switch (n.kind) {
      case 'task':
        return setOpenTaskId(n.ref)
      case 'goal':
      case 'milestone':
        return navigate(`/goals/${n.ref}`)
      case 'habit':
        return navigate(`/habits/${n.ref}`)
      case 'tag':
        return navigate(`/tasks?view=all&tag=${encodeURIComponent(n.ref)}`)
      default:
        return n.ref === 'none' ? navigate('/tasks?view=unscheduled') : navigate(`/tasks?view=${HUB_VIEW[n.ref] ?? 'all'}`)
    }
  }

  const s = graph.data?.summary
  return (
    <>
      <PageHeader title={t('title')} subtitle={s ? t('subtitle', { count: s.tasks }) : undefined} />

      {/* Urgency legend: tap one to light up just those */}
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('legend')}>
        {URGENCIES.map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={only === u}
            onClick={() => {
              play('tap')
              setOnly(only === u ? null : u)
            }}
            className={cn(
              'pressable flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold',
              only === u ? 'bg-fg text-bg' : 'bg-surface text-muted shadow-card dark:shadow-none',
            )}
          >
            <span className={cn('h-2.5 w-2.5 rounded-full', u === 'overdue' && 'animate-pulse')} style={{ background: `var(${URGENCY_VAR[u]})` }} aria-hidden />
            {t(`urgency.${u}`)}
            <span className="tabular-nums opacity-70">{s?.by_urgency[u] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Layout and search, then every filter in one row (it scrolls sideways on phones) */}
      <div className="mb-2 flex items-center gap-2">
        <div role="radiogroup" aria-label={t('layout.label')} className="bg-sunken flex h-9 shrink-0 rounded-full p-0.5">
          {LAYOUTS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={layout === id}
              onClick={() => setLayout(id)}
              className={cn(
                'pressable flex items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors',
                layout === id ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
              )}
            >
              <Icon size={15} aria-hidden />
              {t(`layout.${id}`)}
            </button>
          ))}
        </div>
        <label className="bg-fg/[0.07] focus-within:bg-fg/[0.09] flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 sm:max-w-xs">
          <Search size={15} className="text-subtle shrink-0" aria-hidden />
          <span className="sr-only">{t('search')}</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} className="placeholder:text-subtle min-w-0 flex-1 bg-transparent text-[14px] focus:outline-none" />
        </label>
      </div>
      <div className="-mx-4 mb-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden">
        <label className="flex shrink-0 items-center">
          <span className="sr-only">{t('focus.label')}</span>
          <Select value={focus ?? ''} onChange={(e) => setFocus(e.target.value || null)} className="h-9 w-auto max-w-[220px] rounded-full text-[13px] font-semibold">
            <option value="">{t('focus.all')}</option>
            {goals.length > 0 && (
              <optgroup label={t('focus.goals')}>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </optgroup>
            )}
            {tags.length > 0 && (
              <optgroup label={t('focus.tags')}>
                {tags.map((g) => (
                  <option key={g.id} value={g.id}>
                    #{g.label}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </label>
        <label className="flex shrink-0 items-center">
          <span className="sr-only">{t('priority.label')}</span>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as PriorityFilter)} className="h-9 w-auto rounded-full text-[13px] font-semibold">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </Select>
        </label>
        {TOGGLES.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={!hidden.has(k) && layout === 'web'}
            disabled={layout === 'orbits'}
            title={layout === 'orbits' ? t('webOnly') : undefined}
            onClick={() => {
              play('tap')
              const next = new Set(hidden)
              if (next.has(k)) next.delete(k)
              else next.add(k)
              setHidden(next)
            }}
            className={cn('pressable h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold disabled:opacity-40', hidden.has(k) ? 'bg-sunken text-subtle line-through' : 'bg-accent-soft text-accent')}
          >
            {t(`show.${k}`)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={subtasks}
          onClick={() => {
            play('tap')
            setSubtasks(!subtasks)
          }}
          className={cn('pressable h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold', subtasks ? 'bg-accent-soft text-accent' : 'bg-sunken text-subtle line-through')}
        >
          {t('show.subtasks')}
        </button>
        {(focus || priority !== 'all' || !subtasks) && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => {
              play('tap')
              setFocus(null)
              setPriority('all')
              setSubtasks(true)
            }}
          >
            {t('clearFilters')}
          </Button>
        )}
      </div>

      <div className="bg-surface shadow-card relative h-[calc(100dvh-330px)] min-h-[360px] overflow-hidden rounded-[22px] md:h-[calc(100dvh-280px)] dark:shadow-none">
        {graph.isPending ? (
          <div className="flex h-full items-center justify-center">
            <span className="border-accent h-8 w-8 animate-spin rounded-full border-[3px] border-t-transparent" aria-label={t('common:state.loading')} />
          </div>
        ) : graph.isError ? (
          <ErrorState message={errorMessage(t, graph.error)} onRetry={() => graph.refetch()} />
        ) : nodes.length === 0 ? (
          <EmptyState icon={Waypoints} title={t('emptyTitle')} body={t('emptyBody')} />
        ) : (
          <>
            <div role="img" aria-label={t('aria', { tasks: s?.tasks ?? 0, overdue: s?.by_urgency.overdue ?? 0, goals: s?.goals ?? 0 })} className="h-full w-full">
              <GraphCanvas nodes={nodes} links={links} selected={selected?.id ?? null} dimmed={dimmed} onSelect={(n) => { if (n) play('tap'); setSelected(n) }} layout={layout} ringLabels={ringLabels} controls={controls} />
            </div>
            <div className="absolute top-3 right-3 flex flex-col gap-1.5">
              <Button size="icon" className="h-9 w-9 bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-white/20" aria-label={t('zoomIn')} onClick={() => controls.current?.zoom(1.3)}>
                <Plus size={16} aria-hidden />
              </Button>
              <Button size="icon" className="h-9 w-9 bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-white/20" aria-label={t('zoomOut')} onClick={() => controls.current?.zoom(1 / 1.3)}>
                <Minus size={16} aria-hidden />
              </Button>
              <Button size="icon" className="h-9 w-9 bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-white/20" aria-label={t('fit')} onClick={() => controls.current?.fit()}>
                <Maximize2 size={15} aria-hidden />
              </Button>
            </div>
            <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-white/45">{t(layout === 'orbits' ? 'hintOrbits' : 'hint')}</p>
          </>
        )}

        {/* The tapped node */}
        {selected && (
          <div key={selected.id} className="toast-enter bg-surface shadow-float absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-2xl p-3.5">
            <span
              className={cn('h-3.5 w-3.5 shrink-0 rounded-full', selected.urgency === 'overdue' && 'animate-pulse')}
              style={{ background: `var(${selected.kind === 'task' ? URGENCY_VAR[selected.urgency ?? 'none'] : selected.kind === 'hub' ? URGENCY_VAR[selected.ref as Urgency] : `--tint-${selected.kind === 'milestone' ? 'goals' : selected.kind === 'tag' ? 'focus' : selected.kind === 'habit' ? 'habits' : 'goals'}`})` }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{selected.kind === 'hub' ? t(`urgency.${selected.ref}`) : selected.kind === 'tag' ? `#${selected.label}` : selected.label}</p>
              <p className="text-subtle truncate text-[12.5px]">
                {t(`kind.${selected.kind}`)}
                {selected.kind === 'task' && ` · ${t(`urgency.${selected.urgency}`)}`}
                {selected.due_date && ` · ${formatDay(selected.due_date, i18n.language, { weekday: 'short' })}`}
                {selected.kind === 'goal' && selected.progress != null && ` · ${selected.progress}%`}
                {selected.count != null && ` · ${t('tasksCount', { count: selected.count })}`}
              </p>
            </div>
            <Button size="sm" variant="primary" onClick={() => open(selected)}>
              <ExternalLink size={14} aria-hidden />
              {t('open')}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t('common:actions.close')} onClick={() => setSelected(null)}>
              <X size={16} aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {/* The same information as a list, for screen readers and quick scanning */}
      {graph.data && graph.data.nodes.length > 0 && (
        <details className="bg-surface shadow-card mt-4 rounded-[18px] dark:shadow-none">
          <summary className="cursor-pointer px-4 py-3 font-semibold">{t('asList')}</summary>
          <div className="border-border border-t px-4 pb-4">
            {URGENCIES.filter((u) => (s?.by_urgency[u] ?? 0) > 0).map((u) => (
              <section key={u} className="mt-3">
                <h2 className="text-muted mb-1 text-[13px] font-semibold">{t(`urgency.${u}`)}</h2>
                <ul className="flex flex-col gap-0.5">
                  {graph.data.nodes
                    .filter((n) => n.kind === 'task' && n.urgency === u)
                    .map((n) => (
                      <li key={n.id}>
                        <button type="button" onClick={() => open(n)} className="hover:text-accent text-left text-[14px]">
                          {n.label}
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </details>
      )}

      <TaskDrawer
        task={openTask}
        categories={categories}
        onClose={() => {
          setOpenTaskId(null)
          void qc.invalidateQueries({ queryKey: ['graph'] })
        }}
        onOpenTask={(task) => setOpenTaskId(task.id)}
      />
    </>
  )
}
