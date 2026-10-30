import { ChevronRight, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router'

import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { cn } from '../components/ui/cn'
import { Dialog } from '../components/ui/Dialog'
import { Switch } from '../components/ui/Switch'
import { FocusWidget } from '../features/focus/FocusWidget'
import { usePomodoroEngine } from '../features/focus/usePomodoroEngine'
import { lazyWithReload } from '../lib/lazyPage'
import { notifyBlocker, onPrefsChange, readPrefs, setRemindersEnabled, startReminders } from '../lib/reminders'
import { onSoundChange, play, setSoundEnabled, soundEnabled } from '../lib/sound'
import { useMe } from '../features/auth/AuthProvider'
import { CreateMenu, CreateSheets, type Sheet } from './CreateMenu'
import { ErrorBoundary } from './ErrorBoundary'
import { OfflineBanner, UpdatePrompt } from './OfflineBanner'
import { NAV_ITEMS } from './nav'

const STORAGE_KEY = 'lifeos.sidebarCollapsed'

// The Academia scene is its own chunk: only people using that theme download it
const StudyScene = lazyWithReload(() => import('../components/academia/StudyScene'))
const AchievementWatcher = lazyWithReload(() => import('../features/achievements/AchievementWatcher'))
const subscribeLook = (notify: () => void) => {
  const mo = new MutationObserver(notify)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-look'] })
  return () => mo.disconnect()
}
const isAcademia = () => document.documentElement.dataset.look === 'academia'

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const isActivePath = (pathname: string, to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))

export function AppShell() {
  const { t } = useTranslation()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [moreOpen, setMoreOpen] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  useReminderLoop()
  const me = useMe()
  const academia = useSyncExternalStore(subscribeLook, isAcademia)

  const toggleCollapsed = () => {
    play('tap')
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !c
    })
  }

  const primary = NAV_ITEMS.filter((i) => i.mobilePrimary)
  const secondary = NAV_ITEMS.filter((i) => !i.mobilePrimary)
  const moreActive = secondary.some((i) => isActivePath(location.pathname, i.to))
  // Index of the active tab (the last slot is "More"); drives the sliding highlight
  const activeTab = moreActive ? primary.length : primary.findIndex((i) => isActivePath(location.pathname, i.to))
  const tabCount = primary.length + 1

  const openQuickAdd = () => {
    play('tap')
    setSheet('task')
  }

  return (
    <div className="min-h-dvh md:flex">
      {academia && (
        <Suspense fallback={null}>
          <StudyScene />
        </Suspense>
      )}
      {/* Sidebar (tablet: icons; desktop: icons + labels, collapsible), styled like a macOS source list */}
      <aside
        className={cn(
          'app-sidebar bg-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col md:flex',
          'transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out)]',
          collapsed ? 'w-[72px]' : 'w-[72px] lg:w-60',
        )}
      >
        <div className="flex h-16 items-center gap-3 px-[18px]">
          <img src="/icon.svg" alt="" className="h-9 w-9 shrink-0 rounded-[10px] shadow-[0_2px_6px_rgb(0_0_0/0.15)]" />
          <span className={cn('font-display text-[17px] font-bold tracking-tight', collapsed ? 'hidden' : 'hidden lg:inline')}>
            {t('appName')}
          </span>
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={openQuickAdd}
            aria-label={t('actions.quickAdd')}
            className={cn(
              'pressable bg-accent-fill text-on-accent flex h-10 w-full items-center justify-center gap-2 rounded-xl font-semibold',
              'shadow-[0_2px_8px_-2px_color-mix(in_srgb,var(--accent)_60%,transparent)] hover:brightness-110',
            )}
          >
            <Plus size={18} strokeWidth={2.5} aria-hidden />
            <span className={collapsed ? 'sr-only' : 'sr-only lg:not-sr-only'}>{t('actions.quickAdd')}</span>
          </button>
        </div>

        <nav aria-label={t('nav.main')} className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {NAV_ITEMS.map(({ to, key, icon: Icon, tint }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={t(`nav.${key}`)}
              onClick={() => play('tab')}
              className={({ isActive }) =>
                cn(
                  'pressable flex h-10 items-center gap-3 rounded-[10px] px-3 text-[15px]',
                  isActive ? 'bg-fg/[0.08] text-fg font-semibold' : 'text-muted hover:bg-fg/[0.04] hover:text-fg font-medium',
                )
              }
            >
              <Icon size={19} strokeWidth={2.1} aria-hidden className="shrink-0" style={{ color: tint }} />
              <span className={collapsed ? 'sr-only' : 'sr-only lg:not-sr-only'}>{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/settings"
          className={cn('pressable mx-3 mb-1 flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-fg/[0.04]', collapsed ? 'justify-center' : 'justify-center lg:justify-start')}
          title={me.user.display_name}
        >
          <Avatar emoji={me.settings.avatar} name={me.user.display_name} size={34} />
          <span className={cn('min-w-0 truncate text-[14px] font-semibold', collapsed ? 'hidden' : 'hidden lg:inline')}>{me.user.display_name}</span>
        </NavLink>
        <div className="hidden p-3 pt-1 lg:block">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            className="text-subtle hover:text-fg hover:bg-fg/[0.05]"
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-36 md:px-10 md:pt-10 md:pb-12">
        <div className={cn('mx-auto', location.pathname.startsWith('/calendar') ? 'max-w-7xl' : 'max-w-5xl')}>
          <UpdatePrompt />
          <OfflineBanner />
          <ErrorBoundary resetKey={location.pathname}>
            {/* Keyed by path so each page plays its entrance when you arrive */}
            <div key={location.pathname} className="page-enter">
              <Outlet />
            </div>
          </ErrorBoundary>
        </div>
      </main>

      {/* Phones: a floating frosted tab bar with a sliding highlight, and the round add button beside it */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end gap-2.5 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] md:hidden">
        <nav
          aria-label={t('nav.main')}
          className="material shadow-float pointer-events-auto relative grid h-[62px] flex-1 rounded-full p-1"
          style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
        >
          {activeTab >= 0 && (
            <span
              aria-hidden
              className="bg-fg/[0.08] absolute top-1 bottom-1 left-1 rounded-full transition-transform duration-[460ms] ease-[var(--ease-spring)] dark:bg-white/[0.12]"
              style={{ width: `calc((100% - 8px) / ${tabCount})`, transform: `translateX(${activeTab * 100}%)` }}
            />
          )}
          {primary.map(({ to, key, icon: Icon, tint }, i) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => play('tab')}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-semibold tracking-normal',
                  'transition-colors duration-[var(--duration-fast)]',
                  isActive ? 'text-fg' : 'text-muted',
                )
              }
            >
              <Icon
                key={activeTab === i ? 'on' : 'off'}
                size={22}
                strokeWidth={activeTab === i ? 2.3 : 1.9}
                aria-hidden
                className={activeTab === i ? 'animate-bounce-icon' : undefined}
                style={activeTab === i ? { color: tint } : undefined}
              />
              {t(`nav.${key}`)}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => {
              play('tap')
              setMoreOpen(true)
            }}
            className={cn(
              'relative flex flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-semibold',
              moreActive ? 'text-fg' : 'text-muted',
            )}
          >
            <MoreHorizontal size={22} aria-hidden className={moreActive ? 'animate-bounce-icon text-accent' : undefined} />
            {t('nav.more')}
          </button>
        </nav>

        <CreateMenu sheet={sheet} setSheet={setSheet} />
      </div>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')}>
        {/* An iOS Settings-style grouped list with coloured app-section icons */}
        <div className="bg-sunken/60 stagger overflow-hidden rounded-2xl">
          {secondary.map(({ to, key, icon: Icon, tint }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => {
                play('tab')
                setMoreOpen(false)
              }}
              className="group active:bg-fg/[0.06] flex h-[52px] items-center gap-3.5 pl-3.5"
            >
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-white" style={{ background: tint }}>
                <Icon size={17} strokeWidth={2.2} aria-hidden />
              </span>
              <span className="border-border flex h-full flex-1 items-center justify-between border-b pr-3.5 text-[16px] font-medium group-last:border-b-0">
                {t(`nav.${key}`)}
                <ChevronRight size={18} className="text-border-strong" aria-hidden />
              </span>
            </NavLink>
          ))}
        </div>
        <QuickToggles />
      </Dialog>

      <CreateSheets sheet={sheet} setSheet={setSheet} />
      <FocusWidget />
      <PomodoroEngine />
      <Suspense fallback={null}>
        <AchievementWatcher />
      </Suspense>
    </div>
  )
}

