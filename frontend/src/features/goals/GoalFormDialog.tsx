import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, fieldError } from '../../lib/errors'
import type { Category, Goal } from '../../lib/types'
import { useCreateGoal, useUpdateGoal } from './api'

const schema = z
  .object({
    title: z.string().trim().min(1, 'required').max(200, 'string_too_long'),
    description: z.string().max(20000, 'string_too_long'),
    success_criteria: z.string().max(5000, 'string_too_long'),
    horizon: z.enum(['short', 'long']),
    progress_mode: z.enum(['tasks', 'milestones', 'manual']),
    category_id: z.string(),
    start_date: z.string(),
    target_date: z.string(),
  })
  .refine((v) => !v.start_date || !v.target_date || v.target_date >= v.start_date, {
    path: ['target_date'],
    message: 'invalid',
  })
type FormValues = z.infer<typeof schema>

const empty: FormValues = {
  title: '',
  description: '',
  success_criteria: '',
  horizon: 'short',
  progress_mode: 'tasks',
  category_id: '',
  start_date: '',
  target_date: '',
}

function toForm(goal: Goal): FormValues {
  return {
    title: goal.title,
    description: goal.description ?? '',
    success_criteria: goal.success_criteria ?? '',
    horizon: goal.horizon,
    progress_mode: goal.progress_mode,
    category_id: goal.category_id ?? '',
    start_date: goal.start_date ?? '',
    target_date: goal.target_date ?? '',
  }
}

interface Props {
  open: boolean
  onClose: () => void
  categories: Category[]
  /** Edit this goal; create a new one when omitted. */
  goal?: Goal
}

export function GoalFormDialog({ open, onClose, categories, goal }: Props) {
  const { t } = useTranslation('goals')
  const toast = useToast()
  const navigate = useNavigate()
  const create = useCreateGoal()
  const update = useUpdateGoal()
  const mutation = goal ? update : create
  const { register, handleSubmit, reset, formState, control } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: empty,
  })
  const mode = useWatch({ control, name: 'progress_mode' })

  useEffect(() => {
    if (open) {
      reset(goal ? toForm(goal) : empty)
      create.reset()
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the dialog opens
  }, [open, goal?.id])

  const err = (f: keyof FormValues) => {
    const local = formState.errors[f]?.message
    return local ? t(`common:validation.${local}`) : fieldError(t, mutation.error, f)
  }

  const save = handleSubmit((v) => {
    const body = {
      title: v.title,
      description: v.description.trim() || null,
      success_criteria: v.success_criteria.trim() || null,
      horizon: v.horizon,
      progress_mode: v.progress_mode,
      category_id: v.category_id || null,
      start_date: v.start_date || null,
      target_date: v.target_date || null,
    }
    const done = { onError: (e: unknown) => toast(errorMessage(t, e), 'error') }
    if (goal) {
      update.mutate({ id: goal.id, if_updated_at: goal.updated_at, ...body }, {
        ...done,
        onSuccess: () => {
          toast(t('toast.updated'))
          onClose()
        },
      })
    } else {
      create.mutate(body, {
        ...done,
        onSuccess: (created) => {
          toast(t('toast.created'))
          onClose()
          navigate(`/goals/${created.id}`)
        },
      })
    }
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={goal ? t('edit') : t('new')}
      placement="side"
      footer={
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? t('common:actions.saving') : t('common:actions.save')}
          </Button>
        </div>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={save} noValidate>
        <Field label={t('fields.title')} error={err('title')}>
          {(a) => <Input {...a} maxLength={200} data-autofocus {...register('title')} />}
        </Field>
        <Field label={t('fields.successCriteria')} help={t('fields.successCriteriaHelp')} error={err('success_criteria')}>
          {(a) => <Textarea {...a} rows={2} className="min-h-0" {...register('success_criteria')} />}
        </Field>
        <Field label={t('fields.description')} error={err('description')}>
          {(a) => <Textarea {...a} rows={3} {...register('description')} />}
        </Field>
        <Field label={t('mode.label')} help={t(`mode.help_${mode}`)}>
          {(a) => (
            <Select {...a} {...register('progress_mode')}>
              {(['tasks', 'milestones', 'manual'] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`mode.${m}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('horizon.label')}>
            {(a) => (
              <Select {...a} {...register('horizon')}>
                <option value="short">{t('horizon.short')}</option>
                <option value="long">{t('horizon.long')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('tasks:fields.category')}>
            {(a) => (
              <Select {...a} {...register('category_id')}>
                <option value="">{t('tasks:fields.none')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('fields.startDate')} error={err('start_date')}>
            {(a) => <Input {...a} type="date" {...register('start_date')} />}
          </Field>
          <Field label={t('fields.targetDate')} error={err('target_date')}>
            {(a) => <Input {...a} type="date" {...register('target_date')} />}
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
