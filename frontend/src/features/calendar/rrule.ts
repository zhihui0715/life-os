/**
 * The "Repeat" choices in the event form ⇄ RFC 5545 RRULE text stored by the server.
 * Anything the form can't express is kept as "custom" and left untouched.
 */

export type RepeatFreq = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom'
export type RepeatEnd = 'never' | 'until' | 'count'

export interface RepeatChoice {
  freq: RepeatFreq
  end: RepeatEnd
  until: string // YYYY-MM-DD (inclusive, local)
  count: number
  custom?: string
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] // JS getUTCDay() order
const WEEKDAYS = 'MO,TU,WE,TH,FR'

export const NO_REPEAT: RepeatChoice = { freq: 'none', end: 'never', until: '', count: 10 }

/** startDate: the event's first local date (YYYY-MM-DD), used for "weekly on this day". */
export function buildRRule(choice: RepeatChoice, startDate: string): string | null {
  if (choice.freq === 'none') return null
  if (choice.freq === 'custom') return choice.custom ?? null
  const parts: string[] = []
  if (choice.freq === 'daily') parts.push('FREQ=DAILY')
  if (choice.freq === 'weekdays') parts.push('FREQ=WEEKLY', `BYDAY=${WEEKDAYS}`)
  if (choice.freq === 'weekly') parts.push('FREQ=WEEKLY', `BYDAY=${DAY_CODES[new Date(`${startDate}T00:00:00Z`).getUTCDay()]}`)
  if (choice.freq === 'monthly') parts.push('FREQ=MONTHLY')
  if (choice.end === 'until' && choice.until) parts.push(`UNTIL=${choice.until.replaceAll('-', '')}`)
  if (choice.end === 'count') parts.push(`COUNT=${Math.max(1, Math.min(1000, Math.round(choice.count)))}`)
  return parts.join(';')
}

export function parseRRule(rule: string | null): RepeatChoice {
  if (!rule) return { ...NO_REPEAT }
  const parts = Object.fromEntries(rule.split(';').map((p) => p.split('=') as [string, string]))
  const known = new Set(['FREQ', 'BYDAY', 'UNTIL', 'COUNT'])
  const custom = { ...NO_REPEAT, freq: 'custom' as const, custom: rule }
  if (Object.keys(parts).some((k) => !known.has(k))) return custom

  let freq: RepeatFreq
  if (parts.FREQ === 'DAILY' && !parts.BYDAY) freq = 'daily'
  else if (parts.FREQ === 'WEEKLY' && parts.BYDAY === WEEKDAYS) freq = 'weekdays'
  else if (parts.FREQ === 'WEEKLY' && parts.BYDAY && !parts.BYDAY.includes(',')) freq = 'weekly'
  else if (parts.FREQ === 'MONTHLY' && !parts.BYDAY) freq = 'monthly'
  else return custom

  const until = parts.UNTIL ? `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}` : ''
  const end: RepeatEnd = parts.COUNT ? 'count' : parts.UNTIL ? 'until' : 'never'
  return { freq, end, until, count: parts.COUNT ? Number(parts.COUNT) : 10 }
}
