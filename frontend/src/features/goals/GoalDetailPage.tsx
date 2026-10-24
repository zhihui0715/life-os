import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { CheckMark } from '../../components/ui/CheckMark'
import { BackLink, SectionTitle } from '../../components/ui/Segments'
import { Card, ErrorState, ListSkeleton } from '../../components/ui/states'
import { formatDay, formatInstant } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { play } from '../../lib/sound'
import type { GoalDetail, GoalStatus, Milestone, Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useCategories } from '../tasks/api'
import { QuickAddInput } from '../tasks/QuickAddInput'
import { TaskDrawer } from '../tasks/TaskDrawer'
import { TaskList } from '../tasks/TaskList'
import { useAddGoalUpdate, useAddMilestone, useGoal, useGoalAction, useMilestoneAction, useUpdateGoal } from './api'
import { GoalFormDialog } from './GoalFormDialog'
import { GoalProgress } from './GoalProgress'

const STATUSES: GoalStatus[] = ['active', 'paused', 'completed', 'abandoned']

export function GoalDetailPage() {
  const { goalId } = useParams()
  const { t } = useTranslation('goals')
  const query = useGoal(goalId)
  const categories = useCategories().data ?? []
  const [editing, setEditing] = useState(false)
  const [openTask, setOpenTask] = useState<Task | null>(null)

  if (query.isPending) return <ListSkeleton rows={5} />
  if (query.isError) return <ErrorState message={errorMessage(t, query.error)} onRetry={() => query.refetch()} />
  const goal = query.data

  return (
    <>
      <BackLink to="/goals">{t('back')}</BackLink>

      <GoalHeader goal={goal} onEdit={() => setEditing(true)} />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-5">
            <GoalProgress goal={goal} />
            {goal.success_criteria && (
              <p className="mt-4 text-sm">
                <span className="text-subtle block text-xs font-medium">{t('fields.successCriteria')}</span>
                {goal.success_criteria}
              </p>
            )}
            {goal.description && <p className="text-muted mt-3 text-sm whitespace-pre-line">{goal.description}</p>}
          </Card>

          <Milestones goal={goal} />

          <section>
            <SectionTitle>{t('tasks.title')}</SectionTitle>
            <Card className="overflow-hidden">
              <TaskList
                filters={{ view: 'all', goal_id: goal.id }}
                categories={categories}
                onOpen={setOpenTask}
                hideGoal
                empty={{ title: t('tasks.empty') }}
              />
              {!goal.archived_at && (
                <div className="border-border border-t p-2">
                  <QuickAddInput view="all" extra={{ goal_id: goal.id, status: 'todo' }} placeholder={t('tasks.add')} label={t('tasks.add')} />
                </div>
              )}
            </Card>
          </section>
        </div>

        <Timeline goal={goal} />
      </div>

      <GoalFormDialog open={editing} onClose={() => setEditing(false)} categories={categories} goal={goal} />
      <TaskDrawer task={openTask} categories={categories} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />
    </>
  )
}

