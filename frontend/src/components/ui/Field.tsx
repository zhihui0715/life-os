import { Eye, EyeOff } from 'lucide-react'
import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from './cn'

// iOS-style filled fields: no outline at rest, a soft blue ring while editing
const control =
  'w-full rounded-xl border border-transparent bg-sunken px-3.5 text-[15px] text-fg placeholder:text-subtle ' +
  'transition-[box-shadow,background-color,border-color] duration-[var(--duration-fast)] ' +
  'focus:bg-surface focus:border-accent focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)] focus:outline-none ' +
  'aria-[invalid=true]:border-danger disabled:opacity-60'

interface FieldProps {
  label: string
  error?: string
  help?: string
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode
  className?: string
}

/** Label + control + help/error text, wired together for screen readers. */
export function Field({ label, error, help, children, className }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-muted px-1 text-[13px] font-medium">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-danger px-1 text-xs">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-subtle px-1 text-xs">
          {help}
        </p>
      ) : null}
    </div>
  )
}

export function Input({ className, ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(control, 'h-11', className)} {...props} />
}

/** A password box with an eye button that shows or hides what you typed. */
export function PasswordInput({ className, ref, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { ref?: Ref<HTMLInputElement> }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input ref={ref} type={shown ? 'text' : 'password'} className={cn(control, 'h-11 pr-11', className)} {...props} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={shown}
        className="text-subtle hover:text-fg absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl"
      >
        {shown ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  )
}

export function Textarea({
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 py-2 leading-relaxed', className)} {...props} />
}

export function Select({
  className,
  ref,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return <select ref={ref} className={cn(control, 'h-11 pr-8', className)} {...props} />
}
