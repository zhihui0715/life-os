import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '../../components/ui/Toast'
import { confetti } from '../../lib/confetti'
import { todayInZone } from '../../lib/dates'
import { breakAfter, pomodoro, updatePomodoro, usePomodoro } from '../../lib/pomodoro'
import { notify } from '../../lib/reminders'
import { play } from '../../lib/sound'
import { useMe } from '../auth/AuthProvider'
import { useCurrentFocus, useFocusAction, useFocusSessions } from './api'
import { useFocusClock } from './FocusTimer'

/**
 * Runs the tomato clock from anywhere in the app (mounted in the shell): ends a tomato at 0:00, starts its break,
 * rings and notifies when the break is over, and (if chosen) starts the next tomato.
 */
export function usePomodoroEngine() {
  const { t } = useTranslation('focus')
  const toast = useToast()
  const tz = useMe().settings.timezone
  const today = todayInZone(tz)
  const current = useCurrentFocus()
  const session = current.data
  const { remaining } = useFocusClock(session, current.dataUpdatedAt)
  const sessions = useFocusSessions(today, today)
  const action = useFocusAction()
  const st = usePomodoro()
  const ending = useRef<string | null>(null)
  const doneToday = sessions.data?.completed_count ?? 0

  // A tomato stopped some other way (Stop button, another device) is no longer the tomato.
  useEffect(() => {
    if (st.tomatoId && current.isSuccess && session?.id !== st.tomatoId) updatePomodoro({ tomatoId: null })
  }, [st.tomatoId, session?.id, current.isSuccess])

  // 0:00 → finish the tomato and start the break
  useEffect(() => {
    if (!session || session.id !== st.tomatoId || session.state !== 'running' || remaining > 0 || ending.current === session.id) return
    ending.current = session.id
    action.mutate(
      { kind: 'stop', id: session.id, mark_complete: true },
      {
        onSuccess: () => {
          const done = doneToday + 1
          const rest = breakAfter(done, pomodoro().prefs)
          updatePomodoro({ tomatoId: null, ready: false, rest: { ...rest, endsAt: Date.now() + rest.minutes * 60_000 } })
          toast(t(rest.kind === 'long' ? 'tomato.longBreakStart' : 'tomato.breakStart', { count: rest.minutes }))
          if (rest.kind === 'long') confetti({ emoji: ['🍅', '🎉', '✨'] })
          void notify(t('tomato.doneTitle'), t('tomato.breakStart', { count: rest.minutes }), '/focus', 'tomato')
        },
        onError: () => (ending.current = null),
      },
    )
  }, [session, st.tomatoId, remaining, doneToday, action, toast, t])

  // Break over → bell, and maybe the next tomato
  const startNext = useRef<() => void>(() => {})
  startNext.current = () => {
    const prefs = pomodoro().prefs
    action.mutate(
      { kind: 'start', planned_minutes: prefs.focus, break_minutes: breakAfter(doneToday + 1, prefs).minutes, label: t('tomato.label') },
      { onSuccess: (s) => updatePomodoro({ tomatoId: s.id, ready: false }) },
    )
  }
  useEffect(() => {
    if (!st.rest) return
    const wait = st.rest.endsAt - Date.now()
    const id = setTimeout(() => {
      play('chime')
      void notify(t('tomato.breakOverTitle'), t('tomato.breakOverBody'), '/focus', 'tomato')
      updatePomodoro({ rest: null, ready: true })
      if (pomodoro().prefs.autoStart && !session) startNext.current()
    }, Math.max(0, wait))
    return () => clearTimeout(id)
  }, [st.rest, session, t])
}

/** Start a tomato now (used by the Focus page). */
export function useStartTomato() {
  const { t } = useTranslation('focus')
  const action = useFocusAction()
  const tz = useMe().settings.timezone
  const today = todayInZone(tz)
  const done = useFocusSessions(today, today).data?.completed_count ?? 0
  return {
    pending: action.isPending,
    start: (taskId: string | null, onError: (e: unknown) => void) => {
      const prefs = pomodoro().prefs
      play('success')
      action.mutate(
        { kind: 'start', planned_minutes: prefs.focus, break_minutes: breakAfter(done + 1, prefs).minutes, task_id: taskId, label: taskId ? null : t('tomato.label') },
        { onSuccess: (s) => updatePomodoro({ tomatoId: s.id, ready: false, rest: null }), onError },
      )
    },
  }
}
