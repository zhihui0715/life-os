import { useMutation, useQuery } from '@tanstack/react-query'

import { api } from '../../lib/api'

export interface AiStatus {
  running: boolean
  installed: boolean
  model: string
  models: string[]
}

export const AI_STATUS_KEY = ['ai', 'status'] as const

/** Is the free local AI (Ollama) running with its model? The AI buttons only show when it is. */
export function useAiStatus() {
  return useQuery({
    queryKey: AI_STATUS_KEY,
    queryFn: () => api<AiStatus>('/ai/status'),
    staleTime: 60_000,
    retry: false,
  })
}

export const useAiReady = () => {
  const s = useAiStatus().data
  return !!s?.running && !!s.installed
}

export function useBreakdown() {
  return useMutation({ mutationFn: (taskId: string) => api<{ steps: string[]; model: string }>('/ai/breakdown', { method: 'POST', body: { task_id: taskId } }) })
}

export function useReviewDraft() {
  return useMutation({
    mutationFn: (week: 'this' | 'last') =>
      api<{ went_well: string; to_improve: string; lesson: string; model: string }>('/ai/review-draft', { method: 'POST', body: { week } }),
  })
}
