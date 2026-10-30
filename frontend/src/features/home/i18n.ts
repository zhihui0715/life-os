/** Words for Home's lazily loaded parts (one thing, welcome back, daily seal, close the book), loaded with them. */
import i18n from '../../lib/i18n'
import en from '../../locales/en/fresh.json'
import zh from '../../locales/zh-CN/fresh.json'

i18n.addResourceBundle('en', 'fresh', en, true, true)
i18n.addResourceBundle('zh-CN', 'fresh', zh, true, true)
