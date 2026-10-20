import { Clock, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { Card, ErrorState, ListSkeleton, PageHeader } from '../../components/ui/states'
import { addDays, formatDay, formatInstant, formatMinutes, todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { ActivityLog, FocusSession } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useCategories } from '../tasks/api'
import { ActivityDialog } from './ActivityDialog'
import { useActivity, useActivitySummary, useFocusAction, useFocusSessions } from './api'
import { FocusTimer } from './FocusTimer'

export function FocusPage() {
  const { t, i18n } = useTranslation('focus')
  const me = useMe()
  const today = todayInZone(me.settings.timezone)
  const weekAgo = addDays(today, -6)
  const sessions = useFocusSessions(today, today)
  const week = useFocusSessions(weekAgo, today)
  const activity = useActivity(weekAgo, today)
  const summary = useActivitySummary(weekAgo, today)
  const categories = useCategories().data ?? []
  const [editing, setEditing] = useState<ActivityLog | null>(null)
  const [adding, setAdding] = useState(false)
  const [correcting, setCorrecting] = useState<FocusSession | null>(null)
  const lang = i18n.language
  const catName = (id: string | null) => categories.find((c) => c.id === id)

  const byDay = new Map<string, ActivityLog[]>()
  for (const a of activity.data ?? []) byDay.set(a.log_date, [...(byDay.get(a.log_date) ?? []), a])

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={<Button onClick={() => setAdding(true)}><Plus size={16} aria-hidden />{t('log.add')}</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <FocusTimer />

          <Card className="p-4">
            <h2 className="mb-2 font-semibold">{t('log.title')}</h2>
            {activity.isPending ? (
              <ListSkeleton rows={3} />
            ) : activity.isError ? (
              <ErrorState message={errorMessage(t, activity.error)} onRetry={() => activity.refetch()} />
            ) : byDay.size === 0 ? (
              <p className="text-subtle text-sm">{t('log.empty')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {[...byDay.entries()].map(([day, logs]) => (
                  <section key={day}>
                    <h3 className="text-subtle mb-1 text-xs font-medium">
                      {formatDay(day, lang, { weekday: 'long' })} · {formatMinutes(logs.reduce((s, l) => s + l.duration_minutes, 0), lang)}
                    </h3>
                    <ul className="divide-border divide-y">
                      {logs.map((l) => {
                        const cat = catName(l.category_id)
                        return (
                          <li key={l.id}>
                            <button type="button" onClick={() => setEditing(l)} className="hover:bg-sunken flex w-full items-center gap-3 rounded-md px-2 py-2 text-left">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cat?.color ?? 'var(--border-strong)' }} aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm">{l.title}</span>
                                <span className="text-subtle text-xs">
                                  {cat?.name ?? t('summary.uncategorised')}
                                  {l.focus_session_id && <> · <Clock size={11} className="inline" aria-hidden /> {t('log.fromFocus')}</>}
                                </span>
                              </span>
                              <span className="text-muted shrink-0 text-sm tabular-nums">{formatMinutes(l.duration_minutes, lang)}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">{t('summary.title')}</h2>
            {summary.data && (
              <>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div><p className="text-xl font-semibold tabular-nums">{formatMinutes(summary.data.total_minutes, lang)}</p><p className="text-subtle text-xs">{t('summary.total')}</p></div>
                  <div><p className="text-xl font-semibold tabular-nums">{formatMinutes(summary.data.learning_minutes, lang)}</p><p className="text-subtle text-xs">{t('summary.learning')}</p></div>
                </div>
                <ul className="flex flex-col gap-2">
                  {summary.data.by_category.map((c) => (
                    <li key={c.category_id ?? 'none'} className="text-sm">
                      <div className="mb-0.5 flex justify-between gap-2">
                        <span className="truncate">{c.name ?? t('summary.uncategorised')}</span>
                        <span className="text-muted tabular-nums">{formatMinutes(c.minutes, lang)}</span>
                      </div>
                      <div className="bg-sunken h-1.5 overflow-hidden rounded-full">
                        <div className="h-full rounded-full" style={{ width: `${(100 * c.minutes) / summary.data!.total_minutes}%`, background: c.color ?? 'var(--border-strong)' }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {week.data && (
              <p className="text-subtle border-border mt-3 border-t pt-3 text-xs">
                {t('summary.focus')}: {t('summary.focusDetail', { completed: week.data.completed_count, interrupted: week.data.interrupted_count })}
              </p>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 font-semibold">{t('today')}</h2>
            {!sessions.data?.items.length ? (
              <p className="text-subtle text-sm">{t('noSessions')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sessions.data.items.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium',
                      s.state === 'completed' ? 'bg-success-soft text-success' : s.state === 'interrupted' ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent')}>
                      {t(`state.${s.state}`)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.task_title ?? s.label ?? t('timer.noTask')}</span>
                    <span className="text-subtle text-xs tabular-nums">
                      {formatInstant(s.started_at, lang, me.settings.timezone, { month: undefined, day: undefined })}
                      {s.actual_minutes != null && ` · ${formatMinutes(s.actual_minutes, lang)}`}
                    </span>
                    {(s.state === 'completed' || s.state === 'interrupted') && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setCorrecting(s)}>{t('correct.button')}</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ActivityDialog open={adding || !!editing} log={editing ?? undefined} onClose={() => { setAdding(false); setEditing(null) }} />
      <CorrectDialog session={correcting} onClose={() => setCorrecting(null)} />
    </>
  )
}

function CorrectDialog({ session, onClose }: { session: FocusSession | null; onClose: () => void }) {
  const { t } = useTranslation('focus')
  const toast = useToast()
  const action = useFocusAction()
  const [minutes, setMinutes] = useState('')
  if (!session) return null
  const value = minutes === '' ? String(session.actual_minutes ?? 0) : minutes
  return (
    <Dialog
      open
      onClose={() => { setMinutes(''); onClose() }}
      title={t('correct.title')}
      footer={
        <div className="ml-auto flex gap-2">
          <Button onClick={() => { setMinutes(''); onClose() }}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" disabled={action.isPending || !(Number(value) >= 0)}
            onClick={() => action.mutate({ kind: 'correct', id: session.id, actual_minutes: Math.round(Number(value)) },
              { onSuccess: () => { toast(t('toast.corrected')); setMinutes(''); onClose() }, onError: (e) => toast(errorMessage(t, e), 'error') })}>
            {t('common:actions.save')}
          </Button>
        </div>
      }
    >
      <Field label={t('correct.minutes')} help={t('correct.help')}>
        {(a) => <Input {...a} type="number" min={0} max={1440} value={value} onChange={(e) => setMinutes(e.target.value)} />}
      </Field>
    </Dialog>
  )
}
