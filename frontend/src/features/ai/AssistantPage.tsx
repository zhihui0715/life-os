import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Eye, ListPlus, Lock, Sparkles, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { Select } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '../../components/ui/states'
import { api } from '../../lib/api'
import { formatInstant } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { useMe } from '../auth/AuthProvider'
import {
  AI_STATUS_KEY,
  useAiStatus,
  type AiCategory,
  type AiKind,
  type AiPreview,
  type AiStatus,
  type DailyPlan,
  type WeeklyReview,
} from './api'

export function AssistantPage() {
  const { t } = useTranslation('ai')
  const status = useAiStatus()

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {status.isPending ? (
        <ListSkeleton rows={4} />
      ) : status.isError ? (
        <ErrorState message={errorMessage(t, status.error)} onRetry={() => status.refetch()} />
      ) : !status.data.configured ? (
        <Card>
          <EmptyState icon={Lock} title={t('unavailable.title')} body={t('unavailable.body')} />
        </Card>
      ) : !status.data.enabled ? (
        <Card>
          <EmptyState
            icon={Sparkles}
            title={t('disabled.title')}
            body={t('disabled.body')}
            action={
              <Link to="/settings" className="text-accent font-medium hover:underline">
                {t('disabled.action')}
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <Usage status={status.data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <DailyPlanCard status={status.data} />
            <WeeklyReviewCard status={status.data} />
          </div>
        </>
      )}
    </>
  )
}

function Usage({ status }: { status: AiStatus }) {
  const { t, i18n } = useTranslation('ai')
  const n = (v: number) => new Intl.NumberFormat(i18n.language).format(v)
  return (
    <p className="text-subtle mb-4 text-sm">
      {t('usage', { used: n(status.used_this_month), budget: n(status.monthly_token_budget), model: status.model })}
    </p>
  )
}

/** Category checkboxes. Journal text is never pre-ticked: you include it per request, every time. */
function CategoryPicker({ status, kind, value, onChange }: { status: AiStatus; kind: AiKind; value: AiCategory[]; onChange: (v: AiCategory[]) => void }) {
  const { t } = useTranslation('ai')
  const rules = status.kinds[kind]
  const toggle = (c: AiCategory, on: boolean) => onChange(on ? [...value, c] : value.filter((x) => x !== c))
  return (
    <fieldset className="mt-3">
      <legend className="mb-1.5 text-sm font-medium">{t('send.legend')}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {rules.allowed.map((c) => (
          <label key={c} className={`flex items-center gap-1.5 text-sm ${c === 'journal_text' ? 'text-danger' : ''}`}>
            <input
              type="checkbox"
              checked={value.includes(c)}
              disabled={rules.required.includes(c)}
              onChange={(e) => toggle(c, e.target.checked)}
            />
            {t(`categories.${c}`)}
          </label>
        ))}
      </div>
      {value.includes('journal_text') && (
        <p className="text-danger mt-2 flex gap-1.5 text-xs">
          <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden />
          {t('send.journalWarning')}
        </p>
      )}
    </fieldset>
  )
}

/** Always-visible line naming every category this request will send. */
function WillSend({ value }: { value: AiCategory[] }) {
  const { t } = useTranslation('ai')
  return (
    <p className="text-muted mt-3 text-xs">
      {t('send.willSend', { list: value.map((c) => t(`categories.${c}`)).join(t('send.separator')) })}
    </p>
  )
}

function useAiRequest<T>(kind: AiKind, path: string) {
  const { t } = useTranslation('ai')
  const qc = useQueryClient()
  const toast = useToast()
  const [preview, setPreview] = useState<AiPreview | null>(null)
  const showPreview = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<AiPreview>('/ai/preview', { method: 'POST', body: { kind, ...body } }),
    onSuccess: setPreview,
    onError: (e) => toast(errorMessage(t, e), 'error'),
  })
  const generate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<T>(path, { method: 'POST', body }),
    onSettled: () => qc.invalidateQueries({ queryKey: AI_STATUS_KEY }), // usage changed (failures are recorded too)
    onError: (e) => toast(errorMessage(t, e), 'error'),
  })
  return { preview, setPreview, showPreview, generate }
}

function PreviewDialog({ preview, onClose }: { preview: AiPreview | null; onClose: () => void }) {
  const { t } = useTranslation('ai')
  return (
    <Dialog open={preview !== null} onClose={onClose} title={t('preview.title')} placement="side">
      {preview && (
        <>
          <p className="text-muted text-sm">
            {t('preview.body', { list: preview.categories.map((c) => t(`categories.${c}`)).join(t('send.separator')), tokens: preview.approx_tokens })}
          </p>
          <pre className="bg-sunken mt-3 max-h-[60vh] overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">{preview.payload}</pre>
        </>
      )}
    </Dialog>
  )
}

