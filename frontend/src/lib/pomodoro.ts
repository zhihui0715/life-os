/**
 * The tomato clock (Pomodoro): 25 minutes of focus, a 5-minute break, and a longer break after every fourth
 * tomato. Each tomato is an ordinary focus session on the server (so it counts in Focus and Insights); the breaks
 * between them are kept here, on this device, since they record nothing.
 */
import { useSyncExternalStore } from 'react'

export interface PomodoroPrefs {
  focus: number // minutes
  short: number
  long: number
  every: number // long break after this many tomatoes
  autoStart: boolean // start the next tomato when a break ends
}

export interface PomodoroState {
  prefs: PomodoroPrefs
  /** The running focus session that is a tomato (so it ends itself at 0 and a break follows). */
  tomatoId: string | null
  /** A break in progress. */
  rest: { endsAt: number; kind: 'short' | 'long'; minutes: number } | null
  /** A break that just ended and is waiting for "Start next tomato". */
  ready: boolean
}

export const DEFAULT_POMODORO: PomodoroPrefs = { focus: 25, short: 5, long: 15, every: 4, autoStart: false }
const KEY = 'lifeos.pomodoro'
const listeners = new Set<() => void>()

function load(): PomodoroState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (s) return { tomatoId: null, rest: null, ready: false, ...s, prefs: { ...DEFAULT_POMODORO, ...s.prefs } }
  } catch {
    /* ignore */
  }
  return { prefs: DEFAULT_POMODORO, tomatoId: null, rest: null, ready: false }
}

let state = load()

export function pomodoro(): PomodoroState {
  return state
}

export function updatePomodoro(change: Partial<PomodoroState> | ((s: PomodoroState) => Partial<PomodoroState>)) {
  state = { ...state, ...(typeof change === 'function' ? change(state) : change) }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function usePomodoro(): PomodoroState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

/** Which break follows the n-th tomato of the day (counting the one just finished). */
export function breakAfter(done: number, prefs: PomodoroPrefs): { kind: 'short' | 'long'; minutes: number } {
  return done > 0 && done % prefs.every === 0 ? { kind: 'long', minutes: prefs.long } : { kind: 'short', minutes: prefs.short }
}
