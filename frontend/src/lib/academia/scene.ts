import type { Scene } from '../theme'

/**
 * The backdrops of the Academia theme (and of the graph), painted on a 2D canvas: a library of leather spines in
 * candlelight, a chalkboard of half-erased proofs, an observatory's brass star chart, a sheet of ruled parchment, and
 * a botanist's pressed-fern plates. Everything still is painted once per size into an offscreen layer; each frame
 * only blits it and moves the dust in the air (and flickers the candle, or twinkles the chart's stars).
 */

// ----- glows: one soft radial disc per colour, so a glow costs a drawImage instead of a shadowBlur
const sprites = new Map<string, HTMLCanvasElement>()
function sprite(colour: string) {
  let c = sprites.get(colour)
  if (!c) {
    c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    g.fillStyle = colour // any CSS colour works: the alpha comes from the mask below
    g.fillRect(0, 0, 128, 128)
    const mask = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    mask.addColorStop(0, 'rgba(255,255,255,1)')
    mask.addColorStop(0.25, 'rgba(255,255,255,0.5)')
    mask.addColorStop(0.6, 'rgba(255,255,255,0.1)')
    mask.addColorStop(1, 'rgba(255,255,255,0)')
    g.globalCompositeOperation = 'destination-in'
    g.fillStyle = mask
    g.fillRect(0, 0, 128, 128)
    sprites.set(colour, c)
  }
  return c
}
export function drawGlow(ctx: CanvasRenderingContext2D, colour: string, x: number, y: number, r: number, alpha: number) {
  ctx.globalAlpha = alpha
  ctx.drawImage(sprite(colour), x - r, y - r, r * 2, r * 2)
}

const random = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

// Paper grain: a tile of faint speckles, laid over the parchment scenes
let grainTile: HTMLCanvasElement | null = null
function grain(g: CanvasRenderingContext2D) {
  if (!grainTile) {
    grainTile = document.createElement('canvas')
    grainTile.width = grainTile.height = 160
    const t = grainTile.getContext('2d')!
    const img = t.createImageData(160, 160)
    const rand = random(3)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand()
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v < 0.5 ? 60 : 255
      img.data[i + 3] = Math.floor(rand() * 18)
    }
    t.putImageData(img, 0, 0)
  }
  return g.createPattern(grainTile, 'repeat')!
}

export const SERIF = "'EB Garamond Variable', 'EB Garamond', Garamond, Georgia, 'Songti SC', serif"
const MARGIN = 40 // the still layer overhangs the view so its drift never shows an edge

interface Mote {
  x: number
  y: number
  r: number
  speed: number
  phase: number
}

/** What each scene's dust looks like, and where its light comes from */
const AIR: Record<Scene, { mote: string; count: number; alpha: number }> = {
  library: { mote: '#ffd99a', count: 70, alpha: 0.55 },
  chalkboard: { mote: '#f4f1e6', count: 60, alpha: 0.35 },
  observatory: { mote: '#e9d8a6', count: 30, alpha: 0.3 },
  parchment: { mote: '#c8962f', count: 40, alpha: 0.28 },
  botanical: { mote: '#8a9a5b', count: 35, alpha: 0.25 },
}

