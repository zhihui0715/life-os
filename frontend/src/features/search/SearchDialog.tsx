import { useQuery } from '@tanstack/react-query'
import { BookOpen, CalendarDays, CheckSquare, CornerDownLeft, Flame, Repeat, Search, Target, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { cn } from '../../components/ui/cn'
import { Dialog } from '../../components/ui/Dialog'
import { api } from '../../lib/api'
import { formatDay } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { play } from '../../lib/sound'

interface Results {
  query: string
  tasks: { id: string; title: string; status: string; due_date: string | null; is_subtask: boolean; snippet: string | null }[]
  goals: { id: string; title: string; status: string; archived: boolean; snippet: string | null }[]
  habits: { id: string; name: string; archived: boolean; snippet: string | null }[]
  journal: { entry_date: string; snippet: string | null }[]
  events: { id: string; title: string; date: string; repeats: boolean; snippet: string | null }[]
}

type Group = 'tasks' | 'goals' | 'habits' | 'journal' | 'events'

interface Hit {
  key: string
  group: Group
  title: string
  meta: string[]
  snippet: string | null
  to: string
  repeats?: boolean
}

const GROUPS: { group: Group; icon: LucideIcon; tint: string }[] = [
  { group: 'tasks', icon: CheckSquare, tint: 'var(--tint-tasks)' },
  { group: 'goals', icon: Target, tint: 'var(--tint-goals)' },
  { group: 'habits', icon: Flame, tint: 'var(--tint-habits)' },
  { group: 'journal', icon: BookOpen, tint: 'var(--tint-journal)' },
  { group: 'events', icon: CalendarDays, tint: 'var(--tint-calendar)' },
]

/** Wraps each case-insensitive occurrence of `q` in <mark>. */
function highlight(text: string, q: string): ReactNode {
  if (!q) return text
  const out: ReactNode[] = []
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  let from = 0
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    out.push(text.slice(from, at), <mark key={at} className="bg-accent-soft text-fg rounded-[3px]">{text.slice(at, at + q.length)}</mark>)
    from = at + q.length
  }
  out.push(text.slice(from))
  return out
}

/**
 * Search everything (Ctrl/⌘ K, or the search button): one box over tasks, goals, habits, journal and the calendar.
 * Arrow keys move through the results, Enter opens one. Needs a connection (the server does the searching).
 */
export default function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  // search once typing pauses, not on every key
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 200)
    return () => clearTimeout(timer)
  }, [text])
  useEffect(() => setActive(0), [q])

  const results = useQuery({
    queryKey: ['search', q],
    queryFn: () => api<Results>(`/search?q=${encodeURIComponent(q)}&limit=6`),
    enabled: open && q.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // keep the last results on screen while the next ones load
  })

  const lang = i18n.language
  const day = (d: string) => formatDay(d, lang, { weekday: 'short', year: 'numeric' })
  const hits = useMemo<Hit[]>(() => {
    const r = results.data
    if (!r || !q) return []
    return [
      ...r.tasks.map((x) => ({
        key: `t${x.id}`, group: 'tasks' as const, title: x.title, snippet: x.snippet, to: `/tasks?view=all&task=${x.id}`,
        meta: [x.status === 'done' ? t('search.done') : '', x.is_subtask ? t('search.subtask') : '', x.due_date ? day(x.due_date) : ''],
      })),
      ...r.goals.map((x) => ({
        key: `g${x.id}`, group: 'goals' as const, title: x.title, snippet: x.snippet, to: `/goals/${x.id}`,
        meta: [x.archived ? t('search.archived') : x.status === 'completed' ? t('search.done') : ''],
      })),
      ...r.habits.map((x) => ({
        key: `h${x.id}`, group: 'habits' as const, title: x.name, snippet: x.snippet, to: `/habits/${x.id}`,
        meta: [x.archived ? t('search.archived') : ''],
      })),
      ...r.journal.map((x) => ({
        key: `j${x.entry_date}`, group: 'journal' as const, title: day(x.entry_date), snippet: x.snippet, to: `/journal?date=${x.entry_date}`, meta: [],
      })),
      ...r.events.map((x) => ({
        key: `e${x.id}`, group: 'events' as const, title: x.title, snippet: x.snippet, to: `/calendar?date=${x.date}`,
        meta: [day(x.date)], repeats: x.repeats,
      })),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `day` only depends on the language
  }, [results.data, q, lang, t])

  const close = () => {
    setText('')
    setQ('')
    onClose()
  }
  const go = (hit: Hit) => {
    play('tap')
    close()
    navigate(hit.to)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!hits.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(hits[active])
    }
  }
  useEffect(() => {
    document.getElementById(`search-hit-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const searching = q.length > 0 && results.isFetching && !results.data
  const empty = q.length > 0 && results.isSuccess && !results.isPlaceholderData && hits.length === 0

  return (
    <Dialog open={open} onClose={close} title={t('search.title')}>
      <div className="bg-sunken flex h-12 items-center gap-2.5 rounded-xl px-3.5">
        <Search size={18} className="text-subtle shrink-0" aria-hidden />
        <input
          data-autofocus
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={200}
          enterKeyHint="search"
          placeholder={t('search.placeholder')}
          aria-label={t('search.title')}
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="search-results"
          aria-activedescendant={hits.length ? `search-hit-${active}` : undefined}
          className="placeholder:text-subtle min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none"
        />
      </div>

      <div id="search-results" role="listbox" aria-label={t('search.title')} className="mt-3 flex max-h-[min(60dvh,520px)] flex-col overflow-y-auto">
        {!q && <p className="text-subtle px-1 py-6 text-center text-[14px]">{t('search.hint')}</p>}
        {searching && <p className="text-subtle px-1 py-6 text-center text-[14px]">{t('search.searching')}</p>}
        {results.isError && <p className="text-danger px-1 py-6 text-center text-[14px]">{errorMessage(t, results.error)}</p>}
        {empty && <p className="text-subtle px-1 py-6 text-center text-[14px]">{t('search.empty', { q })}</p>}
        {GROUPS.map(({ group, icon: Icon, tint }) => {
          const items = hits.map((h, i) => [h, i] as const).filter(([h]) => h.group === group)
          if (!items.length) return null
          return (
            <div key={group} role="group" aria-label={t(`search.groups.${group}`)} className="mb-2">
              <p className="text-subtle px-2 pt-2 pb-1 text-[11.5px] font-semibold tracking-wide uppercase">{t(`search.groups.${group}`)}</p>
              {items.map(([hit, i]) => (
                <div
                  key={hit.key}
                  id={`search-hit-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(hit)}
                  className={cn('flex cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2', i === active && 'bg-fg/[0.06]')}
                >
                  <Icon size={17} className="mt-0.5 shrink-0" style={{ color: tint }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[15px] font-medium">
                      <span className="truncate">{highlight(hit.title, q)}</span>
                      {hit.repeats && <Repeat size={12} className="text-accent shrink-0" aria-label={t('search.repeats')} role="img" />}
                    </span>
                    {hit.snippet && <span className="text-muted line-clamp-2 block text-[13px]">{highlight(hit.snippet, q)}</span>}
                    {hit.meta.some(Boolean) && <span className="text-subtle block text-[12px]">{hit.meta.filter(Boolean).join(' · ')}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="text-subtle mt-1 hidden shrink-0 md:block" aria-hidden />}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}
