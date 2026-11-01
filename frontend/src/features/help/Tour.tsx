import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { play } from '../../lib/sound'

/**
 * Each step points at the first visible element among `targets` (marked data-tour="…" in the shell). Phones have
 * no sidebar, so sections that live under "More" fall back to the More tab. No target: the card sits centred.
 */
const STEPS: { key: string; targets: string[] }[] = [
  { key: 'welcome', targets: [] },
  { key: 'quickAdd', targets: ['quick-add', 'create-menu'] },
  { key: 'home', targets: ['nav-home'] },
  { key: 'tasks', targets: ['nav-tasks'] },
  { key: 'calendar', targets: ['nav-calendar'] },
  { key: 'plan', targets: ['nav-plan', 'nav-more'] },
  { key: 'habits', targets: ['nav-habits'] },
  { key: 'focus', targets: ['nav-focus', 'nav-more'] },
  { key: 'insights', targets: ['nav-insights', 'nav-more'] },
  { key: 'help', targets: ['help', 'nav-more'] },
]

const CARD_W = 320
const GAP = 14
const PAD = 6 // breathing room around the highlighted element

function findTarget(names: string[]) {
  for (const name of names) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
  }
  return null
}

type Rect = { left: number; top: number; width: number; height: number }

export default function Tour({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('help')
  const [index, setIndex] = useState(0)
  const [hole, setHole] = useState<Rect | null>(null)
  const [card, setCard] = useState<{ left: number; top: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const measure = useCallback(() => {
    const el = findTarget(step.targets)
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = Math.min(CARD_W, vw - 24)
    const h = cardRef.current?.offsetHeight ?? 180
    if (!el) {
      setHole(null)
      setCard({ left: (vw - w) / 2, top: Math.max(12, (vh - h) / 2) })
      return
    }
    const r = el.getBoundingClientRect()
    const box = { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
    setHole(box)
    const clampX = (x: number) => Math.min(Math.max(12, x), vw - w - 12)
    const clampY = (y: number) => Math.min(Math.max(12, y), vh - h - 12)
    if (box.left + box.width + GAP + w < vw - 12) {
      // beside it (the desktop sidebar)
      setCard({ left: box.left + box.width + GAP, top: clampY(box.top + box.height / 2 - h / 2) })
    } else if (box.top - GAP - h > 12) {
      // above it (the phone tab bar)
      setCard({ left: clampX(box.left + box.width / 2 - w / 2), top: box.top - GAP - h })
    } else {
      setCard({ left: clampX(box.left + box.width / 2 - w / 2), top: clampY(box.top + box.height + GAP) })
    }
  }, [step])

  useLayoutEffect(() => {
    findTarget(step.targets)?.scrollIntoView({ block: 'nearest' })
    measure()
    // Measure again once the card has its real height
    const id = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure, step])

  useEffect(() => nextRef.current?.focus({ preventScroll: true }), [index])

  const go = (to: number) => {
    play('tap')
    if (to >= STEPS.length) return onDone()
    setIndex(Math.max(0, to))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone()
      else if (e.key === 'ArrowRight') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <div className="fixed inset-0 z-[70]" aria-live="polite">
      {/* The dimmed page with a rounded window cut around the target; clicks on the page are held back */}
      {hole ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-2xl transition-all duration-[420ms] ease-[var(--ease-out)] motion-reduce:transition-none"
          style={{ ...hole, boxShadow: '0 0 0 2px var(--accent), 0 0 0 9999px rgb(0 0 0 / 0.55)' }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/55" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        style={{ width: `min(${CARD_W}px, calc(100vw - 24px))`, left: card?.left ?? -9999, top: card?.top ?? -9999 }}
        className={cn(
          'glass-panel bg-surface shadow-pop absolute rounded-[20px] p-5',
          'transition-[left,top] duration-[420ms] ease-[var(--ease-out)] motion-reduce:transition-none',
        )}
      >
        <p className="text-accent mb-1 text-[12px] font-semibold tracking-wide uppercase">
          {t('tour.step', { n: index + 1, total: STEPS.length })}
        </p>
        <h2 id="tour-title" className="font-display text-[19px] font-semibold tracking-tight">
          {t(`tour.${step.key}.title`)}
        </h2>
        <p id="tour-body" className="text-muted mt-1.5 text-[14.5px] leading-snug">
          {t(`tour.${step.key}.body`)}
        </p>
        <div className="mt-4 flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s.key}
              className={cn('h-1.5 rounded-full transition-all duration-300', i === index ? 'bg-accent w-5' : i < index ? 'bg-accent/50 w-1.5' : 'bg-border-strong w-1.5')}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          {!last && (
            <Button variant="ghost" size="sm" onClick={onDone} className="text-subtle -ml-2">
              {t('tour.skip')}
            </Button>
          )}
          <span className="flex-1" />
          {index > 0 && (
            <Button variant="secondary" size="sm" onClick={() => go(index - 1)}>
              {t('tour.back')}
            </Button>
          )}
          <Button ref={nextRef} variant="primary" size="sm" onClick={() => go(index + 1)}>
            {last ? t('tour.done') : t('tour.next')}
          </Button>
        </div>
      </div>
    </div>
  )
}
