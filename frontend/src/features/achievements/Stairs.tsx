/**
 * The achievements as a staircase: one step per achievement, lit in its group's colour once it's unlocked, and a
 * little climber standing on the highest lit step. Each time you open the page the climber hops up from where this
 * device last saw them to where you are now, one step at a time, and jumps for joy on arrival. Under
 * prefers-reduced-motion they're simply standing in place.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface Step {
  key: string
  name: string
  tint: string
  unlocked: boolean
}

const CLIMBED_KEY = 'lifeos.achievements.climbed'
const W = 480
const H = 190
const GROUND = 44 // flat start on the left
const TOP = 36 // room above the last step for the climber and the flag
const CLIMB_MS = 2600 // a whole climb, however many steps, takes about this long…
const MAX_STEP_MS = 420 // …but a short one doesn't crawl

function readClimbed(): number | null {
  try {
    const n = Number(localStorage.getItem(CLIMBED_KEY))
    return localStorage.getItem(CLIMBED_KEY) === null || Number.isNaN(n) ? null : n
  } catch {
    return null
  }
}

function writeClimbed(n: number) {
  try {
    localStorage.setItem(CLIMBED_KEY, String(n))
  } catch {
    /* storage blocked: the climb just starts from the bottom again next time */
  }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export function Stairs({ steps, label }: { steps: Step[]; label: string }) {
  const { t } = useTranslation('achievements')
  const n = steps.length
  const target = steps.filter((s) => s.unlocked).length
  const start = useRef<number | null>(null)
  start.current ??= readClimbed() ?? 0
  const [at, setAt] = useState(() => (reducedMotion() ? target : Math.min(start.current ?? 0, target)))
  const pos = useRef(at)
  const hop = useRef<SVGGElement>(null)

  const sw = (W - GROUND - 12) / n
  const rise = (H - TOP) / n
  const xOf = (p: number) => (p === 0 ? GROUND / 2 : GROUND + (p - 0.5) * sw)
  const yOf = (p: number) => H - p * rise

  useEffect(() => {
    writeClimbed(target)
    const from = pos.current
    if (from >= target || reducedMotion()) {
      pos.current = target
      setAt(target)
      return
    }
    const stepMs = Math.min(MAX_STEP_MS, CLIMB_MS / (target - from))
    const id = setInterval(() => {
      pos.current += 1
      setAt(pos.current)
      if (pos.current >= target) clearInterval(id)
    }, stepMs)
    return () => clearInterval(id)
  }, [target])

  // Every step up is a little hop; the last one is a jump for joy
  const climbed = useRef(false)
  useEffect(() => {
    const el = hop.current
    if (!el?.animate || reducedMotion()) return
    if (at < target) {
      climbed.current = true
      el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-9px)', offset: 0.45 }, { transform: 'translateY(0)' }], {
        duration: 300,
        easing: 'ease-out',
      })
    } else if (climbed.current) {
      climbed.current = false
      el.animate(
        [
          { transform: 'translateY(0) scale(1, 1)' },
          { transform: 'translateY(0) scale(1.15, 0.85)', offset: 0.15 },
          { transform: 'translateY(-18px) scale(0.95, 1.05)', offset: 0.5 },
          { transform: 'translateY(0) scale(1.1, 0.9)', offset: 0.85 },
          { transform: 'translateY(0) scale(1, 1)' },
        ],
        { duration: 700, delay: 250, easing: 'ease-in-out' },
      )
    }
  }, [at, target])

  const next = steps.find((s) => !s.unlocked)
  const summit = at >= n

  return (
    <div className="mb-6">
      <svg viewBox={`0 0 ${W} ${H + 2}`} className="block h-auto w-full" role="img" aria-label={label}>
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border-strong)" strokeWidth={2} strokeLinecap="round" />
        {steps.map((s, i) => {
          const lit = i < at
          const x = GROUND + i * sw
          const y = yOf(i + 1)
          return (
            <g key={s.key}>
              <title>{`${s.name} · ${s.unlocked ? t('unlocked') : t('locked')}`}</title>
              <rect
                x={x}
                y={y}
                width={sw + 0.5}
                height={H - y}
                fill={lit ? s.tint : 'var(--surface-sunken)'}
                style={{ transition: 'fill 300ms var(--ease-out)' }}
              />
              <rect x={x} y={y} width={sw + 0.5} height={3} fill={lit ? 'rgb(255 255 255 / 0.4)' : 'var(--border)'} />
            </g>
          )
        })}

        {/* The flag at the top: grey until you get there */}
        <g transform={`translate(${GROUND + n * sw - 6}, ${yOf(n)})`} aria-hidden>
          <line x1={0} y1={0} x2={0} y2={-30} stroke="var(--text-subtle)" strokeWidth={2} strokeLinecap="round" />
          <path d="M0 -30 L16 -25 L0 -20 Z" fill={summit ? 'var(--warning-fill)' : 'var(--border-strong)'} style={{ transition: 'fill 300ms' }} />
        </g>

        {/* The climber, feet at (0, 0) */}
        <g
          aria-hidden
          style={{ transform: `translate(${xOf(at)}px, ${yOf(at)}px)`, transition: 'transform 280ms var(--ease-out)' }}
        >
          <g ref={hop} style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}>
            <g stroke="var(--text)" strokeWidth={2.4} strokeLinecap="round" fill="none">
              <path d="M0 -14 L0 -6" />
              <path d="M0 -6 L-3.5 0 M0 -6 L3.5 0" />
              <path d="M0 -12 L-4.5 -8 M0 -12 L4.5 -15" />
            </g>
            <circle cx={0} cy={-19} r={4.5} fill="var(--text)" />
          </g>
        </g>
      </svg>
      <p className="text-muted mt-2 text-center text-[13px]">
        {summit ? t('stairs.summit') : next ? t('stairs.next', { name: next.name }) : null}
      </p>
    </div>
  )
}
