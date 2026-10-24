import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { play } from '../../lib/sound'
import { ACCENT_SWATCH, ACCENTS, activeScene, ARTWORKS, BACKGROUNDS, setLook, setTheme, type BackgroundKind, type Scene, type ThemeSetting } from '../../lib/theme'
import type { Me, UserSettings } from '../../lib/types'
import { ME_KEY, useMe } from '../auth/AuthProvider'

const AVATARS = [
  '🌱', '🌸', '🌻', '🍀', '🌙', '⭐', '☀️', '🌈', '🔥', '⚡', '🌊', '🏔️',
  '🦊', '🐼', '🐱', '🐶', '🦉', '🐧', '🦋', '🐝', '🐢', '🦁', '🐳', '🐙',
  '🚀', '🎯', '🎨', '📚', '🎧', '🎸', '⚽', '🧘', '☕', '🍵', '🍅', '💎',
]
const KINDS: BackgroundKind[] = ['plain', 'gradient', 'art', 'paper']
const NON_COSMOS: ThemeSetting = 'system' // where turning Cosmos off goes
// Still previews of the space scenes for their picker tiles (the real ones are drawn live by SpaceSky). Kept here,
// not in the stylesheet, so only the Settings page carries them.
const SCENE_TILES: Record<Scene, string> = {
  nebula:
    'radial-gradient(1px 1px at 18% 22%, #fff, transparent), radial-gradient(1px 1px at 72% 64%, #fff, transparent), radial-gradient(1px 1px at 40% 80%, #fff, transparent), radial-gradient(at 30% 35%, #7b2fbf 0, transparent 50%), radial-gradient(at 70% 60%, #1f5fd1 0, transparent 50%), radial-gradient(at 25% 20%, #1aa6c2 0, transparent 35%), #060716',
  saturn:
    'radial-gradient(1px 1px at 20% 20%, #fff, transparent), radial-gradient(1px 1px at 60% 30%, #fff, transparent), radial-gradient(circle at 85% 88%, #e2c28e 0, #c08a52 26%, #2a1a10 34%, transparent 35%), radial-gradient(ellipse 80% 22% at 82% 86%, transparent 55%, rgb(232 211 168 / 0.55) 58%, transparent 75%), #05060d',
  aurora:
    'linear-gradient(180deg, transparent 72%, #010306 72%), radial-gradient(ellipse 90% 30% at 50% 38%, rgb(61 255 176 / 0.55), transparent 70%), radial-gradient(ellipse 70% 20% at 40% 25%, rgb(120 120 255 / 0.4), transparent 70%), radial-gradient(1px 1px at 30% 12%, #fff, transparent), #04121c',
  'deep-field':
    'radial-gradient(2px 1px at 20% 30%, #ffcf9a, transparent), radial-gradient(2px 1px at 70% 20%, #a8c4ff, transparent), radial-gradient(3px 1.5px at 45% 65%, #ffe6c7, transparent), radial-gradient(2px 1px at 80% 75%, #d7b8ff, transparent), radial-gradient(1px 1px at 30% 85%, #fff, transparent), radial-gradient(1px 1px at 60% 45%, #fff, transparent), #020207',
  eclipse:
    'radial-gradient(circle at 70% 30%, #020104 0, #020104 13%, #fff3dc 14%, rgb(255 213 154 / 0.5) 19%, transparent 38%), radial-gradient(1px 1px at 20% 70%, #fff, transparent), #0d0710',
}

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
      setTheme(s.theme) // put the previous look back
      setLook(s.accent, s.background)
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
  const pickTheme = (theme: ThemeSetting) => {
    play('tap')
    setTheme(theme)
    save.mutate({ theme })
  }
  const art = ARTWORKS[s.background]
  const cosmos = s.theme === 'cosmos'
  // Cosmos shows its space scenes instead of the usual backgrounds; the selected one is what's on screen
  const kinds: BackgroundKind[] = cosmos ? ['space'] : KINDS
  const shown = cosmos ? activeScene(s.background) : s.background

  return (
    <Card className="mb-4 p-5">
      <h2 className="text-[17px] font-semibold tracking-tight">{t('appearance.title')}</h2>

      {/* Cosmos: a theme of its own, offered here where people pick a look */}
      <div className="mt-4 flex items-center gap-3 overflow-hidden rounded-2xl p-3.5 text-white" style={{ background: SCENE_TILES.nebula }}>
        <Sparkles size={20} className="shrink-0 drop-shadow-[0_0_6px_rgb(255_255_255/0.7)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold">{t('appearance.cosmos.title')}</p>
          <p className="text-[12.5px] text-white/80">{t(cosmos ? 'appearance.cosmos.on' : 'appearance.cosmos.body')}</p>
        </div>
        <Button size="sm" variant={cosmos ? 'secondary' : 'primary'} onClick={() => pickTheme(cosmos ? NON_COSMOS : 'cosmos')} aria-pressed={cosmos}>
          {t(cosmos ? 'appearance.cosmos.turnOff' : 'appearance.cosmos.try')}
        </Button>
      </div>

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

      {kinds.map((kind) => (
        <div key={kind}>
          <p className="text-muted mt-5 mb-2.5 text-[13px] font-medium">{t(`appearance.kinds.${kind}`)}</p>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6" role="radiogroup" aria-label={t(`appearance.kinds.${kind}`)}>
            {BACKGROUNDS.filter((b) => b.kind === kind).map((b) => {
              const on = shown === b.id
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
                    style={kind === 'space' ? { background: SCENE_TILES[b.id as Scene] } : undefined}
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
