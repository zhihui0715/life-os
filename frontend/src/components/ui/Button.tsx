import type { ButtonHTMLAttributes, Ref } from 'react'

import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'icon'

// iOS button styles: filled (primary), gray (secondary), plain (ghost), destructive tinted (danger)
const variants: Record<Variant, string> = {
  primary: 'bg-accent-fill text-on-accent hover:brightness-110 shadow-[0_1px_2px_rgb(0_0_0/0.12)]',
  secondary: 'bg-sunken text-fg hover:bg-border',
  ghost: 'text-accent hover:bg-accent-soft',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-[15px] gap-2',
  icon: 'h-10 w-10 justify-center',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  ref?: Ref<HTMLButtonElement>
}

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'pressable inline-flex shrink-0 items-center rounded-full font-semibold whitespace-nowrap',
        'disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
