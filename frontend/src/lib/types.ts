// Shapes returned by the API (keep in sync with backend/app/modules/*/routes.py and service.py).

import type { Locale } from './i18n'
import type { ThemeSetting } from './theme'

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type WorkingHours = Record<Weekday, [string, string][]>

export type ScoreComponentKey = 'tasks' | 'goals_learning' | 'habits' | 'wellbeing'
export type ScoreWeights = Record<ScoreComponentKey, number> & { enabled: Record<ScoreComponentKey, boolean> }
export type DashboardSectionKey = 'focus' | 'schedule' | 'tasks' | 'habits' | 'mood' | 'balance' | 'goals' | 'learning'

export interface UserSettings {
  locale: Locale
  timezone: string
  week_start: number
  theme: ThemeSetting
  working_hours: WorkingHours
  score_weights: ScoreWeights
  weekly_learning_target_min: number | null
  dashboard_layout: { key: DashboardSectionKey; visible: boolean }[]
  ai_enabled: boolean
  ai_monthly_token_budget: number
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
  tracked_minutes: number
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

export type HabitScheduleType = 'daily' | 'weekdays' | 'x_per_week'
export type HabitDayState = 'done' | 'skipped'

export interface HabitStats {
  unit: 'days' | 'weeks'
  current_streak: number
  best_streak: number
  /** 0–1, null = not enough data yet */
  consistency: number | null
  eligible: number
  done_this_week: number
  target_this_week: number | null
}

export interface Habit {
  id: string
  name: string
  description: string | null
  category_id: string | null
  goal_id: string | null
  target_value: number | null
  target_unit: string | null
  start_date: string
  schedule_type: HabitScheduleType
  weekday_mask: number
  times_per_week: number
  scheduled_today: boolean
  today: { state: HabitDayState; value: number | null; note: string | null } | null
  stats: HabitStats
  last7: { date: string; scheduled: boolean; state: HabitDayState | null }[]
  archived_at: string | null
  updated_at: string
}

export interface HabitDetail extends Habit {
  history: { date: string; status: 'done' | 'skipped' | 'missed' | 'open' | 'rest'; scheduled: boolean; value: number | null; note: string | null }[]
  schedule_changes: { effective_from: string; schedule_type: HabitScheduleType; weekday_mask: number; times_per_week: number }[]
}

export const JOURNAL_TEXT_FIELDS = ['body', 'went_well', 'to_improve', 'challenges', 'lessons', 'gratitude', 'tomorrow_priorities'] as const
export type JournalTextField = (typeof JOURNAL_TEXT_FIELDS)[number]

export type JournalEntry = Record<JournalTextField, string | null> & {
  id: string
  entry_date: string
  mood: number | null
  energy: number | null
  updated_at: string
}

export interface JournalSummary {
  entry_date: string
  preview: string
  filled: JournalTextField[]
  mood: number | null
  energy: number | null
}

export interface ActivityLog {
  id: string
  title: string
  category_id: string | null
  log_date: string
  started_at: string | null
  ended_at: string | null
  duration_minutes: number
  notes: string | null
  outcome: string | null
  goal_id: string | null
  task_id: string | null
  focus_session_id: string | null
}

export interface ActivitySummary {
  start: string
  end: string
  total_minutes: number
  learning_minutes: number
  by_category: { category_id: string | null; name: string | null; kind: string | null; color: string | null; minutes: number }[]
  by_day: { date: string; minutes: number }[]
}

export interface FocusSession {
  id: string
  task_id: string | null
  task_title: string | null
  label: string | null
  planned_minutes: number
  break_minutes: number
  state: 'running' | 'paused' | 'completed' | 'interrupted'
  started_at: string
  paused_at: string | null
  ended_at: string | null
  paused_seconds: number
  focused_seconds: number
  actual_minutes: number | null
  server_time: string
}

export interface ScoreComponent {
  key: ScoreComponentKey
  weight: number
  enabled: boolean
  score: number | null
  has_data: boolean
  effective_weight: number
}

export interface Overview {
  period: { start: string; end: string; elapsed_days: number }
  score: { value: number | null; coverage: number; components: ScoreComponent[] }
  components: {
    tasks: { score: number | null; due: number; on_time: number; late: number; missed: number; completed: number; created: number; rate: number | null }
    habits: { score: number | null; habits: number; done: number; eligible: number; rate: number | null; daily: { date: string; rate: number | null }[] }
    goals_learning: {
      score: number | null
      learning_minutes: number
      learning_target_minutes: number | null
      learning_rate: number | null
      goals_on_track: number | null
      goals: { goal_id: string; title: string; progress: number; expected: number; on_track: number }[]
      daily_learning: { date: string; minutes: number }[]
    }
    wellbeing: {
      score: number | null
      check_in_days: number
      min_days: number
      average_mood: number | null
      average_energy: number | null
      daily: { date: string; mood: number | null; energy: number | null }[]
    }
  }
  focus: { completed: number; interrupted: number; minutes: number }
  estimates: { tasks: number; estimated_minutes: number; actual_minutes: number; ratio: number | null }
  time: { total_minutes: number; by_category: { category_id: string | null; name: string | null; color: string | null; kind: string | null; minutes: number }[] }
  previous: { period: { start: string; end: string }; score: number | null; components: Record<ScoreComponentKey, number | null>; learning_minutes: number }
}

export interface TrendWeek {
  start: string
  end: string
  score: number | null
  coverage: number
  tasks: number | null
  habits: number | null
  goals_learning: number | null
  wellbeing: number | null
  learning_minutes: number
  average_mood: number | null
}
