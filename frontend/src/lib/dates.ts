/**
 * Date helpers. Two kinds of values (docs/01-database-schema.md, time rules):
 *  - local days  "2026-10-20"            → a calendar day in the user's timezone
 *  - instants    "2026-10-20T01:30:00Z"  → an exact moment, shown in the user's timezone
 * All formatting goes through Intl so English and Chinese both look natural.
 */

/** Today's date ("YYYY-MM-DD") in the given IANA timezone. */
export function todayInZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Milliseconds the zone is ahead of UTC at a given instant (e.g. +8h for Kuala Lumpur). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/** "2026-11-01T17:00" typed by the user (wall-clock time in their zone) → UTC ISO string. */
export function wallTimeToUtcIso(wall: string, timeZone: string): string {
  const [date, time] = wall.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  // Two passes handle the rare case where the offset differs across a DST change.
  let utc = guess - zoneOffsetMs(new Date(guess), timeZone)
  utc = guess - zoneOffsetMs(new Date(utc), timeZone)
  return new Date(utc).toISOString()
}

/** UTC ISO string → "YYYY-MM-DDTHH:mm" wall-clock time in the zone (for <input type="datetime-local">). */
export function utcIsoToWallTime(iso: string, timeZone: string): string {
  const instant = new Date(iso)
  const local = new Date(instant.getTime() + zoneOffsetMs(instant, timeZone))
  return local.toISOString().slice(0, 16)
}

export function formatDay(day: string, locale: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric', ...opts }).format(
    new Date(`${day}T00:00:00Z`),
  )
}

export function formatInstant(iso: string, locale: string, timeZone: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...opts,
  }).format(new Date(iso))
}

export function formatMinutes(minutes: number, locale: string): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const fmt = (value: number, unit: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value)
  if (h && m) return `${fmt(h, 'hour')} ${fmt(m, 'minute')}`
  return h ? fmt(h, 'hour') : fmt(m, 'minute')
}
