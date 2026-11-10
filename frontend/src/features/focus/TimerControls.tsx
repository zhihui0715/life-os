import { Volume1, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../components/ui/cn'
import { Input } from '../../components/ui/Field'
import { ChoiceChip } from '../../components/ui/Segments'
import { AMBIENCES, previewAmbience, setAmbiencePrefs, useAmbiencePrefs, type Ambience } from '../../lib/ambience'

/**
 * A length picker: quick preset chips plus "Custom", which opens a minutes box for any whole number in [min, max].
 * The value updates as soon as a valid number is typed; leaving the box snaps anything out of range back into it.
 */
export function MinutesPicker({
  label,
  values,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  values: number[]
  value: number
  onChange: (minutes: number) => void
  min: number
  max: number
}) {
  const { t } = useTranslation('focus')
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [custom, setCustom] = useState(() => !values.includes(value))
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    if (document.activeElement !== input.current) setDraft(String(value))
  }, [value])

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)))
  const commit = () => {
    const n = Number(draft)
    const v = draft.trim() === '' || !Number.isFinite(n) ? value : clamp(n)
    setDraft(String(v))
    if (v !== value) onChange(v)
  }

  return (
    <fieldset>
      <legend className="text-muted mb-2 px-1 text-[13px] font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {values.map((m) => (
          <ChoiceChip key={m} selected={!custom && value === m} onClick={() => { setCustom(false); onChange(m) }}>
            {t('timer.minutes', { count: m })}
          </ChoiceChip>
        ))}
        <ChoiceChip selected={custom} onClick={() => { setCustom(true); requestAnimationFrame(() => input.current?.select()) }}>
          {custom && values.includes(value) === false ? t('timer.minutes', { count: value }) : t('timer.custom')}
        </ChoiceChip>
      </div>
      {custom && (
        <div className="mt-2 flex items-center gap-2 px-1">
          <Input
            ref={input}
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={draft}
            aria-label={t('timer.customLabel', { label })}
            aria-describedby={`${id}-range`}
            className="h-10 w-24 text-center tabular-nums"
            onChange={(e) => {
              setDraft(e.target.value)
              const n = Number(e.target.value)
              if (e.target.value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max) onChange(n)
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
                input.current?.blur()
              }
            }}
          />
          <span className="text-muted text-[14px]">{t('timer.minutesUnit')}</span>
          <span id={`${id}-range`} className="text-subtle text-xs">{t('timer.range', { min, max })}</span>
        </div>
      )}
    </fieldset>
  )
}

const ICONS: Record<Ambience, string> = { off: '🔇', piano: '🎹', rain: '🌧️', waves: '🌊', fire: '🔥', brown: '🌫️', tick: '🕰️', tones: '🎵' }

/**
 * Background sound for the timer. Before a session (`preview`), picking a sound plays a few seconds of it;
 * during one, the change is heard straight away.
 */
export function AmbiencePicker({ preview = false, className }: { preview?: boolean; className?: string }) {
  const { t } = useTranslation('focus')
  const { kind, volume } = useAmbiencePrefs()
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  return (
    <fieldset className={cn('w-full', className)}>
      <legend className="text-muted mb-2 px-1 text-[13px] font-medium">{t('sound.title')}</legend>
      <div className="flex flex-wrap gap-2">
        {AMBIENCES.map((a) => (
          <ChoiceChip key={a} selected={kind === a} onClick={() => {
            setAmbiencePrefs({ kind: a })
            if (preview && a !== 'off') previewAmbience()
          }}>
            <span aria-hidden className="mr-1">{ICONS[a]}</span>
            {t(`sound.kinds.${a}`)}
          </ChoiceChip>
        ))}
      </div>
      {kind !== 'off' && (
        <label className="mt-3 flex items-center gap-3 px-1">
          <VolumeIcon size={18} className="text-muted shrink-0" aria-hidden />
          <span className="sr-only">{t('sound.volume')}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(e) => {
              setAmbiencePrefs({ volume: Number(e.target.value) / 100 })
              if (preview) previewAmbience()
            }}
            className="w-full max-w-64 accent-[var(--accent)]"
          />
          <span className="text-subtle w-9 text-right text-xs tabular-nums">{Math.round(volume * 100)}%</span>
        </label>
      )}
      <p className="text-subtle mt-2 px-1 text-xs">{t('sound.hint')}</p>
    </fieldset>
  )
}