/**
 * Sounds and reminders, one tap away on a phone (they're per-device choices; Settings has the details). Reminders
 * explain what's in the way when the phone can't show notifications.
 */
function QuickToggles() {
  const { t } = useTranslation('settings')
  const [sound, setSound] = useState(soundEnabled)
  const [prefs, setPrefs] = useState(readPrefs)
  const [permission, setPermission] = useState(() => (notifyBlocker() ? 'denied' : Notification.permission))
  useEffect(() => {
    const off = onSoundChange(setSound)
    return () => void off()
  }, [])
  useEffect(() => onPrefsChange(setPrefs), [])
  const blocker = notifyBlocker()
  return (
    <div className="bg-sunken/60 mt-4 overflow-hidden rounded-2xl">
      <label className="border-border flex min-h-[52px] items-center gap-3 border-b px-3.5">
        <span id="quick-sound" className="flex-1 text-[16px] font-medium">
          {t('sound.label')}
        </span>
        <Switch checked={sound} onChange={setSoundEnabled} labelledBy="quick-sound" />
      </label>
      <div className="flex min-h-[52px] items-center gap-3 px-3.5 py-2">
        <div className="min-w-0 flex-1">
          <span id="quick-reminders" className="block text-[16px] font-medium">
            {t('reminders.label')}
          </span>
          {(blocker || permission === 'denied') && <span className="text-subtle block text-[12.5px]">{t(blocker ? `reminders.blocked.${blocker}` : 'reminders.denied')}</span>}
        </div>
        <Switch
          checked={prefs.enabled && permission === 'granted'}
          onChange={async (on) => setPermission(await setRemindersEnabled(on))}
          labelledBy="quick-reminders"
          disabled={!!blocker}
        />
      </div>
    </div>
  )
}

/** Runs the reminder loop while signed in (it does nothing until reminders are switched on in Settings). */
function useReminderLoop() {
  const { t } = useTranslation()
  const me = useMe()
  const ctx = useRef({ t, timeZone: me.settings.timezone, weekStart: me.settings.week_start, locale: me.settings.locale as string })
  ctx.current = { t, timeZone: me.settings.timezone, weekStart: me.settings.week_start, locale: me.settings.locale }
  useEffect(() => startReminders(() => ctx.current), [])
}

/** The tomato clock ticks every second; running it in its own component keeps the rest of the shell still. */
function PomodoroEngine() {
  usePomodoroEngine()
  return null
}