// ---------- daily plan ----------

function DailyPlanCard({ status }: { status: AiStatus }) {
  const { t, i18n } = useTranslation('ai')
  const me = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const [cats, setCats] = useState<AiCategory[]>(status.kinds.daily_plan.default)
  const [day, setDay] = useState<'today' | 'tomorrow'>('today')
  const { preview, setPreview, showPreview, generate } = useAiRequest<{ plan: DailyPlan; categories_sent: AiCategory[] }>('daily_plan', '/ai/daily-plan')
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const plan = generate.data?.plan

  const body = { categories: cats, day }
  const run = () =>
    generate.mutate(body, {
      onSuccess: (r) => setChosen(new Set(r.plan.blocks.flatMap((b, i) => (b.issues.length ? [] : [i])))),
    })

  const apply = useMutation({
    mutationFn: async (blocks: DailyPlan['blocks']) => {
      for (const b of blocks) {
        await api('/calendar/events', {
          method: 'POST',
          body: b.task_id
            ? { title: b.title, kind: 'task_block', task_id: b.task_id, starts_at: b.starts_at, ends_at: b.ends_at }
            : { title: b.title, kind: 'appointment', is_hard: false, starts_at: b.starts_at, ends_at: b.ends_at },
        })
      }
      return blocks.length
    },
    onSuccess: (n) => {
      setConfirming(false)
      setChosen(new Set())
      generate.reset()
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast(t('plan.added', { count: n }))
    },
    onError: (e) => {
      setConfirming(false)
      qc.invalidateQueries({ queryKey: ['calendar'] })
      toast(errorMessage(t, e), 'error')
    },
  })
  const time = (iso: string) => formatInstant(iso, i18n.language, me.settings.timezone, { hour: '2-digit', minute: '2-digit', month: undefined, day: undefined })
  const selected = plan ? plan.blocks.filter((_, i) => chosen.has(i)) : []

  return (
    <Card className="p-5">
      <h2 className="font-semibold">{t('plan.title')}</h2>
      <p className="text-subtle mt-1 text-sm">{t('plan.help')}</p>
      <div className="mt-3 flex items-center gap-2">
        <Select aria-label={t('plan.day')} value={day} onChange={(e) => setDay(e.target.value as 'today' | 'tomorrow')} className="w-auto">
          <option value="today">{t('plan.today')}</option>
          <option value="tomorrow">{t('plan.tomorrow')}</option>
        </Select>
      </div>
      <CategoryPicker status={status} kind="daily_plan" value={cats} onChange={setCats} />
      <WillSend value={cats} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={run} disabled={generate.isPending}>
          <Sparkles size={16} aria-hidden />
          {generate.isPending ? t('working') : t('plan.generate')}
        </Button>
        <Button onClick={() => showPreview.mutate(body)} disabled={showPreview.isPending}>
          <Eye size={16} aria-hidden />
          {t('preview.button')}
        </Button>
      </div>

      {plan && (
        <div className="border-border mt-5 border-t pt-4">
          {plan.summary && <p className="text-sm">{plan.summary}</p>}
          {plan.blocks.length === 0 ? (
            <p className="text-muted mt-3 text-sm">{t('plan.empty')}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {plan.blocks.map((b, i) => (
                <li key={i} className="border-border rounded-lg border p-2.5">
                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={chosen.has(i)}
                      onChange={(e) => {
                        const next = new Set(chosen)
                        if (e.target.checked) next.add(i)
                        else next.delete(i)
                        setChosen(next)
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-muted text-sm tabular-nums">
                          {time(b.starts_at)}–{time(b.ends_at)}
                        </span>
                        <span className="font-medium">{b.title}</span>
                      </span>
                      {b.reason && <span className="text-subtle block text-xs">{b.reason}</span>}
                      {b.issues.map((issue) => (
                        <span key={issue} className="text-danger mt-1 flex items-center gap-1 text-xs">
                          <TriangleAlert size={12} aria-hidden />
                          {t(`plan.issues.${issue}`)}
                        </span>
                      ))}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {plan.notes.length > 0 && (
            <ul className="text-muted mt-3 list-disc pl-5 text-sm">
              {plan.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {plan.skipped > 0 && <p className="text-subtle mt-2 text-xs">{t('plan.skipped', { count: plan.skipped })}</p>}
          {plan.blocks.length > 0 && (
            <Button className="mt-4" variant="primary" disabled={!selected.length || apply.isPending} onClick={() => setConfirming(true)}>
              <CalendarPlus size={16} aria-hidden />
              {t('plan.addSelected', { count: selected.length })}
            </Button>
          )}
          <p className="text-subtle mt-2 text-xs">{t('aiNote')}</p>
        </div>
      )}

      <PreviewDialog preview={preview} onClose={() => setPreview(null)} />
      <ConfirmDialog
        open={confirming}
        title={t('plan.confirmTitle')}
        body={t('plan.confirmBody', { count: selected.length })}
        confirmLabel={t('plan.confirm')}
        busy={apply.isPending}
        onConfirm={() => apply.mutate(selected)}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  )
}

// ---------- weekly review ----------

function WeeklyReviewCard({ status }: { status: AiStatus }) {
  const { t } = useTranslation('ai')
  const qc = useQueryClient()
  const toast = useToast()
  const [cats, setCats] = useState<AiCategory[]>(status.kinds.weekly_review.default)
  const [week, setWeek] = useState<'last' | 'this'>('last')
  const { preview, setPreview, showPreview, generate } = useAiRequest<{ review: WeeklyReview }>('weekly_review', '/ai/weekly-review')
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const review = generate.data?.review
  const body = { categories: cats, week }

  const addTask = useMutation({
    mutationFn: (title: string) => api('/tasks', { method: 'POST', body: { title } }),
    onSuccess: (_, title) => {
      setAdding(null)
      setAdded(new Set(added).add(title))
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast(t('review.taskAdded'))
    },
    onError: (e) => {
      setAdding(null)
      toast(errorMessage(t, e), 'error')
    },
  })

  return (
    <Card className="p-5">
      <h2 className="font-semibold">{t('review.title')}</h2>
      <p className="text-subtle mt-1 text-sm">{t('review.help')}</p>
      <div className="mt-3">
        <Select aria-label={t('review.week')} value={week} onChange={(e) => setWeek(e.target.value as 'last' | 'this')} className="w-auto">
          <option value="last">{t('review.last')}</option>
          <option value="this">{t('review.this')}</option>
        </Select>
      </div>
      <CategoryPicker status={status} kind="weekly_review" value={cats} onChange={setCats} />
      <WillSend value={cats} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => generate.mutate(body, { onSuccess: () => setAdded(new Set()) })} disabled={generate.isPending || !cats.length}>
          <Sparkles size={16} aria-hidden />
          {generate.isPending ? t('working') : t('review.generate')}
        </Button>
        <Button onClick={() => showPreview.mutate(body)} disabled={showPreview.isPending || !cats.length}>
          <Eye size={16} aria-hidden />
          {t('preview.button')}
        </Button>
      </div>

      {review && (
        <div className="border-border mt-5 flex flex-col gap-3 border-t pt-4 text-sm">
          {review.summary && <p>{review.summary}</p>}
          <ReviewList title={t('review.wins')} items={review.wins} />
          <ReviewList title={t('review.challenges')} items={review.challenges} />
          {review.suggestions.length > 0 && (
            <div>
              <h3 className="mb-1 font-medium">{t('review.suggestions')}</h3>
              <ul className="flex flex-col gap-1.5">
                {review.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <span>{s.text}</span>
                    {s.task_title && (
                      <Button size="sm" variant="ghost" disabled={added.has(s.task_title)} onClick={() => setAdding(s.task_title)}>
                        <ListPlus size={14} aria-hidden />
                        {added.has(s.task_title) ? t('review.added') : t('review.addTask')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {review.reflection_question && <p className="bg-accent-soft rounded-lg p-3 italic">{review.reflection_question}</p>}
          <p className="text-subtle text-xs">{t('aiNote')}</p>
        </div>
      )}

      <PreviewDialog preview={preview} onClose={() => setPreview(null)} />
      <ConfirmDialog
        open={adding !== null}
        title={t('review.confirmTitle')}
        body={t('review.confirmBody', { title: adding ?? '' })}
        confirmLabel={t('review.addTask')}
        busy={addTask.isPending}
        onConfirm={() => adding && addTask.mutate(adding)}
        onCancel={() => setAdding(null)}
      />
    </Card>
  )
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <h3 className="mb-1 font-medium">{title}</h3>
      <ul className="list-disc pl-5">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  )
}
