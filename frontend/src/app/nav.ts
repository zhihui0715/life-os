import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  Flame,
  Home,
  ScrollText,
  Settings,
  Target,
  Timer,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  key: string // translation key under common:nav
  icon: LucideIcon
  mobilePrimary?: boolean // shown in the mobile bottom bar (others go under "More")
  tint: string // CSS colour for the section's icon (tokens.css --tint-*)
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', key: 'home', tint: 'var(--tint-home)', icon: Home, mobilePrimary: true },
  { to: '/tasks', key: 'tasks', tint: 'var(--tint-tasks)', icon: CheckSquare, mobilePrimary: true },
  { to: '/calendar', key: 'calendar', tint: 'var(--tint-calendar)', icon: CalendarDays, mobilePrimary: true },
  { to: '/plan', key: 'plan', tint: 'var(--tint-plan)', icon: CalendarCheck },
  { to: '/graph', key: 'graph', tint: 'var(--tint-graph)', icon: Waypoints },
  { to: '/goals', key: 'goals', tint: 'var(--tint-goals)', icon: Target },
  { to: '/habits', key: 'habits', tint: 'var(--tint-habits)', icon: Flame, mobilePrimary: true },
  { to: '/focus', key: 'focus', tint: 'var(--tint-focus)', icon: Timer },
  { to: '/insights', key: 'insights', tint: 'var(--tint-insights)', icon: BarChart3 },
  { to: '/reports', key: 'reports', tint: 'var(--tint-plan)', icon: ScrollText },
  { to: '/journal', key: 'journal', tint: 'var(--tint-journal)', icon: BookOpen },
  { to: '/settings', key: 'settings', tint: 'var(--tint-settings)', icon: Settings },
]
