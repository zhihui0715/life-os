/**
 * "Close the book": a 30-second end of day. See what you did, move what's left to tomorrow in one tap, write one line
 * in the journal, and finish the day on a good note instead of an open list.
 */
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { confetti } from '../../lib/confetti'
import { todayInZone } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { play } from '../../lib/sound'
import { useMe } from '../auth/AuthProvider'
import { useEntry, useSaveEntry } from '../journal/api'
import { useSeals } from '../planning/api'
import { useMoveToTomorrow } from '../tasks/api'
import { useTaskTotal } from '../tasks/TaskList'
import { WaxSeal } from './DailySeal'
import './i18n'

export function CloseTheBook({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('fresh')
  const toast = useToast()
  const today = todayInZone(useMe().settings.timezone)
  const seal = useSeals(1).data?.days.at(-1)
  const left = (useTaskTotal({ view: 'today' }) ?? 0) + (useTaskTotal({ view: 'overdue' }) ?? 0)
  const entry = useEntry(today).data
  const move = useMoveToTomorrow()
  const save = useSaveEntry()
  const [line, setLine] = useState('')
  const [moved, setMoved] = useState<number | null>(null)
  const fail = (e: unknown) => toast(errorMessage(t, e), 'error')

  const finish = () => {
    const done = () => {
      play('success')
      if (seal?.sealed) confetti({ emoji: ['🕯️', '🌙', '✨'] })
      toast(t('closeBook.goodnight'))
      setLine('')
      setMoved(null)
      onClose()
    }
    const text = line.trim()
    if (!text) return done()
    // The line goes at the end of today's journal entry, after anything already written.
    const body = entry?.body ? `${entry.body}\n${text}` : text
    save.mutate({ date: today, body }, { onSuccess: done, onError: fail })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('closeBook.title')}
      footer={
        <Button variant="primary" className="ml-auto" onClick={finish} disabled={save.isPending}>
          {t('closeBook.finish')}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="flex items-center gap-3">
          <WaxSeal sealed={!!seal?.sealed} size={40} />
          <p className="text-[15px]">
            {seal
              ? t('closeBook.summary', { count: seal.tasks_done, minutes: seal.focus_minutes })
              : t('closeBook.summaryLoading')}
            {seal?.sealed && <span className="text-success block text-sm font-medium">{t('closeBook.sealed')}</span>}
          </p>
        </section>

        <section>
          <h3 className="mb-1.5 text-[15px] font-semibold">{t('closeBook.leftTitle')}</h3>
          {moved != null ? (
            <p className="text-success text-sm">{t('closeBook.moved', { count: moved })}</p>
          ) : left > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-muted flex-1 text-sm">{t('closeBook.left', { count: left })}</p>
              <Button
                size="sm"
                disabled={move.isPending}
                onClick={() => move.mutate(undefined, { onSuccess: (r) => setMoved(r.moved), onError: fail })}
              >
                {t('closeBook.move')}
                <ArrowRight size={14} aria-hidden />
              </Button>
            </div>
          ) : (
            <p className="text-muted text-sm">{t('closeBook.nothingLeft')}</p>
          )}
        </section>

        <Field label={t('closeBook.lineLabel')}>
          {(props) => (
            <Textarea {...props} rows={2} maxLength={500} value={line} onChange={(e) => setLine(e.target.value)} placeholder={t('closeBook.linePlaceholder')} />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
