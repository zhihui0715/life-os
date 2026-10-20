import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from './Button'
import { cn } from './cn'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** "center" for small dialogs; "side" is a drawer on desktop and a full-screen sheet on mobile. */
  placement?: 'center' | 'side'
}

/**
 * Built on the native <dialog> element: the browser handles focus trapping, Esc to close and
 * hiding the rest of the page from screen readers.
 */
export function Dialog({ open, onClose, title, children, footer, placement = 'center' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const { t } = useTranslation()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      // showModal() focuses the first button (Close); prefer a field marked data-autofocus.
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()} // click on backdrop
      className={cn(
        'border-border bg-surface text-fg shadow-pop m-0 max-h-none max-w-none p-0 backdrop:backdrop-blur-[1px]',
        placement === 'center'
          ? 'fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border'
          : 'fixed inset-0 h-full w-full md:left-auto md:w-[28rem] md:border-l',
      )}
    >
      {open && (
        <div className="flex h-full max-h-[100dvh] flex-col">
          <header className="border-border flex items-center justify-between gap-3 border-b px-5 py-3.5">
            <h2 className="text-base font-semibold">{title}</h2>
            <Button variant="ghost" size="icon" aria-label={t('actions.close')} onClick={onClose}>
              <X size={18} aria-hidden />
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="border-border flex flex-wrap items-center gap-2 border-t px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Extra controls shown under the message (inside the dialog, so they stay clickable). */
  children?: ReactNode
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, busy, onConfirm, onCancel, children }: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel}>{t('actions.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-muted">{body}</p>
      {children}
    </Dialog>
  )
}
