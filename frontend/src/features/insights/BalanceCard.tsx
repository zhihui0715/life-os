import { Info, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../components/ui/cn'
import { Card } from '../../components/ui/states'
import type { Overview } from '../../lib/types'
import { ProgressBar } from '../../components/ui/ProgressBar'

/** Signed change vs the previous period, with an icon so direction is never colour-only. */
export function Delta({ now, before, unit = '' }: { now: number | null; before: number | null; unit?: string }) {
  const { t } = useTranslation('insights')
  if (now == null || before == null) return null
  const d = Math.round((now - before) * 10) / 10
  const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', d > 0 ? 'text-success' : d < 0 ? 'text-danger' : 'text-subtle')}>
      <Icon size={13} aria-hidden />
      {t('score.vsPrevious', { delta: `${d > 0 ? '+' : ''}${d}${unit}` })}
    </span>
  )
}

/** A 0–100 meter whose unfilled track is a lighter step of the same hue. */
export function Meter({ value, label }: { value: number | null; label: string }) {
  const { t } = useTranslation('insights')
  if (value == null) {
    // No data: a dashed empty bar, announced as such (a meter must have a value).
    return <div role="img" aria-label={`${label}: ${t('score.noComponentData')}`} className="border-border-strong h-2 rounded-full border border-dashed" />
  }
  return (
    <ProgressBar value={value} role="meter" label={label} />
  )
}

export function BalanceCard({ data }: { data: Overview }) {
  const { t } = useTranslation('insights')
  const s = data.score
  const enabled = s.components.filter((c) => c.enabled && c.weight > 0)
  const used = enabled.filter((c) => c.has_data)

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-semibold tracking-tight">{t('score.title')}</h2>
        <span className="bg-sunken text-muted rounded-full px-2 py-0.5 text-xs font-medium">{t('score.experimental')}</span>
      </div>

      {s.value == null ? (
        <div className="my-3">
          <p className="text-subtle text-3xl font-semibold">—</p>
          <p className="font-medium">{t('score.noData')}</p>
          <p className="text-muted mt-1 text-sm">{t('score.noDataHelp')}</p>
        </div>
      ) : (
        <div className="my-3 flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="font-display text-[64px] leading-none font-bold tracking-tight tabular-nums">{Math.round(s.value)}</span>
          <span className="text-subtle mb-1.5">/ 100</span>
          <span className="mb-2"><Delta now={s.value} before={data.previous.score} /></span>
        </div>
      )}
      <p className="text-subtle mb-4 text-xs">
        {t('score.coverage', { used: used.length, total: enabled.length, coverage: Math.round(s.coverage) })}
      </p>

      <ul className="flex flex-col gap-3">
        {s.components.map((c) => {
          const name = t(`components.${c.key}`)
          return (
            <li key={c.key} className={cn(!c.enabled && 'opacity-60')}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-medium">{name}</span>
                <span className="text-subtle text-xs">
                  {!c.enabled ? t('score.disabled')
                    : c.has_data ? `${Math.round(c.score!)} · ${t('score.effective', { weight: Math.round(c.effective_weight) })}`
                    : `${t('score.noComponentData')} · ${t('score.weight', { weight: c.weight })}`}
                </span>
              </div>
              <Meter value={c.enabled ? c.score : null} label={name} />
              <details className="mt-1">
                <summary className="text-subtle hover:text-fg inline-flex cursor-pointer items-center gap-1 text-xs select-none">
                  <Info size={12} aria-hidden />{t('metrics.how')}
                </summary>
                <p className="text-muted mt-1 text-xs">{t(`formula.${c.key}`)}</p>
              </details>
            </li>
          )
        })}
      </ul>

      <details className="border-border mt-4 border-t pt-3">
        <summary className="text-accent cursor-pointer text-sm font-medium select-none">{t('score.howTitle')}</summary>
        <p className="text-muted mt-2 text-sm">{t('score.how')}</p>
      </details>
      <p className="text-subtle mt-3 text-xs">{t('score.disclaimer')}</p>
    </Card>
  )
}
