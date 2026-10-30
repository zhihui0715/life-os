import { BookMarked, CalendarCheck, NotebookPen, SlidersHorizontal, Sun } from 'lucide-react'
import { Suspense, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { cn } from '../../components/ui/cn'
import { SunArt } from '../../components/ui/Illustrations'
import { EmptyState, GroupSection, PageHeader, Skeleton } from '../../components/ui/states'
import { useToast } from '../../components/ui/Toast'
import { useAllDone } from '../../lib/celebrate'
import { lazyWithReload } from '../../lib/lazyPage'
import type { Category, DashboardSectionKey, Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useCategories } from '../tasks/api'
import { QuickAddInput } from '../tasks/QuickAddInput'
import { TaskList, useTaskTotal } from '../tasks/TaskList'
import { CustomizeDialog } from './CustomizeDialog'
import { BalanceSection, FocusSection, GoalsSection, LearningSection, ScheduleSection, ViewAll } from './DashboardSections'
import { HabitsTodayCard, MoodCheckInCard } from './TodayCards'

function greetingKey(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
}

// Loaded just after Home's first paint, so the first download stays within the performance budget
// (the task editor brings the forms library with it).
const TaskDrawer = lazyWithReload(() => import('../tasks/TaskDrawer').then((m) => ({ default: m.TaskDrawer })))
const OneThingCard = lazyWithReload(() => import('./FreshStart').then((m) => ({ default: m.OneThingCard })))
const WelcomeBack = lazyWithReload(() => import('./FreshStart').then((m) => ({ default: m.WelcomeBack })))
const DailySealCard = lazyWithReload(() => import('./DailySeal').then((m) => ({ default: m.DailySealCard })))
const CloseTheBook = lazyWithReload(() => import('./CloseTheBook').then((m) => ({ default: m.CloseTheBook })))

/** Sections that need the full width on large screens. */
const WIDE: DashboardSectionKey[] = ['tasks']

/**
 * Home: every section is backed by real data and supports a decision or a quick action.
 * You choose which sections show and in what order (stored in your settings).
 */
export function HomePage() {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const tz = me.settings.timezone
  const categories = useCategories().data ?? []
  const [open, setOpen] = useState<Task | null>(null)
  const [customizing, setCustomizing] = useState(false)
  const [closing, setClosing] = useState(false)
  const evening = greetingKey(tz) === 'evening'

  const dateLine = new Intl.DateTimeFormat(i18n.language, { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

  const sections: Record<DashboardSectionKey, () => ReactNode> = {
    tasks: () => <TasksSection categories={categories} onOpen={setOpen} />,
    schedule: () => <ScheduleSection />,
    habits: () => <HabitsTodayCard />,
    mood: () => <MoodCheckInCard />,
    focus: () => <FocusSection />,
    balance: () => <BalanceSection />,
    goals: () => <GoalsSection />,
    learning: () => <LearningSection />,
  }
  const visible = me.settings.dashboard_layout.filter((s) => s.visible)

  return (
    <>
      <PageHeader
        title={t(`greeting.${greetingKey(tz)}`, { name: me.user.display_name })}
        subtitle={dateLine}
        icon={<Avatar emoji={me.settings.avatar} name={me.user.display_name} />}
        actions={
          <Button size="sm" variant="secondary" onClick={() => setCustomizing(true)} aria-label={t('home.customize')}>
            <SlidersHorizontal size={15} aria-hidden />
            <span className="hidden sm:inline">{t('home.customize')}</span>
          </Button>
        }
      />

      <Suspense fallback={<Skeleton className="mb-4 h-36 rounded-2xl" />}>
        <OneThingCard />
      </Suspense>
      <Suspense fallback={<Skeleton className="mb-4 h-44 rounded-2xl" />}>
        <DailySealCard />
      </Suspense>
      <div className="mb-3">
        <QuickAddInput view="today" />
      </div>
      {/* Daily and weekly rituals, one tap away */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Shortcut to="/plan" icon={CalendarCheck} label={t('planning:home.plan')} tint="var(--tint-plan)" />
        <Shortcut to="/plan?tab=week" icon={NotebookPen} label={t('planning:home.review')} tint="var(--tint-journal)" />
        {/* The end-of-day ritual; stands out in the evening, when it's time */}
        <button
          type="button"
          onClick={() => setClosing(true)}
          className={cn(
            'pressable bg-surface shadow-card flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-[14px] font-semibold whitespace-nowrap sm:flex-none sm:px-4 dark:shadow-none',
            evening && 'ring-2 ring-[var(--seal-wax)]',
          )}
        >
          <BookMarked size={17} style={{ color: 'var(--seal-wax)' }} aria-hidden />
          {t('planning:home.close')}
        </button>
      </div>

      <div className="stagger grid items-start gap-x-5 gap-y-6 lg:grid-cols-2">
        {visible.map((s) => (
          <div key={s.key} className={cn('min-w-0', WIDE.includes(s.key) && 'lg:col-span-2')}>
            {sections[s.key]()}
          </div>
        ))}
      </div>

      <Suspense fallback={null}>
        <TaskDrawer task={open} categories={categories} onClose={() => setOpen(null)} onOpenTask={setOpen} />
      </Suspense>
      <CustomizeDialog open={customizing} onClose={() => setCustomizing(false)} />
      <Suspense fallback={null}>
        <WelcomeBack />
      </Suspense>
      {closing && (
        <Suspense fallback={null}>
          <CloseTheBook open={closing} onClose={() => setClosing(false)} />
        </Suspense>
      )}
    </>
  )
}

function TasksSection({ categories, onOpen }: { categories: Category[]; onOpen: (t: Task) => void }) {
  const { t } = useTranslation()
  const overdueTotal = useTaskTotal({ view: 'overdue' })
  const todayTotal = useTaskTotal({ view: 'today' })
  const toast = useToast()
  useAllDone(todayTotal == null || overdueTotal == null ? undefined : todayTotal + overdueTotal, () => toast(t('celebrate.allDone')))
  return (
    <div className="flex flex-col gap-6">
      {!!overdueTotal && (
        <GroupSection
          title={t('home.overdue')}
          count={overdueTotal}
          tone="danger"
          action={<ViewAll to="/tasks?view=overdue" label={t('home.viewAll')} />}
        >
          <TaskList filters={{ view: 'overdue' }} categories={categories} onOpen={onOpen} limit={5} compact />
        </GroupSection>
      )}
      <GroupSection title={t('home.today')} count={todayTotal} action={<ViewAll to="/tasks?view=today" label={t('home.viewAll')} />}>
        {todayTotal === 0 ? (
          <EmptyState icon={Sun} art={<SunArt />} title={t('home.todayEmptyTitle')} body={t('home.todayEmptyBody')} />
        ) : (
          <TaskList filters={{ view: 'today' }} categories={categories} onOpen={onOpen} limit={10} compact />
        )}
      </GroupSection>
    </div>
  )
}

function Shortcut({ to, icon: Icon, label, tint }: { to: string; icon: typeof Sun; label: string; tint: string }) {
  return (
    <Link to={to} className="pressable bg-surface shadow-card flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-[14px] font-semibold sm:flex-none sm:px-4 dark:shadow-none">
      <Icon size={17} style={{ color: tint }} aria-hidden />
      {label}
    </Link>
  )
}
