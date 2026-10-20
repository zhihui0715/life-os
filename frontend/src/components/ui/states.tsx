import { AlertTriangle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from './Button'
import { cn } from './cn'

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="bg-accent-soft text-accent mb-3 rounded-full p-3">
        <Icon size={22} aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      {body && <p className="text-muted mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <div className="bg-danger-soft text-danger mb-3 rounded-full p-3">
        <AlertTriangle size={22} aria-hidden />
      </div>
      <p className="font-medium">{t('state.errorTitle')}</p>
      <p className="text-muted mt-1 max-w-sm">{message ?? t('state.errorBody')}</p>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          {t('actions.retry')}
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('bg-sunken animate-pulse rounded-md motion-reduce:animate-none', className)} />
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-label={t('state.loading')} className="flex flex-col gap-2 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11" />
      ))}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('border-border bg-surface shadow-card rounded-xl border', className)}>{children}</section>
}
