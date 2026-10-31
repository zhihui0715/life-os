/**
 * Glass palettes (styles/glass.css) are the default look: frosted panes over drifting colour lights. Each palette is
 * light or dark on its own and brings its own accent. 'system' | 'light' | 'dark' is Classic, the solid iOS look.
 */
export const GLASS_THEMES = ['aurora', 'sunset', 'rose', 'mono', 'midnight', 'ocean', 'forest', 'cyber'] as const
export type GlassTheme = (typeof GLASS_THEMES)[number]
export const DARK_GLASS: ReadonlySet<string> = new Set<GlassTheme>(['midnight', 'ocean', 'forest', 'cyber'])
export const DEFAULT_THEME: GlassTheme = 'aurora'
/**
 * Each glass palette's own tokens, set on <html> by apply() (styles/glass.css has what all palettes share).
 * Order: ground, solid pane, four lights, glow, accent, accent hover, accent fill, accent soft, text on accent,
 * chart series 1 and 2. Text pairs were checked ≥ 4.5:1 on the frosted panes.
 */
const PALETTES: Record<GlassTheme, string[]> = {
  aurora: ['#eceefe', '#f7f7ff', '#b8a4ff', '#8fe6da', '#ffc0e3', '#a6c6ff', '#6d4ff0', '#5532d0', '#4523b8', '#5532d0', 'rgb(85 50 208 / 0.12)', '#ffffff', '#5532d0', '#0d8f84'],
  sunset: ['#fff1ea', '#fffaf6', '#ffb088', '#ff94ab', '#ffd98a', '#f2a8ff', '#f0603a', '#b83a0c', '#9c300a', '#b83a0c', 'rgb(184 58 12 / 0.11)', '#ffffff', '#c2410c', '#6d3fd8'],
  rose: ['#fbeef3', '#fff8fb', '#f5b3c8', '#dcc0f2', '#ffd6cb', '#c6b4ea', '#d04a84', '#a8235a', '#8e1c4b', '#a8235a', 'rgb(168 35 90 / 0.11)', '#ffffff', '#b0285f', '#3f63d0'],
  mono: ['#eaecef', '#f8f9fa', '#ffffff', '#c5cad3', '#dde1e7', '#b3bac6', '#5b6475', '#1d2533', '#0f1520', '#1d2533', 'rgb(29 37 51 / 0.09)', '#ffffff', '#1d2533', '#2f6fd6'],
  midnight: ['#060a1c', '#111830', '#1f3f9e', '#0b6f8f', '#4a1f96', '#0e2a6b', '#38bdf8', '#6cd0ff', '#9adfff', '#6cd0ff', 'rgb(108 208 255 / 0.14)', '#04121f', '#5cc4ff', '#e879f9'],
  ocean: ['#03151d', '#0b2530', '#0a5675', '#0a8088', '#133f72', '#06604f', '#2dd4bf', '#5ee0d2', '#8ceee3', '#5ee0d2', 'rgb(94 224 210 / 0.13)', '#032024', '#4fd8ca', '#fbbf72'],
  forest: ['#07130d', '#10231a', '#17603a', '#44691a', '#08654c', '#23401f', '#4ade80', '#74e9ad', '#a0f2c8', '#74e9ad', 'rgb(116 233 173 / 0.13)', '#052e16', '#6ee7a8', '#f9c74f'],
  cyber: ['#07040e', '#160f24', '#a3159f', '#4a1a99', '#3f7a0c', '#0b6b85', '#ff4fd8', '#ff6fe0', '#ff9cea', '#ff6fe0', 'rgb(255 111 224 / 0.14)', '#1d0018', '#ff6fe0', '#b6f04a'],
}
const PALETTE_VARS = ['ground', 'solid', 'blob-1', 'blob-2', 'blob-3', 'blob-4', 'glow', 'accent', 'accent-hover', 'accent-fill', 'accent-soft', 'text-on-accent', 'series-1', 'series-2']
/** Ground and four lights of each palette, for the picker tiles. */
export const GLASS_TILES = Object.fromEntries(GLASS_THEMES.map((id) => [id, PALETTES[id].slice(0, 6).filter((_, i) => i !== 1)])) as Record<GlassTheme, string[]>
export const isGlass = (theme: string): theme is GlassTheme => (GLASS_THEMES as readonly string[]).includes(theme)

