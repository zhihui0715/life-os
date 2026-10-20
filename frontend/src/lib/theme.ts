export type ThemeSetting = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'lifeos.theme'
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)')
let current: ThemeSetting = 'system'

function apply() {
  const dark = current === 'dark' || (current === 'system' && media()?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function setTheme(theme: ThemeSetting) {
  current = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
  apply()
}

export function initTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') current = stored
  } catch {
    /* ignore */
  }
  media()?.addEventListener?.('change', apply)
  apply()
}
