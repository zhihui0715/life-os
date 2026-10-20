import { Pause, Timer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'

import { cn } from '../../components/ui/cn'
import { useCurrentFocus } from './api'
import { clock, useFocusClock } from './FocusTimer'

/** Small floating timer shown on every page while a focus session is running (hidden on the Focus page itself). */
export function FocusWidget() {
  const { t } = useTranslation('focus')
  const location = useLocation()
  const current = useCurrentFocus()
  const session = current.data
  const { remaining, focused } = useFocusClock(session, current.dataUpdatedAt)
  if (!session || location.pathname.startsWith('/focus')) return null
  const over = remaining <= 0
  return (
    <Link
      to="/focus"
      aria-label={t('widget', { time: clock(Math.max(remaining, 0)) })}
      className={cn(
        'shadow-pop bg-surface border-border fixed right-4 bottom-36 z-20 flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold tabular-nums md:right-6 md:bottom-6',
        over ? 'text-success' : 'text-accent',
      )}
    >
      {session.state === 'paused' ? <Pause size={15} aria-hidden /> : <Timer size={15} aria-hidden />}
      {clock(over ? focused : remaining)}
    </Link>
  )
}
