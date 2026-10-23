import { AlertTriangle, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from './Button'
import { cn } from './cn'

export function EmptyState({ icon: Icon, title, body, action, art }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {art ? (
        <div className="mb-3">{art}</div>
      ) : (
        <div className="relative mb-4 flex h-16 w-16 items-center justify-center">
          <span className="bg-accent-soft animate-breathe absolute inset-0 rounded-full" aria-hidden />
          <Icon size={28} strokeWidth={1.75} className="text-accent relative" aria-hidden />
        </div>
      )}
      <p className="text-[17px] font-semibold">{title}</p>
      {body && <p className="text-subtle mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <div className="bg-danger-soft text-danger animate-pop mb-4 flex h-14 w-14 items-center justify-center rounded-full">
        <AlertTriangle size={24} aria-hidden />
      </div>
      <p className="text-[17px] font-semibold">{t('state.errorTitle')}</p>
      <p className="text-subtle mt-1 max-w-sm">{message ?? t('state.errorBody')}</p>
      {onRetry && (
        <Button className="mt-5" onClick={onRetry}>
          {t('actions.retry')}
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('shimmer rounded-xl', className)} />
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-label={t('state.loading')} className="flex flex-col gap-2.5 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.12 }}>
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  )
}

/**
 * iOS large title. On phones, once the title scrolls under the top edge a frosted bar slides in with
 * the title at 17pt, the way UINavigationBar collapses its large title.
 */
export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { rootMargin: '-8px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <>
      <div
        aria-hidden
        className={cn(
          'material border-border fixed inset-x-0 top-0 z-30 flex h-[calc(env(safe-area-inset-top)+44px)] items-end justify-center border-b pb-2.5 md:hidden',
          'transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)]',
          compact ? 'opacity-100' : 'pointer-events-none -translate-y-1 border-transparent opacity-0',
        )}
      >
        <span className="max-w-[70%] truncate text-[17px] font-semibold tracking-tight">{title}</span>
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 md:mb-6">
        <div className="flex min-w-0 items-end gap-3">
          {icon}
          <div className="min-w-0">
          {subtitle && <p className="text-subtle mb-0.5 text-[13px] font-semibold tracking-normal uppercase md:hidden">{subtitle}</p>}
          <h1 className="font-display text-[32px] leading-[1.1] font-bold tracking-[-0.025em] md:text-[30px]">{title}</h1>
          {subtitle && <p className="text-subtle mt-1 hidden md:block">{subtitle}</p>}
          <div ref={sentinel} className="h-px" aria-hidden />
          </div>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('bg-surface rounded-[18px] shadow-card dark:shadow-none', className)}>{children}</section>
}

/**
 * An iOS grouped-list section: a bold heading (with an optional count and "View all" link) sitting
 * above a white card, instead of a header bar inside it.
 */
export function GroupSection({
  title,
  count,
  action,
  tone,
  className,
  children,
}: {
  title: string
  count?: number
  action?: ReactNode
  tone?: 'danger'
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 className={cn('font-display text-[20px] font-bold tracking-tight', tone === 'danger' && 'text-danger')}>
          {title}
          {count != null && <span className="text-subtle ml-2 text-[17px] font-semibold tabular-nums">{count}</span>}
        </h2>
        {action}
      </div>
      <Card className="overflow-hidden">{children}</Card>
    </div>
  )
}
