import { useQuery } from '@tanstack/react-query'

import { api } from '../../lib/api'

export type AchievementGroup = 'tasks' | 'seals' | 'focus' | 'habits' | 'goals' | 'journal'

export interface Achievement {
  key: string
  group: AchievementGroup
  target: number
  progress: number
  unlocked: boolean
  /** The day it was reached, when that can be known (habit streaks have no date). */
  unlocked_on: string | null
}

export const ACHIEVEMENTS_KEY = ['achievements'] as const

export function useAchievements() {
  return useQuery({
    queryKey: ACHIEVEMENTS_KEY,
    queryFn: () => api<{ unlocked: number; total: number; items: Achievement[] }>('/achievements'),
  })
}
