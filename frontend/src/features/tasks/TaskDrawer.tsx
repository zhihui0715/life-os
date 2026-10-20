import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { utcIsoToWallTime, wallTimeToUtcIso } from '../../lib/dates'
import { errorMessage, fieldError } from '../../lib/errors'
import type { Category, Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useDeleteTask, useTaskAction, useUpdateTask } from './api'

const schema = z.object({
  title: z.string().trim().min(1, 'required').max(200, 'string_too_long'),
  notes: z.string().max(20000, 'string_too_long'),
  status: z.enum(['inbox', 'todo', 'in_progress', 'done']),
  priority: z.string(),
  due_date: z.string(),
  deadline: z.string(),
  estimate_minutes: z.string().regex(/^\d{0,5}$/, 'invalid'),
  category_id: z.string(),
})
type FormValues = z.infer<typeof schema>

function toForm(task: Task, timeZone: string): FormValues {
  return {
    title: task.title,
    notes: task.notes ?? '',
    status: task.status,
    priority: String(task.priority),
    due_date: task.due_date ?? '',
    deadline: task.deadline ? utcIsoToWallTime(task.deadline, timeZone) : '',
    estimate_minutes: task.estimate_minutes != null ? String(task.estimate_minutes) : '',
    category_id: task.category_id ?? '',
  }
}

interface Props {
  task: Task | null
  categories: Category[]
  onClose: () => void
}

export function TaskDrawer({ task, categories, onClose }: Props) {
  const { t } = useTranslation('tasks')
  const me = useMe()
  const tz = me.settings.timezone
  const toast = useToast()
  const update = useUpdateTask()
  const action = useTaskAction()
  const remove = useDeleteTask()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({ resolver: zodResolver(schema) })
  useEffect(() => {
    if (task) reset(toForm(task, tz))
    update.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a different task opens
  }, [task?.id, task?.updated_at])

  if (!task) return null

  const done = task.status === 'done'
  const err = (f: keyof FormValues) => {
    const local = formState.errors[f]?.message
    return local ? t(`common:validation.${local}`) : fieldError(t, update.error, f)
  }

  const save = handleSubmit((v) => {
    update.mutate(
      {
        id: task.id,
        if_updated_at: task.updated_at,
        title: v.title,
        notes: v.notes.trim() ? v.notes : null,
        ...(done ? {} : { status: v.status as Exclude<FormValues['status'], 'done'> }),
        priority: Number(v.priority),
        due_date: v.due_date || null,
        deadline: v.deadline ? wallTimeToUtcIso(v.deadline, tz) : null,
        estimate_minutes: v.estimate_minutes ? Number(v.estimate_minutes) : null,
        category_id: v.category_id || null,
      },
      {
        onSuccess: () => {
          toast(t('toast.updated'))
          onClose()
        },
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )
  })

  const run = (kind: 'archive' | 'restore') =>
    action.mutate(
      { id: task.id, action: kind },
      {
        onSuccess: () => {
          toast(t(kind === 'archive' ? 'toast.archived' : 'toast.restored'))
          onClose()
        },
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={t('actions.edit')}
        placement="side"
        footer={
          <>
            {task.archived_at ? (
              <Button variant="ghost" onClick={() => run('restore')}>
                <ArchiveRestore size={16} aria-hidden />
                {t('common:actions.restore')}
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => run('archive')}>
                <Archive size={16} aria-hidden />
                {t('common:actions.archive')}
              </Button>
            )}
            {!done && (
              <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} aria-hidden />
                {t('common:actions.delete')}
              </Button>
            )}
            <Button variant="primary" className="ml-auto" onClick={save} disabled={update.isPending}>
              {update.isPending ? t('common:actions.saving') : t('common:actions.save')}
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={save} noValidate>
          <Field label={t('fields.title')} error={err('title')}>
            {(a) => <Input {...a} maxLength={200} {...register('title')} />}
          </Field>
          <Field label={t('fields.notes')} error={err('notes')}>
            {(a) => <Textarea {...a} rows={4} {...register('notes')} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.status')}>
              {(a) => (
                <Select {...a} disabled={done} {...register('status')}>
                  {(done ? ['done'] : ['inbox', 'todo', 'in_progress']).map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('priority.label')}>
              {(a) => (
                <Select {...a} {...register('priority')}>
                  {[1, 2, 3, 4].map((p) => (
                    <option key={p} value={p}>
                      {t(`priority.${p}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label={t('fields.dueDate')} help={t('fields.dueDateHelp')} error={err('due_date')}>
            {(a) => <Input {...a} type="date" {...register('due_date')} />}
          </Field>
          <Field label={t('fields.deadline')} help={t('fields.deadlineHelp')} error={err('deadline')}>
            {(a) => <Input {...a} type="datetime-local" {...register('deadline')} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.estimate')} error={err('estimate_minutes')}>
              {(a) => <Input {...a} inputMode="numeric" {...register('estimate_minutes')} />}
            </Field>
            <Field label={t('fields.category')} error={err('category_id')}>
              {(a) => (
                <Select {...a} {...register('category_id')}>
                  <option value="">{t('fields.none')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <button type="submit" hidden />
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={t('confirmDelete.title')}
        body={t('confirmDelete.body')}
        confirmLabel={t('common:actions.delete')}
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(task.id, {
            onSuccess: () => {
              setConfirmDelete(false)
              toast(t('toast.deleted'))
              onClose()
            },
            onError: (e) => toast(errorMessage(t, e), 'error'),
          })
        }
      />
    </>
  )
}
