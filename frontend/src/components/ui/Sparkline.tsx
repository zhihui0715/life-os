import { useId } from 'react'

/**
 * A small smoothed trend line with a soft fill under it, drawn as plain SVG so Home doesn't pull in the charts
 * library. Gaps (null) break the line rather than being drawn as zero. Decorative: the tile it sits in states the
 * number in text, so it is hidden from screen readers.
 */
export function Sparkline({ values, max, color = 'var(--accent)', className }: { values: (number | null)[]; max?: number; color?: string; className?: string }) {
  const id = `spark${useId().replace(/[^\w-]/g, '')}`
  const W = 120
  const H = 36
  const known = values.filter((v): v is number => v != null)
  if (known.length < 2) return null
  const top = max ?? Math.max(...known, 1)
  const step = W / (values.length - 1)
  const pt = (v: number, i: number): [number, number] => [i * step, H - 3 - (v / top) * (H - 8)]

  // Split into runs of known values; each run becomes its own smoothed segment
  const runs: [number, number][][] = []
  values.forEach((v, i) => {
    if (v == null) return void runs.push([])
    if (!runs.length) runs.push([])
    runs[runs.length - 1].push(pt(v, i))
  })
  const segments = runs.filter((r) => r.length > 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.32 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {segments.map((r, i) => {
        const line = smooth(r)
        return (
          <g key={i}>
            <path d={`${line} L${r.at(-1)![0]},${H} L${r[0][0]},${H} Z`} fill={`url(#${id})`} />
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pathLength={1} className="spark-draw" />
          </g>
        )
      })}
    </svg>
  )
}

/** Catmull-Rom through the points, as cubic Béziers: a smooth curve that still passes through every value. */
function smooth(p: [number, number][]) {
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const [p0, p1, p2, p3] = [p[i - 1] ?? p[i], p[i], p[i + 1], p[i + 2] ?? p[i + 1]]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}

/** A 0–100 ring. The number goes inside as children; the ring itself is decorative. */
export function Ring({ value, size = 52, stroke = 5, color = 'var(--accent)', children }: { value: number | null; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = value == null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          className="ring-fill"
          style={{ ['--c' as string]: c, filter: `drop-shadow(0 0 4px color-mix(in srgb, ${color} 45%, transparent))` }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  )
}
