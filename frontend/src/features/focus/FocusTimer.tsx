import { Coffee, Pause, Play, SkipForward, Square, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Field, Input, Select } from '../../components/ui/Field'
import { ChoiceChip, Segmented } from '../../components/ui/Segments'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { formatMinutes, todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { updatePomodoro, usePomodoro, type PomodoroPrefs } from '../../lib/pomodoro'
import type { FocusSession } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useTaskList } from '../tasks/api'
import { focusedNow, useCurrentFocus, useFocusAction, useFocusSessions } from './api'
import { Tomato } from './Tomato'
import { TWO_MINUTES } from './TwoMinutes'
import { useStartTomato } from './usePomodoroEngine'

const LENGTHS = [15, 25, 45, 60, 90]
const BREAKS = [0, 5, 10, 15]
const TOMATO_FOCUS = [15, 25, 45, 50]
const TOMATO_SHORT = [3, 5, 10]
const TOMATO_LONG = [15, 20, 30]
const MODE_KEY = 'lifeos.focusMode'

export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}

/** Ticks once a second while a session is running. */
export function useFocusClock(session: FocusSession | null | undefined, dataUpdatedAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (session?.state !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [session?.state])
  if (!session) return { focused: 0, remaining: 0 }
  const focused = focusedNow(session, now, dataUpdatedAt)
  return { focused, remaining: session.planned_minutes * 60 - focused }
}

