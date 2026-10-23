import { cn } from './cn'

interface Props {
  checked: boolean
  /** Play the completion animation (pop, drawn tick, ring burst). Only set right after the user ticks it. */
  celebrate?: boolean
  shape?: 'round' | 'square'
  size?: number
  /** CSS colour of the fill when checked */
  color?: string
}

/**
 * The visual part of a checkbox, Things-style: an empty ring that fills with colour, a tick that draws
 * itself in, and a ring that bursts outwards. The surrounding <button role="checkbox"> owns semantics.
 */
export function CheckMark({ checked, celebrate, shape = 'round', size = 22, color = 'var(--accent-fill)' }: Props) {
  const radius = shape === 'round' ? '9999px' : `${Math.round(size * 0.3)}px`
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      {celebrate && checked && (
        <span className="animate-burst absolute inset-0" style={{ borderRadius: radius, boxShadow: `0 0 0 2px ${color}` }} />
      )}
      <span
        className={cn(
          'flex h-full w-full items-center justify-center border-[1.75px] transition-[background-color,border-color] duration-[var(--duration-fast)]',
          checked ? 'border-transparent' : 'border-border-strong group-hover/check:border-accent',
          celebrate && checked && 'animate-pop',
        )}
        style={{ borderRadius: radius, background: checked ? color : undefined }}
      >
        {checked && (
          <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="white" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" className={celebrate ? 'animate-draw' : undefined} pathLength={24} />
          </svg>
        )}
      </span>
    </span>
  )
}
