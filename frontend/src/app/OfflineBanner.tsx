import type { TFunction } from 'i18next'
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'

import { Button } from '../components/ui/Button'
import { dismissFailures, useOnline, useOutbox, type OutboxItem } from '../lib/offline'

/** What a queued action was, in words: "Complete “Essay”". */
function describe(t: TFunction, item: OutboxItem) {
  const key = item.kind === 'habit_check_in' && item.method === 'DELETE' ? 'habit_uncheck' : item.kind
  return t(`offline.actions.${key}`, { label: item.label })
}

/**
 * Honest status line above every page: offline (and what still works), changes waiting to sync, and changes the
 * server refused. Hidden when everything is normal.
 */
export function OfflineBanner() {
  const { t } = useTranslation()
  const online = useOnline()
  const { items, failed, syncing } = useOutbox()
  const [showDetails, setShowDetails] = useState(false)

  if (online && !items.length && !failed.length) return null

  return (
    <div className="mb-4 flex flex-col gap-2" role="status">
      {!online && (
        <div className="bg-warning-soft rounded-2xl px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <CloudOff size={16} aria-hidden />
            {t('offline.title')}
          </p>
          <p className="text-muted mt-1">{t('offline.works')}</p>
          <p className="text-muted mt-1">{t('offline.needsConnection')}</p>
        </div>
      )}
      {items.length > 0 && (
        <div className="bg-surface shadow-card rounded-2xl px-4 py-2.5 dark:shadow-none text-sm">
          <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setShowDetails(!showDetails)} aria-expanded={showDetails}>
            <RefreshCw size={14} className={syncing ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden />
            <span className="flex-1">{t(online ? 'offline.syncing' : 'offline.waiting', { count: items.length })}</span>
            <span className="text-accent text-xs">{t(showDetails ? 'offline.hide' : 'offline.show')}</span>
          </button>
          {showDetails && (
            <ul className="text-muted mt-2 list-disc pl-6 text-xs">
              {items.map((i) => (
                <li key={i.id}>{describe(t, i)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {failed.length > 0 && (
        <div className="bg-danger-soft rounded-2xl px-4 py-2.5 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert size={14} className="text-danger" aria-hidden />
            {t('offline.failed', { count: failed.length })}
          </p>
          <ul className="text-muted mt-1 list-disc pl-6 text-xs">
            {failed.map((f) => (
              <li key={f.item.id}>
                {describe(t, f.item)} — {t(`errors.${f.code}`, { defaultValue: t('errors.unknown') })}
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="mt-1" onClick={dismissFailures}>
            {t('offline.dismiss')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** A new version of the app was downloaded in the background; it's used after "Reload" (never mid-typing). */
export function UpdatePrompt() {
  const { t } = useTranslation()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div className="bg-accent-soft mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-2.5 text-sm" role="status">
      <span className="flex-1">{t('offline.update')}</span>
      <Button size="sm" variant="primary" onClick={() => updateServiceWorker(true)}>
        {t('offline.reload')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        {t('offline.later')}
      </Button>
    </div>
  )
}
