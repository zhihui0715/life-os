/**
 * Celebration confetti for milestones (all of today's tasks done, a set of tomatoes, a finished weekly review, habit
 * streaks). A canvas over the page for about two seconds; nothing at all under prefers-reduced-motion.
 * `emoji` throws emoji instead of paper (🍅 for tomatoes, 🔥 for streaks).
 */
const COLOURS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#30b0c7', '#0a84ff', '#af52de', '#ff2d55']

interface Bit {
  x: number
  y: number
  vx: number
  vy: number
  spin: number
  angle: number
  size: number
  colour: string
  emoji?: string
}

export function confetti({ emoji, count = 110, origin = { x: 0.5, y: 0.35 } }: { emoji?: string[]; count?: number; origin?: { x: number; y: number } } = {}) {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: `${w}px`, height: `${h}px`, pointerEvents: 'none', zIndex: '100' })
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  const n = emoji ? Math.min(count, 36) : count
  const bits: Bit[] = Array.from({ length: n }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9
    const speed = 7 + Math.random() * 9
    return {
      x: origin.x * w,
      y: origin.y * h,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      spin: (Math.random() - 0.5) * 0.4,
      angle: Math.random() * Math.PI,
      size: emoji ? 20 + Math.random() * 14 : 6 + Math.random() * 6,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      emoji: emoji?.[Math.floor(Math.random() * emoji.length)],
    }
  })

  const start = performance.now()
  const DURATION = 2200
  const frame = (now: number) => {
    const t = now - start
    ctx.clearRect(0, 0, w, h)
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION * 0.6) / (DURATION * 0.4))
    for (const b of bits) {
      b.vy += 0.32 // gravity
      b.vx *= 0.985 // air
      b.x += b.vx
      b.y += b.vy
      b.angle += b.spin
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.angle)
      if (b.emoji) {
        ctx.font = `${b.size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`
        ctx.textAlign = 'center'
        ctx.fillText(b.emoji, 0, 0)
      } else {
        ctx.fillStyle = b.colour
        ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2) // a paper strip, turning
      }
      ctx.restore()
    }
    if (t < DURATION) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
