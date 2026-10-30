import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Segmented } from '../../components/ui/Segments'
import { EmptyState, ListSkeleton } from '../../components/ui/states'
import { useToast } from '../../components/ui/Toast'
import { addDays, formatInstant, todayInZone, utcIsoToWallTime, wallTimeToUtcIso } from '../../lib/dates'
import { play } from '../../lib/sound'
import type { Occurrence, TaskMarker } from '../../lib/types'
import type { ExternalEvent, Range } from './api'

const KIND_COLOR: Record<string, string> = {
  appointment: 'var(--accent-fill)',
  task_block: 'var(--success-fill)',
  preference: 'var(--border-strong)',
  marker: 'var(--warning-fill)',
  google: 'var(--tint-insights)',
}
const SWIPE_PX = 50

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD day. */
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()

function startOfWeek(day: string, weekStart: number) {
  const back = weekStart === 7 ? weekday(day) : (weekday(day) + 6) % 7
  return addDays(day, -back)
}

interface Item {
  key: string
  title: string
  color: string
  allDay: boolean
  starts_at?: string
  ends_at?: string
  clash: boolean
  onOpen: () => void
}

interface Props {
  tz: string
  weekStart: number
  data?: { items: Occurrence[]; tasks: TaskMarker[]; external?: ExternalEvent[] }
  loading: boolean
  clashing: Set<string>
  onRange: (r: Range) => void
  onCreate: (date: string) => void
  onEdit: (o: Occurrence) => void
  onOpenTask: (id: string) => void
}

/**
 * The phone calendar, like iOS Calendar: a row of the week's days you can swipe through, the chosen day's
 * events as a list below, and a month grid one tap away. (FullCalendar stays on larger screens.)
 */
