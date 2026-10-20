import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { ActivityLog, ActivitySummary, FocusSession } from '../../lib/types'

export interface ActivityInput {
  title?: string
  category_id?: string | null
  log_date?: string
  started_at?: string | null
  ended_at?: string | null
  duration_minutes?: number | null
  notes?: string | null
  outcome?: string | null
  goal_id?: string | null
  task_id?: string | null
}

const FOCUS = ['focus']
const ACTIVITY = ['activity']

export function useCurrentFocus() {
  return useQuery({
    queryKey: [...FOCUS, 'current'],
    queryFn: () => api<{ session: FocusSession | null }>('/focus-sessions/current'),
    select: (d) => d.session,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })
}

export function useFocusSessions(start: string, end: string) {
  return useQuery({
    queryKey: [...FOCUS, 'list', start, end],
    queryFn: () =>
      api<{ items: FocusSession[]; completed_count: number; interrupted_count: number; focused_minutes: number }>(
        `/focus-sessions?start=${start}&end=${end}`,
      ),
  })
}

export function useActivity(start: string, end: string) {
  return useQuery({
    queryKey: [...ACTIVITY, 'list', start, end],
    queryFn: () => api<{ items: ActivityLog[] }>(`/activity-logs?start=${start}&end=${end}&limit=200`),
    select: (d) => d.items,
  })
}

export function useActivitySummary(start: string, end: string) {
  return useQuery({
    queryKey: [...ACTIVITY, 'summary', start, end],
    queryFn: () => api<ActivitySummary>(`/activity-logs/summary?start=${start}&end=${end}`),
  })
}

/** Focus and activity changes also change tasks' tracked time. */
function useInvalidate() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: FOCUS }),
      qc.invalidateQueries({ queryKey: ACTIVITY }),
      qc.invalidateQueries({ queryKey: ['tasks'] }),
    ])
}

export function useFocusAction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (a: { kind: 'start'; planned_minutes: number; break_minutes: number; task_id?: string | null; label?: string | null }
      | { kind: 'pause' | 'resume'; id: string }
      | { kind: 'stop'; id: string; mark_complete: boolean }
      | { kind: 'correct'; id: string; actual_minutes: number }) => {
      switch (a.kind) {
        case 'start':
          return api<FocusSession>('/focus-sessions', {
            method: 'POST',
            body: { planned_minutes: a.planned_minutes, break_minutes: a.break_minutes, task_id: a.task_id, label: a.label },
          })
        case 'pause':
        case 'resume':
          return api<FocusSession>(`/focus-sessions/${a.id}/${a.kind}`, { method: 'POST' })
        case 'stop':
          return api<FocusSession>(`/focus-sessions/${a.id}/stop`, { method: 'POST', body: { mark_complete: a.mark_complete } })
        case 'correct':
          return api<FocusSession>(`/focus-sessions/${a.id}`, { method: 'PATCH', body: { actual_minutes: a.actual_minutes } })
      }
    },
    onSuccess: invalidate,
  })
}

export function useSaveActivity() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: ActivityInput & { id?: string }) =>
      id
        ? api<ActivityLog>(`/activity-logs/${id}`, { method: 'PATCH', body })
        : api<ActivityLog>('/activity-logs', { method: 'POST', body: { id: crypto.randomUUID(), ...body } }),
    onSuccess: invalidate,
  })
}

export function useDeleteActivity() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/activity-logs/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

/** Seconds focused so far, correcting for the device clock being off from the server's. */
export function focusedNow(s: FocusSession, clientNow: number, fetchedAt: number): number {
  if (s.state !== 'running') return s.focused_seconds
  return s.focused_seconds + Math.max(0, Math.floor((clientNow - fetchedAt) / 1000))
}
