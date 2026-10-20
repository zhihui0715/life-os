import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, ApiError } from '../../lib/api'
import type { JournalEntry, JournalSummary, JournalTextField } from '../../lib/types'

export type JournalInput = Partial<Record<JournalTextField, string | null>> & { mood?: number | null; energy?: number | null }

const JOURNAL = ['journal']

/** null = no entry for that day yet (not an error). */
export function useEntry(date: string) {
  return useQuery({
    queryKey: [...JOURNAL, 'entry', date],
    queryFn: async () => {
      try {
        return await api<JournalEntry>(`/journal/${date}`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      }
    },
  })
}

export function useEntries(q: string) {
  return useQuery({
    queryKey: [...JOURNAL, 'list', q],
    queryFn: () => api<{ items: JournalSummary[] }>(`/journal?limit=30${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    select: (d) => d.items,
  })
}

export function useSaveEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ date, ...body }: JournalInput & { date: string }) =>
      api<JournalEntry | undefined>(`/journal/${date}`, { method: 'PUT', body }),
    onSuccess: (entry, { date }) => {
      qc.setQueryData([...JOURNAL, 'entry', date], entry ?? null)
      qc.invalidateQueries({ queryKey: [...JOURNAL, 'list'] })
    },
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (date: string) => api<void>(`/journal/${date}`, { method: 'DELETE' }),
    onSuccess: (_, date) => {
      qc.setQueryData([...JOURNAL, 'entry', date], null)
      qc.invalidateQueries({ queryKey: [...JOURNAL, 'list'] })
    },
  })
}
