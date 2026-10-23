import { useTranslation } from 'react-i18next'

import { cn } from '../../components/ui/cn'
import { play } from '../../lib/sound'

const FACES = ['😞', '🙁', '😐', '🙂', '😄']
const BOLTS = ['▁', '▂', '▄', '▆', '█']

/** 1–5 picker for mood or energy. Click the selected value again to clear it. */
export function MoodPicker({ kind, value, onChange, compact }: { kind: 'mood' | 'energy'; value: number | null; onChange: (v: number | null) => void; compact?: boolean }) {
  const { t } = useTranslation('journal')
  const label = kind === 'mood' ? t('mood.label') : t('mood.energy')
  const symbols = kind === 'mood' ? FACES : BOLTS
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-2">
      <span className={cn('text-muted text-[13px] font-semibold', compact ? 'w-12' : 'w-14')}>{label}</span>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={`${t('mood.set', { label, value: v })} · ${t(`mood.${v}`)}`}
            title={t(`mood.${v}`)}
            onClick={() => {
              play('tap')
              onChange(value === v ? null : v)
            }}
            className={cn(
              'pressable flex items-center justify-center rounded-full text-lg',
              compact ? 'h-10 w-10' : 'h-11 w-11',
              value === v ? 'bg-accent-soft animate-pop shadow-[inset_0_0_0_2px_var(--accent)]' : 'bg-sunken hover:bg-border',
              kind === 'energy' && (value === v ? 'text-accent' : 'text-subtle'),
            )}
          >
            {symbols[v - 1]}
          </button>
        ))}
      </div>
    </div>
  )
}
