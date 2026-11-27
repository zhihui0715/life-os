import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckSquare, FileUp, Repeat } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { api, ApiError } from '../../lib/api'
import { errorMessage } from '../../lib/errors'

interface Preview {
  format: 'ics' | 'todoist' | 'google_tasks'
  kind: 'events' | 'tasks'
  new: number
  subtasks: number
  duplicates: number
  skipped: number
  items: { title: string; when: string | null; note: string | null; repeats: boolean; subtasks: number }[]
  skipped_items: { title: string; reason: string }[]
}

interface Result {
  added: number
  subtasks: number
  duplicates: number
  skipped: number
}

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Bring things in from other apps: a calendar file (.ics, e.g. exported from Google Calendar or Outlook), a Todoist
 * CSV export, or Google Tasks' Tasks.json (Google Takeout). The server recognises which; you see what will be added
 * (things already here are skipped) and confirm. Nothing is changed until then.
 */
export function ImportCard() {
  const { t, i18n } = useTranslation('settings')
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [content, setContent] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  const describe = (e: unknown) => (e instanceof ApiError && e.code === 'import_unreadable' ? t('import.unreadable') : errorMessage(t, e))

  const check = useMutation({
    mutationFn: (text: string) => api<Preview>('/import/preview', { method: 'POST', body: { content: text } }),
    onSuccess: setPreview,
    onError: (e) => {
      toast(describe(e), 'error')
      reset()
    },
  })
  const run = useMutation({
    mutationFn: () => api<Result>('/import/apply', { method: 'POST', body: { content } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: preview?.kind === 'events' ? ['calendar'] : ['tasks'] })
      toast(t(preview?.kind === 'events' ? 'import.doneEvents' : 'import.doneTasks', { count: r.added }))
      reset()
    },
    onError: (e) => toast(describe(e), 'error'),
  })

  function reset() {
    setPreview(null)
    setContent(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      toast(t('import.tooBig'), 'error')
      reset()
      return
    }
    const text = await file.text()
    setContent(text)
    check.mutate(text)
  }

  const when = (w: string | null) => {
    if (!w) return null
    const timed = w.length > 10
    return new Intl.DateTimeFormat(i18n.language, timed ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' } : { dateStyle: 'medium', timeZone: 'UTC' })
      .format(new Date(timed ? `${w.slice(0, 16)}:00Z` : `${w}T00:00:00Z`)) // shown as written: already in your time zone
  }
  const Icon = preview?.kind === 'events' ? CalendarDays : CheckSquare

  return (
    <Card className="mb-4 p-5">
      <h2 className="text-[17px] font-semibold tracking-tight">{t('import.title')}</h2>
      <p className="text-subtle mt-0.5 mb-3 text-[13px]">{t('import.help')}</p>
      <Button onClick={() => fileRef.current?.click()} disabled={check.isPending}>
        <FileUp size={16} aria-hidden />
        {check.isPending ? t('import.checking') : t('import.choose')}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".ics,.ical,text/calendar,.csv,text/csv,.json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <Dialog
        open={preview !== null}
        onClose={reset}
        title={t('import.previewTitle')}
        footer={
          <div className="ml-auto flex gap-2">
            <Button onClick={reset}>{t('common:actions.cancel')}</Button>
            <Button variant="primary" disabled={run.isPending || !preview?.new} onClick={() => run.mutate()}>
              {run.isPending ? t('import.adding') : t('import.add', { count: preview?.new ?? 0 })}
            </Button>
          </div>
        }
      >
        {preview && (
          <>
            <p className="text-muted text-sm">{t(`import.formats.${preview.format}`)}</p>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              <li>
                <strong>{t(preview.kind === 'events' ? 'import.newEvents' : 'import.newTasks', { count: preview.new })}</strong>
                {preview.subtasks > 0 && ` · ${t('import.subtasks', { count: preview.subtasks })}`}
              </li>
              {preview.duplicates > 0 && <li className="text-muted">{t('import.duplicates', { count: preview.duplicates })}</li>}
              {preview.skipped > 0 && <li className="text-muted">{t('import.skipped', { count: preview.skipped })}</li>}
            </ul>

            {preview.items.length > 0 && (
              <ul className="bg-sunken/60 mt-4 max-h-72 overflow-y-auto rounded-2xl p-2 text-sm">
                {preview.items.map((it, i) => (
                  <li key={i} className="flex items-start gap-2.5 px-2 py-1.5">
                    <Icon size={15} className="text-subtle mt-0.5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="truncate">{it.title}</span>
                        {it.repeats && <Repeat size={12} className="text-accent shrink-0" aria-label={t('import.repeats')} role="img" />}
                      </span>
                      <span className="text-subtle block text-[12px]">
                        {[when(it.when), it.subtasks ? t('import.subtasks', { count: it.subtasks }) : '', it.note ? t(`import.notes.${it.note}`) : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </li>
                ))}
                {preview.new > preview.items.length && (
                  <li className="text-subtle px-2 py-1.5 text-[12px]">{t('import.more', { count: preview.new - preview.items.length })}</li>
                )}
              </ul>
            )}

            {preview.skipped_items.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="text-muted cursor-pointer">{t('import.skippedWhy')}</summary>
                <ul className="text-subtle mt-1 flex flex-col gap-0.5 pl-4 text-[13px]">
                  {preview.skipped_items.map((s, i) => (
                    <li key={i}>
                      {s.title} — {t(`import.reasons.${s.reason}`)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {preview.new === 0 && <p className="text-muted mt-4 text-sm">{t('import.nothingNew')}</p>}
          </>
        )}
      </Dialog>
    </Card>
  )
}
