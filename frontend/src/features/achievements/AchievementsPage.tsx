import { BookOpen, CheckSquare, Flame, Lock, Stamp, Target, Timer, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import './i18n'
import { cn } from '../../components/ui/cn'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { Card, ErrorState, ListSkeleton, PageHeader } from '../../components/ui/states'
import { formatDay, formatMinutes } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { useAchievements, type Achievement, type AchievementGroup } from './api'

export const GROUPS: { group: AchievementGroup; icon: LucideIcon; tint: string }[] = [
  { group: 'tasks', icon: CheckSquare, tint: 'var(--tint-tasks)' },
  { group: 'seals', icon: Stamp, tint: 'var(--seal-wax)' },
  { group: 'focus', icon: Timer, tint: 'var(--tint-focus)' },
  { group: 'habits', icon: Flame, tint: 'var(--tint-habits)' },
  { group: 'goals', icon: Target, tint: 'var(--tint-goals)' },
  { group: 'journal', icon: BookOpen, tint: 'var(--tint-journal)' },
]

export function AchievementsPage() {
  const { t } = useTranslation('achievements')
  const query = useAchievements()
  const data = query.data

  return (
    <>
      <PageHeader title={t('title')} subtitle={data ? t('subtitle', { unlocked: data.unlocked, total: data.total }) : undefined} />
      {query.isError ? (
        <ErrorState message={errorMessage(t, query.error)} onRetry={() => query.refetch()} />
      ) : !data ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <p className="text-muted mb-3 text-sm">{t('intro')}</p>
          <ProgressBar value={(data.unlocked / data.total) * 100} size="md" label={t('subtitle', { unlocked: data.unlocked, total: data.total })} className="mb-6" />
          <div className="flex flex-col gap-6">
            {GROUPS.map(({ group, icon, tint }) => (
              <section key={group} aria-labelledby={`ach-${group}`}>
                <h2 id={`ach-${group}`} className="mb-2 px-1 text-[17px] font-semibold">
                  {t(`groups.${group}`)}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.items
                    .filter((a) => a.group === group)
                    .map((a) => (
                      <li key={a.key}>
                        <Badge achievement={a} icon={icon} tint={tint} />
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Badge({ achievement: a, icon: Icon, tint }: { achievement: Achievement; icon: LucideIcon; tint: string }) {
  const { t, i18n } = useTranslation('achievements')
  // Focus is counted in minutes; show it the way people think of it (hours).
  const amount = (n: number) => (a.group === 'focus' ? formatMinutes(n, i18n.language) : String(n))
  return (
    <Card className={cn('flex h-full items-center gap-3 p-4', !a.unlocked && 'opacity-80')}>
      <span
        className={cn('relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full', a.unlocked ? 'text-white' : 'bg-sunken text-subtle')}
        style={a.unlocked ? { background: tint } : undefined}
      >
        <Icon size={22} aria-hidden />
        {!a.unlocked && (
          <span className="bg-surface absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full">
            <Lock size={11} aria-hidden />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{t(`items.${a.key}.name`)}</p>
        <p className="text-muted text-[13px] leading-snug">{t(`items.${a.key}.description`)}</p>
        {a.unlocked ? (
          <p className="text-success mt-1 text-xs font-medium">
            {a.unlocked_on ? t('unlockedOn', { date: formatDay(a.unlocked_on, i18n.language) }) : t('unlocked')}
          </p>
        ) : (
          <div className="mt-1.5 flex items-center gap-2">
            <ProgressBar value={(a.progress / a.target) * 100} color={tint} celebrate={false} className="flex-1" />
            <span className="text-subtle shrink-0 text-xs tabular-nums">
              {t('progress', { progress: amount(a.progress), target: amount(a.target) })}
            </span>
          </div>
        )}
        <span className="sr-only">{a.unlocked ? t('unlocked') : t('locked')}</span>
      </div>
    </Card>
  )
}