export function MobileAgenda({ tz, weekStart, data, loading, clashing, onRange, onCreate, onEdit, onOpenTask }: Props) {
  const { t, i18n } = useTranslation('calendar')
  const lang = i18n.language
  const today = todayInZone(tz)
  const [selected, setSelected] = useState(today)
  const toast = useToast()
  const [mode, setMode] = useState<'day' | 'month'>('day')
  const [slide, setSlide] = useState<'left' | 'right' | null>(null)
  const touch = useRef<number | null>(null)

  const weekFirst = startOfWeek(selected, weekStart)
  const monthFirst = `${selected.slice(0, 7)}-01`
  const gridFirst = startOfWeek(monthFirst, weekStart)
  const days = mode === 'day' ? Array.from({ length: 7 }, (_, i) => addDays(weekFirst, i)) : Array.from({ length: 42 }, (_, i) => addDays(gridFirst, i))

  // Ask the page for exactly the days on screen
  const first = days[0]
  const last = days[days.length - 1]
  useEffect(() => {
    onRange({ start: wallTimeToUtcIso(`${first}T00:00`, tz), end: wallTimeToUtcIso(`${addDays(last, 1)}T00:00`, tz) })
  }, [first, last, tz, onRange])

  // Group what's on each day
  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>()
    const put = (day: string, item: Item) => map.set(day, [...(map.get(day) ?? []), item])
    for (const o of data?.items ?? []) {
      const item: Item = {
        key: o.id,
        title: o.title,
        color: KIND_COLOR[o.kind] ?? KIND_COLOR.appointment,
        allDay: o.all_day,
        starts_at: o.starts_at,
        ends_at: o.ends_at,
        clash: clashing.has(`${o.event_id}|${o.original_start}`),
        onOpen: () => onEdit(o),
      }
      if (o.all_day && o.start_date && o.end_date) {
        for (let d = o.start_date; d <= o.end_date; d = addDays(d, 1)) put(d, { ...item, key: `${o.id}-${d}` })
      } else {
        put(utcIsoToWallTime(o.starts_at, tz).slice(0, 10), item)
      }
    }
    for (const g of data?.external ?? []) {
      const item: Item = {
        key: g.id,
        title: g.title,
        color: KIND_COLOR.google,
        allDay: g.all_day,
        starts_at: g.starts_at,
        ends_at: g.ends_at,
        clash: false,
        onOpen: () => toast(t('google.event')), // read-only here: change it in Google Calendar
      }
      if (g.all_day && g.start_date && g.end_date) {
        for (let d = g.start_date; d <= g.end_date; d = addDays(d, 1)) put(d, { ...item, key: `${g.id}-${d}` })
      } else {
        put(utcIsoToWallTime(g.starts_at, tz).slice(0, 10), item)
      }
    }
    for (const m of data?.tasks ?? []) {
      const day = m.kind === 'due' ? m.date! : utcIsoToWallTime(m.at!, tz).slice(0, 10)
      put(day, {
        key: `m-${m.kind}-${m.task_id}`,
        title: t(`markers.${m.kind}`, { title: m.title }),
        color: KIND_COLOR.marker,
        allDay: m.kind === 'due',
        starts_at: m.at,
        ends_at: m.at,
        clash: false,
        onOpen: () => onOpenTask(m.task_id),
      })
    }
    for (const list of map.values()) list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))
    return map
  }, [data, clashing, tz, t, onEdit, onOpenTask, toast])

  const shift = (dir: 1 | -1) => {
    play('tap')
    setSlide(dir === 1 ? 'left' : 'right')
    setSelected(mode === 'day' ? addDays(selected, 7 * dir) : addMonths(monthFirst, dir))
  }
  const pick = (d: string) => {
    play('tap')
    setSelected(d)
    if (mode === 'month') setMode('day')
  }
  const onTouchStart = (e: TouchEvent) => (touch.current = e.touches[0].clientX)
  const onTouchEnd = (e: TouchEvent) => {
    if (touch.current == null) return
    const dx = e.changedTouches[0].clientX - touch.current
    touch.current = null
    if (Math.abs(dx) > SWIPE_PX) shift(dx < 0 ? 1 : -1)
  }

  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang, { timeZone: 'UTC', ...o })
  const time = (iso: string) => formatInstant(iso, lang, tz, { month: undefined, day: undefined })
  const heading = fmt({ month: 'long', year: 'numeric' }).format(new Date(`${(mode === 'day' ? selected : monthFirst)}T00:00:00Z`))
  const dayItems = byDay.get(selected) ?? []
  const selectedLabel = fmt({ weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${selected}T00:00:00Z`))
  const planLink = selected === today || selected === addDays(today, 1) ? '/plan' : null

  return (
    <div>
      {/* Month name, arrows, Today, and the Day / Month switch */}
      <div className="mb-3 flex items-center gap-1">
        <h2 className="font-display min-w-0 flex-1 truncate text-[20px] font-bold tracking-tight">{heading}</h2>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t('agenda.prev')} onClick={() => shift(-1)}>
          <ChevronLeft size={20} aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t('agenda.next')} onClick={() => shift(1)}>
          <ChevronRight size={20} aria-hidden />
        </Button>
        {selected !== today && (
          <Button size="sm" onClick={() => pick(today)}>
            {t('agenda.today')}
          </Button>
        )}
      </div>
      <div className="mb-4">
        <Segmented items={['day', 'month'] as const} value={mode} onChange={setMode} label={t('agenda.view')} render={(m) => t(`agenda.${m}`)} />
      </div>

      <div
        className="bg-surface shadow-card overflow-hidden rounded-[18px] p-2 dark:shadow-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="text-subtle mb-1 grid grid-cols-7 text-center text-[11px] font-semibold">
          {days.slice(0, 7).map((d) => (
            <span key={d}>{fmt({ weekday: 'narrow' }).format(new Date(`${d}T00:00:00Z`))}</span>
          ))}
        </div>
        <div
          key={`${first}-${mode}`}
          className={cn('grid grid-cols-7 gap-y-1', slide === 'left' && 'animate-[slide-l_320ms_var(--ease-out)]', slide === 'right' && 'animate-[slide-r_320ms_var(--ease-out)]')}
          onAnimationEnd={() => setSlide(null)}
        >
          {days.map((d) => {
            const isSel = d === selected
            const isToday = d === today
            const outside = mode === 'month' && d.slice(0, 7) !== monthFirst.slice(0, 7)
            const dots = (byDay.get(d) ?? []).slice(0, 3)
            return (
              <button
                key={d}
                type="button"
                onClick={() => pick(d)}
                aria-pressed={isSel}
                aria-label={fmt({ weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${d}T00:00:00Z`))}
                className={cn('pressable flex flex-col items-center gap-1 rounded-xl py-1.5', outside && 'opacity-35')}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-[17px] tabular-nums transition-colors duration-[var(--duration-fast)]',
                    isSel ? (isToday ? 'bg-danger-fill text-white font-bold' : 'bg-fg text-bg font-bold') : isToday ? 'text-danger font-bold' : 'font-medium',
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                <span className="flex h-1.5 gap-0.5" aria-hidden>
                  {dots.map((x) => (
                    <span key={x.key} className="h-1.5 w-1.5 rounded-full" style={{ background: x.color }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* The chosen day */}
      <div className="mt-6 mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-display text-[20px] font-bold tracking-tight">{selectedLabel}</h2>
        <Button size="sm" variant="ghost" onClick={() => onCreate(selected)} aria-label={t('newEvent')}>
          <Plus size={16} aria-hidden />
        </Button>
      </div>
      <div key={selected} className="page-enter bg-surface shadow-card overflow-hidden rounded-[18px] dark:shadow-none">
        {loading && !data ? (
          <ListSkeleton rows={3} />
        ) : dayItems.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={t('agenda.emptyTitle')}
            body={t('agenda.emptyBody')}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {planLink && (
                  <Link to={planLink} className="pressable bg-accent-fill text-on-accent inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold">
                    <CalendarCheck size={15} aria-hidden />
                    {t('agenda.plan')}
                  </Link>
                )}
                <Button size="sm" onClick={() => onCreate(selected)}>
                  <Plus size={14} aria-hidden />
                  {t('newEvent')}
                </Button>
              </div>
            }
          />
        ) : (
          <ul className="divide-border stagger divide-y">
            {dayItems.map((x) => (
              <li key={x.key}>
                <button type="button" onClick={x.onOpen} className="active:bg-sunken/70 flex w-full items-stretch gap-3 px-4 py-3 text-left">
                  <span className="text-subtle w-14 shrink-0 pt-px text-[13px] leading-tight tabular-nums">
                    {x.allDay || !x.starts_at ? (
                      t('fields.allDay')
                    ) : (
                      <>
                        <span className="text-fg block font-semibold">{time(x.starts_at)}</span>
                        {x.ends_at && x.ends_at !== x.starts_at && <span className="block">{time(x.ends_at)}</span>}
                      </>
                    )}
                  </span>
                  {/* iOS Calendar's colour bar for the event's kind */}
                  <span className="w-[3px] shrink-0 rounded-full" style={{ background: x.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words">{x.title}</span>
                    {x.clash && <span className="text-danger text-xs font-semibold">{t('agenda.clash')}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function addMonths(firstOfMonth: string, n: number) {
  const [y, m] = firstOfMonth.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}
