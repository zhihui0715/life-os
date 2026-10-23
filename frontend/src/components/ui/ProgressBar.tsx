import { useEffect, useState } from 'react'

import { cn } from './cn'

interface Props {
  /** 0–100, or null for "no data yet" (drawn as an empty dashed track, never as 0%). */
  value: number | null
  /** Fill colour (CSS). Defaults to the accent; a full bar turns green. */
  color?: string
  size?: 'sm' | 'md'
  /** progressbar (how far along) or meter (a score). */
  role?: 'progressbar' | 'meter'
  label?: string
  className?: string
  /** Turn green and sparkle at 100% (off for shares of a whole). */
  celebrate?: boolean
}

/**
 * The app's progress bar. It fills up from empty when it appears, a soft shine runs along it while it's in
 * progress, its tip glows, and it pops (with a little sparkle) when it reaches 100%. All of it stops under
 * prefers-reduced-motion, leaving a plain bar.
 */
export function ProgressBar({ value, color, size = 'sm', role = 'progressbar', label, className, celebrate = true }: Props) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    // one frame at 0, then the real value: the width transition does the filling
    const id = requestAnimationFrame(() => setShown(value ?? 0))
    return () => cancelAnimationFrame(id)
  }, [value])

  const h = size === 'md' ? 'h-2.5' : 'h-2'
  if (value === null) {
    return <div aria-hidden className={cn('border-border-strong rounded-full border border-dashed', h, className)} />
  }
  const full = celebrate && value >= 100
  const fill = full ? 'var(--success-fill)' : (color ?? 'var(--accent-fill)')
  const pct = Math.max(Math.min(shown, 100), value > 0 ? 3 : 0)

  return (
    <div className={cn('relative', className)}>
      {/* Without a label the bar only repeats a number written beside it, so it stays out of the accessibility tree */}
      <div
        {...(label
          ? { role, 'aria-valuenow': Math.round(value), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label }
          : { 'aria-hidden': true })}
        className={cn('bg-fg/[0.08] relative overflow-hidden rounded-full', h)}
      >
        <div
          className={cn(
            'relative h-full overflow-hidden rounded-full transition-[width] duration-[1100ms] ease-[var(--ease-out)] motion-reduce:transition-none',
            full && 'animate-[bar-full_600ms_var(--ease-spring)_1100ms_both]',
          )}
          style={{ width: `${pct}%`, background: fill, boxShadow: pct > 0 ? `0 0 10px color-mix(in srgb, ${fill} 55%, transparent)` : undefined }}
        >
          {!full && pct > 0 && (
            <span
              aria-hidden
              className="absolute inset-y-0 -left-1/2 w-1/2 animate-[bar-shine_2.4s_ease-in-out_1.2s_infinite] motion-reduce:hidden"
              style={{ background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.45), transparent)' }}
            />
          )}
        </div>
      </div>
      {full && (
        <span aria-hidden className="absolute -top-2 -right-1 animate-[bar-spark_900ms_var(--ease-out)_1300ms_both] text-[13px] motion-reduce:hidden">
          ✨
        </span>
      )}
    </div>
  )
}
