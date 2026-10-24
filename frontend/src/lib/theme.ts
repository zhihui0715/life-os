export type ThemeSetting = 'system' | 'light' | 'dark' | 'cosmos'

export const ACCENTS = ['blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'teal', 'graphite'] as const
export type Accent = (typeof ACCENTS)[number]

/** Swatch colours for the picker (the real values, per theme, are in styles/accents.css). */
export const ACCENT_SWATCH: Record<Accent, string> = {
  blue: '#0a84ff', indigo: '#5e5ce6', purple: '#af52de', pink: '#ff2d55', red: '#ff3b30',
  orange: '#ff9500', yellow: '#ffcc00', green: '#34c759', teal: '#30b0c7', graphite: '#8e8e93',
}

/** Space scenes, drawn live by components/cosmos/SpaceSky.tsx; only the Cosmos theme shows them. */
export const SCENES = ['nebula', 'saturn', 'aurora', 'deep-field', 'eclipse'] as const
export type Scene = (typeof SCENES)[number]
export const DEFAULT_SCENE: Scene = 'nebula'

export type BackgroundKind = 'plain' | 'gradient' | 'art' | 'paper' | 'space'
export const BACKGROUNDS: { id: string; kind: BackgroundKind }[] = [
  { id: 'plain', kind: 'plain' },
  ...['sunrise', 'ocean', 'lavender', 'mint', 'midnight'].map((id) => ({ id, kind: 'gradient' as const })),
  ...['great-wave', 'water-lilies', 'bedroom', 'plum-garden', 'grande-jatte', 'rainy-day'].map((id) => ({ id, kind: 'art' as const })),
  ...['dots', 'grid', 'linen'].map((id) => ({ id, kind: 'paper' as const })),
  ...SCENES.map((id) => ({ id, kind: 'space' as const })),
]

/** Public-domain artworks (Art Institute of Chicago, CC0) — shown with their credit when chosen. */
export const ARTWORKS: Record<string, { title: string; artist: string; year: string; url: string }> = {
  'great-wave': { title: 'Under the Wave off Kanagawa (The Great Wave)', artist: 'Katsushika Hokusai', year: '1830/33', url: 'https://www.artic.edu/artworks/24645' },
  'water-lilies': { title: 'Water Lilies', artist: 'Claude Monet', year: '1906', url: 'https://www.artic.edu/artworks/16568' },
  bedroom: { title: 'The Bedroom', artist: 'Vincent van Gogh', year: '1889', url: 'https://www.artic.edu/artworks/28560' },
  'plum-garden': { title: 'Plum Garden at Kameido', artist: 'Utagawa Hiroshige', year: '1857', url: 'https://www.artic.edu/artworks/26577' },
  'grande-jatte': { title: 'A Sunday on La Grande Jatte — 1884', artist: 'Georges Seurat', year: '1884–86', url: 'https://www.artic.edu/artworks/27992' },
  'rainy-day': { title: 'Paris Street; Rainy Day', artist: 'Gustave Caillebotte', year: '1877', url: 'https://www.artic.edu/artworks/20684' },
}

const STORAGE_KEY = 'lifeos.theme'
const LOOK_KEY = 'lifeos.look' // last accent + background, so the first paint already has them
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)')
let current: ThemeSetting = 'system'
let background = 'plain'

/** Cosmos runs on the dark tokens plus its own layer (styles/cosmos.css), over a space scene. */
function apply() {
  const root = document.documentElement
  const cosmos = current === 'cosmos'
  const dark = cosmos || current === 'dark' || (current === 'system' && media()?.matches)
  root.dataset.theme = dark ? 'dark' : 'light'
  if (cosmos) root.dataset.look = 'cosmos'
  else delete root.dataset.look
  // Cosmos always has a scene behind it; the other themes never do
  const chosen = BACKGROUNDS.find((b) => b.id === background) ?? BACKGROUNDS[0]
  const bg = cosmos ? (chosen.kind === 'space' ? chosen : BACKGROUNDS.find((b) => b.id === DEFAULT_SCENE)!) : chosen.kind === 'space' ? BACKGROUNDS[0] : chosen
  root.dataset.bg = bg.id
  root.dataset.bgKind = bg.kind
}

/** The scene Cosmos is showing (the chosen one, or the default when a non-space background is saved). */
export function activeScene(saved: string): Scene {
  return (SCENES as readonly string[]).includes(saved) ? (saved as Scene) : DEFAULT_SCENE
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

/** Applies the accent colour and background (styles/accents.css, styles/backgrounds.css). */
export function setLook(accent: string, chosen: string) {
  const root = document.documentElement
  if (accent === 'blue') delete root.dataset.accent
  else root.dataset.accent = accent
  background = BACKGROUNDS.some((b) => b.id === chosen) ? chosen : 'plain'
  apply()
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify({ accent, background }))
  } catch {
    /* ignore */
  }
}

export function initTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system' || stored === 'cosmos') current = stored
    const look = JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null')
    if (look) setLook(look.accent, look.background)
  } catch {
    /* ignore */
  }
  media()?.addEventListener?.('change', apply)
  apply()
}
