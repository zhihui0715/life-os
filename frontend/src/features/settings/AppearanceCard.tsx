import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../components/ui/cn'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { play } from '../../lib/sound'
import { ACCENT_SWATCH, ACCENTS, ARTWORKS, BACKGROUNDS, setLook, type BackgroundKind } from '../../lib/theme'
import type { Me, UserSettings } from '../../lib/types'
import { ME_KEY, useMe } from '../auth/AuthProvider'

const AVATARS = [
  '🌱', '🌸', '🌻', '🍀', '🌙', '⭐', '☀️', '🌈', '🔥', '⚡', '🌊', '🏔️',
  '🦊', '🐼', '🐱', '🐶', '🦉', '🐧', '🦋', '🐝', '🐢', '🦁', '🐳', '🐙',
  '🚀', '🎯', '🎨', '📚', '🎧', '🎸', '⚽', '🧘', '☕', '🍵', '🍅', '💎',
]
const KINDS: BackgroundKind[] = ['plain', 'gradient', 'art', 'paper']

/** Accent colour, background and avatar. Saved to the account, so every device gets the same look. */
export function AppearanceCard() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const s = me.settings
  const save = useMutation({
    mutationFn: (changes: Partial<UserSettings>) => api<UserSettings>('/settings', { method: 'PATCH', body: changes }),
    onSuccess: (settings) => qc.setQueryData<Me>(ME_KEY, (old) => old && { ...old, settings }),
    onError: (e) => {
      setLook(s.accent, s.background) // put the previous look back
      toast(errorMessage(t, e), 'error')
    },
  })

  const pickAccent = (accent: string) => {
    play('tap')
    setLook(accent, s.background) // instant; the server catches up
    save.mutate({ accent })
  }
  const pickBackground = (background: string) => {
    play('tap')
    setLook(s.accent, background)
    save.mutate({ background })
  }
  const pickAvatar = (avatar: string) => {
    play('tap')
    save.mutate({ avatar: avatar === s.avatar ? '' : avatar })
  }
  const art = ARTWORKS[s.background]

  return (
    <Card className="mb-4 p-5">
      <h2 className="text-[17px] font-semibold tracking-tight">{t('appearance.title')}</h2>

      <p className="text-muted mt-4 mb-2.5 text-[13px] font-medium">{t('appearance.accent')}</p>
      <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={t('appearance.accent')}>
        {ACCENTS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={s.accent === a}
            aria-label={t(`appearance.accents.${a}`)}
            title={t(`appearance.accents.${a}`)}
            onClick={() => pickAccent(a)}
            className="pressable relative flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: ACCENT_SWATCH[a] }}
          >
            {s.accent === a && (
              <>
                <span className="absolute -inset-[4px] rounded-full ring-2" style={{ ['--tw-ring-color' as string]: ACCENT_SWATCH[a] }} aria-hidden />
                <Check size={17} strokeWidth={3} className="animate-pop text-white drop-shadow" aria-hidden />
              </>
            )}
          </button>
        ))}
      </div>

      {KINDS.map((kind) => (
        <div key={kind}>
          <p className="text-muted mt-5 mb-2.5 text-[13px] font-medium">{t(`appearance.kinds.${kind}`)}</p>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6" role="radiogroup" aria-label={t(`appearance.kinds.${kind}`)}>
            {BACKGROUNDS.filter((b) => b.kind === kind).map((b) => {
              const on = s.background === b.id
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickBackground(b.id)}
                  className="group pressable flex flex-col items-stretch gap-1.5 text-left"
                >
                  <span
                    data-tile={b.id}
                    className={cn(
                      'bg-tile relative block aspect-[4/5] overflow-hidden rounded-xl transition-shadow',
                      on ? 'shadow-[0_0_0_2.5px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--border)]',
                    )}
                  >
                    {kind === 'art' && (
                      <img src={`/wallpapers/thumbs/${b.id}.jpg`} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    )}
                    {/* a mini card, so you can see how content will sit on it */}
                    <span className="bg-surface/90 absolute inset-x-2 bottom-2 block h-4 rounded-md" aria-hidden />
                    {on && (
                      <span className="bg-accent-fill text-on-accent animate-pop absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full">
                        <Check size={12} strokeWidth={3} aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className={cn('truncate text-[12px] font-medium', on ? 'text-fg' : 'text-subtle')}>{t(`appearance.backgrounds.${b.id}`)}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {art && (
        <a href={art.url} target="_blank" rel="noreferrer" className="text-subtle hover:text-fg mt-3 inline-flex items-center gap-1 text-xs">
          {t('appearance.credit', { title: art.title, artist: art.artist, year: art.year })}
          <ExternalLink size={11} aria-hidden />
        </a>
      )}

      <p className="text-muted mt-6 mb-2.5 text-[13px] font-medium">{t('appearance.avatar')}</p>
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12" role="radiogroup" aria-label={t('appearance.avatar')}>
        {AVATARS.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={s.avatar === e}
            aria-label={e}
            onClick={() => pickAvatar(e)}
            className={cn(
              'pressable flex aspect-square items-center justify-center rounded-xl text-[22px]',
              s.avatar === e ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--accent)]' : 'hover:bg-sunken',
            )}
          >
            <span className={s.avatar === e ? 'animate-pop' : undefined}>{e}</span>
          </button>
        ))}
      </div>
      <p className="text-subtle mt-2 text-xs">{t('appearance.avatarHelp')}</p>
    </Card>
  )
}
