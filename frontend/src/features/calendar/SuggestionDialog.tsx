import { CalendarPlus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { ListSkeleton } from '../../components/ui/states'
import { formatInstant, formatMinutes } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import type { SlotSuggestion } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useCreateEvent, useSuggestions } from './api'

export function useWhen() {
  const { i18n } = useTranslation()
  const tz = useMe().settings.timezone
  return (start: string, end: string) => {
    const s = formatInstant(start, i18n.language, tz, { weekday: 'short' })
    const e = formatInstant(end, i18n.language, tz, { month: undefined, day: undefined, hour: 'numeric', minute: '2-digit' })
    return `${s} – ${e}`
  }
}

/** Proposes free slots for one task. Nothing is added until you pick a slot and confirm. */
export function SuggestionDialog({ task, onClose }: { task: { id: string; title: string } | null; onClose: () => void }) {
  const { t, i18n } = useTranslation('calendar')
  const tz = useMe().settings.timezone
  const toast = useToast()
  const when = useWhen()
  const query = useSuggestions(task?.id ?? null)
  const create = useCreateEvent()
  const [picked, setPicked] = useState<SlotSuggestion | null>(null)
  if (!task) return null
  const data = query.data

  const confirm = () =>
    picked &&
    create.mutate(
      { title: task.title, kind: 'task_block', task_id: task.id, starts_at: picked.starts_at, ends_at: picked.ends_at },
      {
        onSuccess: () => {
          toast(t('suggest.added'))
          setPicked(null)
          onClose()
        },
        onError: (e) => toast(errorMessage(t, e), 'error'),
      },
    )

  return (
    <>
      <Dialog open onClose={onClose} title={t('suggest.title', { title: task.title })}>
        {query.isPending || !data ? (
          <ListSkeleton rows={3} />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-muted text-sm">
              {t('suggest.summary', { remaining: formatMinutes(data.remaining_minutes, i18n.language) })}
              {data.due_by && <> · {t('suggest.due', { when: formatInstant(data.due_by, i18n.language, tz, { weekday: 'short' }) })}</>}
            </p>
            {data.assumed_estimate && <p className="text-subtle text-xs">{t('suggest.assumed')}</p>}
            {data.slots.length === 0 ? (
              <p className="bg-warning-soft text-warning rounded-md px-3 py-2 text-sm">{t('suggest.none')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.slots.map((s) => (
                  <li key={s.starts_at} className="bg-sunken/70 flex items-center gap-3 rounded-2xl p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{when(s.starts_at, s.ends_at)}</p>
                      <p className="text-subtle flex flex-wrap items-center gap-x-2 text-xs">
                        {s.reason === 'preferred_time' && <Sparkles size={12} aria-hidden className="text-accent" />}
                        {t(`suggest.${s.reason}`)} · {formatMinutes(s.minutes, i18n.language)}
                        {!s.covers_remaining && <span className="text-warning">· {t('suggest.partial')}</span>}
                      </p>
                    </div>
                    <Button size="sm" variant="primary" onClick={() => setPicked(s)}>
                      <CalendarPlus size={14} aria-hidden />
                      {t('suggest.pick')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!picked}
        title={t('suggest.confirmTitle')}
        body={picked ? t('suggest.confirmBody', { when: when(picked.starts_at, picked.ends_at), title: task.title }) : ''}
        confirmLabel={t('suggest.pick')}
        busy={create.isPending}
        onCancel={() => setPicked(null)}
        onConfirm={confirm}
      />
    </>
  )
}
