import { BookOpen, CalendarPlus, CheckSquare, Flame, Plus, Timer, type LucideIcon } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { cn } from '../components/ui/cn'
import { todayInZone } from '../lib/dates'
import { play } from '../lib/sound'
import { useMe } from '../features/auth/AuthProvider'
import { NewTaskSheet } from '../features/tasks/NewTaskSheet'
import { lazyWithReload } from '../lib/lazyPage'

// The event and habit forms load only when you ask for them
const EventDialog = lazyWithReload(() => import('../features/calendar/EventDialog').then((m) => ({ default: m.EventDialog })))
const HabitFormDialog = lazyWithReload(() => import('../features/habits/HabitFormDialog').then((m) => ({ default: m.HabitFormDialog })))

const LONG_PRESS_MS = 450
export type Sheet = 'task' | 'event' | 'habit' | null

/**
 * The round + on phones. Tap: a fan of things to create springs up from it (task, event, habit, journal, tomato).
 * Press and hold: straight to a new task. On larger screens the sidebar's Quick add opens the task sheet.
 */
export function CreateMenu({ sheet, setSheet }: { sheet: Sheet; setSheet: (s: Sheet) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; long: boolean }>({ timer: null, long: false })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const choose = (fn: () => void) => {
    play('tap')
    setOpen(false)
    fn()
  }
  const items: { key: string; icon: LucideIcon; tint: string; run: () => void }[] = [
    { key: 'task', icon: CheckSquare, tint: 'var(--tint-tasks)', run: () => setSheet('task') },
    { key: 'event', icon: CalendarPlus, tint: 'var(--tint-calendar)', run: () => setSheet('event') },
    { key: 'habit', icon: Flame, tint: 'var(--tint-habits)', run: () => setSheet('habit') },
    { key: 'journal', icon: BookOpen, tint: 'var(--tint-journal)', run: () => navigate('/journal') },
    { key: 'tomato', icon: Timer, tint: 'var(--tint-focus)', run: () => navigate('/focus') },
  ]

  const down = () => {
    press.current.long = false
    press.current.timer = setTimeout(() => {
      press.current.long = true
      play('open')
      if ('vibrate' in navigator) navigator.vibrate(12)
      setOpen(false)
      setSheet('task')
    }, LONG_PRESS_MS)
  }
  const up = () => {
    if (press.current.timer) clearTimeout(press.current.timer)
    press.current.timer = null
  }

  return (
    <>
      {/* Scrim: tap anywhere to close */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-20 bg-black/25 backdrop-blur-[2px] transition-opacity duration-[var(--duration-base)] md:hidden',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <div
        id="create-menu"
        role="menu"
        aria-label={t('create.title')}
        className={cn(
          'fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-30 flex flex-col items-end gap-2.5 md:hidden',
          open ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        {items.map((it, i) => {
          const Icon = it.icon
          const delay = (items.length - 1 - i) * 35 // the closest to the button comes first
          return (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              tabIndex={open ? 0 : -1}
              onClick={() => choose(it.run)}
              className={cn(
                'pressable bg-surface shadow-float flex h-12 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-[15px] font-semibold',
                'transition-[transform,opacity] ease-[var(--ease-spring)]',
                open ? 'translate-y-0 scale-100 opacity-100 duration-[420ms]' : 'translate-y-6 scale-75 opacity-0 duration-150',
              )}
              style={{ transitionDelay: open ? `${delay}ms` : '0ms', transformOrigin: 'right center' }}
            >
              {t(`create.${it.key}`)}
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: it.tint }}>
                <Icon size={18} strokeWidth={2.3} aria-hidden />
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        aria-label={t('actions.quickAdd')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="create-menu"
        title={t('create.hint')}
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (press.current.long) return // the long press already opened the sheet
          play(open ? 'close' : 'open')
          setOpen(!open)
        }}
        className={cn(
          'pressable bg-accent-fill text-on-accent pointer-events-auto relative z-30 flex h-[62px] w-[62px] shrink-0 touch-none items-center justify-center rounded-full select-none',
          'shadow-[0_10px_24px_-6px_color-mix(in_srgb,var(--accent)_70%,transparent)]',
        )}
      >
        <Plus
          size={28}
          strokeWidth={2.4}
          aria-hidden
          className={cn('transition-transform duration-[380ms] ease-[var(--ease-spring)]', (open || sheet) && 'rotate-[135deg]')}
        />
      </button>

    </>
  )
}

/** The forms the menu opens. Rendered outside the bottom bar, whose pointer-events are off. */
export function CreateSheets({ sheet, setSheet }: { sheet: Sheet; setSheet: (s: Sheet) => void }) {
  const tz = useMe().settings.timezone
  return (
    <>
      <NewTaskSheet open={sheet === 'task'} onClose={() => setSheet(null)} />
      <Suspense fallback={null}>
        {sheet === 'event' && <EventDialog mode={{ type: 'create', date: todayInZone(tz) }} onClose={() => setSheet(null)} />}
        {sheet === 'habit' && <HabitFormDialog open onClose={() => setSheet(null)} />}
      </Suspense>
    </>
  )
}
