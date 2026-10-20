import { describe, expect, it } from 'vitest'

import { addDays, formatDay, todayInZone, utcIsoToWallTime, wallTimeToUtcIso } from './dates'

const KL = 'Asia/Kuala_Lumpur'

describe('dates', () => {
  it('finds the local day in Kuala Lumpur (UTC+8)', () => {
    expect(todayInZone(KL, new Date('2026-10-20T15:59:00Z'))).toBe('2026-10-20') // 23:59 KL
    expect(todayInZone(KL, new Date('2026-10-20T16:00:00Z'))).toBe('2026-10-21') // 00:00 KL next day
  })

  it('converts wall-clock time in the user zone to UTC and back', () => {
    expect(wallTimeToUtcIso('2026-11-01T17:00', KL)).toBe('2026-11-01T09:00:00.000Z')
    expect(utcIsoToWallTime('2026-11-01T09:00:00Z', KL)).toBe('2026-11-01T17:00')
  })

  it('handles a daylight-saving zone', () => {
    // New York: EDT (UTC-4) until 1 Nov 2026, then EST (UTC-5)
    expect(wallTimeToUtcIso('2026-10-30T09:00', 'America/New_York')).toBe('2026-10-30T13:00:00.000Z')
    expect(wallTimeToUtcIso('2026-11-02T09:00', 'America/New_York')).toBe('2026-11-02T14:00:00.000Z')
  })

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })

  it('formats a local day without shifting it', () => {
    expect(formatDay('2026-10-20', 'en', { month: 'short', day: 'numeric' })).toBe('Oct 20')
    expect(formatDay('2026-10-20', 'zh-CN', { month: 'short', day: 'numeric' })).toBe('10月20日')
  })
})
