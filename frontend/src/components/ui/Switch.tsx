import { cn } from './cn'

/** An iOS switch: a real checkbox role, a knob that slides with a spring. */
export function Switch({ checked, onChange, labelledBy, disabled }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-[var(--duration-base)] disabled:opacity-45',
        checked ? 'bg-success-fill' : 'bg-fg/[0.14]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)]',
          'transition-transform duration-[380ms] ease-[var(--ease-spring)]',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}
