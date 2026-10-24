import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, FileUp, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { api, ApiError } from '../../lib/api'
import { errorMessage } from '../../lib/errors'

interface TableDiff {
  current: number
  in_backup: number
  added: number
  changed: number
  unchanged: number
  removed: number
}

interface Preview {
  account_empty: boolean
  exported_at: string | null
  account: { email: string; display_name: string } | null
  tables: Record<string, TableDiff>
  preview_token: string
}

/** Tables shown in the preview, in a friendly order; link tables (task_tags…) are folded into their parent. */
const SHOWN = [
  'tasks', 'goals', 'goal_milestones', 'schedule_events', 'habits', 'habit_logs', 'journal_entries',
  'activity_logs', 'focus_sessions', 'categories', 'tags', 'user_settings',
] as const

/** Browsers download a GET with Content-Disposition: attachment without leaving the page. */
function download(path: string) {
  window.location.assign(`/api/v1${path}`)
}

export function BackupCard() {
  const { t, i18n } = useTranslation('settings')
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [backup, setBackup] = useState<unknown>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [understood, setUnderstood] = useState(false)

  const check = useMutation({
    mutationFn: (b: unknown) => api<Preview>('/backup/import/preview', { method: 'POST', body: { backup: b } }),
    onSuccess: (p) => {
      setPreview(p)
      setUnderstood(false)
    },
    onError: (e) => toast(describe(e), 'error'),
  })

  const restore = useMutation({
    mutationFn: () =>
      api('/backup/import/apply', {
        method: 'POST',
        body: { backup, preview_token: preview?.preview_token, replace_existing: !preview?.account_empty },
      }),
    onSuccess: () => {
      close()
      qc.invalidateQueries() // every page now shows the restored data (and settings such as language)
      toast(t('backup.restored'))
    },
    onError: (e) => toast(describe(e), 'error'),
  })

  function describe(e: unknown) {
    // For a rejected file the server's reason (which section, which field) is the useful part.
    const detail = e instanceof ApiError && e.code === 'backup_invalid' ? ` (${e.message})` : ''
    return errorMessage(t, e) + detail
  }

  function close() {
    setPreview(null)
    setBackup(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      toast(t('backup.notJson'), 'error')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setBackup(parsed)
    check.mutate(parsed)
  }

  const removed = preview ? Object.values(preview.tables).reduce((n, d) => n + d.removed + d.changed, 0) : 0
  const needsConsent = preview !== null && !preview.account_empty
  const exportedAt = preview?.exported_at
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(preview.exported_at))
    : t('backup.unknownDate')

  return (
    <Card className="mb-4 p-5">
      <h2 className="text-[17px] font-semibold tracking-tight">{t('backup.title')}</h2>

      {/* The readable copy: a laid-out document to read, print or keep */}
      <div className="bg-sunken/70 mt-4 flex items-start gap-3.5 rounded-2xl p-4">
        <span className="bg-danger-soft text-danger flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
          <FileText size={22} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t('backup.pdfTitle')}</p>
          <p className="text-subtle mt-0.5 mb-3 text-[13px]">{t('backup.pdfHelp')}</p>
          <Button variant="primary" size="sm" onClick={() => download('/backup/export/report.pdf')}>
            <Download size={14} aria-hidden />
            {t('backup.pdfDownload')}
          </Button>
        </div>
      </div>

      <p className="mt-5 font-semibold">{t('backup.fileTitle')}</p>
      <p className="text-subtle mt-0.5 mb-3 text-[13px]">{t('backup.help')}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => download('/backup/export')}>
          <Download size={16} aria-hidden />
          {t('backup.download')}
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={check.isPending}>
          <FileUp size={16} aria-hidden />
          {check.isPending ? t('backup.checking') : t('backup.restore')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>

      <Dialog
        open={preview !== null}
        onClose={close}
        title={t('backup.previewTitle')}
        footer={
          <div className="ml-auto flex gap-2">
            <Button onClick={close}>{t('common:actions.cancel')}</Button>
            <Button
              variant={needsConsent ? 'danger' : 'primary'}
              disabled={restore.isPending || (needsConsent && !understood)}
              onClick={() => restore.mutate()}
            >
              {needsConsent ? t('backup.replace') : t('backup.restoreNow')}
            </Button>
          </div>
        }
      >
        {preview && (
          <>
            <p className="text-muted text-sm">
              {t('backup.fileFrom', { date: exportedAt, email: preview.account?.email ?? '—' })}
            </p>
            <p className="text-muted mt-1 text-sm">{t('backup.checked')}</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-subtle text-left">
                    <th className="py-1 pr-2 font-medium">{t('backup.col.what')}</th>
                    <th className="px-2 py-1 text-right font-medium">{t('backup.col.now')}</th>
                    <th className="px-2 py-1 text-right font-medium">{t('backup.col.after')}</th>
                    <th className="py-1 pl-2 text-right font-medium">{t('backup.col.lost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {SHOWN.map((name) => {
                    const d = preview.tables[name]
                    if (!d) return null
                    const lost = d.removed + d.changed
                    return (
                      <tr key={name} className="border-border border-t">
                        <td className="py-1.5 pr-2">{t(`backup.tables.${name}`)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{d.current}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{d.in_backup}</td>
                        <td className={`py-1.5 pl-2 text-right tabular-nums ${lost ? 'text-danger font-semibold' : 'text-subtle'}`}>
                          {lost || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-subtle mt-2 text-xs">{t('backup.lostHelp')}</p>

            {needsConsent && (
              <div className="bg-danger-soft mt-4 rounded-2xl p-3">
                <p className="flex gap-2 text-sm font-medium">
                  <TriangleAlert size={16} className="text-danger mt-0.5 shrink-0" aria-hidden />
                  {removed ? t('backup.warnReplace', { count: removed }) : t('backup.warnReplaceSame')}
                </p>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                  {t('backup.understand')}
                </label>
                <p className="text-subtle mt-2 text-xs">{t('backup.tip')}</p>
              </div>
            )}
          </>
        )}
      </Dialog>
    </Card>
  )
}
