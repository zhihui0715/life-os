import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Flame,
  Home,
  Settings,
  Sparkles,
  Target,
  Timer,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  key: string // translation key under common:nav
  icon: LucideIcon
  mobilePrimary?: boolean // shown in the mobile bottom bar (others go under "More")
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', key: 'home', icon: Home, mobilePrimary: true },
  { to: '/tasks', key: 'tasks', icon: CheckSquare, mobilePrimary: true },
  { to: '/calendar', key: 'calendar', icon: CalendarDays, mobilePrimary: true },
  { to: '/goals', key: 'goals', icon: Target },
  { to: '/habits', key: 'habits', icon: Flame, mobilePrimary: true },
  { to: '/focus', key: 'focus', icon: Timer },
  { to: '/insights', key: 'insights', icon: BarChart3 },
  { to: '/journal', key: 'journal', icon: BookOpen },
  { to: '/assistant', key: 'assistant', icon: Sparkles },
  { to: '/settings', key: 'settings', icon: Settings },
]
