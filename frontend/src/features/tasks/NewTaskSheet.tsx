import { CalendarDays, Flag, Hash, Target, Timer } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Dialog } from '../../components/ui/Dialog'
import { Select, Textarea } from '../../components/ui/Field'
import { Switch } from '../../components/ui/Switch'
import { useToast } from '../../components/ui/Toast'
import { addDays, formatDay, todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { isQueued } from '../../lib/offline'
import { play } from '../../lib/sound'
import { useMe } from '../auth/AuthProvider'
import { useGoals } from '../goals/api'
import { useCreateTask } from './api'

type When = 'today' | 'tomorrow' | 'weekend' | 'nextWeek' | 'someday' | 'pick'
const PRIORITY_TINT: Record<number, string> = { 1: 'var(--p1)', 2: 'var(--p2)', 3: 'var(--p3)', 4: 'var(--p4)' }
const ESTIMATES = [15, 30, 60, 120]

/** Saturday on or after today, and next Monday, as YYYY-MM-DD. */
function dayFor(when: When, today: string, picked: string): string | null {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() // 0 Sunday
  switch (when) {
    case 'today':
      return today
    case 'tomorrow':
      return addDays(today, 1)
    case 'weekend':
      return addDays(today, dow === 6 || dow === 0 ? 0 : 6 - dow)
    case 'nextWeek':
      return addDays(today, ((8 - dow) % 7) || 7)
    case 'pick':
      return picked || null
    default:
      return null
  }
}

/**
 * The task sheet behind the + button: everything a task needs, sized for a thumb. Title first (with #tags), then
 * one-tap chips for when, how important and how long; notes and goal when you want them. "Add another" keeps the
 * sheet open for a run of tasks.
 */
export function NewTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation('tasks')
  const me = useMe()
  const toast = useToast()
  const create = useCreateTask()
  const goals = useGoals('active').data ?? []
  const today = todayInZone(me.settings.timezone)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [when, setWhen] = useState<When>('today')
  const [picked, setPicked] = useState('')
  const [priority, setPriority] = useState(3)
  const [estimate, setEstimate] = useState<number | null>(null)
  const [goalId, setGoalId] = useState('')
  const [again, setAgain] = useState(false)
  const [added, setAdded] = useState(0)

  const due = dayFor(when, today, picked)
  const reset = (keepChoices: boolean) => {
    setTitle('')
    setNotes('')
    setShowNotes(false)
    if (!keepChoices) {
      setWhen('today')
      setPriority(3)
      setEstimate(null)
      setGoalId('')
    }
  }
  const close = () => {
    reset(false)
    setAdded(0)
    onClose()
  }

  const submit = () => {
    const raw = title.trim()
    if (!raw) return
    const tags = [...new Set((raw.match(/#[^\s#,，]+/g) ?? []).map((x) => x.slice(1)))]
    const clean = raw.replace(/#[^\s#]+/g, '').replace(/\s{2,}/g, ' ').trim() || raw
    create.mutate(
      {
        title: clean,
        notes: notes.trim() || null,
        status: due ? 'todo' : 'inbox',
        due_date: due,
        priority,
        estimate_minutes: estimate,
        goal_id: goalId || null,
        tags,
      },
      {
        onSuccess: (r) => {
          play('complete')
          toast(isQueued(r) ? t('common:offline.queued') : t('toast.created'))
          if (again) {
            setAdded((n) => n + 1)
            reset(true)
          } else close()
        },
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )
  }

  const whenChips: [When, string][] = [
    ['today', t('sheet.today')],
    ['tomorrow', t('sheet.tomorrow')],
    ['weekend', t('sheet.weekend')],
    ['nextWeek', t('sheet.nextWeek')],
    ['someday', t('sheet.someday')],
    ['pick', t('sheet.pick')],
  ]

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('actions.newTask')}
      footer={
        <div className="flex w-full items-center gap-3">
          <label className="text-muted flex min-w-0 flex-1 items-center gap-2 text-[13px]">
            <Switch checked={again} onChange={setAgain} labelledBy="sheet-again" />
            <span id="sheet-again">{added ? t('sheet.addedCount', { count: added }) : t('sheet.again')}</span>
          </label>
          <Button variant="primary" onClick={submit} disabled={!title.trim() || create.isPending}>
            {t('sheet.add')}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex flex-col gap-5"
      >
        <div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            data-autofocus
            enterKeyHint="done"
            aria-label={t('quickAdd.label')}
            placeholder={t('sheet.titlePlaceholder')}
            className="placeholder:text-subtle w-full bg-transparent text-[20px] font-semibold tracking-tight focus:outline-none"
          />
          {showNotes ? (
            <Textarea
              autoFocus
              rows={2}
              maxLength={5000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('sheet.notesPlaceholder')}
              aria-label={t('fields.notes')}
              className="mt-2 min-h-0"
            />
          ) : (
            <button type="button" onClick={() => setShowNotes(true)} className="text-subtle mt-1 text-[14px]">
              {t('sheet.addNotes')}
            </button>
          )}
          <p className="text-subtle mt-2 flex items-center gap-1 text-[12px]">
            <Hash size={12} aria-hidden />
            {t('sheet.tagHint')}
          </p>
        </div>

        <Row icon={<CalendarDays size={16} className="text-[var(--tint-calendar)]" />} label={t('sheet.when')}>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {whenChips.map(([w, label]) => (
              <Chip key={w} on={when === w} onClick={() => setWhen(w)}>
                {label}
              </Chip>
            ))}
          </div>
          {when === 'pick' && (
            <input
              type="date"
              min={today}
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              aria-label={t('sheet.pick')}
              className="bg-sunken text-fg mt-2 h-10 rounded-xl px-3 text-[15px]"
            />
          )}
          <p className="text-subtle mt-1.5 text-[12px]">
            {due ? t('sheet.dueOn', { date: formatDay(due, i18n.language, { weekday: 'long' }) }) : t('sheet.inbox')}
          </p>
        </Row>

        <Row icon={<Flag size={16} className="text-[var(--tint-calendar)]" />} label={t('priority.label')}>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={priority === p}
                onClick={() => {
                  play('tap')
                  setPriority(p)
                }}
                className={cn(
                  'pressable flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold',
                  priority === p ? 'bg-surface shadow-[inset_0_0_0_2px_currentColor]' : 'bg-sunken text-muted',
                )}
                style={priority === p ? { color: PRIORITY_TINT[p] } : undefined}
              >
                <Flag size={13} aria-hidden fill={priority === p ? 'currentColor' : 'none'} />
                {t(`priority.${p}`)}
              </button>
            ))}
          </div>
        </Row>

        <Row icon={<Timer size={16} className="text-[var(--tint-focus)]" />} label={t('sheet.estimate')}>
          <div className="flex flex-wrap gap-2">
            <Chip on={estimate === null} onClick={() => setEstimate(null)}>
              {t('sheet.noEstimate')}
            </Chip>
            {ESTIMATES.map((m) => (
              <Chip key={m} on={estimate === m} onClick={() => setEstimate(m)}>
                {m < 60 ? t('sheet.min', { count: m }) : t('sheet.hours', { count: m / 60 })}
              </Chip>
            ))}
          </div>
        </Row>

        {goals.length > 0 && (
          <Row icon={<Target size={16} className="text-[var(--tint-goals)]" />} label={t('sheet.goal')}>
            <Select value={goalId} onChange={(e) => setGoalId(e.target.value)} aria-label={t('sheet.goal')}>
              <option value="">{t('sheet.noGoal')}</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </Select>
          </Row>
        )}
        {/* lets Enter in the title submit (the date field would otherwise block it); the visible button is in the footer */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          {t('sheet.add')}
        </button>
      </form>
    </Dialog>
  )
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-muted mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
        <span aria-hidden>{icon}</span>
        {label}
      </p>
      {children}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        play('tap')
        onClick()
      }}
      className={cn(
        'pressable h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold',
        on ? 'bg-accent-fill text-on-accent' : 'bg-sunken text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}
