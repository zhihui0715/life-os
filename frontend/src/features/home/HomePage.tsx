import { SlidersHorizontal, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { EmptyState, GroupSection, PageHeader } from '../../components/ui/states'
import type { Category, DashboardSectionKey, Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useCategories } from '../tasks/api'
import { QuickAddInput } from '../tasks/QuickAddInput'
import { TaskDrawer } from '../tasks/TaskDrawer'
import { TaskList, useTaskTotal } from '../tasks/TaskList'
import { CustomizeDialog } from './CustomizeDialog'
import { BalanceSection, FocusSection, GoalsSection, LearningSection, ScheduleSection, ViewAll } from './DashboardSections'
import { HabitsTodayCard, MoodCheckInCard } from './TodayCards'

function greetingKey(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
}

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
        actions={
          <Button size="sm" variant="secondary" onClick={() => setCustomizing(true)}>
            <SlidersHorizontal size={15} aria-hidden />
            {t('home.customize')}
          </Button>
        }
      />

      <div className="mb-8">
        <QuickAddInput view="today" />
      </div>

      <div className="stagger grid items-start gap-x-5 gap-y-8 lg:grid-cols-2">
        {visible.map((s) => (
          <div key={s.key} className={cn('min-w-0', WIDE.includes(s.key) && 'lg:col-span-2')}>
            {sections[s.key]()}
          </div>
        ))}
      </div>

      <TaskDrawer task={open} categories={categories} onClose={() => setOpen(null)} onOpenTask={setOpen} />
      <CustomizeDialog open={customizing} onClose={() => setCustomizing(false)} />
    </>
  )
}

function TasksSection({ categories, onOpen }: { categories: Category[]; onOpen: (t: Task) => void }) {
  const { t } = useTranslation()
  const overdueTotal = useTaskTotal({ view: 'overdue' })
  const todayTotal = useTaskTotal({ view: 'today' })
  return (
    <div className="flex flex-col gap-8">
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
          <EmptyState icon={Sun} title={t('home.todayEmptyTitle')} body={t('home.todayEmptyBody')} />
        ) : (
          <TaskList filters={{ view: 'today' }} categories={categories} onOpen={onOpen} limit={10} compact />
        )}
      </GroupSection>
    </div>
  )
}
