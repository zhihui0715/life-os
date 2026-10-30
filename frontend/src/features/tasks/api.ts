/** Task data hooks. Pages never call fetch directly; they use these. */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { isQueued, sendOrQueue, type Queued } from '../../lib/offline'
import type { Category, Page, TagSummary, Task, TaskFilters, TaskStatus } from '../../lib/types'

export interface TaskInput {
  id?: string // only on create, when the caller needs the id before the server answers (e.g. offline)
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
    // The client creates the id, so a retried request can never create a duplicate. Works offline (queued).
    mutationFn: (input: TaskInput): Promise<Task | Queued> =>
      sendOrQueue<Task>({
        kind: 'task_create',
        method: 'POST',
        path: '/tasks',
        body: { id: crypto.randomUUID(), ...input },
        label: input.title ?? '',
      }),
    onSuccess: (result) => (isQueued(result) ? undefined : invalidate()),
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
    // Completing works offline (queued); the other actions need the server.
    mutationFn: ({ id, action, title }: { id: string; action: TaskAction; title?: string }): Promise<Task | Queued> =>
      action === 'complete'
        ? sendOrQueue<Task>({ kind: 'task_complete', method: 'POST', path: `/tasks/${id}/complete`, label: title ?? '' })
        : api<Task>(`/tasks/${id}/${action}`, { method: 'POST' }),
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
    // A queued completion keeps its optimistic tick until it syncs (refetching now would undo it on screen).
    // A completed task stays ticked in place for a moment (like Things) so its animation can play before it leaves the list.
    onSettled: async (result, _error, { action }) => {
      if (isQueued(result)) return
      if (action === 'complete') await new Promise((r) => setTimeout(r, 900))
      await Promise.all([qc.invalidateQueries({ queryKey: TASKS }), qc.invalidateQueries({ queryKey: ['goals'] })])
    },
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useTask(id: string | null) {
  return useQuery({ queryKey: [...TASKS, 'one', id], queryFn: () => api<Task>(`/tasks/${id}`), enabled: !!id })
}

/** Fresh start after time away: every overdue task loses its missed date and moves to Someday. Nothing is deleted. */
export function useMoveToSomeday() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ moved: number }>('/tasks/someday', { method: 'POST' }),
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: TASKS }), qc.invalidateQueries({ queryKey: ['goals'] }), qc.invalidateQueries({ queryKey: ['planning'] })]),
  })
}

/** Close the book: open tasks due today or earlier move to tomorrow (hard deadlines stay as they are). */
export function useMoveToTomorrow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ moved: number }>('/tasks/tomorrow', { method: 'POST' }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: TASKS }), qc.invalidateQueries({ queryKey: ['planning'] })]),
  })
}
