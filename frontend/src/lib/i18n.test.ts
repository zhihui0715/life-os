import { describe, expect, it } from 'vitest'

import enFresh from '../locales/en/fresh.json'
import enLanding from '../locales/en/landing.json'
import enReports from '../locales/en/reports.json'
import enSignup from '../locales/en/signup.json'
import zhFresh from '../locales/zh-CN/fresh.json'
import zhLanding from '../locales/zh-CN/landing.json'
import zhReports from '../locales/zh-CN/reports.json'
import zhSignup from '../locales/zh-CN/signup.json'
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

  // the landing, sign-up and reports pages and Home's fresh-start card load their own words, so they're not in `resources`
  for (const [ns, en, zh] of [
    ['landing', enLanding, zhLanding],
    ['reports', enReports, zhReports],
    ['signup', enSignup, zhSignup],
    ['fresh', enFresh, zhFresh],
  ] as const) {
    it(`"${ns}" has the same keys in English and Chinese, none empty`, () => {
      expect([...new Set(keys(zh))].sort()).toEqual([...new Set(keys(en))].sort())
      expect(JSON.stringify([en, zh])).not.toContain('""')
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
