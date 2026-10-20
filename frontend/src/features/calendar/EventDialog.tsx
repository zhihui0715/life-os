import { Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { ApiError } from '../../lib/api'
import { addDays, utcIsoToWallTime, wallTimeToUtcIso } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { EventKind, Occurrence } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useTaskList } from '../tasks/api'
import { useArchiveEvent, useCancelOccurrence, useCreateEvent, useEditOccurrence, useEvent, useUpdateEvent, type EventInput } from './api'
import { buildRRule, NO_REPEAT, parseRRule, type RepeatChoice } from './rrule'

export type EventDialogMode =
  | { type: 'create'; date: string; start?: string; end?: string; allDay?: boolean; kind?: EventKind; taskId?: string; title?: string }
  | { type: 'edit'; occurrence: Occurrence }

interface FormState {
  title: string
  kind: EventKind
  taskId: string
  allDay: boolean
  date: string
  start: string // HH:mm
  end: string
  endDate: string // all-day, inclusive
  repeat: RepeatChoice
  isHard: boolean
  description: string
}

const KINDS: EventKind[] = ['appointment', 'task_block', 'preference']

function plusHour(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function EventDialog({ mode, onClose }: { mode: EventDialogMode | null; onClose: () => void }) {
  const { t } = useTranslation('calendar')
  const me = useMe()
  const tz = me.settings.timezone
  const toast = useToast()
  const occurrence = mode?.type === 'edit' ? mode.occurrence : null
  const eventQuery = useEvent(occurrence?.event_id ?? null)
  const event = eventQuery.data
  const recurring = !!occurrence?.recurring
  const [scope, setScope] = useState<'this' | 'all'>('this')
  const [form, setForm] = useState<FormState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tasks = useTaskList({ view: 'all' }, 200).data?.pages.flatMap((p) => p.items).filter((x) => x.status !== 'done' && !x.parent_task_id) ?? []

  const create = useCreateEvent()
  const update = useUpdateEvent()
  const editOne = useEditOccurrence()
  const archive = useArchiveEvent()
  const cancelOne = useCancelOccurrence()
  const busy = create.isPending || update.isPending || editOne.isPending

  // Build the form from the dialog mode (and, when editing, from the loaded event + chosen scope).
  const initial = useMemo<FormState | null>(() => {
    if (!mode) return null
    if (mode.type === 'create') {
      const start = mode.start ?? '09:00'
      return {
        title: mode.title ?? '', kind: mode.kind ?? 'appointment', taskId: mode.taskId ?? '', allDay: !!mode.allDay,
        date: mode.date, start, end: mode.end ?? plusHour(start), endDate: mode.date, repeat: { ...NO_REPEAT },
        isHard: (mode.kind ?? 'appointment') === 'appointment', description: '',
      }
    }
    if (!event) return null
    const useSeries = scope === 'all' || !recurring
    const s = useSeries ? event.starts_at : mode.occurrence.starts_at
    const e = useSeries ? event.ends_at : mode.occurrence.ends_at
    const sw = utcIsoToWallTime(s, tz)
    const ew = utcIsoToWallTime(e, tz)
    return {
      title: useSeries ? event.title : mode.occurrence.title, kind: event.kind, taskId: event.task_id ?? '', allDay: event.all_day,
      date: event.all_day ? (useSeries ? event.start_date! : mode.occurrence.start_date!) : sw.slice(0, 10),
      start: sw.slice(11, 16), end: ew.slice(11, 16),
      endDate: event.all_day ? (useSeries ? event.end_date! : mode.occurrence.end_date!) : ew.slice(0, 10),
      repeat: parseRRule(event.rrule), isHard: event.is_hard, description: event.description ?? '',
    }
  }, [mode, event, scope, recurring, tz])

  useEffect(() => setForm(initial), [initial])
  useEffect(() => {
    if (mode) {
      setScope('this')
      setConfirmDelete(false)
      create.reset()
      update.reset()
      editOne.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the dialog target changes
  }, [mode])

  if (!mode) return null
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))
  const onlyThis = recurring && scope === 'this'
  const error = create.error || update.error || editOne.error
  const fieldErrors = error instanceof ApiError ? Object.keys(error.fields ?? {}) : []

  const timed = (f: FormState) => {
    const startIso = wallTimeToUtcIso(`${f.date}T${f.start}`, tz)
    // An end time at or before the start means "the next day" (e.g. 22:00 → 01:00).
    const endDay = f.end <= f.start ? addDays(f.date, 1) : f.date
    return { starts_at: startIso, ends_at: wallTimeToUtcIso(`${endDay}T${f.end}`, tz) }
  }

  const save = () => {
    if (!form || !form.title.trim()) return
    const done = (msg: string) => () => {
      toast(t(msg))
      onClose()
    }
    const fail = (e: unknown) => toast(errorMessage(t, e), 'error')

    if (mode.type === 'edit' && onlyThis) {
      editOne.mutate(
        { eventId: occurrence!.event_id, originalStart: occurrence!.original_start, title: form.title.trim(), ...timed(form) },
        { onSuccess: done('toast.updated'), onError: fail },
      )
      return
    }
    const body: EventInput = {
      title: form.title.trim(),
      kind: form.kind,
      task_id: form.kind === 'task_block' ? form.taskId || null : null,
      is_hard: form.kind === 'preference' ? false : form.isHard,
      all_day: form.allDay,
      rrule: buildRRule(form.repeat, form.date),
      description: form.description.trim() || null,
      ...(form.allDay ? { start_date: form.date, end_date: form.endDate < form.date ? form.date : form.endDate } : timed(form)),
    }
    if (mode.type === 'create') {
      create.mutate(body, { onSuccess: done('toast.created'), onError: fail })
    } else {
      update.mutate(
        { id: event!.id, if_updated_at: event!.updated_at, ...body },
        {
          onSuccess: (res) => {
            if (res.dropped_exceptions) toast(t('toast.dropped', { count: res.dropped_exceptions }))
            done('toast.updated')()
          },
          onError: fail,
        },
      )
    }
  }

  const remove = (which: 'this' | 'all') => {
    const ok = { onSuccess: () => { toast(t('toast.deleted')); onClose() }, onError: (e: unknown) => toast(errorMessage(t, e), 'error') }
    if (which === 'this') cancelOne.mutate({ eventId: occurrence!.event_id, originalStart: occurrence!.original_start }, ok)
    else archive.mutate(occurrence!.event_id, ok)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode.type === 'create' ? t('newEvent') : t('editEvent')}
      placement="side"
      footer={
        confirmDelete ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{t('delete.title')}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button onClick={() => setConfirmDelete(false)}>{t('common:actions.cancel')}</Button>
              {recurring && <Button variant="danger" onClick={() => remove('this')}>{t('delete.occurrence')}</Button>}
              <Button variant="danger" onClick={() => remove('all')}>{recurring ? t('delete.series') : t('common:actions.delete')}</Button>
            </div>
          </div>
        ) : (
          <>
            {mode.type === 'edit' && (
              <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} aria-hidden />
                {t('common:actions.delete')}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
              <Button variant="primary" onClick={save} disabled={busy || !form?.title.trim() || (form.kind === 'task_block' && !form.taskId)}>
                {busy ? t('common:actions.saving') : t('common:actions.save')}
              </Button>
            </div>
          </>
        )
      }
    >
      {!form ? (
        <p className="text-subtle">{t('common:state.loading')}</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          {recurring && (
            <fieldset className="border-border rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">{t('scope.label')}</legend>
              {(['this', 'all'] as const).map((s) => (
                <label key={s} className="flex items-center gap-2 py-1 text-sm">
                  <input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} />
                  {t(`scope.${s}`)}
                </label>
              ))}
              {scope === 'all' && event && event.exception_count > 0 && <p className="text-warning mt-1 text-xs">{t('scope.allWarning')}</p>}
            </fieldset>
          )}

          <Field label={t('fields.title')} error={fieldErrors.includes('title') ? t('common:validation.invalid') : undefined}>
            {(a) => <Input {...a} data-autofocus maxLength={200} value={form.title} onChange={(e) => set('title', e.target.value)} />}
          </Field>

          {!onlyThis && (
            <Field label={t('kind.label')} help={t(`kind.help_${form.kind}`)}>
              {(a) => (
                <Select {...a} value={form.kind} onChange={(e) => set('kind', e.target.value as EventKind)}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`kind.${k}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          {!onlyThis && form.kind === 'task_block' && (
            <Field label={t('fields.task')}>
              {(a) => (
                <Select
                  {...a}
                  value={form.taskId}
                  onChange={(e) => {
                    const task = tasks.find((x) => x.id === e.target.value)
                    setForm((f) => (f ? { ...f, taskId: e.target.value, title: f.title || task?.title || '' } : f))
                  }}
                >
                  <option value="">{t('fields.chooseTask')}</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          {!onlyThis && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} />
              {t('fields.allDay')}
            </label>
          )}

          {form.allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fields.startDate')}>{(a) => <Input {...a} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />}</Field>
              <Field label={t('fields.endDate')}>{(a) => <Input {...a} type="date" value={form.endDate} min={form.date} onChange={(e) => set('endDate', e.target.value)} />}</Field>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('fields.date')}>{(a) => <Input {...a} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />}</Field>
              <Field label={t('fields.start')}>{(a) => <Input {...a} type="time" value={form.start} onChange={(e) => set('start', e.target.value)} />}</Field>
              <Field label={t('fields.end')}>{(a) => <Input {...a} type="time" value={form.end} onChange={(e) => set('end', e.target.value)} />}</Field>
            </div>
          )}

          {!onlyThis && <RepeatFields value={form.repeat} onChange={(r) => set('repeat', r)} />}

          {!onlyThis && form.kind !== 'preference' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isHard} onChange={(e) => set('isHard', e.target.checked)} />
              {t('fields.isHard')}
            </label>
          )}

          {!onlyThis && (
            <Field label={t('fields.description')}>
              {(a) => <Textarea {...a} rows={3} maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)} />}
            </Field>
          )}
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  )
}

function RepeatFields({ value, onChange }: { value: RepeatChoice; onChange: (r: RepeatChoice) => void }) {
  const { t } = useTranslation('calendar')
  const freqs = ['none', 'daily', 'weekdays', 'weekly', 'monthly', ...(value.freq === 'custom' ? ['custom'] : [])] as RepeatChoice['freq'][]
  return (
    <div className="flex flex-col gap-3">
      <Field label={t('repeat.label')} help={value.freq === 'custom' ? value.custom : undefined}>
        {(a) => (
          <Select {...a} value={value.freq} onChange={(e) => onChange({ ...value, freq: e.target.value as RepeatChoice['freq'] })}>
            {freqs.map((f) => (
              <option key={f} value={f}>
                {t(`repeat.${f}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {value.freq !== 'none' && value.freq !== 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('repeat.ends')} className="min-w-32">
            {(a) => (
              <Select {...a} value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value as RepeatChoice['end'] })}>
                <option value="never">{t('repeat.never')}</option>
                <option value="until">{t('repeat.until')}</option>
                <option value="count">{t('repeat.count')}</option>
              </Select>
            )}
          </Field>
          {value.end === 'until' && (
            <Input type="date" aria-label={t('repeat.until')} className="w-auto" value={value.until} onChange={(e) => onChange({ ...value, until: e.target.value })} />
          )}
          {value.end === 'count' && (
            <label className="flex items-center gap-2 text-sm">
              <Input type="number" min={1} max={1000} className="w-24" value={value.count} onChange={(e) => onChange({ ...value, count: Number(e.target.value) || 1 })} />
              {t('repeat.times')}
            </label>
          )}
        </div>
      )}
    </div>
  )
}
