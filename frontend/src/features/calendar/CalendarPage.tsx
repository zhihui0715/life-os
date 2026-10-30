import './fullcalendar.css'

import type { DateSelectArg, DatesSetArg, EventClickArg, EventDropArg, EventInput as FcEvent } from '@fullcalendar/core'
import zhCnLocale from '@fullcalendar/core/locales/zh-cn'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DropArg, type EventResizeDoneArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import luxonPlugin from '@fullcalendar/luxon3'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { Card, ErrorState, PageHeader } from '../../components/ui/states'
import { addDays, todayInZone, utcIsoToWallTime, wallTimeToUtcIso } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { Occurrence } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useCategories } from '../tasks/api'
import { TaskDrawer } from '../tasks/TaskDrawer'
import { useConflicts, useEditOccurrence, useEvent, useOccurrences, useTask, useUpdateEvent, type Range } from './api'
import { EventDialog, type EventDialogMode } from './EventDialog'
import { MobileAgenda } from './MobileAgenda'
import { AttentionPanel, ToSchedulePanel } from './SidePanels'
import { SuggestionDialog, useWhen } from './SuggestionDialog'

const mobileQuery = '(max-width: 767px)'
const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]

/**
 * Two accessibility gaps in FullCalendar's own markup (found by the axe checks in e2e/a11y.spec.ts), patched after
 * every redraw: its arrow icons are role="img" without a name (the buttons around them are already named, so the icons
 * are hidden from screen readers), and its "+N more" link carries aria-expanded, which needs role="button".
 */
function useCalendarA11yFixes() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const fix = () => {
      root.querySelectorAll('.fc-icon[role="img"]').forEach((el) => {
        el.removeAttribute('role')
        el.setAttribute('aria-hidden', 'true')
      })
      root.querySelectorAll('a.fc-daygrid-more-link:not([role])').forEach((el) => el.setAttribute('role', 'button'))
    }
    fix()
    const observer = new MutationObserver(fix)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return ref
}
const LOCALES = [zhCnLocale]
const MOBILE_HEADER = { left: 'prev,next', center: 'title', right: 'today' }
const MOBILE_FOOTER = { center: 'timeGridDay,listWeek,dayGridMonth' }
const DESKTOP_HEADER = { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek' }
function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(mobileQuery)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(mobileQuery).matches,
  )
}

/** FullCalendar gives "2026-10-21", "2026-10-21T09:00:00" or "...+08:00"; turn any of them into a UTC instant. */
function toInstant(value: string, tz: string): string {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(value)) return new Date(value).toISOString()
  if (value.includes('T')) return wallTimeToUtcIso(value.slice(0, 16), tz)
  return wallTimeToUtcIso(`${value}T00:00`, tz)
}

interface PendingMove {
  occ: Occurrence
  starts_at: string
  ends_at: string
  allDay: boolean
  startDate?: string
  endDate?: string
  revert: () => void
}

