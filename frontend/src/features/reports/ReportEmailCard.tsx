import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import './i18n'
import { Button } from '../../components/ui/Button'
import { Switch } from '../../components/ui/Switch'
import { Card } from '../../components/ui/states'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import type { Me, UserSettings } from '../../lib/types'
import { ME_KEY, useMe } from '../auth/AuthProvider'
import { useEmailStatus, useSendTestEmail, type ReportKind } from './api'

const KINDS: ReportKind[] = ['day', 'week', 'month']

/** Which reports arrive by email (saved to the account; the server sends them with `flask send-reports`). */
export function ReportEmailCard() {
  const { t } = useTranslation('reports')
  const me = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const status = useEmailStatus()
  const test = useSendTestEmail()
  const prefs = me.settings.report_emails
  const save = useMutation({
    mutationFn: (changes: Partial<Record<ReportKind, boolean>>) => api<UserSettings>('/settings', { method: 'PATCH', body: { report_emails: changes } }),
    onSuccess: (settings) => qc.setQueryData<Me>(ME_KEY, (old) => old && { ...old, settings }),
    onError: (e) => toast(errorMessage(t, e), 'error'),
  })
  const configured = status.data?.configured ?? false

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
        <Mail size={18} className="text-subtle" aria-hidden />
        {t('email.title')}
      </h2>
      <p className="text-subtle mt-0.5 text-[13px]">{t('email.help')}</p>
      {status.data && !configured && <p className="bg-warning-soft text-warning mt-3 rounded-xl px-3.5 py-2.5 text-[13px]">{t('email.notConfigured')}</p>}
      {configured && <p className="text-subtle mt-2 text-[13px]">{t('email.to', { to: status.data?.to })}</p>}
      <div className="mt-4 flex flex-col gap-4">
        {KINDS.map((k) => (
          <label key={k} className="flex items-center gap-4">
            <span id={`report-email-${k}`} className="min-w-0 flex-1 text-[15px]">
              {t(`email.${k}`)}
            </span>
            <Switch checked={!!prefs?.[k]} onChange={(on) => save.mutate({ [k]: on })} labelledBy={`report-email-${k}`} disabled={!configured} />
          </label>
        ))}
      </div>
      {configured && (
        <Button
          size="sm"
          className="mt-4"
          disabled={test.isPending}
          onClick={() =>
            test.mutate(undefined, {
              onSuccess: (r) => toast(t('email.testSent', { to: r.sent_to })),
              onError: (e) => toast(errorMessage(t, e), 'error'),
            })
          }
        >
          <Send size={14} aria-hidden />
          {t('email.test')}
        </Button>
      )}
    </Card>
  )
}
