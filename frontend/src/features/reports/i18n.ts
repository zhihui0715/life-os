import i18n from '../../lib/i18n'
import en from '../../locales/en/reports.json'
import zh from '../../locales/zh-CN/reports.json'

// The reports' words travel with the reports (the page and the Settings card), not in the app's first download
i18n.addResourceBundle('en', 'reports', en, true, true)
i18n.addResourceBundle('zh-CN', 'reports', zh, true, true)
