import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Habit, HabitDayState, HabitDetail, HabitScheduleType } from '../../lib/types'

export interface HabitInput {
  name?: string
  description?: string | null
  schedule_type?: HabitScheduleType
  weekday_mask?: number
  times_per_week?: number
  target_value?: number | null
  target_unit?: string | null
  start_date?: string
  goal_id?: string | null
  category_id?: string | null
}

const HABITS = ['habits']

export function useHabits(archived = false) {
  return useQuery({
    queryKey: [...HABITS, 'list', archived],
    queryFn: () => api<{ items: Habit[] }>(`/habits${archived ? '?archived_only=true' : ''}`),
    select: (d) => d.items,
  })
}

export function useHabit(id: string | undefined) {
  return useQuery({ queryKey: [...HABITS, 'detail', id], queryFn: () => api<HabitDetail>(`/habits/${id}`), enabled: !!id })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: HABITS })
}

export function useCreateHabit() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: HabitInput) => api<HabitDetail>('/habits', { method: 'POST', body: { id: crypto.randomUUID(), ...input } }),
    onSuccess: invalidate,
  })
}

export function useUpdateHabit() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: HabitInput & { id: string }) => api<HabitDetail>(`/habits/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  })
}

export function useArchiveHabit() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      api<HabitDetail>(`/habits/${id}/${archive ? 'archive' : 'restore'}`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}

/** Set or clear a day's check-in. `state: null` removes it. */
export function useCheckIn() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, date, state, value, note }: { id: string; date: string; state: HabitDayState | null; value?: number | null; note?: string | null }) =>
      state === null
        ? api<HabitDetail>(`/habits/${id}/logs/${date}`, { method: 'DELETE' })
        : api<HabitDetail>(`/habits/${id}/logs/${date}`, { method: 'PUT', body: { state, value, note } }),
    onSuccess: invalidate,
  })
}

export const WEEKDAY_BITS = [1, 2, 4, 8, 16, 32, 64] // Mon … Sun
