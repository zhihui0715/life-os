import { useQuery } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Overview, TrendWeek } from '../../lib/types'

export type PeriodKind = 'week' | 'month'

export function useOverview(period: PeriodKind, offset: number) {
  return useQuery({
    queryKey: ['insights', 'overview', period, offset],
    queryFn: () => api<Overview>(`/insights/overview?period=${period}&offset=${offset}`),
    placeholderData: (prev) => prev,
  })
}

export function useTrend(weeks = 8) {
  return useQuery({
    queryKey: ['insights', 'trend', weeks],
    queryFn: () => api<{ weeks: TrendWeek[] }>(`/insights/trend?weeks=${weeks}`),
    select: (d) => d.weeks,
  })
}