export function CalendarPage() {
  const { t, i18n } = useTranslation('calendar')
  const calendarRef = useCalendarA11yFixes()
  const me = useMe()
  const tz = me.settings.timezone
  const isMobile = useIsMobile()
  const toast = useToast()
  const when = useWhen()
  const categories = useCategories().data ?? []

  const [range, setRange] = useState<Range | null>(null)
  const occ = useOccurrences(range)
  const conflicts = useConflicts(range)
  const [dialog, setDialog] = useState<EventDialogMode | null>(null)
  const [findTime, setFindTime] = useState<{ id: string; title: string } | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const openTask = useTask(openTaskId).data ?? null
  const [move, setMove] = useState<PendingMove | null>(null)
  const [moveScope, setMoveScope] = useState<'this' | 'all'>('this')
  const moveEvent = useEvent(move && moveScope === 'all' ? move.occ.event_id : null).data
  const editOne = useEditOccurrence()
  const editSeries = useUpdateEvent()

  // Occurrences in a conflict get a warning outline.
  const clashing = useMemo(() => {
    const ids = new Set<string>()
    for (const o of conflicts.data?.overlaps ?? []) for (const x of [o.a, o.b]) ids.add(`${x.event_id}|${x.original_start}`)
    return ids
  }, [conflicts.data])

  const events = useMemo<FcEvent[]>(() => {
    const items: FcEvent[] = (occ.data?.items ?? []).map((o) => ({
      id: o.id,
      title: o.title,
      start: o.all_day ? o.start_date : o.starts_at,
      end: o.all_day ? addDays(o.end_date!, 1) : o.ends_at,
      allDay: o.all_day,
      // Repeating all-day events can only be changed as a whole series, from the form.
      editable: !(o.all_day && o.recurring),
      classNames: [`ev-${o.kind}`, clashing.has(`${o.event_id}|${o.original_start}`) ? 'ev-clash' : ''],
      extendedProps: { occ: o },
    }))
    for (const g of occ.data?.external ?? []) {
      items.push({
        id: g.id,
        title: g.title,
        start: g.all_day ? g.start_date : g.starts_at,
        end: g.all_day ? addDays(g.end_date!, 1) : g.ends_at,
        allDay: g.all_day,
        editable: false, // change it in Google Calendar
        classNames: ['ev-google'],
        extendedProps: { google: true },
      })
    }
    for (const m of occ.data?.tasks ?? []) {
      items.push({
        id: `marker-${m.kind}-${m.task_id}`,
        title: t(`markers.${m.kind}`, { title: m.title }),
        start: m.kind === 'due' ? m.date : m.at,
        allDay: m.kind === 'due',
        editable: false,
        classNames: ['ev-marker'],
        extendedProps: { taskId: m.task_id },
      })
    }
    return items
  }, [occ.data, clashing, t])

  // FullCalendar reports its visible range after every render; only store it when it really changed,
  // otherwise storing it re-renders the calendar, which reports again — an endless loop.
  const onDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const next = { start: toInstant(arg.startStr, tz), end: toInstant(arg.endStr, tz) }
      setRange((prev) => (prev && prev.start === next.start && prev.end === next.end ? prev : next))
    },
    [tz],
  )

  const onSelect = (arg: DateSelectArg) => {
    arg.view.calendar.unselect()
    if (arg.allDay) {
      setDialog({ type: 'create', date: arg.startStr.slice(0, 10), allDay: true })
      return
    }
    const s = utcIsoToWallTime(toInstant(arg.startStr, tz), tz)
    const e = utcIsoToWallTime(toInstant(arg.endStr, tz), tz)
    setDialog({ type: 'create', date: s.slice(0, 10), start: s.slice(11, 16), end: e.slice(11, 16) })
  }

  const onClick = (arg: EventClickArg) => {
    const { occ: o, taskId } = arg.event.extendedProps as { occ?: Occurrence; taskId?: string }
    if (o) setDialog({ type: 'edit', occurrence: o })
    else if (taskId) setOpenTaskId(taskId)
  }

  // Dragging or resizing never saves straight away: it asks first, and puts the event back if you cancel.
  const onMove = (arg: EventDropArg | EventResizeDoneArg) => {
    const o = arg.event.extendedProps.occ as Occurrence | undefined
    if (!o) return arg.revert()
    const allDay = arg.event.allDay
    const startDate = arg.event.startStr.slice(0, 10)
    const endDate = arg.event.endStr ? addDays(arg.event.endStr.slice(0, 10), -1) : startDate
    setMoveScope('this')
    setMove({
      occ: o,
      allDay,
      startDate,
      endDate,
      starts_at: allDay ? wallTimeToUtcIso(`${startDate}T00:00`, tz) : toInstant(arg.event.startStr, tz),
      ends_at: allDay ? wallTimeToUtcIso(`${addDays(endDate, 1)}T00:00`, tz) : toInstant(arg.event.endStr || arg.event.startStr, tz),
      revert: arg.revert,
    })
  }

  // Stable callbacks for the phone agenda (it asks for its own visible range)
  const onAgendaRange = useCallback((r: Range) => setRange((prev) => (prev && prev.start === r.start && prev.end === r.end ? prev : r)), [])
  const onAgendaEdit = useCallback((o: Occurrence) => setDialog({ type: 'edit', occurrence: o }), [])
  const onAgendaTask = useCallback((id: string) => setOpenTaskId(id), [])

  const confirmMove = () => {
    if (!move) return
    const o = move.occ
    const opts = {
      onSuccess: () => {
        toast(t('toast.moved'))
        setMove(null)
      },
      onError: (e: unknown) => {
        move.revert()
        setMove(null)
        toast(errorMessage(t, e), 'error')
      },
    }
    if (o.recurring && moveScope === 'this') {
      editOne.mutate({ eventId: o.event_id, originalStart: o.original_start, starts_at: move.starts_at, ends_at: move.ends_at }, opts)
    } else if (o.recurring) {
      if (!moveEvent) return
      // Shift the whole series by the same amount this occurrence moved.
      const delta = new Date(move.starts_at).getTime() - new Date(o.starts_at).getTime()
      const length = new Date(move.ends_at).getTime() - new Date(move.starts_at).getTime()
      const start = new Date(new Date(moveEvent.starts_at).getTime() + delta)
      editSeries.mutate({ id: o.event_id, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + length).toISOString() }, opts)
    } else if (move.allDay) {
      editSeries.mutate({ id: o.event_id, start_date: move.startDate, end_date: move.endDate }, opts)
    } else {
      editSeries.mutate({ id: o.event_id, starts_at: move.starts_at, ends_at: move.ends_at }, opts)
    }
  }

  // A task dragged in from "To schedule" opens the form pre-filled, so nothing is created without a click.
  const onExternalDrop = (arg: DropArg) => {
    const el = arg.draggedEl
    const minutes = Number(el.dataset.minutes) || 60
    if (arg.allDay) {
      setDialog({ type: 'create', date: arg.dateStr.slice(0, 10), kind: 'task_block', taskId: el.dataset.taskId, title: el.dataset.title })
      return
    }
    const s = utcIsoToWallTime(toInstant(arg.dateStr, tz), tz)
    const endIso = new Date(new Date(toInstant(arg.dateStr, tz)).getTime() + minutes * 60_000).toISOString()
    setDialog({
      type: 'create', date: s.slice(0, 10), start: s.slice(11, 16), end: utcIsoToWallTime(endIso, tz).slice(11, 16),
      kind: 'task_block', taskId: el.dataset.taskId, title: el.dataset.title,
    })
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <Button variant="primary" size={isMobile ? 'sm' : 'md'} onClick={() => setDialog({ type: 'create', date: todayInZone(tz) })}>
            <Plus size={16} aria-hidden />
            {t('newEvent')}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {isMobile ? (
          occ.isError ? (
            <ErrorState message={errorMessage(t, occ.error)} onRetry={() => occ.refetch()} />
          ) : (
            <MobileAgenda
              tz={tz}
              weekStart={me.settings.week_start}
              data={occ.data}
              loading={occ.isPending}
              clashing={clashing}
              onRange={onAgendaRange}
              onCreate={(date) => setDialog({ type: 'create', date })}
              onEdit={onAgendaEdit}
              onOpenTask={onAgendaTask}
            />
          )
        ) : (
        <Card className="min-w-0 p-2 sm:p-3">
          <div ref={calendarRef}>
          {occ.isError ? (
            <ErrorState message={errorMessage(t, occ.error)} onRetry={() => occ.refetch()} />
          ) : (
            <FullCalendar
              key={isMobile ? 'mobile' : 'desktop'}
              plugins={PLUGINS}
              timeZone={tz}
              locales={LOCALES}
              locale={i18n.language === 'zh-CN' ? 'zh-cn' : 'en'}
              firstDay={me.settings.week_start === 7 ? 0 : 1}
              initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
              headerToolbar={isMobile ? MOBILE_HEADER : DESKTOP_HEADER}
              footerToolbar={isMobile ? MOBILE_FOOTER : undefined}
              height="auto"
              scrollTime="08:00:00"
              slotMinTime="06:00:00"
              slotMaxTime="24:00:00"
              nowIndicator
              selectable
              selectMirror
              editable
              droppable
              eventDurationEditable
              events={events}
              datesSet={onDatesSet}
              select={onSelect}
              eventClick={onClick}
              eventDrop={onMove}
              eventResize={onMove}
              drop={onExternalDrop}
              dayMaxEventRows={3}
            />
          )}
          </div>
        </Card>
        )}

        <div className="flex flex-col gap-4">
          <AttentionPanel overlaps={conflicts.data?.overlaps ?? []} workload={conflicts.data?.workload ?? []} onFindTime={setFindTime} />
          <ToSchedulePanel onFindTime={setFindTime} />
        </div>
      </div>

      <EventDialog mode={dialog} onClose={() => setDialog(null)} />
      <SuggestionDialog task={findTime} onClose={() => setFindTime(null)} />
      <TaskDrawer task={openTask} categories={categories} onClose={() => setOpenTaskId(null)} onOpenTask={(task) => setOpenTaskId(task.id)} />

      <ConfirmDialog
        open={!!move}
        title={t('move.title')}
        body={move ? t('move.body', { title: move.occ.title, when: when(move.starts_at, move.ends_at) }) : ''}
        confirmLabel={t('move.confirm')}
        busy={editOne.isPending || editSeries.isPending || (moveScope === 'all' && !moveEvent)}
        onCancel={() => {
          move?.revert()
          setMove(null)
        }}
        onConfirm={confirmMove}
      >
        {move?.occ.recurring && !move.allDay && <MoveScopePicker scope={moveScope} onChange={setMoveScope} />}
      </ConfirmDialog>
    </>
  )
}

/** Shown inside the move confirmation for a repeating event. */
function MoveScopePicker({ scope, onChange }: { scope: 'this' | 'all'; onChange: (s: 'this' | 'all') => void }) {
  const { t } = useTranslation('calendar')
  return (
    <div className="bg-sunken/70 mt-3 rounded-xl p-3">
      <p className="mb-1 text-sm font-medium">{t('scope.label')}</p>
      {(['this', 'all'] as const).map((s) => (
        <label key={s} className="flex items-center gap-2 py-1 text-sm">
          <input type="radio" name="move-scope" checked={scope === s} onChange={() => onChange(s)} />
          {t(`scope.${s}`)}
        </label>
      ))}
    </div>
  )
}

export default CalendarPage
