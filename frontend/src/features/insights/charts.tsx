/**
 * Charts follow the dataviz rules: thin 2px lines, ≥8px markers with a surface ring, bars ≤24px with a rounded
 * data end, hairline solid grid, one y-axis per chart, text in text tokens (never series colours), a legend only
 * for 2+ series, hover tooltips, and a table view. Colours are CSS tokens validated for colour-blind safety.
 * Lines are smoothed (monotone, so they never overshoot a value) over a soft gradient wash in the series colour,
 * and they draw in on first show unless reduced motion is asked for.
 */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'

import { formatDay, formatMinutes } from '../../lib/dates'

const AXIS = { stroke: 'var(--chart-grid)', tick: { fill: 'var(--chart-axis)', fontSize: 11 }, tickLine: false }
const GRID = <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
const ANIMATE = typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const MOTION = { isAnimationActive: ANIMATE, animationDuration: 900, animationEasing: 'ease-out' as const }
const RING = { stroke: 'var(--surface-solid)', strokeWidth: 2 }

/** A vertical wash from the series colour down to nothing, under a line or inside a bar. */
function Wash({ id, color, from = 0.3, to = 0 }: { id: string; color: string; from?: number; to?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style={{ stopColor: color, stopOpacity: from }} />
      <stop offset="100%" style={{ stopColor: color, stopOpacity: to }} />
    </linearGradient>
  )
}
const useChartId = () => `chart${useId().replace(/[^\w-]/g, '')}`

interface Row {
  label: string
  [series: string]: string | number | null
}

function ChartTooltip({ active, payload, label, format }: TooltipProps<number, string> & { format: (v: number, key: string) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-panel bg-solid shadow-float rounded-xl px-3 py-2 text-xs">
      <p className="text-muted mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="text-fg flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-semibold">{p.value == null ? '—' : format(Number(p.value), String(p.dataKey))}</span>
        </p>
      ))}
    </div>
  )
}

/** Toggle between the chart and a plain table (screen readers, exact values, colour-free reading). */
export function WithTable({ rows, columns, children }: { rows: Row[]; columns: { key: string; name: string; format: (v: number) => string }[]; children: React.ReactNode }) {
  const { t } = useTranslation('insights')
  const [table, setTable] = useState(false)
  return (
    <div>
      {table ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-subtle text-left text-xs">
                <th className="py-1 font-medium">{t('table.date')}</th>
                {columns.map((c) => <th key={c.key} className="py-1 text-right font-medium">{c.name}</th>)}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-1">{r.label}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="py-1 text-right tabular-nums">{r[c.key] == null ? '—' : c.format(Number(r[c.key]))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      <button type="button" onClick={() => setTable((v) => !v)} className="text-accent mt-1 text-xs font-medium hover:underline">
        {table ? t('table.hide') : t('table.show')}
      </button>
    </div>
  )
}

/** Weekly Life Balance Score: one series, so no legend — the card title names it. Gaps stay gaps. */
export function ScoreTrendChart({ data }: { data: { start: string; score: number | null }[] }) {
  const { t, i18n } = useTranslation('insights')
  const rows = data.map((w) => ({ label: formatDay(w.start, i18n.language), score: w.score }))
  const id = useChartId()
  return (
    <WithTable rows={rows} columns={[{ key: 'score', name: t('score.title'), format: (v) => String(v) }]}>
      <div className="h-48" role="img" aria-label={t('trend.title')}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
            <defs><Wash id={id} color="var(--series-1)" from={0.34} /></defs>
            {GRID}
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} {...AXIS} axisLine={false} />
            <Tooltip cursor={{ stroke: 'var(--chart-muted)', strokeDasharray: '3 3' }} content={<ChartTooltip format={(v) => String(v)} />} />
            <Area type="monotone" dataKey="score" name={t('score.title')} stroke="var(--series-1)" strokeWidth={2.25} fill={`url(#${id})`}
              strokeLinecap="round" connectNulls={false} {...MOTION}
              dot={{ r: 4, fill: 'var(--series-1)', ...RING }}
              activeDot={{ r: 6, ...RING }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </WithTable>
  )
}

/** Mood and energy share the same 1–5 scale, so one axis is honest. Two series → legend + colour key. */
export function MoodChart({ data }: { data: { date: string; mood: number | null; energy: number | null }[] }) {
  const { t, i18n } = useTranslation('insights')
  const rows = data.map((d) => ({ label: formatDay(d.date, i18n.language), mood: d.mood, energy: d.energy }))
  const series = [
    { key: 'mood', name: t('metrics.mood'), color: 'var(--series-1)' },
    { key: 'energy', name: t('metrics.energy'), color: 'var(--series-2)' },
  ]
  const id = useChartId()
  return (
    <WithTable rows={rows} columns={series.map((s) => ({ key: s.key, name: s.name, format: (v: number) => `${v}/5` }))}>
      <ul className="text-muted mb-1 flex gap-4 text-xs" aria-hidden>
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="h-40" role="img" aria-label={t('dailyMood')}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
            <defs>{series.map((s) => <Wash key={s.key} id={`${id}-${s.key}`} color={s.color} from={0.2} />)}</defs>
            {GRID}
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
            <YAxis domain={[1, 5]} ticks={[1, 3, 5]} {...AXIS} axisLine={false} />
            <Tooltip cursor={{ stroke: 'var(--chart-muted)', strokeDasharray: '3 3' }} content={<ChartTooltip format={(v) => `${v}/5`} />} />
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.25} fill={`url(#${id}-${s.key})`}
                baseValue={1} connectNulls={false} {...MOTION} dot={{ r: 4, fill: s.color, ...RING }} activeDot={{ r: 6, ...RING }} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </WithTable>
  )
}

/** Minutes per day: magnitude, so a single hue. */
export function MinutesBars({ data, name }: { data: { date: string; minutes: number }[]; name: string }) {
  const { i18n } = useTranslation()
  const rows = data.map((d) => ({ label: formatDay(d.date, i18n.language, { weekday: 'short', month: undefined, day: undefined }), full: d.date, minutes: d.minutes }))
  const fmt = (v: number) => formatMinutes(v, i18n.language)
  const id = useChartId()
  return (
    <WithTable rows={rows.map((r) => ({ label: formatDay(r.full, i18n.language), minutes: r.minutes }))} columns={[{ key: 'minutes', name, format: fmt }]}>
      <div className="h-32" role="img" aria-label={name}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap="30%">
            <defs><Wash id={id} color="var(--series-1)" from={1} to={0.55} /></defs>
            {GRID}
            <XAxis dataKey="label" {...AXIS} interval={rows.length > 10 ? 'preserveStartEnd' : 0} />
            <YAxis {...AXIS} axisLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'var(--surface-sunken)', radius: 6 }} content={<ChartTooltip format={(v) => fmt(v)} />} />
            <Bar dataKey="minutes" name={name} fill={`url(#${id})`} maxBarSize={24} radius={[6, 6, 2, 2]} {...MOTION} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </WithTable>
  )
}
