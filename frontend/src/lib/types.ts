// Shapes returned by the API (keep in sync with backend/app/modules/*/routes.py and service.py).

import type { Locale } from './i18n'
import type { ThemeSetting } from './theme'

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type WorkingHours = Record<Weekday, [string, string][]>

export interface UserSettings {
  locale: Locale
  timezone: string
  week_start: number
  theme: ThemeSetting
  working_hours: WorkingHours
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
  goal_id: string | null
  milestone_id: string | null
  parent_task_id: string | null
  tags: string[]
  subtasks_done: number
  subtasks_total: number
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

export interface TaskFilters {
  view?: TaskView
  q?: string
  tag?: string
  goal_id?: string
  milestone_id?: string
  parent_id?: string
  needs_scheduling?: string
}

export interface TagSummary {
  name: string
  task_count: number
}

export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned'
export type ProgressMode = 'milestones' | 'tasks' | 'manual'

export interface Goal {
  id: string
  title: string
  description: string | null
  success_criteria: string | null
  category_id: string | null
  horizon: 'short' | 'long'
  status: GoalStatus
  progress_mode: ProgressMode
  manual_progress: number | null
  /** null = not enough data to calculate (never shown as 0%) */
  progress: number | null
  progress_detail: { tasks_done: number; tasks_total: number; milestones_done: number; milestones_total: number }
  start_date: string | null
  target_date: string | null
  completed_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface Milestone {
  id: string
  goal_id: string
  title: string
  position: number
  weight: number
  target_date: string | null
  completed_at: string | null
  tasks_done: number
  tasks_total: number
}

export interface GoalUpdate {
  id: string
  kind: 'auto' | 'manual' | 'note' | 'status'
  progress: number | null
  status: GoalStatus | null
  note: string | null
  created_at: string
}

export interface GoalDetail extends Goal {
  milestones: Milestone[]
  updates: GoalUpdate[]
}

export type EventKind = 'appointment' | 'task_block' | 'preference'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  kind: EventKind
  is_hard: boolean
  all_day: boolean
  starts_at: string
  ends_at: string
  start_date?: string
  end_date?: string
  tzid: string
  rrule: string | null
  task_id: string | null
  category_id: string | null
  exception_count: number
  archived_at: string | null
  updated_at: string
}

export interface Occurrence {
  id: string
  event_id: string
  title: string
  kind: EventKind
  is_hard: boolean
  all_day: boolean
  starts_at: string
  ends_at: string
  start_date?: string
  end_date?: string
  original_start: string
  recurring: boolean
  is_exception: boolean
  task_id: string | null
  category_id: string | null
}

export interface TaskMarker {
  task_id: string
  title: string
  kind: 'due' | 'deadline'
  date?: string
  at?: string
  priority: number
}

export interface OccurrenceBrief {
  event_id: string
  title: string
  kind: EventKind
  is_hard: boolean
  starts_at: string
  ends_at: string
  original_start: string
  recurring: boolean
}

export interface Overlap {
  a: OccurrenceBrief
  b: OccurrenceBrief
  overlap_minutes: number
  severity: 'hard' | 'soft'
  suggestion: { occurrence: OccurrenceBrief; starts_at: string; ends_at: string } | null
}

export interface WorkloadItem {
  task_id: string
  title: string
  due_by: string
  estimate_minutes: number
  scheduled_minutes: number
  remaining_minutes: number
  free_minutes: number
  status: 'at_risk' | 'needs_time'
}

export interface SlotSuggestion {
  starts_at: string
  ends_at: string
  minutes: number
  reason: 'preferred_time' | 'earliest_free'
  covers_remaining: boolean
}

export interface Suggestions {
  task_id: string
  estimate_minutes: number | null
  assumed_estimate: boolean
  scheduled_minutes: number
  remaining_minutes: number
  due_by: string | null
  slots: SlotSuggestion[]
}
