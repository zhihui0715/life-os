import { Check, Copy, Link2, Unlink } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { errorMessage, fieldError } from '../../lib/errors'
import { useCalendarLink, useCalendarLinks } from '../calendar/api'

/**
 * Google Calendar, both ways, without signing in to Google:
 * out — a private feed address you add in Google Calendar ("From URL");
 * in — Google's "secret address in iCal format", whose events show here (read-only) and count as busy time.
 */
export function GoogleCalendarCard() {
  const { t } = useTranslation('calendar')
  const toast = useToast()
  const links = useCalendarLinks().data
  const link = useCalendarLink()
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const fail = (e: unknown) => toast(errorMessage(t, e), 'error')

  const copy = async () => {
    if (!links?.feed_url) return
    try {
      await navigator.clipboard.writeText(links.feed_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast(t('google.copyFailed'), 'error')
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    link.mutate(
      { kind: 'google', url: url.trim() },
      {
        onSuccess: (r) => {
          setUrl('')
          toast(t(r.google === 'ok' ? 'google.linked' : 'google.linkedError'), r.google === 'ok' ? undefined : 'error')
        },
        onError: (err) => (fieldError(t, err, 'url') ? undefined : fail(err)),
      },
    )
  }
  const urlError = link.variables?.kind === 'google' && link.variables.url ? fieldError(t, link.error, 'url') : undefined

  return (
    <Card className="mb-4 p-5">
      <h2 className="mb-1 text-[17px] font-semibold">{t('google.title')}</h2>
      <p className="text-muted mb-5 text-sm">{t('google.intro')}</p>

      <section className="mb-6">
        <h3 className="mb-1 text-[15px] font-semibold">{t('google.outTitle')}</h3>
        <p className="text-muted mb-3 text-sm">{t('google.outBody')}</p>
        {links?.feed_url ? (
          <>
            <div className="mb-2 flex gap-2">
              <Input readOnly value={links.feed_url} aria-label={t('google.feedLabel')} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[13px]" />
              <Button onClick={copy} aria-label={t('google.copy')}>
                {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                <span className="hidden sm:inline">{copied ? t('google.copied') : t('google.copy')}</span>
              </Button>
            </div>
            <ol className="text-muted mb-3 list-decimal space-y-0.5 pl-5 text-[13px]">
              <li>{t('google.outStep1')}</li>
              <li>{t('google.outStep2')}</li>
              <li>{t('google.outStep3')}</li>
            </ol>
            <p className="text-subtle mb-3 text-xs">{t('google.outPrivate')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={link.isPending} onClick={() => link.mutate({ kind: 'feed', on: true }, { onSuccess: () => toast(t('google.feedReset')), onError: fail })}>
                {t('google.newAddress')}
              </Button>
              <Button size="sm" variant="ghost" className="text-danger" disabled={link.isPending} onClick={() => link.mutate({ kind: 'feed', on: false }, { onError: fail })}>
                {t('google.stopFeed')}
              </Button>
            </div>
          </>
        ) : (
          <Button variant="primary" disabled={link.isPending || !links} onClick={() => link.mutate({ kind: 'feed', on: true }, { onError: fail })}>
            <Link2 size={16} aria-hidden />
            {t('google.startFeed')}
          </Button>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-[15px] font-semibold">{t('google.inTitle')}</h3>
        {links?.google && links.google !== 'off' ? (
          <>
            <p className={links.google === 'ok' ? 'text-success mb-3 text-sm' : 'text-danger mb-3 text-sm'}>
              {t(links.google === 'ok' ? 'google.inOk' : 'google.inError')}
            </p>
            <Button size="sm" variant="ghost" className="text-danger" disabled={link.isPending} onClick={() => link.mutate({ kind: 'google', url: null }, { onError: fail })}>
              <Unlink size={15} aria-hidden />
              {t('google.unlink')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted mb-2 text-sm">{t('google.inBody')}</p>
            <ol className="text-muted mb-3 list-decimal space-y-0.5 pl-5 text-[13px]">
              <li>{t('google.inStep1')}</li>
              <li>{t('google.inStep2')}</li>
              <li>{t('google.inStep3')}</li>
            </ol>
            <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label={t('google.inLabel')} error={urlError} className="flex-1">
                {(props) => (
                  <Input {...props} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autoComplete="off" spellCheck={false} />
                )}
              </Field>
              <Button type="submit" variant="primary" disabled={!url.trim() || link.isPending}>
                {t('google.link')}
              </Button>
            </form>
          </>
        )}
      </section>
    </Card>
  )
}
