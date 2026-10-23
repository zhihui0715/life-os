import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { addDays, formatMinutes, todayInZone, utcIsoToWallTime, wallTimeToUtcIso } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { ActivityLog } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useGoals } from '../goals/api'
import { useCategories, useTaskList } from '../tasks/api'
import { useDeleteActivity, useSaveActivity } from './api'

interface Form {
  title: string
  category_id: string
  log_date: string
  duration: string
  start: string // HH:mm, optional
  end: string
  task_id: string
  goal_id: string
  outcome: string
  notes: string
}

export function ActivityDialog({ open, log, onClose }: { open: boolean; log?: ActivityLog; onClose: () => void }) {
  const { t, i18n } = useTranslation('focus')
  const me = useMe()
  const tz = me.settings.timezone
  const toast = useToast()
  const save = useSaveActivity()
  const remove = useDeleteActivity()
  const categories = useCategories().data ?? []
  const tasks = useTaskList({ view: 'all' }, 200).data?.pages.flatMap((p) => p.items) ?? []
  const goals = useGoals().data ?? []
  const [f, setF] = useState<Form | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setF({
      title: log?.title ?? '', category_id: log?.category_id ?? '', log_date: log?.log_date ?? todayInZone(tz),
      duration: log ? String(log.duration_minutes) : '30',
      start: log?.started_at ? utcIsoToWallTime(log.started_at, tz).slice(11, 16) : '',
      end: log?.ended_at ? utcIsoToWallTime(log.ended_at, tz).slice(11, 16) : '',
      task_id: log?.task_id ?? '', goal_id: log?.goal_id ?? '', outcome: log?.outcome ?? '', notes: log?.notes ?? '',
    })
    save.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the dialog opens
  }, [open, log?.id])

  if (!open || !f) return null
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x))
  const hasTimes = !!(f.start && f.end)
  const fromFocus = !!log?.focus_session_id
  const invalid = !f.title.trim() || (!hasTimes && !(Number(f.duration) >= 1))

  const submit = () => {
    if (invalid) return
    let times: { started_at: string | null; ended_at: string | null; duration_minutes?: number }
    if (hasTimes) {
      const endDay = f.end <= f.start ? addDays(f.log_date, 1) : f.log_date
      times = { started_at: wallTimeToUtcIso(`${f.log_date}T${f.start}`, tz), ended_at: wallTimeToUtcIso(`${endDay}T${f.end}`, tz) }
    } else {
      times = { started_at: null, ended_at: null, duration_minutes: Math.round(Number(f.duration)) }
    }
    save.mutate(
      {
        id: log?.id, title: f.title.trim(), category_id: f.category_id || null, log_date: f.log_date,
        ...(fromFocus ? {} : times), // a focus session's minutes are corrected on the session itself
        task_id: f.task_id || null, goal_id: f.goal_id || null, outcome: f.outcome.trim() || null, notes: f.notes.trim() || null,
      },
      { onSuccess: () => { toast(t(log ? 'toast.updated' : 'toast.logged')); onClose() }, onError: (e) => toast(errorMessage(t, e), 'error') },
    )
  }

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={log ? t('log.editTitle') : t('log.addTitle')}
        placement="side"
        footer={
          <>
            {log && (
              <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} aria-hidden />{t('common:actions.delete')}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
              <Button variant="primary" onClick={submit} disabled={invalid || save.isPending}>{t('common:actions.save')}</Button>
            </div>
          </>
        }
      >
        <form className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit() }}>
          <Field label={t('log.what')}>{(a) => <Input {...a} data-autofocus maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('log.category')}>
              {(a) => (
                <Select {...a} value={f.category_id} onChange={(e) => set('category_id', e.target.value)}>
                  <option value="">{t('tasks:fields.none')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t('log.date')}>{(a) => <Input {...a} type="date" max={todayInZone(tz)} value={f.log_date} onChange={(e) => set('log_date', e.target.value)} />}</Field>
          </div>
          {fromFocus ? (
            <p className="text-subtle text-sm">{t('log.fromFocus')} · {formatMinutes(log!.duration_minutes, i18n.language)}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field label={t('log.start')}>{(a) => <Input {...a} type="time" value={f.start} onChange={(e) => set('start', e.target.value)} />}</Field>
                <Field label={t('log.end')}>{(a) => <Input {...a} type="time" value={f.end} onChange={(e) => set('end', e.target.value)} />}</Field>
                <Field label={t('log.duration')}>{(a) => <Input {...a} type="number" min={1} max={1440} disabled={hasTimes} value={f.duration} onChange={(e) => set('duration', e.target.value)} />}</Field>
              </div>
              <p className="text-subtle -mt-2 text-xs">{t('log.timesHelp')}</p>
            </>
          )}
          <Field label={t('log.task')}>
            {(a) => (
              <Select {...a} value={f.task_id} onChange={(e) => set('task_id', e.target.value)}>
                <option value="">{t('tasks:fields.none')}</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t('log.goal')}>
            {(a) => (
              <Select {...a} value={f.goal_id} onChange={(e) => set('goal_id', e.target.value)}>
                <option value="">{t('tasks:fields.noGoal')}</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t('log.outcome')}>{(a) => <Input {...a} maxLength={2000} value={f.outcome} onChange={(e) => set('outcome', e.target.value)} />}</Field>
          <Field label={t('log.notes')}>{(a) => <Textarea {...a} rows={3} maxLength={5000} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
          <button type="submit" hidden />
        </form>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        danger
        title={t('log.deleteTitle')}
        body={log ? t('log.deleteBody', { minutes: formatMinutes(log.duration_minutes, i18n.language) }) : ''}
        confirmLabel={t('common:actions.delete')}
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          log && remove.mutate(log.id, { onSuccess: () => { setConfirmDelete(false); toast(t('toast.deleted')); onClose() }, onError: (e) => toast(errorMessage(t, e), 'error') })
        }
      />
    </>
  )
}
