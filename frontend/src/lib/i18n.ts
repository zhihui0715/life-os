/**
 * Translations (docs/03-design-and-i18n.md §1). Rule: no user-visible text is typed directly into a
 * component — always t('namespace:key'). A test checks that en and zh-CN have exactly the same keys.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enCommon from '../locales/en/common.json'
import enGoals from '../locales/en/goals.json'
import enSettings from '../locales/en/settings.json'
import enTasks from '../locales/en/tasks.json'
import zhCommon from '../locales/zh-CN/common.json'
import zhGoals from '../locales/zh-CN/goals.json'
import zhSettings from '../locales/zh-CN/settings.json'
import zhTasks from '../locales/zh-CN/tasks.json'

export const LOCALES = ['en', 'zh-CN'] as const
export type Locale = (typeof LOCALES)[number]

export const resources = {
  en: { common: enCommon, tasks: enTasks, goals: enGoals, settings: enSettings },
  'zh-CN': { common: zhCommon, tasks: zhTasks, goals: zhGoals, settings: zhSettings },
} as const

const STORAGE_KEY = 'lifeos.locale'

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale
  } catch {
    /* storage unavailable (private mode) — fall through */
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLocale(),
  fallbackLng: 'en',
  ns: ['common', 'tasks', 'goals', 'settings'],
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes output
})

function onLanguageChanged(lng: string) {
  document.documentElement.lang = lng
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    /* ignore */
  }
}
i18n.on('languageChanged', onLanguageChanged)
onLanguageChanged(i18n.language)

export default i18n
