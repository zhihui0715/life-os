/**
 * Reminders, sent by the app itself while it's open (a browser tab, or the installed app running in the
 * background on a computer). They are a per-device choice, like sounds, so they're stored in this browser.
 *
 * Every minute the app looks at what's coming up — events, deadlines, habits still to do, the morning plan and the
 * end-of-week review — and shows a system notification once for each. Nothing is sent anywhere.
 */
import type { TFunction } from 'i18next'

import { api } from './api'
import { play } from './sound'
import type { Habit, Occurrence, Page, Task } from './types'

export interface ReminderPrefs {
  enabled: boolean
  eventLead: number // minutes before an event; 0 = off
  deadlines: boolean // 30 minutes before a task's deadline
  habitsAt: string // "20:00", or "" for off
  planAt: string // morning "Plan your day"
  reviewAt: string // on the last day of your week
}

export const DEFAULT_PREFS: ReminderPrefs = { enabled: false, eventLead: 10, deadlines: true, habitsAt: '20:00', planAt: '08:30', reviewAt: '18:00' }
const PREFS_KEY = 'lifeos.reminders'
const FIRED_KEY = 'lifeos.reminders.fired'
const DEADLINE_LEAD_MIN = 30
const TICK_MS = 60_000
const REFRESH_MS = 5 * 60_000
const LATE_WINDOW_MIN = 3 * 60 // a morning reminder opened at 3 pm is no longer useful

const listeners = new Set<(p: ReminderPrefs) => void>()

export function remindersSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function readPrefs(): ReminderPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writePrefs(p: ReminderPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(p))
}

export function onPrefsChange(l: (p: ReminderPrefs) => void) {
  listeners.add(l)
  return () => void listeners.delete(l)
}

function fired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** Remembers a reminder was shown (so it shows once). Returns false if it already was. */
function claim(key: string): boolean {
  const all = fired()
  if (all[key]) return false
  const cutoff = Date.now() - 3 * 86_400_000
  const kept = Object.fromEntries(Object.entries(all).filter(([, at]) => at > cutoff))
  kept[key] = Date.now()
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(kept))
  } catch {
    /* ignore */
  }
  return true
}

export async function notify(title: string, body: string, url: string, tag: string) {
  if (!remindersSupported() || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') play('success')
  const options: NotificationOptions = { body, tag, icon: '/pwa-192.png', badge: '/pwa-192.png', data: { url } }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, options) // the service worker opens `url` when it's tapped (notify-sw.js)
      return
    }
  } catch {
    /* fall back to a page notification */
  }
  try {
    const n = new Notification(title, options)
    n.onclick = () => {
      window.focus()
      window.location.assign(url)
    }
  } catch {
    /* some phones only allow notifications through a service worker */
  }
}

interface Clock {
  date: string // YYYY-MM-DD in your timezone
  minutes: number // minutes since local midnight
  isoWeekday: number // 1 Monday … 7 Sunday
}

function clockIn(timeZone: string, now = new Date()): Clock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  const isoWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), isoWeekday }
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Is it at or just after a daily time (and not hours later)? */
const due = (c: Clock, at: string) => !!at && c.minutes >= toMinutes(at) && c.minutes - toMinutes(at) <= LATE_WINDOW_MIN

interface Context {
  t: TFunction
  timeZone: string
  weekStart: number // 1 Monday … 7 Sunday
  locale: string
}

/** Starts the reminder loop. Returns a stop function. */
export function startReminders(getContext: () => Context): () => void {
  let occs: Occurrence[] = []
  let tasks: Task[] = []
  let loadedAt = 0

  const refresh = async (prefs: ReminderPrefs) => {
    const now = new Date()
    const end = new Date(now.getTime() + 3 * 3_600_000)
    const jobs: Promise<unknown>[] = []
    if (prefs.eventLead)
      jobs.push(
        api<{ items: Occurrence[] }>(`/calendar/occurrences?start=${encodeURIComponent(now.toISOString())}&end=${encodeURIComponent(end.toISOString())}`).then(
          (r) => (occs = r.items),
        ),
      )
    if (prefs.deadlines) jobs.push(api<Page<Task>>('/tasks?view=today&limit=100').then((r) => (tasks = r.items)))
    await Promise.allSettled(jobs)
    loadedAt = Date.now()
  }

  const tick = async () => {
    const prefs = readPrefs()
    if (!prefs.enabled || !remindersSupported() || Notification.permission !== 'granted') return
    const { t, timeZone, weekStart, locale } = getContext()
    if (Date.now() - loadedAt > REFRESH_MS) await refresh(prefs)
    const now = Date.now()
    const time = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

    for (const o of occs) {
      if (o.all_day || o.kind === 'preference' || !prefs.eventLead) continue
      const until = new Date(o.starts_at).getTime() - now
      if (until <= prefs.eventLead * 60_000 && until > -60_000 && claim(`ev:${o.id}:${o.starts_at}`))
        void notify(o.title, until > 60_000 ? t('common:reminder.eventSoon', { time: time(o.starts_at) }) : t('common:reminder.eventNow'), '/calendar', `ev:${o.id}`)
    }
    for (const task of tasks) {
      if (!task.deadline || task.status === 'done' || !prefs.deadlines) continue
      const until = new Date(task.deadline).getTime() - now
      if (until <= DEADLINE_LEAD_MIN * 60_000 && until > -60_000 && claim(`dl:${task.id}:${task.deadline}`))
        void notify(task.title, t('common:reminder.deadline', { time: time(task.deadline) }), '/tasks?view=today', `dl:${task.id}`)
    }

    const c = clockIn(timeZone)
    if (due(c, prefs.planAt) && claim(`pl:${c.date}`))
      void notify(t('common:reminder.planTitle'), t('common:reminder.planBody'), '/plan', 'plan')
    const lastDay = weekStart === 1 ? 7 : weekStart - 1
    if (c.isoWeekday === lastDay && due(c, prefs.reviewAt) && claim(`rv:${c.date}`))
      void notify(t('common:reminder.reviewTitle'), t('common:reminder.reviewBody'), '/plan?tab=week', 'review')
    if (due(c, prefs.habitsAt) && !fired()[`hb:${c.date}`]) {
      const habits = await api<{ items: Habit[] }>('/habits').then((r) => r.items).catch(() => null)
      if (habits && claim(`hb:${c.date}`)) {
        const left = habits.filter((h) => h.scheduled_today && !h.today)
        if (left.length)
          void notify(t('common:reminder.habitsTitle', { count: left.length }), left.map((h) => h.name).join(' · '), '/habits', 'habits')
      }
    }
  }

  void tick()
  const id = setInterval(() => void tick(), TICK_MS)
  const wake = () => document.visibilityState === 'visible' && void tick()
  document.addEventListener('visibilitychange', wake)
  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', wake)
  }
}
