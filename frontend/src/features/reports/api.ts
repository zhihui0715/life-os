import { useMutation, useQuery } from '@tanstack/react-query'

import { api } from '../../lib/api'

export type ReportKind = 'day' | 'week' | 'month'

/** One report (app/modules/reports/service.py): a period, compared with the one before it. */
export interface Report {
  kind: ReportKind
  period: { start: string; end: string; complete: boolean; previous_start: string }
  score: number | null
  components: Record<string, number | null>
  tasks: {
    done: number
    done_before: number
    added: number
    overdue: number
    on_time_rate: number | null
    by_day: { date: string; count: number }[]
    list: { title: string; completed_at: string; goal: string | null }[]
  }
  focus: { minutes: number; minutes_before: number; sessions: number; by_day: { date: string; minutes: number }[] }
  habits: { rate: number | null; items: { name: string; done: number; skipped: number }[] }
  goals: { title: string; progress: number | null }[]
  journal: {
    entries: number
    mood: number | null
    energy: number | null
    by_day: { date: string; mood: number | null; energy: number | null }[]
    notes: { date: string; text: string }[]
  }
  time: { total_minutes: number; by_category: { name: string | null; color: string | null; minutes: number }[] }
  events: number
}

export function useReport(kind: ReportKind, date: string) {
  return useQuery({ queryKey: ['reports', kind, date], queryFn: () => api<Report>(`/reports/${kind}?date=${date}`) })
}

export function useEmailStatus() {
  return useQuery({ queryKey: ['reports', 'email'], queryFn: () => api<{ configured: boolean; to: string }>('/reports/email') })
}

export function useSendTestEmail() {
  return useMutation({ mutationFn: () => api<{ sent_to: string }>('/reports/email/test', { method: 'POST' }) })
}

export const pdfUrl = (kind: ReportKind, date: string) => `/api/v1/reports/${kind}.pdf?date=${date}`
