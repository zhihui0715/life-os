import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { CheckMark } from '../../components/ui/CheckMark'
import { useToast } from '../../components/ui/Toast'
import { errorMessage } from '../../lib/errors'
import { play } from '../../lib/sound'
import { useCreateTask } from '../tasks/api'
import { useAiReady, useBreakdown } from './api'

/**
 * "Break it down" in a task: the local AI suggests small next steps; you tick the ones you want and they become
 * subtasks. Hidden unless Ollama is running on this computer.
 */
export function BreakdownPanel({ taskId }: { taskId: string }) {
  const { t } = useTranslation('ai')
  const ready = useAiReady()
  const toast = useToast()
  const breakdown = useBreakdown()
  const create = useCreateTask()
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const steps = breakdown.data?.steps ?? []

  if (!ready) return null

  const ask = () => {
    play('open')
    breakdown.mutate(taskId, {
      onSuccess: (r) => setPicked(new Set(r.steps.map((_, i) => i))),
      onError: (e) => toast(errorMessage(t, e), 'error'),
    })
  }
  const add = async () => {
    const chosen = steps.filter((_, i) => picked.has(i))
    for (const title of chosen) await create.mutateAsync({ title, parent_task_id: taskId, status: 'todo' })
    play('complete')
    toast(t('breakdown.added', { count: chosen.length }))
    breakdown.reset()
  }

  return (
    <div className="mb-3">
      {steps.length === 0 ? (
        <Button size="sm" variant="secondary" onClick={ask} disabled={breakdown.isPending}>
          <Sparkles size={14} className={breakdown.isPending ? 'animate-spin' : 'text-[var(--tint-journal)]'} aria-hidden />
          {breakdown.isPending ? t('thinking') : t('breakdown.button')}
        </Button>
      ) : (
        <div className="bg-accent-soft/60 page-enter rounded-2xl p-3">
          <p className="text-muted mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
            <Sparkles size={14} className="text-[var(--tint-journal)]" aria-hidden />
            {t('breakdown.title')}
          </p>
          <ul className="stagger flex flex-col">
            {steps.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={picked.has(i)}
                  onClick={() => {
                    const next = new Set(picked)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    setPicked(next)
                  }}
                  className="group/check flex w-full items-start gap-2.5 rounded-lg px-1 py-1.5 text-left"
                >
                  <CheckMark checked={picked.has(i)} shape="square" size={18} />
                  <span className="text-[14px]">{s}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" onClick={add} disabled={!picked.size || create.isPending}>
              {t('breakdown.add', { count: picked.size })}
            </Button>
            <Button size="sm" onClick={() => breakdown.reset()}>{t('dismiss')}</Button>
          </div>
          <p className="text-subtle mt-2 text-[11px]">{t('localNote', { model: breakdown.data?.model })}</p>
        </div>
      )}
    </div>
  )
}
