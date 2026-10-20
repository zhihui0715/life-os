import { describe, expect, it } from 'vitest'

import { resources } from './i18n'

/** All leaf keys, with plural suffixes removed (Chinese has no singular/plural forms). */
function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k.replace(/_(zero|one|two|few|many|other)$/, '')}`],
  )
}

describe('translations', () => {
  for (const ns of Object.keys(resources.en) as (keyof typeof resources.en)[]) {
    it(`"${ns}" has the same keys in English and Chinese`, () => {
      const en = [...new Set(keys(resources.en[ns]))].sort()
      const zh = [...new Set(keys(resources['zh-CN'][ns]))].sort()
      expect(zh).toEqual(en)
    })
  }

  it('has no empty strings', () => {
    for (const lang of Object.values(resources)) {
      for (const ns of Object.values(lang)) {
        const values = JSON.stringify(ns)
        expect(values).not.toContain('""')
      }
    }
  })
})
