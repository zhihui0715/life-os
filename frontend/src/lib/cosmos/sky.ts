import type { Scene } from '../theme'

/**
 * The night sky behind the Cosmos theme and the graph, drawn on a 2D canvas. The heavy parts (nebula clouds,
 * planets, galaxies) are painted once per size into an offscreen layer; each frame only blits that layer with a
 * slow drift and draws the twinkling stars, the odd shooting star and whatever the scene animates (aurora curtains,
 * the eclipse's corona).
 */
export interface SkyColours {
  accent: string
  violet: string
  cyan: string
  pink: string
}

// ----- glow sprites: one soft radial disc per colour, so a glow costs a drawImage instead of a shadowBlur
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
    mask.addColorStop(0.22, 'rgba(255,255,255,0.55)')
    mask.addColorStop(0.55, 'rgba(255,255,255,0.12)')
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

interface Star {
  x: number
  y: number
  r: number
  depth: number
  phase: number
  tint: string
}

const MARGIN = 48 // the static layer overhangs the view so its drift never shows an edge
const BASE: Record<Scene, [string, string, string]> = {
  nebula: ['#04050d', '#080b1f', '#100a26'],
  saturn: ['#030409', '#070914', '#120c18'],
  aurora: ['#02060c', '#04121c', '#071a20'],
  'deep-field': ['#010103', '#03040a', '#06050d'],
  eclipse: ['#050307', '#0d0710', '#170b0a'],
}

