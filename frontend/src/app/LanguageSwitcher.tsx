import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LOCALES } from '../lib/i18n'

/** Changes the display language immediately. When logged in, Settings also saves it to the account. */
export function LanguageSwitcher({ onChange }: { onChange?: (locale: string) => void }) {
  const { t, i18n } = useTranslation()
  return (
    <label className="text-muted inline-flex items-center gap-2">
      <Languages size={16} aria-hidden />
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={i18n.language}
        onChange={(e) => {
          i18n.changeLanguage(e.target.value)
          onChange?.(e.target.value)
        }}
        className="hover:text-fg bg-transparent py-1 text-sm"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(`language.${l}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
