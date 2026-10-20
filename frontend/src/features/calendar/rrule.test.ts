import { describe, expect, it } from 'vitest'

import { buildRRule, NO_REPEAT, parseRRule } from './rrule'

describe('repeat rules', () => {
  it('builds the common choices', () => {
    expect(buildRRule(NO_REPEAT, '2026-10-21')).toBeNull()
    expect(buildRRule({ ...NO_REPEAT, freq: 'daily' }, '2026-10-21')).toBe('FREQ=DAILY')
    expect(buildRRule({ ...NO_REPEAT, freq: 'weekdays' }, '2026-10-21')).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    // 2026-10-21 is a Wednesday
    expect(buildRRule({ ...NO_REPEAT, freq: 'weekly', end: 'count', count: 5 }, '2026-10-21')).toBe('FREQ=WEEKLY;BYDAY=WE;COUNT=5')
    expect(buildRRule({ ...NO_REPEAT, freq: 'monthly', end: 'until', until: '2027-01-31' }, '2026-10-21')).toBe(
      'FREQ=MONTHLY;UNTIL=20270131',
    )
  })

  it('round-trips through parse', () => {
    for (const rule of ['FREQ=DAILY', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'FREQ=WEEKLY;BYDAY=WE;COUNT=5', 'FREQ=MONTHLY;UNTIL=20270131']) {
      expect(buildRRule(parseRRule(rule), '2026-10-21')).toBe(rule)
    }
  })

  it('keeps rules the form cannot express as custom', () => {
    const choice = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2')
    expect(choice.freq).toBe('custom')
    expect(buildRRule(choice, '2026-10-21')).toBe('FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2')
  })
})
