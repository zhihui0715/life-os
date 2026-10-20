import { MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router'

import { Button } from '../components/ui/Button'
import { cn } from '../components/ui/cn'
import { Dialog } from '../components/ui/Dialog'
import { QuickAddDialog } from '../features/tasks/QuickAddDialog'
import { NAV_ITEMS } from './nav'

const STORAGE_KEY = 'lifeos.sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const { t } = useTranslation()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [moreOpen, setMoreOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !c
    })
  }

  const secondary = NAV_ITEMS.filter((i) => !i.mobilePrimary)
  const moreActive = secondary.some((i) => location.pathname.startsWith(i.to))

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar: tablet (icons) and desktop (icons + labels, collapsible) */}
      <aside
        className={cn(
          'border-border bg-surface sticky top-0 hidden h-dvh shrink-0 flex-col border-r md:flex',
          collapsed ? 'w-16' : 'w-16 lg:w-56',
        )}
      >
        <div className="flex h-14 items-center gap-2.5 px-4">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <span className={cn('font-semibold', collapsed ? 'hidden' : 'hidden lg:inline')}>{t('appName')}</span>
        </div>
        <nav aria-label={t('nav.main')} className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV_ITEMS.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={t(`nav.${key}`)}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-3 rounded-md px-3 font-medium transition-colors',
                  isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-sunken hover:text-fg',
                )
              }
            >
              <Icon size={18} aria-hidden className="shrink-0" />
              <span className={collapsed ? 'sr-only' : 'sr-only lg:not-sr-only'}>{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="hidden p-2 lg:block">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-10">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile: floating quick-add + bottom navigation */}
      <Button
        variant="primary"
        size="icon"
        aria-label={t('actions.quickAdd')}
        onClick={() => setQuickAddOpen(true)}
        className="shadow-pop fixed right-4 bottom-20 z-20 h-14 w-14 rounded-full md:hidden"
      >
        <Plus size={24} aria-hidden />
      </Button>

      <nav
        aria-label={t('nav.main')}
        className="border-border bg-surface fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV_ITEMS.filter((i) => i.mobilePrimary).map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-accent' : 'text-subtle')
            }
          >
            <Icon size={20} aria-hidden />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', moreActive ? 'text-accent' : 'text-subtle')}
        >
          <MoreHorizontal size={20} aria-hidden />
          {t('nav.more')}
        </button>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')}>
        <div className="flex flex-col gap-1">
          {secondary.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              className="hover:bg-sunken flex h-12 items-center gap-3 rounded-md px-3 font-medium"
            >
              <Icon size={20} aria-hidden className="text-muted" />
              {t(`nav.${key}`)}
            </NavLink>
          ))}
        </div>
      </Dialog>

      <QuickAddDialog open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  )
}
