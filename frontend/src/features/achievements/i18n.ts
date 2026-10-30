import i18n from '../../lib/i18n'
import en from '../../locales/en/achievements.json'
import zh from '../../locales/zh-CN/achievements.json'

// The achievements' words travel with the page and the unlock toast, not in the app's first download
i18n.addResourceBundle('en', 'achievements', en, true, true)
i18n.addResourceBundle('zh-CN', 'achievements', zh, true, true)
