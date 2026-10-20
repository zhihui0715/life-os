// Shapes returned by the API (keep in sync with backend/app/modules/*/routes.py and service.py).

import type { Locale } from './i18n'
import type { ThemeSetting } from './theme'

export interface UserSettings {
  locale: Locale
  timezone: string
  week_start: number
  theme: ThemeSetting
}

export interface Me {
  user: { id: string; email: string; display_name: string }
  settings: UserSettings
  csrf_token: string
}

export interface Category {
  id: string
  name: string
  kind: 'general' | 'learning'
  color: string
  archived_at: string | null
}

export type TaskStatus = 'inbox' | 'todo' | 'in_progress' | 'done'
export type TaskView = 'all' | 'inbox' | 'today' | 'upcoming' | 'overdue' | 'unscheduled' | 'completed' | 'archived'

export interface Task {
  id: string
  title: string
  notes: string | null
  status: TaskStatus
  priority: 1 | 2 | 3 | 4
  due_date: string | null
  deadline: string | null
  estimate_minutes: number | null
  actual_minutes_manual: number | null
  category_id: string | null
  position: number
  is_overdue: boolean
  completed_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface Page<T> {
  items: T[]
  next_cursor: string | null
  total: number
}
