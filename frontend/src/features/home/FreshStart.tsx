/**
 * Two ways Home makes starting easy:
 * - One thing today: pick a single task (suggested by Plan my day), then start it for 2 minutes or tick it off.
 * - Welcome back: after a few days away, offer a fresh start instead of a wall of overdue tasks.
 * Both remember their state on this device (today's pick, the last visit), like sounds and reminders.
 */
import { Check, RefreshCw, Sparkles, Sun } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Input } from '../../components/ui/Field'
import { Card } from '../../components/ui/states'
import { useToast } from '../../components/ui/Toast'
import { confetti } from '../../lib/confetti'
import { addDays, todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { isQueued } from '../../lib/offline'
import { play } from '../../lib/sound'
import { useMe } from '../auth/AuthProvider'
import { TwoMinuteButton } from '../focus/TwoMinutes'
import { useDayPlan } from '../planning/api'
import { useCreateTask, useMoveToSomeday, useTask, useTaskAction } from '../tasks/api'
import { useTaskTotal } from '../tasks/TaskList'

const PICK_KEY = 'lifeos.oneThing'
const VISIT_KEY = 'lifeos.lastVisit'
export const AWAY_DAYS = 3

interface Pick {
  date: string
  id: string
  title: string
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage blocked: it just isn't remembered */
  }
}

export function OneThingCard() {
  const { t } = useTranslation()
  const today = todayInZone(useMe().settings.timezone)
  const [pick, setPick] = useState<Pick | null>(() => read<Pick>(PICK_KEY))
  const current = pick?.date === today ? pick : null
  const task = useTask(current?.id ?? null)
  const choose = (p: Pick | null) => {
    write(PICK_KEY, p)
    setPick(p)
  }
  // A pick deleted elsewhere is simply forgotten.
  const missing = task.isError
  useEffect(() => {
    if (missing) {
      write(PICK_KEY, null)
      setPick(null)
    }
  }, [missing])

  return (
    <Card className="mb-4 p-4">
      <p className="text-subtle mb-1 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide uppercase">
        <Sun size={14} aria-hidden />
        {t('oneThing.eyebrow')}
      </p>
      {current ? (
        <Picked pick={current} done={task.data?.status === 'done'} onChange={() => choose(null)} />
      ) : (
        <Chooser today={today} onPick={choose} />
      )}
    </Card>
  )
}

function Chooser({ today, onPick }: { today: string; onPick: (p: Pick) => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const plan = useDayPlan('today').data
  const create = useCreateTask()
  const [title, setTitle] = useState('')

  // Plan my day's own suggestions first, then the rest of its ranked candidates.
  const suggested = new Set(plan?.suggested ?? [])
  const candidates = plan?.candidates ?? []
  const ranked = [...candidates.filter((c) => suggested.has(c.task.id)), ...candidates.filter((c) => !suggested.has(c.task.id))]
  const suggestions = ranked.slice(0, 3).map((c) => c.task)

  const pickTask = (id: string, taskTitle: string) => {
    play('tap')
    onPick({ date: today, id, title: taskTitle })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = title.trim()
    if (!text) return
    const id = crypto.randomUUID()
    create.mutate(
      { id, title: text, status: 'todo', due_date: today },
      {
        onSuccess: (result) => {
          setTitle('')
          pickTask(isQueued(result) ? id : result.id, text)
        },
        onError: (err) => toast(errorMessage(t, err), 'error'),
      },
    )
  }

  return (
    <>
      <h2 className="mb-3 text-[19px] font-semibold">{t('oneThing.question')}</h2>
      {suggestions.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => pickTask(s.id, s.title)}
                className="pressable bg-sunken hover:bg-border flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[15px]"
              >
                <Sparkles size={15} className="text-accent shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t(suggestions.length ? 'oneThing.orType' : 'oneThing.type')}
          aria-label={t('oneThing.type')}
          maxLength={200}
        />
        <Button type="submit" variant="primary" disabled={!title.trim() || create.isPending}>
          {t('oneThing.pick')}
        </Button>
      </form>
    </>
  )
}

function Picked({ pick, done, onChange }: { pick: Pick; done: boolean; onChange: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const action = useTaskAction()

  if (done)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-success text-[19px] font-semibold">{t('oneThing.doneTitle')}</h2>
          <p className="text-muted truncate text-sm line-through">{pick.title}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onChange}>
          {t('oneThing.another')}
        </Button>
      </div>
    )

  return (
    <>
      <h2 className="mb-1 text-[19px] leading-snug font-semibold break-words">{pick.title}</h2>
      <p className="text-subtle mb-3 text-sm">{t('oneThing.nudge')}</p>
      <div className="flex flex-wrap gap-2">
        <TwoMinuteButton taskId={pick.id} variant="primary" size="md" />
        <Button
          disabled={action.isPending}
          onClick={() =>
            action.mutate(
              { id: pick.id, action: 'complete', title: pick.title },
              {
                onSuccess: () => {
                  play('success')
                  confetti({ emoji: ['⭐', '🎉', '✨'] })
                  toast(t('oneThing.doneToast'))
                },
                onError: (e) => toast(errorMessage(t, e), 'error'),
              },
            )
          }
        >
          <Check size={16} aria-hidden />
          {t('oneThing.done')}
        </Button>
        <Button variant="ghost" onClick={onChange} aria-label={t('oneThing.change')}>
          <RefreshCw size={15} aria-hidden />
          <span className="hidden sm:inline">{t('oneThing.change')}</span>
        </Button>
      </div>
    </>
  )
}

/** Whole days since this device last opened Home (null on a first visit), read once; today's visit is recorded. */
function useDaysAway(today: string): number | null {
  const [away] = useState(() => {
    const last = read<string>(VISIT_KEY)
    if (!last || last >= today) return null
    let days = 0
    for (let d = last; d < today && days < 366; d = addDays(d, 1)) days++
    return days
  })
  useEffect(() => write(VISIT_KEY, today), [today])
  return away
}

export function WelcomeBack() {
  const { t } = useTranslation()
  const me = useMe()
  const toast = useToast()
  const today = todayInZone(me.settings.timezone)
  const away = useDaysAway(today)
  const overdue = useTaskTotal({ view: 'overdue' })
  const move = useMoveToSomeday()
  const [open, setOpen] = useState(true)
  if (away == null || away < AWAY_DAYS || overdue == null) return null

  const close = () => setOpen(false)
  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('welcomeBack.title', { name: me.user.display_name })}
      footer={
        overdue > 0 ? (
          <>
            <Button variant="ghost" onClick={close}>
              {t('welcomeBack.keep')}
            </Button>
            <Button
              variant="primary"
              className="ml-auto"
              disabled={move.isPending}
              onClick={() =>
                move.mutate(undefined, {
                  onSuccess: (r) => {
                    toast(t('welcomeBack.moved', { count: r.moved }))
                    close()
                  },
                  onError: (e) => toast(errorMessage(t, e), 'error'),
                })
              }
            >
              {t('welcomeBack.fresh')}
            </Button>
          </>
        ) : (
          <Button variant="primary" className="ml-auto" onClick={close}>
            {t('welcomeBack.go')}
          </Button>
        )
      }
    >
      <p className="mb-2 text-[15px]">{t('welcomeBack.body')}</p>
      {overdue > 0 && <p className="text-muted text-sm">{t('welcomeBack.overdue', { count: overdue })}</p>}
    </Dialog>
  )
}