export function createSky(initialScene: Scene, initialColours: SkyColours) {
  let scene = initialScene
  let colours = initialColours
  let w = 0
  let h = 0
  let stars: Star[] = []
  const layer = document.createElement('canvas')
  const aurora = document.createElement('canvas') // drawn small each frame, scaled up: the upscale is the blur
  // one pre-shaded column of light per curtain colour, stretched into place column by column
  const curtains = (
    [
      ['61,255,176', 0.34, 0],
      ['80,200,255', 0.26, 2.1],
      ['190,110,255', 0.2, 4.2],
    ] as const
  ).map(([rgb, base, k]) => {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 64
    const g = c.getContext('2d')!
    const col = g.createLinearGradient(0, 0, 0, 64)
    col.addColorStop(0, `rgba(${rgb},0)`)
    col.addColorStop(0.75, `rgba(${rgb},0.5)`)
    col.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = col
    g.fillRect(0, 0, 1, 64)
    return [c, base, k] as const
  })
  let ridge: [number, number][] = []
  let shooting: { x: number; y: number; vx: number; vy: number; born: number } | null = null
  let nextShot = 3500

  const paint = () => {
    if (!w || !h) return
    const rand = random(11)
    const lw = w + MARGIN * 2
    const lh = h + MARGIN * 2
    const scale = Math.min(window.devicePixelRatio || 1, 1.5) // it's all soft light: no need for full resolution
    layer.width = Math.ceil(lw * scale)
    layer.height = Math.ceil(lh * scale)
    const g = layer.getContext('2d')!
    g.setTransform(scale, 0, 0, scale, 0, 0)
    const big = Math.max(lw, lh)
    const small = Math.min(w, h)

    const [a, b, c] = BASE[scene]
    const bg = g.createLinearGradient(0, 0, lw * 0.5, lh)
    bg.addColorStop(0, a)
    bg.addColorStop(0.55, b)
    bg.addColorStop(1, c)
    g.fillStyle = bg
    g.fillRect(0, 0, lw, lh)

    // nebula clouds: many faint blobs strung along a band, added together
    const cloud = (colour: string, cx: number, cy: number, angle: number, length: number, count: number, alpha: number) => {
      for (let i = 0; i < count; i++) {
        const t = (rand() - 0.5) * length
        const off = (rand() - 0.5) * length * 0.35
        const x = cx + Math.cos(angle) * t - Math.sin(angle) * off
        const y = cy + Math.sin(angle) * t + Math.cos(angle) * off
        drawGlow(g, colour, x, y, big * (0.08 + rand() * 0.22), alpha * (0.5 + rand()))
      }
    }
    g.globalCompositeOperation = 'lighter'
    if (scene === 'nebula') {
      cloud(colours.violet, lw * 0.35, lh * 0.4, -0.5, big * 0.9, 26, 0.07)
      cloud(colours.accent, lw * 0.62, lh * 0.55, -0.6, big * 0.7, 20, 0.07)
      cloud(colours.cyan, lw * 0.25, lh * 0.25, -0.3, big * 0.4, 12, 0.06)
      cloud(colours.pink, lw * 0.75, lh * 0.35, 0.4, big * 0.35, 10, 0.05)
      // dark dust lanes cut through the glow
      g.globalCompositeOperation = 'source-over'
      for (let i = 0; i < 14; i++) drawGlow(g, '#03040b', lw * (0.25 + rand() * 0.5), lh * (0.3 + rand() * 0.4), big * (0.04 + rand() * 0.08), 0.35)
    } else if (scene === 'saturn') {
      cloud(colours.violet, lw * 0.2, lh * 0.25, -0.4, big * 0.6, 12, 0.04)
      cloud('#c98a4b', lw * 0.7, lh * 0.7, -0.2, big * 0.5, 10, 0.035)
    } else if (scene === 'aurora') {
      cloud('#1fae8a', lw * 0.5, lh * 0.2, 0, big * 0.9, 10, 0.035)
    } else if (scene === 'deep-field') {
      cloud(colours.violet, lw * 0.5, lh * 0.5, 0.3, big * 1.1, 10, 0.02)
    } else {
      cloud('#e0662e', lw * 0.72, lh * 0.32, 0, big * 0.4, 10, 0.05)
      cloud(colours.violet, lw * 0.2, lh * 0.7, 0.2, big * 0.5, 8, 0.03)
    }

    // a few bright stars with diffraction spikes
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 7; i++) {
      const x = rand() * lw
      const y = rand() * lh * (scene === 'aurora' ? 0.7 : 1)
      const s = 6 + rand() * 10
      const tint = rand() < 0.3 ? '#ffd9b0' : '#cfe0ff'
      drawGlow(g, tint, x, y, s * 2.2, 0.55)
      g.strokeStyle = tint
      g.lineWidth = 0.8
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const line = g.createLinearGradient(x - dx * s * 3, y - dy * s * 3, x + dx * s * 3, y + dy * s * 3)
        line.addColorStop(0, 'rgba(255,255,255,0)')
        line.addColorStop(0.5, 'rgba(255,255,255,0.7)')
        line.addColorStop(1, 'rgba(255,255,255,0)')
        g.strokeStyle = line
        g.globalAlpha = 0.8
        g.beginPath()
        g.moveTo(x - dx * s * 3, y - dy * s * 3)
        g.lineTo(x + dx * s * 3, y + dy * s * 3)
        g.stroke()
      }
    }

    if (scene === 'deep-field') {
      // hundreds of faraway galaxies: tilted smudges with bright cores, warm and blue
      for (let i = 0; i < 90; i++) {
        const x = rand() * lw
        const y = rand() * lh
        const r = 2 + rand() ** 3 * 16
        const tint = ['#ffcf9a', '#ffe6c7', '#a8c4ff', '#d7b8ff', '#ff9f80'][Math.floor(rand() * 5)]
        g.save()
        g.translate(x, y)
        g.rotate(rand() * Math.PI)
        g.scale(1, 0.25 + rand() * 0.6)
        drawGlow(g, tint, 0, 0, r * 2.4, 0.5 + rand() * 0.4)
        drawGlow(g, '#ffffff', 0, 0, r * 0.5, 0.6)
        g.restore()
      }
    }

    g.globalCompositeOperation = 'source-over'
    if (scene === 'saturn') {
      // a ringed gas giant rising from the lower right
      const r = small * 0.3
      const x = MARGIN + w * 0.84
      const y = MARGIN + h * 0.86
      const tilt = -0.32
      const ring = (from: number, to: number) => {
        for (let i = 0; i < 46; i++) {
          const k = 1.32 + (i / 46) * 1.05
          const gap = k > 1.86 && k < 1.92 // the Cassini division
          g.globalAlpha = gap ? 0.03 : 0.1 + 0.25 * Math.abs(Math.sin(i * 1.7))
          g.strokeStyle = i % 3 ? '#e8d3a8' : '#c9a774'
          g.lineWidth = r * 0.025
          g.beginPath()
          g.ellipse(x, y, r * k, r * k * 0.26, tilt, from, to)
          g.stroke()
        }
      }
      ring(Math.PI, Math.PI * 2)
      g.globalAlpha = 1
      g.save()
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.clip()
      g.translate(x, y)
      g.rotate(tilt)
      const bands = ['#e9d2a6', '#d3a56a', '#f1e1bf', '#b88a57', '#e4c592', '#c79a62', '#f3e6c9', '#a87a4a']
      for (let i = -12; i < 12; i++) {
        g.fillStyle = bands[(i + 24) % bands.length]
        g.fillRect(-r * 1.2, (i / 12) * r, r * 2.4, r / 12 + 1)
      }
      g.restore()
      const lit = g.createRadialGradient(x - r * 0.5, y - r * 0.5, r * 0.1, x - r * 0.1, y - r * 0.1, r * 1.15)
      lit.addColorStop(0, 'rgba(255,248,230,0.35)')
      lit.addColorStop(0.5, 'rgba(255,248,230,0)')
      lit.addColorStop(0.8, 'rgba(3,4,9,0.45)')
      lit.addColorStop(1, 'rgba(3,4,9,0.9)')
      g.fillStyle = lit
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
      ring(0, Math.PI)
      g.globalAlpha = 1
      g.globalCompositeOperation = 'lighter'
      drawGlow(g, '#d9a86a', x, y, r * 1.5, 0.12)
      g.globalCompositeOperation = 'source-over'
    } else if (scene === 'eclipse') {
      // a total eclipse: corona streamers round a black disc, with the diamond ring catching light
      const r = small * 0.11
      const x = MARGIN + w * 0.74
      const y = MARGIN + h * 0.28
      g.globalCompositeOperation = 'lighter'
      drawGlow(g, '#fff1d6', x, y, r * 6, 0.35)
      drawGlow(g, '#ffd59a', x, y, r * 3, 0.6)
      for (let i = 0; i < 70; i++) {
        const a = rand() * Math.PI * 2
        const len = r * (1.4 + rand() ** 2 * 3.2)
        const ray = g.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len)
        ray.addColorStop(0, 'rgba(255,240,215,0.5)')
        ray.addColorStop(1, 'rgba(255,240,215,0)')
        g.strokeStyle = ray
        g.lineWidth = 1 + rand() * 2.5
        g.globalAlpha = 0.5
        g.beginPath()
        g.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9)
        g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
        g.stroke()
      }
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1
      g.fillStyle = '#020104'
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = 'rgba(255,236,200,0.9)'
      g.lineWidth = 1.5
      g.stroke()
      g.globalCompositeOperation = 'lighter'
      drawGlow(g, '#ffffff', x + Math.cos(-0.7) * r, y + Math.sin(-0.7) * r, r * 0.9, 0.9)
      g.globalCompositeOperation = 'source-over'
    } else if (scene === 'aurora') {
      // a mountain ridge to stand on
      g.fillStyle = '#010306'
      g.globalAlpha = 1
      g.beginPath()
      g.moveTo(0, lh)
      for (const [x, y] of ridge) g.lineTo(x + MARGIN, y + MARGIN)
      g.lineTo(lw, lh)
      g.closePath()
      g.fill()
    }

    // vignette pulls the eye to the middle
    const vig = g.createRadialGradient(lw / 2, lh / 2, small * 0.35, lw / 2, lh / 2, big * 0.75)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,0.5)')
    g.globalAlpha = 1
    g.fillStyle = vig
    g.fillRect(0, 0, lw, lh)
  }

  const resize = (width: number, height: number) => {
    if (width === w && height === h) return
    w = width
    h = height
    const rand = random(7)
    const count = Math.min(scene === 'deep-field' ? 700 : 380, Math.round((w * h) / (scene === 'deep-field' ? 1800 : 3600)))
    stars = Array.from({ length: count }, () => ({
      x: rand(),
      y: rand(),
      r: 0.3 + rand() ** 3 * 1.5,
      depth: [0.04, 0.1, 0.2][Math.floor(rand() * 3)],
      phase: rand() * Math.PI * 2,
      tint: rand() < 0.15 ? '#ffe2c4' : rand() < 0.2 ? '#c9d8ff' : '#eef2ff',
    }))
    ridge = []
    for (let x = -10; x <= w + 10; x += 24) ridge.push([x, h * (0.86 + 0.05 * Math.sin(x * 0.006) + 0.03 * Math.sin(x * 0.021) + rand() * 0.012)])
    paint()
  }

  const draw = (ctx: CanvasRenderingContext2D, time: number, ox = 0, oy = 0, still = false) => {
    if (!w || !h) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const drift = still ? 0 : MARGIN * 0.45
    const dx = Math.max(-MARGIN, Math.min(MARGIN, Math.sin(time * 0.00004) * drift + ox * 0.02))
    const dy = Math.max(-MARGIN, Math.min(MARGIN, Math.cos(time * 0.00003) * drift + oy * 0.02))
    ctx.drawImage(layer, -MARGIN + dx, -MARGIN + dy, w + MARGIN * 2, h + MARGIN * 2)

    ctx.globalCompositeOperation = 'lighter'
    if (scene === 'aurora') {
      // curtains of light, rippling slowly, under the stars
      const aw = Math.max(1, Math.round(w / 6))
      const ah = Math.max(1, Math.round(h / 6))
      if (aurora.width !== aw || aurora.height !== ah) {
        aurora.width = aw
        aurora.height = ah
      }
      const g = aurora.getContext('2d')!
      g.clearRect(0, 0, aw, ah)
      g.globalCompositeOperation = 'lighter'
      const t = still ? 0 : time
      for (const [column, base, k] of curtains) {
        for (let x = 0; x < aw; x++) {
          const fx = x / aw
          const y = ah * (base + 0.08 * Math.sin(fx * 5 + t * 0.00025 + k) + 0.03 * Math.sin(fx * 13 - t * 0.0004 + k))
          const tall = ah * (0.16 + 0.1 * Math.sin(fx * 7 + t * 0.0003 + k * 2))
          g.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(fx * 9 - t * 0.0006 + k))
          g.drawImage(column, x, y - tall, 1, tall + 2)
        }
      }
      ctx.globalAlpha = 0.9
      ctx.drawImage(aurora, 0, 0, w, h * 0.9)
    }

    // stars, three depths for parallax; they twinkle out of step
    for (const s of stars) {
      const x = (((s.x * w + ox * s.depth) % w) + w) % w
      const y = (((s.y * h + oy * s.depth) % h) + h) % h
      if (scene === 'aurora' && y > h * 0.84) continue // behind the mountains
      const tw = still ? 0.8 : 0.55 + 0.45 * Math.sin(time * 0.0016 + s.phase)
      ctx.globalAlpha = tw * (0.3 + s.depth * 3.2)
      ctx.fillStyle = s.tint
      ctx.beginPath()
      ctx.arc(x, y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }

    if (scene === 'eclipse' && !still) {
      // the corona breathes
      const r = Math.min(w, h) * 0.11
      drawGlow(ctx, '#ffe0b0', w * 0.74 + dx, h * 0.28 + dy, r * (2.6 + 0.25 * Math.sin(time * 0.0012)), 0.18)
    }

    // now and then a shooting star crosses the sky
    if (!still) {
      if (!shooting && time > nextShot) {
        shooting = { x: Math.random() * w, y: Math.random() * h * 0.45, vx: 0.45 + Math.random() * 0.4, vy: 0.15 + Math.random() * 0.2, born: time }
        nextShot = time + 8000 + Math.random() * 12000
      }
      if (shooting) {
        const age = time - shooting.born
        const life = 1100
        if (age > life) shooting = null
        else {
          const hx = shooting.x + shooting.vx * age
          const hy = shooting.y + shooting.vy * age
          const ex = hx - shooting.vx * 170
          const ey = hy - shooting.vy * 170
          const tail = ctx.createLinearGradient(hx, hy, ex, ey)
          tail.addColorStop(0, 'rgba(255,255,255,0.9)')
          tail.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.globalAlpha = Math.sin((age / life) * Math.PI)
          ctx.strokeStyle = tail
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(hx, hy)
          ctx.lineTo(ex, ey)
          ctx.stroke()
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  /** Change the scene or colours; repaints the static layer only when something changed. */
  const set = (next: Scene, nextColours: SkyColours) => {
    if (next === scene && JSON.stringify(nextColours) === JSON.stringify(colours)) return
    const recount = (next === 'deep-field') !== (scene === 'deep-field')
    scene = next
    colours = nextColours
    if (recount) {
      const [ww, hh] = [w, h]
      w = h = 0
      resize(ww, hh)
    } else paint()
  }

  return { resize, draw, set }
}

/** Reads the sky's colours from the theme tokens. */
export function readSkyColours(): SkyColours {
  const cs = getComputedStyle(document.documentElement)
  const get = (v: string, fallback: string) => cs.getPropertyValue(v).trim() || fallback
  return { accent: get('--accent', '#409cff'), violet: get('--tint-journal', '#bf5af2'), cyan: get('--tint-focus', '#40c8e0'), pink: get('--tint-graph', '#da8fff') }
}