export function createScene(initialScene: Scene) {
  let scene = initialScene
  let w = 0
  let h = 0
  let motes: Mote[] = []
  let stars: { x: number; y: number; r: number; phase: number }[] = []
  const layer = document.createElement('canvas')

  const paint = () => {
    if (!w || !h) return
    const rand = random(17)
    const lw = w + MARGIN * 2
    const lh = h + MARGIN * 2
    const scale = Math.min(window.devicePixelRatio || 1, 1.5)
    layer.width = Math.ceil(lw * scale)
    layer.height = Math.ceil(lh * scale)
    const g = layer.getContext('2d')!
    g.setTransform(scale, 0, 0, scale, 0, 0)
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
    const small = Math.min(w, h)
    PAINTERS[scene](g, lw, lh, small, rand)
  }

  const resize = (width: number, height: number) => {
    if (width === w && height === h) return
    w = width
    h = height
    const rand = random(5)
    const air = AIR[scene]
    motes = Array.from({ length: Math.round(air.count * Math.min(1.4, (w * h) / (1280 * 800))) }, () => ({
      x: rand(),
      y: rand(),
      r: 0.6 + rand() ** 2 * 1.8,
      speed: 0.4 + rand() * 0.8,
      phase: rand() * Math.PI * 2,
    }))
    stars = Array.from({ length: 140 }, () => ({ x: rand(), y: rand(), r: 0.4 + rand() ** 3 * 1.4, phase: rand() * Math.PI * 2 }))
    paint()
  }

  const draw = (ctx: CanvasRenderingContext2D, time: number, ox = 0, oy = 0, still = false) => {
    if (!w || !h) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const dx = Math.max(-MARGIN, Math.min(MARGIN, (still ? 0 : Math.sin(time * 0.00003) * 10) + ox * 0.015))
    const dy = Math.max(-MARGIN, Math.min(MARGIN, (still ? 0 : Math.cos(time * 0.000025) * 8) + oy * 0.015))
    ctx.drawImage(layer, -MARGIN + dx, -MARGIN + dy, w + MARGIN * 2, h + MARGIN * 2)

    if (scene === 'observatory') {
      ctx.globalCompositeOperation = 'lighter'
      for (const s of stars) {
        ctx.globalAlpha = still ? 0.7 : 0.45 + 0.4 * Math.sin(time * 0.0014 + s.phase)
        ctx.fillStyle = '#f5ead0'
        ctx.beginPath()
        ctx.arc(s.x * w + dx, s.y * h + dy, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    if (scene === 'library' && !still) {
      // the candle breathes
      ctx.globalCompositeOperation = 'lighter'
      const flicker = 0.85 + 0.1 * Math.sin(time * 0.009) + 0.05 * Math.sin(time * 0.023)
      drawGlow(ctx, '#ffb347', w * 0.5 + dx, h * 0.08 + dy, Math.min(w, h) * 0.55 * flicker, 0.16)
    }

    // dust drifting through the light
    if (!still) {
      const air = AIR[scene]
      ctx.globalCompositeOperation = DARK.has(scene) ? 'lighter' : 'source-over'
      ctx.fillStyle = air.mote
      for (const m of motes) {
        const t = time * 0.00001 * m.speed
        const x = ((((m.x + t * 0.6 + 0.02 * Math.sin(time * 0.0003 * m.speed + m.phase)) % 1) + 1) % 1) * w
        const y = ((((m.y - t + 0.015 * Math.cos(time * 0.0004 * m.speed + m.phase)) % 1) + 1) % 1) * h
        ctx.globalAlpha = air.alpha * (0.5 + 0.5 * Math.sin(time * 0.001 * m.speed + m.phase))
        ctx.beginPath()
        ctx.arc(x, y, m.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  /** Change the scene; repaints the still layer only when it changed. */
  const set = (next: Scene) => {
    if (next === scene) return
    scene = next
    const [ww, hh] = [w, h]
    w = h = 0
    resize(ww, hh)
  }

  return { resize, draw, set }
}

const DARK = new Set<Scene>(['library', 'chalkboard', 'observatory'])

type Painter = (g: CanvasRenderingContext2D, w: number, h: number, small: number, rand: () => number) => void

const vignette = (g: CanvasRenderingContext2D, w: number, h: number, colour: string, strength: number) => {
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75)
  v.addColorStop(0, `rgba(${colour},0)`)
  v.addColorStop(1, `rgba(${colour},${strength})`)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = v
  g.fillRect(0, 0, w, h)
}

const LEATHER = ['#5a2a22', '#6b3a1f', '#3e4a2f', '#2f3b4f', '#4a2c3d', '#7a4a24', '#33281f', '#56331f', '#284034', '#6a2f2f']

/** Dark academia: shelves of leather spines down both sides, a candle-warm wall between them */
const library: Painter = (g, w, h, small, rand) => {
  const wall = g.createLinearGradient(0, 0, 0, h)
  wall.addColorStop(0, '#1d140e')
  wall.addColorStop(1, '#100b07')
  g.fillStyle = wall
  g.fillRect(0, 0, w, h)
  // wood panelling between the shelves
  g.strokeStyle = 'rgba(120,80,45,0.08)'
  g.lineWidth = 1
  for (let x = 0; x < w; x += 6 + rand() * 10) {
    g.beginPath()
    g.moveTo(x, 0)
    g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.7, x + 3, h)
    g.stroke()
  }
  const shelfW = Math.max(110, Math.min(w * 0.17, 260))
  const shelfH = Math.max(120, small * 0.22)
  for (const side of [0, 1]) {
    const x0 = side ? w - shelfW : 0
    g.fillStyle = '#24170f'
    g.fillRect(x0, 0, shelfW, h)
    for (let y = 18; y < h; y += shelfH) {
      // a row of books
      let x = x0 + 8
      while (x < x0 + shelfW - 10) {
        const bw = 9 + rand() * 14
        const bh = shelfH * (0.62 + rand() * 0.3)
        const lean = rand() < 0.07 ? (rand() - 0.5) * 0.25 : 0
        g.save()
        g.translate(x + bw / 2, y + shelfH - 14)
        g.rotate(lean)
        const spine = g.createLinearGradient(-bw / 2, 0, bw / 2, 0)
        const c = LEATHER[Math.floor(rand() * LEATHER.length)]
        spine.addColorStop(0, 'rgba(0,0,0,0.45)')
        spine.addColorStop(0.35, c)
        spine.addColorStop(0.65, c)
        spine.addColorStop(1, 'rgba(0,0,0,0.55)')
        g.fillStyle = spine
        g.fillRect(-bw / 2, -bh, bw, bh)
        // gilt bands
        g.fillStyle = 'rgba(214,170,90,0.55)'
        g.fillRect(-bw / 2 + 1, -bh + bh * 0.12, bw - 2, 1.4)
        g.fillRect(-bw / 2 + 1, -bh + bh * 0.18, bw - 2, 0.8)
        g.fillRect(-bw / 2 + 1, -bh * 0.14, bw - 2, 1.4)
        if (rand() < 0.5) {
          g.fillStyle = 'rgba(214,170,90,0.35)'
          g.fillRect(-bw / 2 + 2, -bh * 0.6, bw - 4, bh * 0.12)
        }
        g.restore()
        x += bw + (rand() < 0.08 ? 6 : 1)
      }
      // the shelf board
      const board = g.createLinearGradient(0, y + shelfH - 14, 0, y + shelfH)
      board.addColorStop(0, '#5a3a20')
      board.addColorStop(1, '#2a1a0e')
      g.fillStyle = board
      g.fillRect(x0, y + shelfH - 14, shelfW, 14)
    }
    // shade the shelves towards the room
    const shade = g.createLinearGradient(side ? x0 : x0 + shelfW, 0, side ? x0 + shelfW : x0, 0)
    shade.addColorStop(0, 'rgba(10,6,3,0.75)')
    shade.addColorStop(1, 'rgba(10,6,3,0.05)')
    g.fillStyle = shade
    g.fillRect(x0, 0, shelfW, h)
  }
  // warm candlelight from above, and a beam from a high window
  g.globalCompositeOperation = 'lighter'
  drawGlow(g, '#ff9f45', w * 0.5, h * 0.05, small * 0.7, 0.18)
  g.globalAlpha = 0.05
  g.fillStyle = '#ffe2b0'
  g.beginPath()
  g.moveTo(w * 0.25, 0)
  g.lineTo(w * 0.42, 0)
  g.lineTo(w * 0.78, h)
  g.lineTo(w * 0.5, h)
  g.closePath()
  g.fill()
  vignette(g, w, h, '5,3,1', 0.65)
}

const CHALK_LINES = ['a² + b² = c²', '∫₀^∞ e^(−x²) dx = √π ⁄ 2', 'E = mc²', 'Σ 1/n² = π²/6', 'e^(iπ) + 1 = 0', '∇ · E = ρ / ε₀', 'f′(x) = lim (f(x+h) − f(x)) / h', 'p ⇒ q', 'Δx · Δp ≥ ħ/2', 'sin²θ + cos²θ = 1']

/** A slate chalkboard with half-erased proofs, diagrams and a wooden chalk tray */
const chalkboard: Painter = (g, w, h, small, rand) => {
  const slate = g.createLinearGradient(0, 0, w, h)
  slate.addColorStop(0, '#1d2a23')
  slate.addColorStop(1, '#16211b')
  g.fillStyle = slate
  g.fillRect(0, 0, w, h)
  // erased haze
  for (let i = 0; i < 26; i++) drawGlow(g, '#dfe6dc', rand() * w, rand() * h, small * (0.1 + rand() * 0.25), 0.035)
  g.globalCompositeOperation = 'source-over'
  // equations in chalk, scattered and slightly tilted
  const size = Math.max(16, small * 0.032)
  for (let i = 0; i < 14; i++) {
    const text = CHALK_LINES[i % CHALK_LINES.length]
    g.save()
    g.translate(rand() * w * 0.9 + w * 0.02, rand() * h * 0.9 + h * 0.06)
    g.rotate((rand() - 0.5) * 0.12)
    g.globalAlpha = 0.12 + rand() * 0.16
    g.fillStyle = '#f2efe4'
    g.font = `italic ${size * (0.8 + rand() * 0.6)}px ${SERIF}`
    g.fillText(text, 0, 0)
    g.restore()
  }
  // a triangle, a circle with a radius and a sine wave
  g.strokeStyle = '#f2efe4'
  g.lineWidth = 2
  g.globalAlpha = 0.2
  const tx = w * 0.12
  const ty = h * 0.72
  g.beginPath()
  g.moveTo(tx, ty)
  g.lineTo(tx + small * 0.22, ty)
  g.lineTo(tx, ty - small * 0.16)
  g.closePath()
  g.stroke()
  g.strokeRect(tx + 1, ty - 12, 11, 11)
  g.beginPath()
  g.arc(w * 0.84, h * 0.24, small * 0.09, 0, Math.PI * 2)
  g.moveTo(w * 0.84, h * 0.24)
  g.lineTo(w * 0.84 + small * 0.09, h * 0.24)
  g.stroke()
  g.beginPath()
  for (let x = 0; x <= small * 0.4; x += 3) g.lineTo(w * 0.6 + x, h * 0.86 - Math.sin(x / (small * 0.04)) * small * 0.04)
  g.stroke()
  g.globalAlpha = 0.12
  g.beginPath()
  g.moveTo(w * 0.6, h * 0.86)
  g.lineTo(w * 0.6 + small * 0.42, h * 0.86)
  g.stroke()
  // the wooden frame and chalk tray along the bottom
  const tray = g.createLinearGradient(0, h - 26, 0, h)
  tray.addColorStop(0, '#6b4424')
  tray.addColorStop(1, '#3a2312')
  g.globalAlpha = 1
  g.fillStyle = tray
  g.fillRect(0, h - 26, w, 26)
  g.fillStyle = '#f4f1e6'
  g.fillRect(w * 0.3, h - 32, 34, 6)
  g.fillRect(w * 0.34, h - 31, 18, 5)
  vignette(g, w, h, '4,8,6', 0.55)
}

const CONSTELLATIONS: [number, number][][] = [
  [[0.12, 0.2], [0.17, 0.26], [0.22, 0.23], [0.27, 0.3], [0.31, 0.27]],
  [[0.7, 0.12], [0.74, 0.18], [0.79, 0.15], [0.83, 0.22], [0.78, 0.27], [0.74, 0.18]],
  [[0.15, 0.7], [0.2, 0.66], [0.26, 0.72], [0.22, 0.8], [0.15, 0.7]],
  [[0.72, 0.68], [0.78, 0.74], [0.85, 0.7], [0.9, 0.78]],
]

/** An old celestial chart in brass on navy: graticule, ecliptic, zodiac ring and constellations */
const observatory: Painter = (g, w, h, small, rand) => {
  const sky = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
  sky.addColorStop(0, '#13213a')
  sky.addColorStop(1, '#070c18')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  const cx = w * 0.5
  const cy = h * 0.5
  const R = Math.max(w, h) * 0.46
  g.strokeStyle = '#c9a45c'
  // graticule
  for (let k = 1; k <= 5; k++) {
    g.globalAlpha = k === 5 ? 0.3 : 0.1
    g.lineWidth = k === 5 ? 1.6 : 0.8
    g.beginPath()
    g.arc(cx, cy, (R * k) / 5, 0, Math.PI * 2)
    g.stroke()
  }
  g.globalAlpha = 0.08
  for (let a = 0; a < 24; a++) {
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + Math.cos((a / 24) * Math.PI * 2) * R, cy + Math.sin((a / 24) * Math.PI * 2) * R)
    g.stroke()
  }
  // the zodiac ring: ticks every degree, longer every ten
  g.globalAlpha = 0.28
  for (let d = 0; d < 360; d++) {
    const a = (d / 360) * Math.PI * 2
    const len = d % 30 === 0 ? 16 : d % 10 === 0 ? 9 : 4
    g.lineWidth = d % 30 === 0 ? 1.4 : 0.6
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
    g.lineTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len))
    g.stroke()
  }
  const signs = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓']
  g.fillStyle = '#c9a45c'
  g.globalAlpha = 0.35
  g.font = `${Math.max(14, small * 0.026)}px ${SERIF}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  signs.forEach((s, i) => {
    const a = ((i + 0.5) / 12) * Math.PI * 2
    g.fillText(s, cx + Math.cos(a) * (R - 32), cy + Math.sin(a) * (R - 32))
  })
  // the ecliptic, tilted
  g.globalAlpha = 0.22
  g.lineWidth = 1.2
  g.setLineDash([6, 6])
  g.beginPath()
  g.ellipse(cx, cy, R * 0.8, R * 0.32, -0.41, 0, Math.PI * 2)
  g.stroke()
  g.setLineDash([])
  // constellations: brass lines between bright stars
  for (const c of CONSTELLATIONS) {
    g.globalAlpha = 0.35
    g.lineWidth = 1
    g.beginPath()
    c.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)))
    g.stroke()
    g.globalCompositeOperation = 'lighter'
    for (const [x, y] of c) drawGlow(g, '#fff1c9', x * w, y * h, 7 + rand() * 4, 0.8)
    g.globalCompositeOperation = 'source-over'
  }
  vignette(g, w, h, '3,5,12', 0.6)
}

/** Light academia: a sheet of aged parchment, ruled, with a margin, a coffee ring and a few ink blots */
const parchment: Painter = (g, w, h, small, rand) => {
  const paper = g.createRadialGradient(w * 0.45, h * 0.4, 0, w / 2, h / 2, Math.max(w, h) * 0.75)
  paper.addColorStop(0, '#f6eedb')
  paper.addColorStop(1, '#e6d5b0')
  g.fillStyle = paper
  g.fillRect(0, 0, w, h)
  g.fillStyle = grain(g)
  g.fillRect(0, 0, w, h)
  // blotches of age
  for (let i = 0; i < 18; i++) drawGlow(g, '#b98c4a', rand() * w, rand() * h, small * (0.05 + rand() * 0.18), 0.06)
  // ruled lines and a red margin
  g.strokeStyle = '#7d9cc0'
  g.lineWidth = 1
  g.globalAlpha = 0.16
  for (let y = 96; y < h; y += 32) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(w, y)
    g.stroke()
  }
  g.strokeStyle = '#b5413a'
  g.globalAlpha = 0.28
  g.beginPath()
  g.moveTo(Math.min(96, w * 0.09), 0)
  g.lineTo(Math.min(96, w * 0.09), h)
  g.stroke()
  // a coffee ring
  g.strokeStyle = '#8a5a2b'
  g.globalAlpha = 0.14
  for (let i = 0; i < 3; i++) {
    g.lineWidth = 2 + rand() * 3
    g.beginPath()
    g.arc(w * 0.82, h * 0.78, small * 0.08 + i * 2, rand(), Math.PI * 1.75 + rand())
    g.stroke()
  }
  // ink blots and a flourish
  g.fillStyle = '#2b2118'
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.18 + rand() * 0.2
    const x = w * (0.1 + rand() * 0.8)
    const y = h * (0.1 + rand() * 0.8)
    g.beginPath()
    g.arc(x, y, 1.5 + rand() * 3.5, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = '#2b2118'
  g.globalAlpha = 0.16
  g.lineWidth = 1.4
  g.beginPath()
  const fx = w * 0.7
  const fy = h * 0.14
  g.moveTo(fx, fy)
  g.bezierCurveTo(fx + 40, fy - 30, fx + 90, fy + 30, fx + 140, fy)
  g.bezierCurveTo(fx + 170, fy - 18, fx + 150, fy - 40, fx + 120, fy - 20)
  g.stroke()
  vignette(g, w, h, '120,80,30', 0.32)
}

/** A sprig of fern, drawn in ink: a curved stem with paired leaflets shrinking to the tip */
function fern(g: CanvasRenderingContext2D, x: number, y: number, length: number, angle: number, bend: number, colour: string) {
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  g.strokeStyle = colour
  g.fillStyle = colour
  g.lineWidth = 1.4
  g.beginPath()
  g.moveTo(0, 0)
  g.quadraticCurveTo(length * 0.5, -length * bend, length, 0)
  g.stroke()
  const steps = 18
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const px = length * t
    const py = -length * bend * 4 * t * (1 - t) * 0.5
    const leaf = (1 - t) * length * 0.16 + 3
    for (const side of [-1, 1]) {
      g.beginPath()
      g.ellipse(px + leaf * 0.3, py + side * leaf * 0.55, leaf * 0.62, leaf * 0.22, side * 0.9, 0, Math.PI * 2)
      g.globalAlpha = 0.5
      g.fill()
      g.globalAlpha = 0.7
      g.stroke()
    }
  }
  g.restore()
}

/** A botanist's plate: cream paper, pressed ferns in sepia and green ink, specimen labels and tape */
const botanical: Painter = (g, w, h, small, rand) => {
  const paper = g.createLinearGradient(0, 0, w, h)
  paper.addColorStop(0, '#f7f1e1')
  paper.addColorStop(1, '#ece2c8')
  g.fillStyle = paper
  g.fillRect(0, 0, w, h)
  g.fillStyle = grain(g)
  g.fillRect(0, 0, w, h)
  // On a phone the page's header and buttons fill the corners, so the ferns stay small there and the labels are left out
  const phone = w < 700
  const len = phone ? 110 : Math.max(160, small * 0.36)
  const plates: [number, number, number, number, string][] = [
    [w * 0.03, h * 0.95, -1.15, 0.12, '#55663a'],
    [w * 0.08, h * 0.98, -0.85, -0.1, '#6b5530'],
    [w * 0.97, h * 0.05, 2.1, 0.1, '#55663a'],
    [w * 0.93, h * 0.02, 1.75, -0.12, '#6b5530'],
    [w * 0.98, h * 0.98, -2.2, 0.08, '#4d5e34'],
  ]
  for (const [x, y, a, b, c] of plates) fern(g, x, y, len * (0.8 + rand() * 0.4), a, b, c)
  // specimen labels with tape
  const label = (x: number, y: number, name: string, no: string) => {
    g.save()
    g.translate(x, y)
    g.rotate((rand() - 0.5) * 0.08)
    g.globalAlpha = 1
    g.fillStyle = '#fbf7ea'
    g.strokeStyle = 'rgba(80,60,30,0.35)'
    g.lineWidth = 1
    g.fillRect(0, 0, 170, 54)
    g.strokeRect(4, 4, 162, 46)
    g.fillStyle = '#3a2c1c'
    g.font = `italic 15px ${SERIF}`
    g.fillText(name, 12, 26)
    g.font = `11px ${SERIF}`
    g.globalAlpha = 0.7
    g.fillText(no, 12, 42)
    g.fillStyle = 'rgba(214,196,150,0.55)'
    g.globalAlpha = 1
    g.fillRect(60, -8, 48, 16)
    g.restore()
  }
  if (!phone) {
    label(w * 0.06, h * 0.08, 'Pteridium aquilinum', 'Plate IV · No. 112')
    label(w * 0.76, h * 0.84, 'Polypodium vulgare', 'Plate VII · No. 205')
  }
  vignette(g, w, h, '110,80,40', 0.22)
}

const PAINTERS: Record<Scene, Painter> = { library, chalkboard, observatory, parchment, botanical }