function GoalHeader({ goal, onEdit }: { goal: GoalDetail; onEdit: () => void }) {
  const { t, i18n } = useTranslation('goals')
  const toast = useToast()
  const update = useUpdateGoal()
  const action = useGoalAction()

  const setStatus = (status: GoalStatus) =>
    update.mutate(
      { id: goal.id, status },
      { onSuccess: () => toast(t('toast.updated')), onError: (e) => toast(errorMessage(t, e), 'error') },
    )
  const archive = (kind: 'archive' | 'restore') =>
    action.mutate(
      { id: goal.id, action: kind },
      {
        onSuccess: () => toast(t(kind === 'archive' ? 'toast.archived' : 'toast.restored')),
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )

  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[30px] leading-tight font-bold tracking-[-0.025em] break-words">{goal.title}</h1>
        <p className="text-subtle mt-1 flex flex-wrap gap-x-3 text-sm">
          <span>{t(`horizon.${goal.horizon}`)}</span>
          {goal.target_date && <span>{t('meta.target', { date: formatDay(goal.target_date, i18n.language, { year: 'numeric' }) })}</span>}
          {goal.archived_at && <span className="text-warning">{t('filters.archived')}</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="goal-status">
          {t('status.label')}
        </label>
        <Select id="goal-status" value={goal.status} onChange={(e) => setStatus(e.target.value as GoalStatus)} className="h-9 w-auto">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={onEdit}>
          <Pencil size={14} aria-hidden />
          {t('edit')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => archive(goal.archived_at ? 'restore' : 'archive')}>
          {goal.archived_at ? <ArchiveRestore size={14} aria-hidden /> : <Archive size={14} aria-hidden />}
          {t(goal.archived_at ? 'common:actions.restore' : 'common:actions.archive')}
        </Button>
      </div>
    </div>
  )
}

function Milestones({ goal }: { goal: GoalDetail }) {
  const { t, i18n } = useTranslation('goals')
  const toast = useToast()
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const add = useAddMilestone()
  const act = useMilestoneAction()
  const [title, setTitle] = useState('')
  const [weight, setWeight] = useState('1')
  const [toDelete, setToDelete] = useState<Milestone | null>(null)

  const submit = () => {
    const value = title.trim()
    if (!value) return
    setTitle('')
    add.mutate(
      { goalId: goal.id, title: value, weight: Math.min(100, Math.max(1, Number(weight) || 1)) },
      {
        onSuccess: () => toast(t('toast.milestoneAdded')),
        onError: (e) => {
          setTitle((cur) => cur || value)
          toast(errorMessage(t, e), 'error')
        },
      },
    )
  }

  return (
    <section>
      <SectionTitle>{t('milestones.title')}</SectionTitle>
      <Card className="overflow-hidden">
        {goal.milestones.length === 0 ? (
          <p className="text-subtle px-4 py-3 text-sm">{t('milestones.empty')}</p>
        ) : (
          <ul className="divide-border divide-y">
            {goal.milestones.map((m) => {
              const done = !!m.completed_at
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={t(done ? 'milestones.reopen' : 'milestones.complete', { title: m.title })}
                    onClick={() => {
                      setCelebrating(done ? null : m.id)
                      play(done ? 'uncheck' : 'complete')
                      act.mutate({ id: m.id, action: done ? 'reopen' : 'complete' }, { onError: (e) => toast(errorMessage(t, e), 'error') })
                    }}
                    className="group/check pressable relative flex shrink-0 items-center justify-center before:absolute before:-m-3 before:h-11 before:w-11"
                  >
                    <CheckMark checked={done} celebrate={celebrating === m.id} shape="square" size={21} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn('break-words', done && 'text-subtle line-through')}>{m.title}</p>
                    <p className="text-subtle flex flex-wrap gap-x-3 text-xs">
                      {goal.progress_mode === 'milestones' && <span>{t('milestones.weight')} {m.weight}</span>}
                      {m.tasks_total > 0 && <span>{t('milestones.tasks', { done: m.tasks_done, total: m.tasks_total })}</span>}
                      {m.target_date && <span>{formatDay(m.target_date, i18n.language)}</span>}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="text-subtle hover:text-danger hover:bg-danger-soft" aria-label={`${t('common:actions.delete')}: ${m.title}`} onClick={() => setToDelete(m)}>
                    <Trash2 size={16} aria-hidden />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="border-border flex items-center gap-2.5 border-t px-4"
        >
          <span className="bg-accent-fill text-on-accent flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full"><Plus size={14} strokeWidth={3} aria-hidden /></span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            aria-label={t('milestones.addLabel')}
            placeholder={t('milestones.add')}
            className="placeholder:text-subtle h-12 min-w-0 flex-1 bg-transparent focus:outline-none"
          />
          {/* With two fields (title and weight) browsers only submit on Enter if the form has a submit button */}
          <button type="submit" className="sr-only">{t('common:actions.add')}</button>
          {goal.progress_mode === 'milestones' && (
            <label className="text-subtle flex items-center gap-1.5 text-xs" title={t('milestones.weightHelp')}>
              {t('milestones.weight')}
              <input
                type="number"
                min={1}
                max={100}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="bg-sunken text-fg h-8 w-14 rounded-lg px-2 text-sm tabular-nums"
              />
            </label>
          )}
        </form>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title={t('milestones.deleteTitle')}
        body={t('milestones.deleteBody')}
        confirmLabel={t('common:actions.delete')}
        busy={act.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() =>
          toDelete &&
          act.mutate(
            { id: toDelete.id, action: 'delete' },
            {
              onSuccess: () => {
                setToDelete(null)
                toast(t('toast.milestoneDeleted'))
              },
              onError: (e) => {
                setToDelete(null)
                toast(errorMessage(t, e), 'error')
              },
            },
          )
        }
      />
    </section>
  )
}

function Timeline({ goal }: { goal: GoalDetail }) {
  const { t, i18n } = useTranslation('goals')
  const me = useMe()
  const toast = useToast()
  const add = useAddGoalUpdate()
  const [note, setNote] = useState('')
  const [progress, setProgress] = useState(goal.manual_progress != null ? String(goal.manual_progress) : '')
  const manual = goal.progress_mode === 'manual'

  const describe = (u: GoalDetail['updates'][number]) => {
    if (u.kind === 'auto') return t('timeline.auto', { value: u.progress })
    if (u.kind === 'manual') return t('timeline.manual', { value: u.progress })
    if (u.kind === 'status' && u.status) return t('timeline.status', { status: t(`status.${u.status}`) })
    return null
  }

  const submit = () => {
    const value = manual && progress !== '' ? Math.min(100, Math.max(0, Math.round(Number(progress)))) : undefined
    const text = note.trim()
    if (!text && value === undefined) return
    add.mutate(
      { goalId: goal.id, note: text || undefined, progress: value },
      {
        onSuccess: () => {
          setNote('')
          toast(t('toast.updateAdded'))
        },
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )
  }

  return (
    <section>
      <SectionTitle>{t('timeline.title')}</SectionTitle>
      <Card className="p-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Field label={t('timeline.noteLabel')}>
            {(a) => <Textarea {...a} rows={2} className="min-h-0" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('timeline.notePlaceholder')} maxLength={5000} />}
          </Field>
          {manual && (
            <Field label={t('timeline.progressLabel')}>
              {(a) => <Input {...a} type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />}
            </Field>
          )}
          <Button type="submit" size="sm" className="self-end" disabled={add.isPending}>
            {t('timeline.add')}
          </Button>
        </form>

        <ol className="border-border mt-4 flex flex-col gap-3 border-t pt-4">
          {goal.updates.length === 0 && <li className="text-subtle text-sm">{t('timeline.empty')}</li>}
          {goal.updates.map((u) => {
            const summary = describe(u)
            return (
              <li key={u.id} className="text-sm">
                <p className="text-subtle text-xs">{formatInstant(u.created_at, i18n.language, me.settings.timezone)}</p>
                {summary && <p className="font-medium">{summary}</p>}
                {u.note && <p className="text-muted whitespace-pre-line">{u.note}</p>}
              </li>
            )
          })}
        </ol>
      </Card>
    </section>
  )
}