export function FocusTimer() {
  const { t, i18n } = useTranslation('focus')
  const toast = useToast()
  const current = useCurrentFocus()
  const session = current.data
  const action = useFocusAction()
  const { focused, remaining } = useFocusClock(session, current.dataUpdatedAt)
  const tasks = useTaskList({ view: 'all' }, 200).data?.pages.flatMap((p) => p.items).filter((x) => x.status !== 'done') ?? []
  const [planned, setPlanned] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [taskId, setTaskId] = useState('')
  const [label, setLabel] = useState('')
  const [stopping, setStopping] = useState(false)
  const [markComplete, setMarkComplete] = useState(false)

  const pomo = usePomodoro()
  const tomato = useStartTomato()
  const [mode, setModeState] = useState<'tomato' | 'custom'>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'custom' ? 'custom' : 'tomato'
    } catch {
      return 'tomato'
    }
  })
  const setMode = (m: 'tomato' | 'custom') => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* ignore */
    }
  }

  const fail = (e: unknown) => toast(errorMessage(t, e), 'error')
  const over = session && remaining <= 0

  if (!session && (pomo.rest || pomo.ready)) return <BreakCard onNext={() => tomato.start(taskId || null, fail)} pending={tomato.pending} />

  if (!session) {
    return (
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><Timer size={19} className="text-[var(--tint-focus)]" aria-hidden />{t('title')}</h2>
          <div className="w-56">
            <Segmented items={['tomato', 'custom'] as const} value={mode} onChange={setMode} label={t('tomato.mode')} render={(m) => t(`tomato.modes.${m}`)} />
          </div>
        </div>
        {mode === 'tomato' && <TomatoSetup />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('timer.focusOn')}>
            {(a) => (
              <Select {...a} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">{t('timer.noTask')}</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </Select>
            )}
          </Field>
          {!taskId && (
            <Field label={t('timer.label')}>
              {(a) => <Input {...a} maxLength={200} placeholder={t('timer.labelPlaceholder')} value={label} onChange={(e) => setLabel(e.target.value)} />}
            </Field>
          )}
        </div>
        {mode === 'tomato' ? (
          <>
            <Button variant="primary" className="mt-5 w-full justify-center sm:w-auto" disabled={tomato.pending || current.isPending} onClick={() => tomato.start(taskId || null, fail)}>
              <span aria-hidden>🍅</span>
              {t('tomato.start', { count: pomo.prefs.focus })}
            </Button>
            <p className="text-subtle mt-3 text-xs">{t('tomato.rule', { focus: pomo.prefs.focus, short: pomo.prefs.short, long: pomo.prefs.long, every: pomo.prefs.every })}</p>
          </>
        ) : (
        <>
        <fieldset className="mt-4">
          <legend className="text-muted mb-2 px-1 text-[13px] font-medium">{t('timer.length')}</legend>
          <div className="flex flex-wrap gap-2">
            {LENGTHS.map((m) => (
              <ChoiceChip key={m} selected={planned === m} onClick={() => setPlanned(m)}>
                {t('timer.minutes', { count: m })}
              </ChoiceChip>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-3">
          <legend className="text-muted mb-2 px-1 text-[13px] font-medium">{t('timer.break')}</legend>
          <div className="flex flex-wrap gap-2">
            {BREAKS.map((m) => (
              <ChoiceChip key={m} selected={breakMin === m} onClick={() => setBreakMin(m)}>
                {t('timer.minutes', { count: m })}
              </ChoiceChip>
            ))}
          </div>
        </fieldset>
        <Button variant="primary" className="mt-5 w-full justify-center sm:w-auto" disabled={action.isPending || current.isPending}
          onClick={() => action.mutate({ kind: 'start', planned_minutes: planned, break_minutes: breakMin, task_id: taskId || null, label: taskId ? null : label || null },
            { onSuccess: () => toast(t('toast.started')), onError: fail })}>
          <Play size={16} aria-hidden />
          {t('timer.start')}
        </Button>
        <p className="text-subtle mt-3 text-xs">{t('timer.rule')}</p>
        </>
        )}
      </Card>
    )
  }

  const progress = Math.min(1, focused / (session.planned_minutes * 60))
  const R = 88
  const C = 2 * Math.PI * R
  return (
    <Card className="flex flex-col items-center p-5">
      <p className="text-muted text-sm font-medium">{session.task_title ?? session.label ?? t('timer.noTask')}</p>
      {pomo.tomatoId === session.id ? (
        <div className="my-3 flex flex-col items-center">
          <Tomato progress={progress} mood={over ? 'done' : session.state === 'paused' ? 'paused' : 'running'} size={220} />
          <div className="-mt-2 flex flex-col items-center" role="timer" aria-live="off">
            <span className="font-display text-[52px] leading-none font-light tracking-tight tabular-nums">{clock(over ? focused : remaining)}</span>
            <span className="text-subtle mt-1 text-xs">{t('timer.remaining')}</span>
          </div>
          <TomatoRow />
        </div>
      ) : (
      <div className="relative my-5 h-60 w-60">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-sunken)" strokeWidth="12" />
          <circle cx="100" cy="100" r={R} fill="none" stroke={over ? 'var(--success)' : 'var(--accent)'} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - progress)} className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" role="timer" aria-live="off">
          <span className="font-display text-[52px] leading-none font-light tracking-tight tabular-nums">{clock(over ? focused : remaining)}</span>
          <span className="text-subtle text-xs">{over ? t('timer.planned', { count: session.planned_minutes }) : t('timer.remaining')}</span>
        </div>
      </div>
      )}
      <p className={cn('mb-4 text-sm', over ? 'text-success font-medium' : 'text-subtle')}>
        {over ? t(session.planned_minutes === TWO_MINUTES ? 'twoMinutes.over' : 'timer.overtime') : session.state === 'paused' ? t('timer.paused') : t('timer.running')}
      </p>
      <div className="flex gap-2">
        {session.state === 'running' ? (
          <Button onClick={() => action.mutate({ kind: 'pause', id: session.id }, { onError: fail })} disabled={action.isPending}>
            <Pause size={16} aria-hidden />{t('timer.pause')}
          </Button>
        ) : (
          <Button onClick={() => action.mutate({ kind: 'resume', id: session.id }, { onError: fail })} disabled={action.isPending}>
            <Play size={16} aria-hidden />{t('timer.resume')}
          </Button>
        )}
        <Button variant="primary" onClick={() => { setMarkComplete(false); setStopping(true) }} disabled={action.isPending}>
          <Square size={14} aria-hidden />{t('timer.stop')}
        </Button>
      </div>

      <ConfirmDialog
        open={stopping}
        title={t('timer.stopTitle')}
        body={t('timer.stopBody', { time: formatMinutes(Math.floor(focused / 60), i18n.language) })}
        confirmLabel={t('timer.stop')}
        busy={action.isPending}
        onCancel={() => setStopping(false)}
        onConfirm={() =>
          action.mutate({ kind: 'stop', id: session.id, mark_complete: markComplete }, {
            onSuccess: (s) => {
              setStopping(false)
              toast(t('toast.stopped'))
              if (s.state === 'completed' && s.break_minutes > 0) toast(t('timer.breakTime', { count: s.break_minutes }))
            },
            onError: fail,
          })
        }
      >
        {focused < 0.8 * session.planned_minutes * 60 && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={markComplete} onChange={(e) => setMarkComplete(e.target.checked)} />
            {t('timer.markComplete')}
          </label>
        )}
      </ConfirmDialog>
    </Card>
  )
}

