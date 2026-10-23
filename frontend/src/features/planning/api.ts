import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Occurrence, Task } from '../../lib/types'

export type PlanDay = 'today' | 'tomorrow'
export type Reason = 'overdue' | 'due_today' | 'deadline_soon' | 'in_progress' | 'high_priority' | 'due_soon'

export interface DayPlan {
  date: string
  is_today: boolean
  events: Occurrence[]
  free_slots: { starts_at: string; ends_at: string; minutes: number }[]
  free_minutes: number
  candidates: { task: Task; reasons: Reason[]; scheduled: boolean }[]
  suggested: string[]
  habits: { id: string; name: string }[]
}

export interface PlannedBlock {
  task_id: string
  title: string
  starts_at: string
  ends_at: string
  minutes: number
  estimated: boolean
}

export interface WeeklyReview {
  id: string
  week_start: string
  went_well: string | null
  to_improve: string | null
  lesson: string | null
  priorities: string[]
  completed_at: string | null
  updated_at: string
}

export interface WeekSummary {
  week: { start: string; end: string; elapsed_days: number; offset: number }
  score: number | null
  tasks: { due: number; on_time: number; late: number; missed: number; completed: number; created: number; rate: number | null }
  habits_rate: number | null
  completed: { id: string; title: string; completed_at: string }[]
  carry_over: Task[]
  habits: { id: string; name: string; current_streak: number; unit: 'days' | 'weeks'; consistency: number | null }[]
  goals: { id: string; title: string; progress: number | null; target_date: string | null }[]
  mood: { average_mood: number | null; average_energy: number | null; check_in_days: number | null }
  focus: { completed: number; interrupted: number; minutes: number }
  tracked_minutes: number
  review: WeeklyReview | null
  last_week_priorities: string[]
}

export const PLAN_KEY = ['planning'] as const

export function useDayPlan(day: PlanDay) {
  return useQuery({ queryKey: [...PLAN_KEY, 'day', day], queryFn: () => api<DayPlan>(`/planning/day?day=${day}`) })
}

export function useSchedule() {
  return useMutation({
    mutationFn: (body: { day: PlanDay; task_ids: string[] }) =>
      api<{ date: string; blocks: PlannedBlock[]; unplaced: string[] }>('/planning/day/schedule', { method: 'POST', body }),
  })
}

/** Creates the kept blocks as calendar task blocks, one after another (each is an ordinary calendar call). */
export function useAddBlocks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (blocks: PlannedBlock[]) => {
      for (const b of blocks) {
        await api('/calendar/events', {
          method: 'POST',
          body: { title: b.title, kind: 'task_block', task_id: b.task_id, starts_at: b.starts_at, ends_at: b.ends_at },
        })
      }
      return blocks.length
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: PLAN_KEY })
    },
  })
}

export function useWeek(week: 'this' | 'last') {
  return useQuery({ queryKey: [...PLAN_KEY, 'week', week], queryFn: () => api<WeekSummary>(`/planning/week?week=${week}`) })
}

export function useSaveReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ weekStart, ...body }: { weekStart: string } & Partial<Pick<WeeklyReview, 'went_well' | 'to_improve' | 'lesson' | 'priorities'>> & { completed?: boolean }) =>
      api<WeeklyReview>(`/planning/reviews/${weekStart}`, { method: 'PUT', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PLAN_KEY }),
  })
}
