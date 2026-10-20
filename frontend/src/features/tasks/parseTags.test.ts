import { describe, expect, it } from 'vitest'

import { parseTags } from './TaskDrawer'

describe('parseTags', () => {
  it('splits on English and Chinese commas and trims', () => {
    expect(parseTags(' exam, networking，考试 ,, ')).toEqual(['exam', 'networking', '考试'])
  })

  it('returns an empty list for blank input', () => {
    expect(parseTags('  ')).toEqual([])
  })
})