/** Tomato lengths: focus, short break, long break. Saved on this device. */
function TomatoSetup() {
  const { t } = useTranslation('focus')
  const { prefs } = usePomodoro()
  const set = (p: Partial<PomodoroPrefs>) => updatePomodoro((s) => ({ prefs: { ...s.prefs, ...p } }))
  const row = (label: string, values: number[], value: number, key: keyof PomodoroPrefs) => (
    <fieldset>
      <legend className="text-muted mb-2 px-1 text-[13px] font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((m) => (
          <ChoiceChip key={m} selected={value === m} onClick={() => set({ [key]: m })}>
            {t('timer.minutes', { count: m })}
          </ChoiceChip>
        ))}
      </div>
    </fieldset>
  )
  return (
    <div className="mb-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
      <div className="flex flex-col items-center">
        <Tomato progress={0} mood="idle" size={150} />
        <TomatoRow />
      </div>
      <div className="flex w-full flex-col gap-3">
        {row(t('tomato.focus'), TOMATO_FOCUS, prefs.focus, 'focus')}
        {row(t('tomato.short'), TOMATO_SHORT, prefs.short, 'short')}
        {row(t('tomato.long', { count: prefs.every }), TOMATO_LONG, prefs.long, 'long')}
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" className="accent-[var(--accent)]" checked={prefs.autoStart} onChange={(e) => set({ autoStart: e.target.checked })} />
          {t('tomato.autoStart')}
        </label>
      </div>
    </div>
  )
}

/** Today's tomatoes: ripe for each finished one in the current set, the rest still to grow. */
function TomatoRow() {
  const { t } = useTranslation('focus')
  const tz = useMe().settings.timezone
  const today = todayInZone(tz)
  const { prefs } = usePomodoro()
  const done = useFocusSessions(today, today).data?.completed_count ?? 0
  const inSet = done % prefs.every
  const sets = Math.floor(done / prefs.every)
  return (
    <div className="mt-3 flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: prefs.every }, (_, i) => (
          <span key={i} className={cn('text-[20px] transition-all duration-500', i < inSet ? 'animate-pop' : 'opacity-30 saturate-50')}>🍅</span>
        ))}
      </div>
      <p className="text-subtle text-xs">{t('tomato.today', { count: done })}{sets > 0 ? ` · ${t('tomato.sets', { count: sets })}` : ''}</p>
    </div>
  )
}

/** Between tomatoes: a sleeping tomato counts down the break; then "Start next tomato". */
function BreakCard({ onNext, pending }: { onNext: () => void; pending: boolean }) {
  const { t } = useTranslation('focus')
  const pomo = usePomodoro()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!pomo.rest) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [pomo.rest])
  const left = pomo.rest ? Math.max(0, (pomo.rest.endsAt - now) / 1000) : 0
  const total = pomo.rest ? pomo.rest.minutes * 60 : 1
  return (
    <Card className="flex flex-col items-center p-6 text-center">
      <p className="text-success mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
        <Coffee size={15} aria-hidden />
        {pomo.rest ? t(pomo.rest.kind === 'long' ? 'tomato.longBreak' : 'tomato.shortBreak') : t('tomato.breakOverTitle')}
      </p>
      <Tomato progress={pomo.rest ? 1 - left / total : 1} mood={pomo.rest ? 'resting' : 'done'} size={200} />
      {pomo.rest ? (
        <>
          <span className="font-display -mt-1 text-[48px] leading-none font-light tracking-tight tabular-nums" role="timer">{clock(left)}</span>
          <p className="text-subtle mt-2 max-w-xs text-[13px]">{t('tomato.breakHint')}</p>
          <Button className="mt-5" onClick={() => updatePomodoro({ rest: null, ready: true })}>
            <SkipForward size={15} aria-hidden />
            {t('tomato.skip')}
          </Button>
        </>
      ) : (
        <>
          <p className="text-subtle mt-1 max-w-xs text-[13px]">{t('tomato.breakOverBody')}</p>
          <div className="mt-5 flex gap-2">
            <Button variant="primary" onClick={onNext} disabled={pending}>
              <span aria-hidden>🍅</span>
              {t('tomato.next')}
            </Button>
            <Button onClick={() => updatePomodoro({ ready: false })}>{t('tomato.finish')}</Button>
          </div>
        </>
      )}
      <TomatoRow />
    </Card>
  )
}
