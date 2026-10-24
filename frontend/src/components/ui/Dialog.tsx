import { X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { play } from '../../lib/sound'
import { Button } from './Button'
import { cn } from './cn'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** "center" for small dialogs; "side" is a drawer on desktop and a full-height sheet on mobile. */
  placement?: 'center' | 'side'
}

const CLOSE_MS = 280
const DISMISS_DISTANCE = 110

/**
 * Built on the native <dialog> element: the browser handles focus trapping, Esc to close and
 * hiding the rest of the page from screen readers. On phones it is an iOS bottom sheet that can be
 * dragged down to dismiss; on larger screens a centred card or a side drawer. Opening and closing
 * are animated (motion.css); the element stays open until its exit animation has played.
 */
export function Dialog({ open, onClose, title, children, footer, placement = 'center' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; dy: number } | null>(null)
  const [rendered, setRendered] = useState(open)
  const { t } = useTranslation()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open) {
      setRendered(true)
      el.removeAttribute('data-closing')
      if (!el.open) {
        el.showModal()
        play('open')
        // showModal() focuses the first button (Close); prefer a field marked data-autofocus.
        requestAnimationFrame(() => el.querySelector<HTMLElement>('[data-autofocus]')?.focus())
      }
      return
    }
    if (!el.open) return
    el.setAttribute('data-closing', '')
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const id = setTimeout(
      () => {
        el.removeAttribute('data-closing')
        el.close()
        setRendered(false)
        if (panel.current) panel.current.style.transform = ''
      },
      reduce ? 0 : CLOSE_MS,
    )
    return () => clearTimeout(id)
  }, [open])

  const requestClose = () => {
    play('close')
    onClose()
  }

  // Drag the grabber (phones) to pull the sheet down; past a threshold it closes.
  const onPointerDown = (e: PointerEvent) => {
    if (window.innerWidth >= 768) return
    drag.current = { startY: e.clientY, dy: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (panel.current) panel.current.style.transition = 'none'
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current || !panel.current) return
    const dy = Math.max(0, e.clientY - drag.current.startY)
    drag.current.dy = dy
    panel.current.style.transform = `translate3d(0, ${dy}px, 0)`
  }
  const onPointerUp = () => {
    if (!drag.current || !panel.current) return
    const { dy } = drag.current
    drag.current = null
    panel.current.style.transition = 'transform 380ms var(--ease-sheet)'
    if (dy > DISMISS_DISTANCE) {
      panel.current.style.transform = 'translate3d(0, 100%, 0)'
      requestClose()
    } else {
      panel.current.style.transform = ''
    }
  }

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={() => open && onClose()}
      onCancel={(e) => {
        e.preventDefault()
        requestClose()
      }}
      onClick={(e) => e.target === ref.current && requestClose()} // click on backdrop
      className={cn(
        'sheet bg-transparent text-fg m-0 max-h-none max-w-none overflow-visible p-0',
        // phones: a sheet anchored to the bottom edge
        'fixed inset-x-0 top-auto bottom-0 w-full',
        placement === 'center'
          ? 'md:inset-0 md:m-auto md:h-fit md:w-[calc(100%-2rem)] md:max-w-md'
          : 'drawer h-[calc(100dvh-env(safe-area-inset-top)-12px)] md:inset-y-0 md:right-0 md:left-auto md:h-full md:w-[28rem]',
      )}
    >
      {rendered && (
        <div
          ref={panel}
          className={cn(
            'bg-surface shadow-pop flex flex-col overflow-hidden',
            'max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] rounded-t-[22px] pb-[env(safe-area-inset-bottom)]',
            placement === 'center' ? 'md:max-h-[85dvh] md:rounded-[22px] md:pb-0' : 'h-full md:max-h-none md:rounded-none md:rounded-l-[22px] md:pb-0',
          )}
        >
          <div
            className="flex cursor-grab touch-none justify-center pt-2 pb-1 md:hidden"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-hidden
          >
            <span className="bg-border-strong h-[5px] w-9 rounded-full" />
          </div>
          <header
            className="flex items-center justify-between gap-3 px-5 pt-1 pb-3 md:pt-4"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <h2 className="font-display text-[19px] font-semibold tracking-tight">{title}</h2>
            <Button
              variant="secondary"
              size="icon"
              aria-label={t('actions.close')}
              onClick={requestClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-muted h-8 w-8"
            >
              <X size={16} strokeWidth={2.5} aria-hidden />
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
          {footer && (
            <footer className="border-border flex flex-wrap items-center gap-2 border-t px-5 py-3">{footer}</footer>
          )}
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
        <div className="grid w-full grid-cols-2 gap-2 md:ml-auto md:flex md:w-auto">
          <Button onClick={onCancel}>{t('actions.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy} className="justify-center">
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
