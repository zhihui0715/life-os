/** Task data hooks. Pages never call fetch directly; they use these. */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Category, Page, TagSummary, Task, TaskFilters, TaskStatus } from '../../lib/types'

export interface TaskInput {
  title?: string
  notes?: string | null
  status?: Exclude<TaskStatus, 'done'>
  priority?: number
  due_date?: string | null
  deadline?: string | null
  estimate_minutes?: number | null
  category_id?: string | null
  goal_id?: string | null
  milestone_id?: string | null
  parent_task_id?: string | null
  tags?: string[]
}

const TASKS = ['tasks']

function toQueryString(filters: TaskFilters, limit: number, cursor: string) {
  const params = new URLSearchParams({ limit: String(limit) })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

export function useTaskList(filters: TaskFilters, limit = 50) {
  return useInfiniteQuery({
    queryKey: [...TASKS, 'list', filters, limit],
    queryFn: ({ pageParam }) => api<Page<Task>>(`/tasks?${toQueryString(filters, limit, pageParam)}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ items: Category[] }>('/categories'),
    select: (d) => d.items,
    staleTime: 5 * 60_000,
  })
}

export function useTags() {
  return useQuery({
    queryKey: [...TASKS, 'tags'],
    queryFn: () => api<{ items: TagSummary[] }>('/tags'),
    select: (d) => d.items,
  })
}

/** Task changes can move goal progress, so goals are refreshed too. */
function useInvalidateTasks() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: TASKS }), qc.invalidateQueries({ queryKey: ['goals'] })])
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    // The client creates the id, so a retried request can never create a duplicate.
    mutationFn: (input: TaskInput) =>
      api<Task>('/tasks', { method: 'POST', body: { id: crypto.randomUUID(), ...input } }),
    onSuccess: invalidate,
  })
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: ({ id, ...changes }: TaskInput & { id: string; if_updated_at?: string }) =>
      api<Task>(`/tasks/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: invalidate,
  })
}

export type TaskAction = 'complete' | 'reopen' | 'archive' | 'restore'

export function useTaskAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: TaskAction }) =>
      api<Task>(`/tasks/${id}/${action}`, { method: 'POST' }),
    // Optimistic tick: the checkbox responds instantly; the list refreshes from the server afterwards.
    onMutate: async ({ id, action }) => {
      if (action !== 'complete' && action !== 'reopen') return
      await qc.cancelQueries({ queryKey: TASKS })
      qc.setQueriesData<{ pages: Page<Task>[] }>({ queryKey: [...TASKS, 'list'] }, (data) =>
        data && {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.map((t) =>
              t.id === id ? { ...t, status: action === 'complete' ? 'done' : 'todo', is_overdue: action === 'complete' ? false : t.is_overdue } : t,
            ),
          })),
        },
      )
    },
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: TASKS }), qc.invalidateQueries({ queryKey: ['goals'] })]),
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}
