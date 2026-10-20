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

const CAL = ['calendar']
const qs = (r: Range) => `start=${encodeURIComponent(r.start)}&end=${encodeURIComponent(r.end)}`

export function useOccurrences(range: Range | null) {
  return useQuery({
    queryKey: [...CAL, 'occurrences', range],
    queryFn: () => api<{ items: Occurrence[]; tasks: TaskMarker[] }>(`/calendar/occurrences?${qs(range!)}`),
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