export type ThemeSetting = 'system' | 'light' | 'dark' | 'academia' | GlassTheme
const THEMES: readonly string[] = ['system', 'light', 'dark', 'academia', ...GLASS_THEMES]

export const ACCENTS = ['blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'teal', 'graphite'] as const
export type Accent = (typeof ACCENTS)[number]

/** Swatch colours for the picker (the real values, per theme, are in styles/accents.css). */
export const ACCENT_SWATCH: Record<Accent, string> = {
  blue: '#0a84ff', indigo: '#5e5ce6', purple: '#af52de', pink: '#ff2d55', red: '#ff3b30',
  orange: '#ff9500', yellow: '#ffcc00', green: '#34c759', teal: '#30b0c7', graphite: '#8e8e93',
}

/**
 * Academia's scenes, drawn live by components/academia/StudyScene.tsx; only the Academia theme shows them. The scene
 * sets the mood: the library, chalkboard and observatory are dark academia, parchment and botanical are light.
 */
export const SCENES = ['library', 'chalkboard', 'observatory', 'parchment', 'botanical'] as const
export type Scene = (typeof SCENES)[number]
export const DEFAULT_SCENE: Scene = 'library'
export const DARK_SCENES: ReadonlySet<Scene> = new Set(['library', 'chalkboard', 'observatory'])

export type BackgroundKind = 'plain' | 'gradient' | 'art' | 'paper' | 'scene'
export const BACKGROUNDS: { id: string; kind: BackgroundKind }[] = [
  { id: 'plain', kind: 'plain' },
  ...['sunrise', 'ocean', 'lavender', 'mint', 'midnight'].map((id) => ({ id, kind: 'gradient' as const })),
  ...['great-wave', 'water-lilies', 'bedroom', 'plum-garden', 'grande-jatte', 'rainy-day'].map((id) => ({ id, kind: 'art' as const })),
  ...['dots', 'grid', 'linen'].map((id) => ({ id, kind: 'paper' as const })),
  ...SCENES.map((id) => ({ id, kind: 'scene' as const })),
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
let current: ThemeSetting = DEFAULT_THEME
let accent = 'blue'
let background = 'plain'

/**
 * Academia runs on its own tokens (styles/academia.css), light or dark as its scene says, over that scene. Glass
 * palettes draw their own backdrop and accent, so the saved background and accent only show in Classic and Academia.
 */
function apply() {
  const root = document.documentElement
  const academia = current === 'academia'
  const glass = isGlass(current)
  const dark = academia
    ? DARK_SCENES.has(activeScene(background))
    : glass
      ? DARK_GLASS.has(current)
      : current === 'dark' || (current === 'system' && media()?.matches)
  root.dataset.theme = dark ? 'dark' : 'light'
  if (!glass && !academia) void import('../styles/classic.css') // accents and backgrounds: Classic only
  if (academia || glass) root.dataset.look = academia ? 'academia' : 'glass'
  else delete root.dataset.look
  if (glass) root.dataset.palette = current
  else delete root.dataset.palette
  PALETTE_VARS.forEach((name, i) => {
    if (glass) root.style.setProperty(`--${name}`, PALETTES[current as GlassTheme][i])
    else root.style.removeProperty(`--${name}`)
  })
  if (glass) root.style.setProperty('--p3', PALETTES[current as GlassTheme][7])
  else root.style.removeProperty('--p3')
  if (glass || accent === 'blue') delete root.dataset.accent
  else root.dataset.accent = accent
  // Academia always has a scene behind it; Classic never does; glass has its own
  const chosen = BACKGROUNDS.find((b) => b.id === background) ?? BACKGROUNDS[0]
  const bg = academia
    ? chosen.kind === 'scene' ? chosen : BACKGROUNDS.find((b) => b.id === DEFAULT_SCENE)!
    : glass || chosen.kind === 'scene' ? BACKGROUNDS[0] : chosen
  root.dataset.bg = bg.id
  root.dataset.bgKind = bg.kind
}

/** The scene Academia is showing (the chosen one, or the default when another kind of background is saved). */
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
export function setLook(chosenAccent: string, chosen: string) {
  accent = chosenAccent
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
    if (stored && THEMES.includes(stored)) current = stored as ThemeSetting
    const look = JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null')
    if (look) setLook(look.accent, look.background)
  } catch {
    /* ignore */
  }
  media()?.addEventListener?.('change', apply)
  apply()
}
