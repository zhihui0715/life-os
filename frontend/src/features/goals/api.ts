/** Goal data hooks. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Goal, GoalDetail, GoalStatus, GoalUpdate, Milestone, ProgressMode } from '../../lib/types'

export interface GoalInput {
  title?: string
  description?: string | null
  success_criteria?: string | null
  category_id?: string | null
  horizon?: 'short' | 'long'
  status?: GoalStatus
  progress_mode?: ProgressMode
  manual_progress?: number | null
  start_date?: string | null
  target_date?: string | null
}

export type GoalListFilter = GoalStatus | 'archived'

const GOALS = ['goals']

export function useGoals(filter?: GoalListFilter) {
  const params = filter === 'archived' ? '?archived_only=true' : filter ? `?status=${filter}` : ''
  return useQuery({
    queryKey: [...GOALS, 'list', filter ?? 'all'],
    queryFn: () => api<{ items: Goal[] }>(`/goals${params}`),
    select: (d) => d.items,
  })
}

export function useGoal(id: string | null | undefined) {
  return useQuery({
    queryKey: [...GOALS, 'detail', id],
    queryFn: () => api<GoalDetail>(`/goals/${id}`),
    enabled: !!id,
  })
}

/** Goals and tasks affect each other's numbers, so refresh both after any change. */
function useInvalidate() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: GOALS }), qc.invalidateQueries({ queryKey: ['tasks'] })])
}

export function useCreateGoal() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: GoalInput) => api<GoalDetail>('/goals', { method: 'POST', body: { id: crypto.randomUUID(), ...input } }),
    onSuccess: invalidate,
  })
}

export function useUpdateGoal() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...changes }: GoalInput & { id: string; if_updated_at?: string }) =>
      api<GoalDetail>(`/goals/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: invalidate,
  })
}

export function useGoalAction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'archive' | 'restore' }) =>
      api<GoalDetail>(`/goals/${id}/${action}`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}

export function useAddGoalUpdate() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ goalId, ...body }: { goalId: string; note?: string; progress?: number }) =>
      api<GoalUpdate>(`/goals/${goalId}/updates`, { method: 'POST', body }),
    onSuccess: invalidate,
  })
}

export function useAddMilestone() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ goalId, ...body }: { goalId: string; title: string; weight?: number; target_date?: string | null }) =>
      api<Milestone>(`/goals/${goalId}/milestones`, { method: 'POST', body }),
    onSuccess: invalidate,
  })
}

export function useMilestoneAction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'complete' | 'reopen' | 'delete' }) => {
      if (action === 'delete') await api<void>(`/milestones/${id}`, { method: 'DELETE' })
      else await api<Milestone>(`/milestones/${id}/${action}`, { method: 'POST' })
    },
    onSuccess: invalidate,
  })
}

export function useUpdateMilestone() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; weight?: number; target_date?: string | null }) =>
      api<Milestone>(`/milestones/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  })
}
