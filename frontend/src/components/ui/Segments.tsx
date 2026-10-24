import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { play } from '../../lib/sound'
import { cn } from './cn'

/**
 * A row of filter pills (the views of a list). Scrolls sideways on phones. The selected pill is filled with
 * the tint, like the scope bar in iOS Mail and Things.
 */
export function ChipTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  render,
  className,
}: {
  items: readonly T[]
  value: T | null
  onChange: (v: T) => void
  label: string
  render: (v: T) => ReactNode
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        '-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {items.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          onClick={() => {
            play('tab')
            onChange(v)
          }}
          className={cn(
            'pressable h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold',
            v === value
              ? 'bg-accent-fill text-on-accent shadow-[0_2px_8px_-2px_color-mix(in_srgb,var(--accent)_55%,transparent)]'
              : 'bg-surface text-muted hover:text-fg shadow-card dark:shadow-none',
          )}
        >
          {render(v)}
        </button>
      ))}
    </div>
  )
}

/** The iOS segmented control: a grey track with a white thumb that slides to the chosen segment. */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
  render,
}: {
  items: readonly T[]
  value: T
  onChange: (v: T) => void
  label: string
  render: (v: T) => ReactNode
}) {
  const index = Math.max(0, items.indexOf(value))
  return (
    <div role="tablist" aria-label={label} className="bg-fg/[0.07] relative grid h-9 rounded-[10px] p-[2px]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className="bg-surface dark:bg-raised absolute top-[2px] bottom-[2px] left-[2px] rounded-[8px] shadow-[0_3px_8px_rgb(0_0_0/0.12),0_1px_1px_rgb(0_0_0/0.04)] transition-transform duration-[380ms] ease-[var(--ease-spring)]"
        style={{ width: `calc((100% - 4px) / ${items.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {items.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          onClick={() => {
            play('tab')
            onChange(v)
          }}
          className={cn('relative min-w-20 px-4 text-[13px] font-semibold transition-colors', v === value ? 'text-fg' : 'text-muted')}
        >
          {render(v)}
        </button>
      ))}
    </div>
  )
}

/** A toggle pill for picking one option of a small set (lengths, periods): aria-pressed, tinted when on. */
export function ChoiceChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => {
        play('tap')
        onClick()
      }}
      className={cn(
        'pressable h-9 rounded-full px-4 text-[14px] font-semibold tabular-nums',
        selected ? 'bg-accent-soft text-accent shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'bg-sunken text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

/** The iOS back button: a chevron and the parent screen's name, in the tint colour. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-accent pressable -ml-1.5 mb-2 inline-flex items-center text-[16px] font-medium">
      <ChevronLeft size={24} strokeWidth={2.4} aria-hidden className="-mr-0.5" />
      {children}
    </Link>
  )
}

/** Heading over a group of cards, the same voice as GroupSection's. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('font-display mb-2 px-1 text-[20px] font-bold tracking-tight', className)}>{children}</h2>
}

/** A figure set large with its label underneath (stats rows on detail pages). */
export function Stat({ value, label, help, tone }: { value: ReactNode; label: string; help?: string; tone?: string }) {
  return (
    <div className="bg-surface shadow-card rounded-[18px] p-4 dark:shadow-none">
      <p className="font-display text-[28px] leading-none font-bold tracking-tight tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      <p className="text-muted mt-1.5 text-[13px] font-medium">{label}</p>
      {help && <p className="text-subtle mt-1 text-xs">{help}</p>}
    </div>
  )
}
