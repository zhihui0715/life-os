import { Coffee, Pause, Timer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'

import { cn } from '../../components/ui/cn'
import { usePomodoro } from '../../lib/pomodoro'
import { play } from '../../lib/sound'
import { useCurrentFocus } from './api'
import { clock, useFocusClock } from './FocusTimer'

/**
 * Small floating timer shown on every page while a focus session is running (hidden on the Focus page itself),
 * styled like an iOS Live Activity. It is always mounted, so it also rings the bell when the time is up.
 */
export function FocusWidget() {
  const { t } = useTranslation('focus')
  const location = useLocation()
  const current = useCurrentFocus()
  const session = current.data
  const { remaining, focused } = useFocusClock(session, current.dataUpdatedAt)
  const rungFor = useRef<string | null>(null)
  const running = session?.state === 'running'
  useEffect(() => {
    if (!session || !running || remaining > 0 || rungFor.current === session.id) return
    rungFor.current = session.id
    // Only ring if the session was still counting down a moment ago (not when reopening the app hours later)
    if (remaining > -5) play('chime')
  }, [session, running, remaining])
  if (location.pathname.startsWith('/focus')) return null
  if (!session) return <BreakPill />
  const over = remaining <= 0
  return (
    <Link
      to="/focus"
      aria-label={t('widget', { time: clock(Math.max(remaining, 0)) })}
      className={cn(
        'pressable toast-enter shadow-float fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-20 flex items-center gap-2 rounded-full bg-fg text-bg py-2 pr-4 pl-2 text-[15px] font-semibold tabular-nums md:right-6 md:bottom-6',
      )}
    >
      <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', over ? 'bg-success-fill' : 'bg-warning-fill')}>
        {session.state === 'paused' ? <Pause size={14} aria-hidden /> : <Timer size={14} className={running ? 'animate-pulse' : undefined} aria-hidden />}
      </span>
      {clock(over ? focused : remaining)}
    </Link>
  )
}

/** During a tomato break, the pill counts the break down instead. */
function BreakPill() {
  const { t } = useTranslation('focus')
  const { rest } = usePomodoro()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!rest) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [rest])
  if (!rest) return null
  return (
    <Link
      to="/focus"
      aria-label={t(rest.kind === 'long' ? 'tomato.longBreak' : 'tomato.shortBreak')}
      className="pressable toast-enter shadow-float bg-fg text-bg fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-20 flex items-center gap-2 rounded-full py-2 pr-4 pl-2 text-[15px] font-semibold tabular-nums md:right-6 md:bottom-6"
    >
      <span className="bg-success-fill flex h-7 w-7 items-center justify-center rounded-full text-white">
        <Coffee size={14} aria-hidden />
      </span>
      {clock(Math.max(0, (rest.endsAt - now) / 1000))}
    </Link>
  )
}
