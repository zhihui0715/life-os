/**
 * The achievements as a climb over time: a chart with the days along the bottom and how many you've unlocked up
 * the side. The line you've walked is a staircase that steps up on each unlock's date (a dot in that group's
 * colour), and the steps still ahead carry on, dashed, past today to the flag. Each time you open the page a little
 * climber walks the line up from where this device last saw them to today, and jumps for joy on arrival. Under
 * prefers-reduced-motion they're simply standing there.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDay } from '../../lib/dates'

export interface Step {
  key: string
  name: string
  tint: string
  unlocked: boolean
  /** The day it was unlocked, when known (habit streaks have no date: they count as today). */
  date: string | null
}

const CLIMBED_KEY = 'lifeos.achievements.climbed'
const DAY = 86_400_000
const PAD = { left: 30, right: 14, top: 34, bottom: 26 }
const CLIMB_MS = 2600 // a whole climb, however many steps, takes about this long…
const MAX_STEP_MS = 420 // …but a short one doesn't crawl

function readClimbed(): number | null {
  try {
    const raw = localStorage.getItem(CLIMBED_KEY)
    return raw === null || Number.isNaN(Number(raw)) ? null : Number(raw)
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
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)

/** Where the axis gets a label: the 1st of each month over long spans, every week over short ones. */
function ticks(from: number, to: number, max: number): number[] {
  const out: number[] = []
  if (to - from > 75) {
    const d = new Date(from * DAY)
    for (let m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); m.getTime() / DAY <= to; m.setUTCMonth(m.getUTCMonth() + 1))
      out.push(m.getTime() / DAY)
  } else {
    for (let n = from + 7; n < to - 2; n += 7) out.push(n)
  }
  const every = Math.ceil(out.length / Math.max(1, max))
  return out.filter((_, i) => i % every === 0)
}

