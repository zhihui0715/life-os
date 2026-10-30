/** Calendar data hooks. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { CalendarEvent, EventKind, Occurrence, Overlap, Suggestions, Task, TaskMarker, WorkloadItem } from '../../lib/types'

export interface Range {
  start: string // ISO with offset
  end: string
}

export interface EventInput {
  title?: string
  description?: string | null
  kind?: EventKind
  is_hard?: boolean
  all_day?: boolean
  starts_at?: string
  ends_at?: string
  start_date?: string
  end_date?: string
  rrule?: string | null
  task_id?: string | null
  category_id?: string | null
}

/** An event from a linked Google calendar: shown read-only (change it in Google). */
export interface ExternalEvent {
  id: string
  title: string
  all_day: boolean
  starts_at: string
  ends_at: string
  start_date?: string
  end_date?: string
  busy: boolean
  source: 'google'
}

export interface CalendarLinks {
  /** The private address Google Calendar subscribes to; null when switched off */
  feed_url: string | null
  /** off: no Google calendar linked; error: linked, but it couldn't be read just now */
  google: 'off' | 'ok' | 'error'
  /** Why a linked Google calendar couldn't be read (with google: 'error') */
  google_problem: GoogleProblem | null
}

export type GoogleProblem = 'public_not_shared' | 'not_found' | 'denied' | 'google_busy' | 'timeout' | 'unreachable' | 'too_large' | 'not_calendar'

const CAL = ['calendar']
const qs = (r: Range) => `start=${encodeURIComponent(r.start)}&end=${encodeURIComponent(r.end)}`

export function useOccurrences(range: Range | null) {
  return useQuery({
    queryKey: [...CAL, 'occurrences', range],
    queryFn: () => api<{ items: Occurrence[]; tasks: TaskMarker[]; external: ExternalEvent[] }>(`/calendar/occurrences?${qs(range!)}`),
    enabled: !!range,
    placeholderData: (prev) => prev, // keep showing the old week while the next one loads
  })
}

export function useConflicts(range: Range | null) {
  return useQuery({
    queryKey: [...CAL, 'conflicts', range],
    queryFn: () => api<{ overlaps: Overlap[]; workload: WorkloadItem[] }>(`/calendar/conflicts?${qs(range!)}`),
    enabled: !!range,
    placeholderData: (prev) => prev,
  })
}

export function useEvent(id: string | null) {
  return useQuery({
    queryKey: [...CAL, 'event', id],
    queryFn: () => api<CalendarEvent>(`/calendar/events/${id}`),
    enabled: !!id,
  })
}

export function useSuggestions(taskId: string | null) {
  return useQuery({
    queryKey: [...CAL, 'suggestions', taskId],
    queryFn: () => api<Suggestions>(`/calendar/suggestions?task_id=${taskId}`),
    enabled: !!taskId,
    staleTime: 0,
  })
}

export function useTask(id: string | null) {
  return useQuery({ queryKey: ['tasks', 'one', id], queryFn: () => api<Task>(`/tasks/${id}`), enabled: !!id })
}

/** Calendar changes affect free time, conflicts and "needs scheduling", so refresh calendar + tasks together. */
function useInvalidate() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: CAL }), qc.invalidateQueries({ queryKey: ['tasks'] })])
}

export function useCreateEvent() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: EventInput) =>
      api<CalendarEvent>('/calendar/events', { method: 'POST', body: { id: crypto.randomUUID(), ...input } }),
    onSuccess: invalidate,
  })
}

export function useUpdateEvent() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: EventInput & { id: string; if_updated_at?: string }) =>
      api<CalendarEvent & { dropped_exceptions: number }>(`/calendar/events/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  })
}

export function useArchiveEvent() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<CalendarEvent>(`/calendar/events/${id}/archive`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}

const occurrenceUrl = (eventId: string, originalStart: string) =>
  `/calendar/events/${eventId}/occurrence?original_start=${encodeURIComponent(originalStart)}`

export function useEditOccurrence() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ eventId, originalStart, ...body }: { eventId: string; originalStart: string; starts_at: string; ends_at: string; title?: string }) =>
      api<Occurrence>(occurrenceUrl(eventId, originalStart), { method: 'PATCH', body }),
    onSuccess: invalidate,
  })
}

export function useCancelOccurrence() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ eventId, originalStart }: { eventId: string; originalStart: string }) =>
      api<void>(occurrenceUrl(eventId, originalStart), { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

const LINKS_KEY = [...CAL, 'links']

export function useCalendarLinks() {
  return useQuery({ queryKey: LINKS_KEY, queryFn: () => api<CalendarLinks>('/calendar/links') })
}

/** start/stop the feed, or link/unlink a Google calendar. Linking changes what the calendar shows. */
export function useCalendarLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { kind: 'feed'; on: boolean } | { kind: 'google'; url: string | null }) =>
      a.kind === 'feed'
        ? api<CalendarLinks>('/calendar/links/feed', { method: a.on ? 'POST' : 'DELETE' })
        : a.url
          ? api<CalendarLinks>('/calendar/links/google', { method: 'PUT', body: { url: a.url } })
          : api<CalendarLinks>('/calendar/links/google', { method: 'DELETE' }),
    onSuccess: (links) => {
      qc.setQueryData(LINKS_KEY, links)
      void qc.invalidateQueries({ queryKey: [...CAL, 'occurrences'] })
      void qc.invalidateQueries({ queryKey: ['planning'] })
    },
  })
}
