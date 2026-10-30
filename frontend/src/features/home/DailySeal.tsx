/**
 * The daily seal on Home: three small quests (a task, a habit or the journal, 15 minutes of focus). Finishing all
 * three stamps the day's seal; the last week of seals and the run of sealed days sit underneath.
 * The server works the seals out from what you log, so this card only shows them and celebrates the moment.
 */
import { useQueryClient } from '@tanstack/react-query'
import { Check, Flame } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../components/ui/cn'
import { Card } from '../../components/ui/states'
import { useToast } from '../../components/ui/Toast'
import { confetti } from '../../lib/confetti'
import { play } from '../../lib/sound'
import { SEALS_KEY, useSeals, type SealDay } from '../planning/api'
import './i18n'

/** Anything you do elsewhere (tick a task, check in a habit, stop a focus) can change today's seal. */
function useRefreshAfterChanges() {
  const qc = useQueryClient()
  useEffect(
    () =>
      qc.getMutationCache().subscribe((e) => {
        if (e.type === 'updated' && e.mutation.state.status === 'success') void qc.invalidateQueries({ queryKey: SEALS_KEY })
      }),
    [qc],
  )
}

/** `stamp`: play the pressing animation when it's sealed (the big seal; the small ones in a row stay still). */
export function WaxSeal({ sealed, size = 44, stamp = false }: { sealed: boolean; size?: number; stamp?: boolean }) {
  // A wavy rim: 14 bumps around the disc, like pressed wax.
  const bumps = 14
  const rim = Array.from({ length: bumps * 2 }, (_, i) => {
    const a = (i / (bumps * 2)) * Math.PI * 2
    const r = i % 2 ? 44 : 48
    return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`
  }).join(' ')
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className={sealed && stamp ? 'animate-pop' : undefined}>
      {sealed ? (
        <>
          <polygon points={rim} fill="var(--seal-wax)" />
          <circle cx="50" cy="50" r="31" fill="none" stroke="var(--seal-emboss)" strokeWidth="3" />
          <path d="M37 51 l9 9 l18 -20" fill="none" stroke="var(--seal-emboss)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <polygon points={rim} fill="none" stroke="var(--border-strong)" strokeWidth="3" strokeDasharray="6 6" />
      )}
    </svg>
  )
}

export function DailySealCard() {
  const { t, i18n } = useTranslation('fresh')
  const toast = useToast()
  useRefreshAfterChanges()
  const data = useSeals(30).data
  const today = data?.days.at(-1)

  // Celebrate the moment today's seal is stamped (not when the page opens on an already sealed day).
  const was = useRef<boolean | null>(null)
  useEffect(() => {
    if (!today) return
    if (was.current === false && today.sealed) {
      play('success')
      confetti({ emoji: ['🕯️', '📜', '✨'] })
      toast(t('seal.stamped'))
    }
    was.current = today.sealed
  }, [today, t, toast])

  if (!data || !today) return null
  const week = data.days.slice(-7)
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow', timeZone: 'UTC' })
  const quests = [
    { key: 'task', done: today.done.task, label: t('seal.task') },
    { key: 'habit', done: today.done.habit, label: t(data.habit_quest === 'habit' ? 'seal.habit' : 'seal.journal') },
    {
      key: 'focus',
      done: today.done.focus,
      label: t('seal.focus', { count: data.focus_minutes_target }),
      progress: today.done.focus ? null : `${today.focus_minutes}/${data.focus_minutes_target}`,
    },
  ]
  const count = quests.filter((q) => q.done).length

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 flex items-center gap-3">
        <WaxSeal key={String(today.sealed)} sealed={today.sealed} stamp />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold">{t(today.sealed ? 'seal.titleDone' : 'seal.title')}</h2>
          <p className="text-subtle text-sm">{today.sealed ? t('seal.doneBody') : t('seal.progress', { count, total: 3 })}</p>
        </div>
        {data.streak > 1 && (
          <span className="text-warning inline-flex shrink-0 items-center gap-1 text-xs font-semibold">
            <Flame size={13} aria-hidden />
            {t('seal.streak', { count: data.streak })}
          </span>
        )}
      </div>

      <ul className="mb-3 flex flex-col gap-1.5" aria-label={t('seal.quests')}>
        {quests.map((q) => (
          <li key={q.key} className="flex items-center gap-2.5 text-[15px]">
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                q.done ? 'bg-success-fill text-white' : 'border-border-strong border',
              )}
            >
              {q.done && <Check size={13} strokeWidth={3} aria-hidden />}
            </span>
            <span className={cn('min-w-0 flex-1', q.done && 'text-subtle line-through')}>{q.label}</span>
            {q.progress && <span className="text-subtle text-xs tabular-nums">{q.progress}</span>}
            <span className="sr-only">{q.done ? t('seal.questDone') : t('seal.questOpen')}</span>
          </li>
        ))}
      </ul>

      <ol className="flex justify-between gap-1" aria-label={t('seal.week')}>
        {week.map((d: SealDay) => (
          <li key={d.date} className="flex flex-col items-center gap-0.5" title={d.date}>
            <WaxSeal sealed={d.sealed} size={22} />
            <span className="text-subtle text-[11px]">{weekday.format(new Date(`${d.date}T00:00:00Z`))}</span>
            <span className="sr-only">{d.sealed ? t('seal.daySealed') : t('seal.dayOpen')}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
