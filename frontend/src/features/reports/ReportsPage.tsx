import { CheckCircle2, ChevronLeft, ChevronRight, Download, Flame, NotebookPen, Smile, Target, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import './i18n'
import { Button } from '../../components/ui/Button'
import { ChipTabs } from '../../components/ui/Segments'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { Card, ErrorState, ListSkeleton, PageHeader } from '../../components/ui/states'
import { formatDay, formatMinutes } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { play } from '../../lib/sound'
import { MinutesBars } from '../insights/charts'
import { pdfUrl, useReport, type Report, type ReportKind } from './api'

const KINDS: ReportKind[] = ['day', 'week', 'month']

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function shift(day: string, kind: ReportKind, by: number) {
  const d = new Date(`${day}T12:00:00`)
  if (kind === 'day') d.setDate(d.getDate() + by)
  else if (kind === 'week') d.setDate(d.getDate() + 7 * by)
  else d.setMonth(d.getMonth() + by, 1)
  return iso(d)
}

/**
 * Reports: a day, a week or a month at a glance, compared with the period before — what got done, focus time,
 * habits, goals, where the time went and how the journal felt. Step back and forth through periods, download any of
 * them as a PDF.
 */
export function ReportsPage() {
  const { t, i18n } = useTranslation('reports')
  const [params, setParams] = useSearchParams()
  const kind = (KINDS as string[]).includes(params.get('kind') ?? '') ? (params.get('kind') as ReportKind) : 'week'
  const today = iso(new Date())
  const date = params.get('date') ?? today
  const report = useReport(kind, date)
  const go = (next: { kind?: ReportKind; date?: string }) => {
    play('tap')
    setParams({ kind: next.kind ?? kind, date: next.date ?? date }, { replace: true })
  }
  const r = report.data
  const label = r ? periodLabel(r, i18n.language) : ''

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <ChipTabs items={KINDS} value={kind} onChange={(k) => go({ kind: k })} label={t('kindLabel')} render={(k) => t(`kinds.${k}`)} />

      {/* the period, with steps back and forth */}
      <div className="mb-4 flex items-center gap-2">
        <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={t('previous')} onClick={() => go({ date: shift(date, kind, -1) })}>
          <ChevronLeft size={18} aria-hidden />
        </Button>
        <p className="font-display min-w-0 flex-1 truncate text-center text-[19px] font-semibold" aria-live="polite">
          {label}
          {r && !r.period.complete && <span className="text-subtle ml-2 text-[13px] font-medium">· {t('inProgress')}</span>}
        </p>
        <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={t('next')} disabled={!r || !r.period.complete} onClick={() => go({ date: shift(date, kind, 1) })}>
          <ChevronRight size={18} aria-hidden />
        </Button>
      </div>
      <div className="mb-5 flex flex-wrap justify-center gap-2">
        {date !== today && (
          <Button size="sm" onClick={() => go({ date: today })}>
            {t('current')}
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={() => window.location.assign(pdfUrl(kind, date))}>
          <Download size={14} aria-hidden />
          {t('download')}
        </Button>
      </div>

      {report.isPending ? (
        <ListSkeleton rows={5} />
      ) : report.isError ? (
        <ErrorState message={errorMessage(t, report.error)} onRetry={() => report.refetch()} />
      ) : r ? (
        <ReportBody r={r} />
      ) : null}
    </>
  )
}

function ReportBody({ r }: { r: Report }) {
  const { t, i18n } = useTranslation('reports')
  const lang = i18n.language
  const pct = (v: number | null) => (v == null ? t('noData') : `${Math.round(v)}%`)
  const longest = Math.max(1, ...r.tasks.by_day.map((d) => d.count))

  return (
    <div className="stagger flex flex-col gap-4">
      {/* the headline numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat icon={<Target size={16} />} label={t('score')} value={pct(r.score)} />
        <Stat icon={<CheckCircle2 size={16} />} label={t('done')} value={String(r.tasks.done)} note={t('vsBefore', { n: r.tasks.done_before })} />
        <Stat icon={<Timer size={16} />} label={t('focus')} value={formatMinutes(r.focus.minutes, lang)} note={t('vsBefore', { n: formatMinutes(r.focus.minutes_before, lang) })} />
        <Stat icon={<Flame size={16} />} label={t('habits')} value={pct(r.habits.rate)} />
        <Stat icon={<Smile size={16} />} label={t('mood')} value={r.journal.mood == null ? t('noData') : `${r.journal.mood}/5`} />
      </div>

      {r.kind !== 'day' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-3 text-[17px] font-semibold">{t('doneByDay')}</h2>
            {/* simple bars, labelled, so they read the same to a screen reader */}
            <ul className="flex h-32 items-end gap-1" aria-label={t('doneByDay')}>
              {r.tasks.by_day.map((d) => (
                <li key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" aria-label={`${formatDay(d.date, lang)}: ${d.count}`}>
                  <span className="text-subtle text-[10px] tabular-nums">{d.count || ''}</span>
                  <span className="bg-accent w-full max-w-6 rounded-t-[4px]" style={{ height: `${(d.count / longest) * 100}%`, minHeight: d.count ? 3 : 0 }} />
                  {r.kind === 'week' && <span className="text-subtle text-[10px]">{formatDay(d.date, lang, { weekday: 'narrow', month: undefined, day: undefined })}</span>}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-[17px] font-semibold">{t('focusByDay')}</h2>
            <MinutesBars data={r.focus.by_day} name={t('focusByDay')} />
          </Card>
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-[17px] font-semibold">{t('completed')}</h2>
        <p className="text-subtle mb-3 text-[13px]">
          {t('addedOverdue', { added: r.tasks.added, overdue: r.tasks.overdue })} · {t('events', { count: r.events })}
        </p>
        {r.tasks.list.length ? (
          <ul className="flex flex-col gap-1.5">
            {r.tasks.list.map((task) => (
              <li key={task.completed_at + task.title} className="flex items-start gap-2.5 text-[15px]">
                <CheckCircle2 size={17} className="text-success mt-0.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  {task.title}
                  {task.goal && <span className="text-subtle text-[13px]"> · {task.goal}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-subtle text-[14px]">{t('nothingDone')}</p>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-[17px] font-semibold">{t('habitsTitle')}</h2>
          {r.habits.items.length ? (
            <ul className="flex flex-col gap-2">
              {r.habits.items.map((h) => (
                <li key={h.name} className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="min-w-0 truncate">{h.name}</span>
                  <span className="text-subtle shrink-0 text-[13px] tabular-nums">{t('habitLine', { done: h.done, skipped: h.skipped })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-subtle text-[14px]">{t('noHabits')}</p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-[17px] font-semibold">{t('goalsTitle')}</h2>
          {r.goals.length ? (
            <ul className="flex flex-col gap-3">
              {r.goals.map((g) => (
                <li key={g.title}>
                  <div className="mb-1 flex justify-between gap-3 text-[15px]">
                    <span className="min-w-0 truncate">{g.title}</span>
                    <span className="text-subtle text-[13px] tabular-nums">{pct(g.progress)}</span>
                  </div>
                  <ProgressBar value={g.progress} label={g.title} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-subtle text-[14px]">{t('noGoals')}</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {r.time.by_category.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 text-[17px] font-semibold">{t('timeTitle')}</h2>
            <ul className="flex flex-col gap-2">
              {r.time.by_category.map((c) => (
                <li key={c.name ?? '-'} className="flex items-center gap-2.5 text-[15px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color ?? 'var(--text-subtle)' }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{c.name ?? t('uncategorised')}</span>
                  <span className="text-subtle text-[13px] tabular-nums">{formatMinutes(c.minutes, lang)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 text-[17px] font-semibold">
            <NotebookPen size={17} className="text-subtle" aria-hidden />
            {t('journalTitle')}
          </h2>
          <p className="text-subtle text-[13px]">
            {t('journalLine', { count: r.journal.entries, mood: r.journal.mood ?? '—', energy: r.journal.energy ?? '—' })}
          </p>
          {r.journal.notes.map((n) => (
            <blockquote key={n.date} className="border-accent mt-3 border-l-2 pl-3 text-[15px] whitespace-pre-line italic">
              {n.text}
            </blockquote>
          ))}
        </Card>
      </div>
    </div>
  )
}

function Stat({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note?: string }) {
  return (
    <Card className="p-4">
      <p className="text-subtle flex items-center gap-1.5 text-[12.5px] font-medium">
        <span aria-hidden>{icon}</span>
        {label}
      </p>
      <p className="font-display mt-1 text-[24px] font-semibold tabular-nums">{value}</p>
      {note && <p className="text-subtle text-[12px]">{note}</p>}
    </Card>
  )
}

function periodLabel(r: Report, lang: string) {
  const { start, end } = r.period
  if (r.kind === 'day') return formatDay(start, lang, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  if (r.kind === 'month') return formatDay(start, lang, { month: 'long', year: 'numeric', day: undefined })
  return `${formatDay(start, lang)} – ${formatDay(end, lang, { year: 'numeric' })}`
}

