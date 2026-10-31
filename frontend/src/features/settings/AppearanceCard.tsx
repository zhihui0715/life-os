import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Check, ExternalLink, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { BookAvatar } from '../../components/ui/BookAvatar'
import { SCENE_TILES } from '../../lib/academia/tiles'
import { BOOK_AVATARS } from '../../components/ui/bookAvatars'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { play } from '../../lib/sound'
import {
  ACCENT_SWATCH,
  ACCENTS,
  activeScene,
  ARTWORKS,
  BACKGROUNDS,
  DARK_GLASS,
  DEFAULT_THEME,
  GLASS_THEMES,
  GLASS_TILES,
  isGlass,
  setLook,
  setTheme,
  type BackgroundKind,
  type Scene,
  type ThemeSetting,
} from '../../lib/theme'
import type { Me, UserSettings } from '../../lib/types'
import { ME_KEY, useMe } from '../auth/AuthProvider'

const KINDS: BackgroundKind[] = ['plain', 'gradient', 'art', 'paper']
const NON_ACADEMIA: ThemeSetting = DEFAULT_THEME // where turning Academia off goes
const CLASSIC = ['light', 'dark', 'system'] as const
/** Theme, accent colour, background and avatar. Saved to the account, so every device gets the same look. */
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
  const academia = s.theme === 'academia'
  const glass = isGlass(s.theme)
  // Academia shows its scenes instead of the usual backgrounds; the selected one is what's on screen
  const kinds: BackgroundKind[] = academia ? ['scene'] : KINDS
  const shown = academia ? activeScene(s.background) : s.background

  return (
    <Card className="mb-4 p-5">
      <h2 className="text-[17px] font-semibold tracking-tight">{t('appearance.title')}</h2>

      <p className="text-muted mt-4 mb-1 text-[13px] font-medium">{t('appearance.glass.title')}</p>
      <p className="text-subtle mb-2.5 text-[12.5px]">{t('appearance.glass.body')}</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label={t('appearance.glass.title')}>
        {GLASS_THEMES.map((id) => {
          const on = s.theme === id
          const [t0, t1, t2, t3, t4] = GLASS_TILES[id]
          const dark = DARK_GLASS.has(id)
          return (
            <button key={id} type="button" role="radio" aria-checked={on} onClick={() => pickTheme(id)} className="group pressable flex flex-col items-stretch gap-1.5 text-left">
              <span
                className={cn(
                  'relative block aspect-[16/10] overflow-hidden rounded-2xl transition-shadow',
                  on ? 'shadow-[0_0_0_2.5px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--border)]',
                )}
                style={{
                  background: `radial-gradient(60% 60% at 18% 18%, ${t1}, transparent 70%), radial-gradient(55% 55% at 85% 25%, ${t2}, transparent 70%), radial-gradient(65% 60% at 70% 92%, ${t3}, transparent 70%), radial-gradient(55% 55% at 10% 90%, ${t4}, transparent 70%), ${t0}`,
                }}
              >
                {/* a little frosted pane, so you can see how cards will sit on it */}
                <span
                  className={cn(
                    'absolute inset-x-2.5 bottom-2.5 flex h-7 items-center gap-1.5 rounded-lg px-2 backdrop-blur-md transition-transform duration-300 group-hover:-translate-y-0.5',
                    dark ? 'bg-white/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]' : 'bg-white/55 shadow-[inset_0_1px_0_rgb(255_255_255/0.9)]',
                  )}
                  aria-hidden
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t1 }} />
                  <span className={cn('h-1.5 flex-1 rounded-full', dark ? 'bg-white/25' : 'bg-black/15')} />
                </span>
                {on && (
                  <span className="bg-accent-fill text-on-accent animate-pop absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full">
                    <Check size={12} strokeWidth={3} aria-hidden />
                  </span>
                )}
              </span>
              <span className={cn('flex items-center gap-1 truncate text-[12.5px] font-medium', on ? 'text-fg' : 'text-subtle')}>
                {dark ? <Moon size={11} aria-label={t('appearance.glass.dark')} /> : <Sun size={11} aria-label={t('appearance.glass.light')} />}
                {t(`theme.${id}`)}
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-muted mt-5 mb-1 text-[13px] font-medium">{t('appearance.classic.title')}</p>
      <p className="text-subtle mb-2.5 text-[12.5px]">{t('appearance.classic.body')}</p>
      <div className="bg-sunken inline-flex rounded-xl p-1" role="radiogroup" aria-label={t('appearance.classic.title')}>
        {CLASSIC.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={s.theme === v}
            onClick={() => pickTheme(v)}
            className={cn('pressable rounded-lg px-3.5 py-1.5 text-[13.5px] font-medium', s.theme === v ? 'bg-solid text-fg shadow-card' : 'text-muted hover:text-fg')}
          >
            {t(`appearance.classic.${v}`)}
          </button>
        ))}
      </div>

      {/* Academia: a theme of its own, offered here where people pick a look */}
      <div className="mt-4 flex items-center gap-3 overflow-hidden rounded-2xl p-3.5 text-[#f2e8d4]" style={{ background: SCENE_TILES.library }}>
        <BookOpen size={20} className="shrink-0 drop-shadow-[0_0_6px_rgb(255_200_120/0.7)]" aria-hidden />
        <div className="min-w-0 flex-1 rounded-lg bg-[#1a120c]/70 px-2.5 py-1.5">
          <p className="font-display text-[17px] font-semibold" style={{ fontFamily: "'EB Garamond Variable', Georgia, serif" }}>
            {t('appearance.academia.title')}
          </p>
          <p className="text-[12.5px] text-[#f2e8d4]/85">{t(academia ? 'appearance.academia.on' : 'appearance.academia.body')}</p>
        </div>
        <Button size="sm" variant={academia ? 'secondary' : 'primary'} onClick={() => pickTheme(academia ? NON_ACADEMIA : 'academia')} aria-pressed={academia}>
          {t(academia ? 'appearance.academia.turnOff' : 'appearance.academia.try')}
        </Button>
      </div>

      {glass ? (
        <p className="text-subtle mt-4 text-[12.5px]">{t('appearance.glass.accentNote')}</p>
      ) : (
        <>
          <p className="text-muted mt-4 mb-2.5 text-[13px] font-medium">{t('appearance.accent')}</p>
          {academia && <p className="text-subtle -mt-1.5 mb-2.5 text-[12.5px]">{t('appearance.academia.accentNote')}</p>}
          <div className={cn('flex flex-wrap gap-2.5', academia && 'pointer-events-none opacity-40')} role="radiogroup" aria-label={t('appearance.accent')} aria-disabled={academia}>
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
                        style={kind === 'scene' ? { background: SCENE_TILES[b.id as Scene] } : undefined}
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
        </>
      )}

      <p className="text-muted mt-6 mb-2.5 text-[13px] font-medium">{t('appearance.avatar')}</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" role="radiogroup" aria-label={t('appearance.avatar')}>
        {BOOK_AVATARS.map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={s.avatar === b}
            aria-label={t(`appearance.bookNames.${b}`)}
            title={t(`appearance.bookNames.${b}`)}
            onClick={() => pickAvatar(b)}
            className={cn(
              'pressable flex aspect-square items-center justify-center rounded-2xl',
              s.avatar === b ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--accent)]' : 'bg-sunken/60 hover:bg-sunken',
            )}
          >
            <span className={s.avatar === b ? 'animate-pop' : undefined}>
              <BookAvatar id={b} size={68} />
            </span>
          </button>
        ))}
      </div>
      <p className="text-subtle mt-2 text-xs">{t('appearance.avatarHelp')}</p>
    </Card>
  )
}
