import { ChevronLeft, ChevronRight, Lock, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker, useSearchParams } from 'react-router'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Input, Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { Card, ErrorState, ListSkeleton, PageHeader } from '../../components/ui/states'
import { addDays, formatDay, todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { JOURNAL_TEXT_FIELDS, type JournalEntry, type JournalTextField } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useDeleteEntry, useEntries, useEntry, useSaveEntry } from './api'
import { MoodPicker } from './MoodPicker'

type Draft = Record<JournalTextField, string> & { mood: number | null; energy: number | null }
const PROMPTS = JOURNAL_TEXT_FIELDS.filter((f) => f !== 'body')

function toDraft(e: JournalEntry | null | undefined): Draft {
  const text = Object.fromEntries(JOURNAL_TEXT_FIELDS.map((f) => [f, e?.[f] ?? ''])) as Record<JournalTextField, string>
  return { ...text, mood: e?.mood ?? null, energy: e?.energy ?? null }
}

export function JournalPage() {
  const { t, i18n } = useTranslation('journal')
  const me = useMe()
  const toast = useToast()
  const today = todayInZone(me.settings.timezone)
  const [params, setParams] = useSearchParams()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today
  const entry = useEntry(date)
  const save = useSaveEntry()
  const remove = useDeleteEntry()
  const [draft, setDraft] = useState<Draft>(() => toDraft(null))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const list = useEntries(q)

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  // Load the stored entry into the editor whenever the day (or the saved version) changes.
  useEffect(() => {
    if (entry.data !== undefined) setDraft(toDraft(entry.data))
  }, [entry.data, date])

  const saved = useMemo(() => toDraft(entry.data), [entry.data])
  const dirty = entry.data !== undefined && JSON.stringify(draft) !== JSON.stringify(saved)

  // Don't lose writing: ask before leaving the page (in-app navigation and closing the tab).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const go = (d: string) => {
    if (dirty && !window.confirm(t('leave'))) return
    setParams(d === today ? {} : { date: d })
  }

  const doSave = () => {
    const body: Record<string, string | number | null> = {}
    for (const f of JOURNAL_TEXT_FIELDS) if (draft[f] !== saved[f]) body[f] = draft[f]
    if (draft.mood !== saved.mood) body.mood = draft.mood
    if (draft.energy !== saved.energy) body.energy = draft.energy
    save.mutate({ date, ...body }, { onSuccess: () => toast(t('toast.saved')), onError: (e) => toast(errorMessage(t, e), 'error') })
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const longDate = formatDay(date, i18n.language, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const status = save.isPending ? t('status.saving') : dirty ? t('status.unsaved') : entry.data ? t('status.saved') : t('status.new')

  return (
    <>
      <PageHeader title={t('title')} subtitle={undefined} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button size="icon" variant="ghost" aria-label={t('prev')} onClick={() => go(addDays(date, -1))}>
              <ChevronLeft size={18} aria-hidden />
            </Button>
            <h2 className="min-w-0 flex-1 text-center text-[17px] font-semibold tracking-tight sm:flex-none sm:text-left">{longDate}</h2>
            <Button size="icon" variant="ghost" aria-label={t('next')} onClick={() => go(addDays(date, 1))} disabled={date >= addDays(today, 1)}>
              <ChevronRight size={18} aria-hidden />
            </Button>
            <div className="flex items-center gap-2 sm:ml-auto">
              {date !== today && <Button size="sm" onClick={() => go(today)}>{t('today')}</Button>}
              <Input type="date" aria-label={t('pickDate')} className="h-8 w-auto" value={date} max={addDays(today, 1)} onChange={(e) => e.target.value && go(e.target.value)} />
            </div>
          </div>

          {entry.isPending ? (
            <ListSkeleton rows={4} />
          ) : entry.isError ? (
            <ErrorState message={errorMessage(t, entry.error)} onRetry={() => entry.refetch()} />
          ) : (
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); doSave() }}>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <MoodPicker kind="mood" value={draft.mood} onChange={(v) => set('mood', v)} />
                <MoodPicker kind="energy" value={draft.energy} onChange={(v) => set('energy', v)} />
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t('fields.body')}</span>
                <Textarea rows={6} maxLength={20000} placeholder={t('placeholder.body')} value={draft.body} onChange={(e) => set('body', e.target.value)} />
              </label>
              <details className="group" open={PROMPTS.some((f) => saved[f])}>
                <summary className="text-accent cursor-pointer text-sm font-medium select-none">{t('prompts')}</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {PROMPTS.map((f) => (
                    <label key={f} className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">{t(`fields.${f}`)}</span>
                      <Textarea rows={3} className="min-h-0" maxLength={20000} value={draft[f]} onChange={(e) => set(f, e.target.value)} />
                    </label>
                  ))}
                </div>
              </details>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="primary" disabled={!dirty || save.isPending}>{t('common:actions.save')}</Button>
                <span className={cn('text-xs', dirty ? 'text-warning' : 'text-subtle')} aria-live="polite">{status}</span>
                <span className="text-subtle inline-flex items-center gap-1 text-xs"><Lock size={12} aria-hidden />{t('private')}</span>
                {entry.data && (
                  <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft ml-auto" onClick={() => setConfirmDelete(true)}>
                    <Trash2 size={14} aria-hidden />
                    {t('delete.button')}
                  </Button>
                )}
              </div>
            </form>
          )}
        </Card>

        <Card className="p-4">
          <label className="bg-fg/[0.07] focus-within:bg-fg/[0.09] mb-3 flex h-9 items-center gap-2 rounded-xl px-2.5 transition-colors">
            <Search size={15} className="text-subtle shrink-0" aria-hidden />
            <span className="sr-only">{t('search.label')}</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search.placeholder')} maxLength={200} className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
          </label>
          <h2 className="text-muted mb-2 px-1 text-[13px] font-semibold">{q ? t('search.label') : t('recent')}</h2>
          {list.isPending ? (
            <ListSkeleton rows={3} />
          ) : !list.data?.length ? (
            <p className="text-subtle text-sm">{q ? t('search.none') : t('noEntries')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {list.data.map((e) => (
                <li key={e.entry_date}>
                  <button
                    type="button"
                    onClick={() => go(e.entry_date)}
                    className={cn('hover:bg-sunken w-full rounded-xl px-2 py-1.5 text-left', e.entry_date === date && 'bg-accent-soft')}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {formatDay(e.entry_date, i18n.language, { weekday: 'short' })}
                      {e.mood != null && <span aria-label={t('mood.set', { label: t('mood.label'), value: e.mood })}>{['😞', '🙁', '😐', '🙂', '😄'][e.mood - 1]}</span>}
                    </span>
                    {e.preview && <span className="text-subtle line-clamp-2 text-xs">{e.preview}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={t('delete.title')}
        body={t('delete.body', { date: longDate })}
        confirmLabel={t('common:actions.delete')}
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(date, {
            onSuccess: () => { setConfirmDelete(false); toast(t('toast.deleted')) },
            onError: (e) => toast(errorMessage(t, e), 'error'),
          })
        }
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        danger
        title={t('status.unsaved')}
        body={t('leave')}
        confirmLabel={t('common:actions.close')}
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  )
}