export function Stairs({ steps, label }: { steps: Step[]; label: string }) {
  const { t, i18n } = useTranslation('achievements')
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setW(Math.max(280, el.clientWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = W < 480 ? 210 : 250

  const n = steps.length
  const done = steps.filter((s) => s.unlocked)
  const target = done.length
  const start = useRef<number | null>(null)
  start.current ??= readClimbed() ?? 0
  const [at, setAt] = useState(() => (reducedMotion() ? target : Math.min(start.current ?? 0, target)))
  const pos = useRef(at)
  const hop = useRef<SVGGElement>(null)
  const [stepMs, setStepMs] = useState(MAX_STEP_MS)

  // Time runs from a little before the first unlock (at least a month back) to today
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY
  const days = done.map((s) => (s.date ? dayNum(s.date) : today))
  const first = Math.min(today - 30, ...days.map((d) => d - 4))
  const x0 = PAD.left
  const x1 = W - PAD.right
  // The steps still to come get more room the more of them there are
  const ahead = 0.25 + 0.35 * ((n - target) / n)
  const xToday = target === n ? x1 - 18 : x0 + (x1 - x0) * (1 - ahead)
  const xOfDay = (d: number) => x0 + ((d - first) / (today - first)) * (xToday - x0)
  const yOf = (k: number) => H - PAD.bottom - (k / n) * (H - PAD.bottom - PAD.top)
  const xAhead = (k: number) => xToday + ((k - target) / (n - target)) * (x1 - 18 - xToday) // k > target

  // The climber's stops: the bottom-left, then the corner of each unlock, and finally today on the top step
  const stop = (k: number): [number, number] => (k >= target ? [xToday, yOf(target)] : k === 0 ? [x0, yOf(0)] : [xOfDay(days[k - 1]), yOf(k)])

  let walked = `M${x0},${yOf(0)}`
  days.forEach((d, i) => (walked += ` H${xOfDay(d)} V${yOf(i + 1)}`))
  walked += ` H${xToday}`
  let toCome = `M${xToday},${yOf(target)}`
  for (let k = target + 1; k <= n; k++) toCome += ` H${xAhead(k)} V${yOf(k)}`
  const yStep = n > 10 ? 5 : 2

  useEffect(() => {
    writeClimbed(target)
    const from = pos.current
    if (from >= target || reducedMotion()) {
      pos.current = target
      setAt(target)
      return
    }
    const ms = Math.min(MAX_STEP_MS, CLIMB_MS / (target - from))
    setStepMs(ms)
    const timer = setInterval(() => {
      pos.current += 1
      setAt(pos.current)
      if (pos.current >= target) clearInterval(timer)
    }, ms)
    return () => clearInterval(timer)
  }, [target])

  // Every step up is a little hop; the last one is a jump for joy
  const climbed = useRef(false)
  useEffect(() => {
    const el = hop.current
    if (!el?.animate || reducedMotion()) return
    if (at < target) {
      climbed.current = true
      el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-8px)', offset: 0.45 }, { transform: 'translateY(0)' }], {
        duration: Math.min(300, stepMs),
        easing: 'ease-out',
      })
    } else if (climbed.current) {
      climbed.current = false
      el.animate(
        [
          { transform: 'translateY(0) scale(1, 1)' },
          { transform: 'translateY(0) scale(1.15, 0.85)', offset: 0.15 },
          { transform: 'translateY(-16px) scale(0.95, 1.05)', offset: 0.5 },
          { transform: 'translateY(0) scale(1.1, 0.9)', offset: 0.85 },
          { transform: 'translateY(0) scale(1, 1)' },
        ],
        { duration: 700, delay: 250, easing: 'ease-in-out' },
      )
    }
  }, [at, target, stepMs])

  const [cx, cy] = stop(at)
  const move = `${Math.min(280, stepMs)}ms var(--ease-out)`
  const next = steps.find((s) => !s.unlocked)
  const summit = at >= n
  const flag: [number, number] = target === n ? [x1 - 18, yOf(n)] : [xAhead(n), yOf(n)]

  return (
    <div className="bg-surface shadow-card mb-6 rounded-[18px] px-3 pt-3 pb-3 dark:shadow-none">
      <div ref={box}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={label}>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent-fill)" stopOpacity={0.28} />
              <stop offset="1" stopColor="var(--accent-fill)" stopOpacity={0.02} />
            </linearGradient>
            {/* The walked line is revealed as the climber walks it */}
            <clipPath id={`${id}-walked`}>
              <rect
                x={0}
                y={0}
                width={W}
                height={H}
                style={{ transform: `scaleX(${(cx + 1) / W})`, transformOrigin: '0 0', transition: `transform ${move}` }}
              />
            </clipPath>
          </defs>

          {/* Grid and axes */}
          <g fontSize={11} fill="var(--chart-axis)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {Array.from({ length: Math.floor(n / yStep) + 1 }, (_, i) => i * yStep).map((k) => (
              <g key={k}>
                <line x1={x0} x2={x1} y1={yOf(k)} y2={yOf(k)} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={x0 - 8} y={yOf(k)} textAnchor="end" dominantBaseline="middle">
                  {k}
                </text>
              </g>
            ))}
            {ticks(first, today, Math.floor((xToday - x0) / (today - first > 75 ? 44 : 64))).map((d) => (
              <g key={d}>
                <line x1={xOfDay(d)} x2={xOfDay(d)} y1={PAD.top} y2={yOf(0)} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={xOfDay(d)} y={H - 8} textAnchor="middle">
                  {formatDay(isoOf(d), i18n.language, today - first > 75 ? { day: undefined } : {})}
                </text>
              </g>
            ))}
            {target < n && <rect x={xToday} y={PAD.top} width={x1 - xToday} height={yOf(0) - PAD.top} fill="var(--text)" opacity={0.035} />}
            <line x1={xToday} x2={xToday} y1={PAD.top - 14} y2={yOf(0)} stroke="var(--chart-axis)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={xToday} y={PAD.top - 20} textAnchor="middle" fontWeight={600}>
              {t('stairs.today')}
            </text>
            {target < n && (
              <text x={(xToday + x1) / 2} y={H - 8} textAnchor="middle">
                {t('stairs.ahead')}
              </text>
            )}
            <line x1={x0} x2={x1} y1={yOf(0)} y2={yOf(0)} stroke="var(--chart-axis)" strokeWidth={1.5} />
          </g>

          {/* The climb so far, and the steps still to come */}
          <g clipPath={`url(#${id}-walked)`}>
            <path d={`${walked} V${yOf(0)} H${x0} Z`} fill={`url(#${id}-fill)`} />
            <path d={walked} fill="none" stroke="var(--accent-fill)" strokeWidth={2.5} strokeLinejoin="round" />
          </g>
          {target < n && <path d={toCome} fill="none" stroke="var(--border-strong)" strokeWidth={2} strokeDasharray="4 4" strokeLinejoin="round" />}

          {steps.map((s, i) => {
            const k = i + 1
            const [x, y] = s.unlocked ? [xOfDay(days[i]), yOf(k)] : [xAhead(k), yOf(k)]
            const lit = s.unlocked && k <= at
            return (
              <g key={s.key}>
                <title>
                  {s.unlocked
                    ? `${s.name} · ${s.date ? t('unlockedOn', { date: formatDay(s.date, i18n.language) }) : t('unlocked')}`
                    : `${s.name} · ${t('locked')}`}
                </title>
                <circle cx={x} cy={y} r={9} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={s.unlocked ? 4.5 : 3.5}
                  fill={lit ? s.tint : 'var(--surface)'}
                  stroke={lit ? 'var(--surface)' : 'var(--border-strong)'}
                  strokeWidth={1.5}
                  style={{ transition: 'fill 300ms var(--ease-out)' }}
                />
              </g>
            )
          })}

          {/* The flag at the top: grey until you get there */}
          <g transform={`translate(${flag[0]}, ${flag[1]})`} aria-hidden>
            <line x1={0} y1={0} x2={0} y2={-26} stroke="var(--text-subtle)" strokeWidth={2} strokeLinecap="round" />
            <path d="M0 -26 L14 -21.5 L0 -17 Z" fill={summit ? 'var(--warning-fill)' : 'var(--border-strong)'} style={{ transition: 'fill 300ms' }} />
          </g>

          {/* The climber, feet at (0, 0) */}
          <g aria-hidden style={{ transform: `translate(${cx}px, ${cy - 2}px)`, transition: `transform ${move}` }}>
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
      </div>
      <p className="text-muted mt-1 text-center text-[13px]">
        {summit ? t('stairs.summit') : next ? t('stairs.next', { name: next.name }) : null}
      </p>
    </div>
  )
}
