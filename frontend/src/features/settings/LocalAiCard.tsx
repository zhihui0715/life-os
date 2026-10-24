import { useQueryClient } from '@tanstack/react-query'
import { Cpu, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Card } from '../../components/ui/states'
import { AI_STATUS_KEY, useAiStatus } from '../ai/api'

/** Free local AI: whether Ollama is reachable, and the three steps to set it up when it isn't. */
export function LocalAiCard() {
  const { t } = useTranslation('ai')
  const qc = useQueryClient()
  const status = useAiStatus()
  const s = status.data
  const ready = !!s?.running && s.installed
  const state = ready ? 'ready' : s?.running ? 'noModel' : 'off'

  return (
    <Card className="mb-4 p-5">
      <div className="flex items-start gap-3">
        <span className="bg-sunken flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--tint-journal)]">
          <Cpu size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-tight">{t('settings.title')}</h2>
          <p className="text-subtle mt-0.5 text-[13px]">{t('settings.help')}</p>
          <p className="mt-2 flex items-center gap-2 text-[14px] font-medium" role="status">
            <span className={cn('h-2.5 w-2.5 rounded-full', ready ? 'bg-success-fill' : s?.running ? 'bg-warning-fill' : 'bg-border-strong')} aria-hidden />
            {status.isPending ? t('settings.checking') : t(`settings.state.${state}`, { model: s?.model })}
          </p>
        </div>
        <Button size="icon" variant="ghost" aria-label={t('settings.recheck')} onClick={() => qc.invalidateQueries({ queryKey: AI_STATUS_KEY })}>
          <RefreshCw size={16} className={status.isFetching ? 'animate-spin' : undefined} aria-hidden />
        </Button>
      </div>
      {!ready && !status.isPending && (
        <ol className="bg-sunken/70 mt-4 flex list-decimal flex-col gap-1.5 rounded-xl py-3 pr-3 pl-8 text-[14px]">
          <li>
            {t('settings.step1')}{' '}
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="text-accent font-medium underline-offset-2 hover:underline">
              ollama.com/download
            </a>
          </li>
          <li>
            {t('settings.step2')} <code className="bg-surface rounded px-1.5 py-0.5 text-[13px]">ollama pull {s?.model ?? 'qwen2.5:3b'}</code>
          </li>
          <li>{t('settings.step3')}</li>
        </ol>
      )}
    </Card>
  )
}
