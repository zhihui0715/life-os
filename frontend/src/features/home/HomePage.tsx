import { ArrowRight, Sun } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Card, EmptyState, PageHeader } from '../../components/ui/states'
import type { Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useCategories } from '../tasks/api'
import { QuickAddInput } from '../tasks/QuickAddInput'
import { TaskDrawer } from '../tasks/TaskDrawer'
import { TaskList, useTaskTotal } from '../tasks/TaskList'

function greetingKey(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
}

/**
 * Stage 1 home: only sections backed by real data (today's and overdue tasks).
 * Schedule, habits, goals and insights are added as those modules are built (Stage 5 completes the dashboard).
 */
export function HomePage() {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const tz = me.settings.timezone
  const categories = useCategories().data ?? []
  const [open, setOpen] = useState<Task | null>(null)
  const overdueTotal = useTaskTotal('overdue')
  const todayTotal = useTaskTotal('today')

  const dateLine = new Intl.DateTimeFormat(i18n.language, { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

  return (
    <>
      <PageHeader title={t(`greeting.${greetingKey(tz)}`, { name: me.user.display_name })} subtitle={dateLine} />

      <div className="mb-4">
        <QuickAddInput view="today" />
      </div>

      {!!overdueTotal && (
        <Card className="mb-4 overflow-hidden">
          <SectionHeader title={t('home.overdue')} count={overdueTotal} to="/tasks?view=overdue" tone="danger" />
          <TaskList view="overdue" categories={categories} onOpen={setOpen} limit={5} compact />
        </Card>
      )}

      <Card className="overflow-hidden">
        <SectionHeader title={t('home.today')} count={todayTotal} to="/tasks?view=today" />
        {todayTotal === 0 ? (
          <EmptyState icon={Sun} title={t('home.todayEmptyTitle')} body={t('home.todayEmptyBody')} />
        ) : (
          <TaskList view="today" categories={categories} onOpen={setOpen} limit={10} compact />
        )}
      </Card>

      <p className="text-subtle mt-6 text-center text-xs">{t('home.laterNote')}</p>

      <TaskDrawer task={open} categories={categories} onClose={() => setOpen(null)} />
    </>
  )
}

function SectionHeader({ title, count, to, tone }: { title: string; count?: number; to: string; tone?: 'danger' }) {
  const { t } = useTranslation()
  return (
    <div className="border-border flex items-center justify-between border-b px-4 py-3">
      <h2 className={tone === 'danger' ? 'text-danger font-semibold' : 'font-semibold'}>
        {title}
        {count != null && <span className="text-subtle ml-2 font-normal">{count}</span>}
      </h2>
      <Link to={to} className="text-accent inline-flex items-center gap-1 text-sm font-medium hover:underline">
        {t('home.viewAll')}
        <ArrowRight size={14} aria-hidden />
      </Link>
    </div>
  )
}
