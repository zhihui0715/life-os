import { useEffect, useRef } from 'react'

import '../../styles/cosmos.css' // the theme's styles travel with its sky: only Cosmos users download them
import { createSky, readSkyColours } from '../../lib/cosmos/sky'
import { activeScene } from '../../lib/theme'

const FRAME_MS = 1000 / 30 // a background doesn't need 60 fps; half the battery

/**
 * The Cosmos theme's sky: a fixed canvas behind everything. It follows the chosen scene and accent, drifts a little
 * with scrolling and the pointer, sleeps while the tab is hidden, and holds still under reduced motion.
 */
export default function SpaceSky() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const root = document.documentElement
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let still = !!motion?.matches
    const sky = createSky(activeScene(root.dataset.bg ?? ''), readSkyColours())
    let w = 0
    let h = 0
    let pointer = { x: 0, y: 0 }
    let eased = { x: 0, y: 0 }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sky.resize(w, h)
      if (still) paint(0)
    }
    const paint = (time: number) => {
      eased = { x: eased.x + (pointer.x - eased.x) * 0.05, y: eased.y + (pointer.y - eased.y) * 0.05 }
      sky.draw(ctx, time, eased.x, eased.y - window.scrollY * 0.6, still)
    }

    let frame = 0
    let last = 0
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop)
      if (time - last < FRAME_MS) return
      last = time
      paint(time)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      if (still) paint(0)
      else if (!document.hidden) frame = requestAnimationFrame(loop)
    }

    const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : start())
    const onMotion = () => {
      still = !!motion?.matches
      start()
    }
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') pointer = { x: (e.clientX / w - 0.5) * -40, y: (e.clientY / h - 0.5) * -30 }
    }
    const onScroll = () => still && paint(0)
    // the scene and colours live on <html> (lib/theme.ts)
    const mo = new MutationObserver(() => {
      sky.set(activeScene(root.dataset.bg ?? ''), readSkyColours())
      if (still) paint(0)
    })
    mo.observe(root, { attributes: true, attributeFilter: ['data-bg', 'data-accent', 'data-theme'] })

    resize()
    start()
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointermove', onPointer, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    motion?.addEventListener?.('change', onMotion)
    return () => {
      cancelAnimationFrame(frame)
      mo.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      motion?.removeEventListener?.('change', onMotion)
    }
  }, [])

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 -z-10 h-full w-full" aria-hidden />
}
