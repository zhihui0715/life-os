import { useQuery } from '@tanstack/react-query'

import { api } from '../../lib/api'

export type AiKind = 'daily_plan' | 'weekly_review'
export type AiCategory = 'tasks' | 'calendar' | 'goals' | 'habits' | 'activity' | 'mood' | 'journal_text'

export interface AiStatus {
  configured: boolean
  provider: string | null
  model: string | null
  enabled: boolean
  monthly_token_budget: number
  used_this_month: number
  kinds: Record<AiKind, { allowed: AiCategory[]; default: AiCategory[]; required: AiCategory[] }>
}

export interface AiPreview {
  kind: AiKind
  categories: AiCategory[]
  payload: string
  approx_tokens: number
}

export interface PlanBlock {
  title: string
  task_id: string | null
  starts_at: string
  ends_at: string
  reason: string
  issues: ('conflict' | 'past')[]
}

export interface DailyPlan {
  date: string
  summary: string
  blocks: PlanBlock[]
  notes: string[]
  skipped: number
}

export interface WeeklyReview {
  summary: string
  wins: string[]
  challenges: string[]
  suggestions: { text: string; task_title: string | null }[]
  reflection_question: string
}

export const AI_STATUS_KEY = ['ai', 'status']

export function useAiStatus() {
  return useQuery({ queryKey: AI_STATUS_KEY, queryFn: () => api<AiStatus>('/ai/status') })
}
