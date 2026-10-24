import { forceCenter, forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { useEffect, useRef } from 'react'

import { createSky, drawGlow as glowOn, readSkyColours } from '../../lib/cosmos/sky'
import { activeScene, type Scene } from '../../lib/theme'
import type { GraphLink, GraphNode, Urgency } from './api'
import type { Layout } from './filter'
import { KIND_VAR, LINK_DISTANCE, ORBIT, orbitRadius, radius, URGENCY_VAR } from './style'

export interface SimNode extends GraphNode, SimulationNodeDatum {}
type SimLink = SimulationLinkDatum<SimNode> & { kind: GraphLink['kind'] }

interface Props {
  nodes: SimNode[]
  links: GraphLink[]
  selected: string | null
  dimmed: (n: SimNode) => boolean
  onSelect: (n: SimNode | null) => void
  layout: Layout
  /** names for the rings of the orbits layout, and for the sun at their centre */
  ringLabels: Record<Urgency | 'now', string>
  /** gets the canvas's zoom controls once mounted */
  controls: React.MutableRefObject<{ zoom: (factor: number) => void; fit: () => void } | null>
}

/**
 * Draws the graph on a canvas and runs the physics (d3-force). Drag empty space to pan, drag a node to move it,
 * pinch or scroll to zoom, tap a node to focus it and its neighbours. Drawn as deep space: goals are ringed planets,
 * due-date hubs are suns with their tasks in orbit, tasks are stars in their urgency colour, and overdue ones flare.
 * In the orbits layout, tasks circle a central "now" on rings by urgency (the nearer, the sooner) and slowly revolve,
 * inner rings faster, with goals out on the edge.
 */
export function GraphCanvas({ nodes, links, selected, dimmed, onSelect, layout, ringLabels, controls }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef({ x: 0, y: 0, k: 1 })
  const sim = useRef<Simulation<SimNode, SimLink> | null>(null)
  const props = useRef({ selected, dimmed, onSelect, ringLabels })
  props.current = { selected, dimmed, onSelect, ringLabels }

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    // the sky: in Cosmos the scene you picked, elsewhere a nebula
    const root = document.documentElement
    const scene = (): Scene => (root.dataset.look === 'cosmos' ? activeScene(root.dataset.bg ?? '') : 'nebula')
    const sky = createSky(scene(), readSkyColours())
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sky.resize(w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // theme colours, re-read when the theme or accent changes
    let colours: Record<string, string> = {}
    const readColours = () => {
      const cs = getComputedStyle(document.documentElement)
      const get = (v: string) => cs.getPropertyValue(v).trim()
      colours = Object.fromEntries(['--p1', '--warning-fill', '--urgency-week', '--accent', '--text-subtle', '--tint-goals', '--tint-focus', '--tint-habits'].map((v) => [v, get(v)]))
    }
    readColours()
    const mo = new MutationObserver(() => {
      readColours()
      sky.set(scene(), readSkyColours())
    })
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'data-bg', 'data-look'] })

    const byId = new Map(nodes.map((n) => [n.id, n]))
    const simLinks: SimLink[] = links.filter((l) => byId.has(l.source) && byId.has(l.target)).map((l) => ({ ...l }))
    const neighbours = new Map<string, Set<string>>()
    for (const l of links) {
      ;(neighbours.get(l.source) ?? neighbours.set(l.source, new Set()).get(l.source)!).add(l.target)
      ;(neighbours.get(l.target) ?? neighbours.set(l.target, new Set()).get(l.target)!).add(l.source)
    }

    const orbits = layout === 'orbits'
    const simulation = forceSimulation<SimNode, SimLink>(nodes)
      .force('link', forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance((l) => (orbits ? 30 : LINK_DISTANCE[l.kind])).strength(orbits ? 0.02 : 0.6))
      .force('charge', forceManyBody<SimNode>().strength((d) => (orbits ? -40 : d.kind === 'hub' ? -380 : d.kind === 'goal' ? -260 : -90)))
      .force('collide', forceCollide<SimNode>((d) => radius(d) + 3))
    if (orbits) simulation.force('radial', forceRadial<SimNode>(orbitRadius, 0, 0).strength(0.9))
    else simulation.force('center', forceCenter(0, 0)).force('x', forceX(0).strength(0.04)).force('y', forceY(0).strength(0.06))
    sim.current = simulation
    if (reduce) {
      simulation.stop()
      for (let i = 0; i < 300; i++) simulation.tick()
    }

    const toWorld = (sx: number, sy: number) => ({ x: (sx - w / 2 - view.current.x) / view.current.k, y: (sy - h / 2 - view.current.y) / view.current.k })
    const hit = (sx: number, sy: number) => {
      const p = toWorld(sx, sy)
      let best: SimNode | null = null
      let bestD = Infinity
      for (const n of nodes) {
        const d = Math.hypot((n.x ?? 0) - p.x, (n.y ?? 0) - p.y)
        const r = radius(n) + 8 / view.current.k
        if (d < r && d < bestD) {
          best = n
          bestD = d
        }
      }
      return best
    }

    const fit = () => {
      if (!nodes.length) return
      const edge = orbits ? Math.max(ORBIT.goal, ...nodes.map((n) => Math.hypot(n.x ?? 0, n.y ?? 0))) + 40 : 0
      const xs = orbits ? [-edge, edge] : nodes.map((n) => n.x ?? 0)
      const ys = orbits ? [-edge, edge] : nodes.map((n) => n.y ?? 0)
      const bw = Math.max(...xs) - Math.min(...xs) + 80
      const bh = Math.max(...ys) - Math.min(...ys) + 80
      const k = Math.min(2.2, Math.max(0.25, Math.min(w / bw, h / bh)))
      view.current = { k, x: -((Math.max(...xs) + Math.min(...xs)) / 2) * k, y: -((Math.max(...ys) + Math.min(...ys)) / 2) * k }
    }
    const zoomAt = (factor: number, sx = w / 2, sy = h / 2) => {
      const v = view.current
      const k = Math.min(4, Math.max(0.2, v.k * factor))
      const ox = sx - w / 2
      const oy = sy - h / 2
      view.current = { k, x: ox - ((ox - v.x) * k) / v.k, y: oy - ((oy - v.y) * k) / v.k }
    }
    controls.current = { zoom: (f) => zoomAt(f), fit }
    let fitted = false

    const drawGlow = (colour: string, x: number, y: number, r: number, alpha: number) => glowOn(ctx, colour, x, y, r, alpha)
    const nodeColour = (n: SimNode) =>
      n.kind === 'task' ? colours[URGENCY_VAR[n.urgency ?? 'none']] : n.kind === 'hub' ? colours[URGENCY_VAR[(n.ref as Urgency) ?? 'none']] : colours[KIND_VAR[n.kind]]

    // a lit sphere: base colour, a highlight up-left and a shadowed limb down-right
    const sphere = (colour: string, x: number, y: number, r: number) => {
      ctx.fillStyle = colour
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      const lit = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x - r * 0.2, y - r * 0.2, r * 1.1)
      lit.addColorStop(0, 'rgba(255,255,255,0.75)')
      lit.addColorStop(0.35, 'rgba(255,255,255,0.12)')
      lit.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = lit
      ctx.fill()
      const shade = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.4, x, y, r)
      shade.addColorStop(0, 'rgba(4,5,16,0)')
      shade.addColorStop(1, 'rgba(4,5,16,0.6)')
      ctx.fillStyle = shade
      ctx.fill()
    }
    // a tilted planetary ring, drawn in two halves so the planet sits inside it
    const ring = (colour: string, x: number, y: number, r: number, half: 'back' | 'front', alpha: number) => {
      ctx.globalAlpha = alpha
      ctx.strokeStyle = colour
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.ellipse(x, y, r * 1.75, r * 0.5, -0.38, half === 'back' ? Math.PI : 0, half === 'back' ? Math.PI * 2 : Math.PI)
      ctx.stroke()
    }
    const sparkle = (x: number, y: number, r: number, spin: number) => {
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = spin + (i * Math.PI) / 4
        const d = i % 2 === 0 ? r * 1.5 : r * 0.4
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d)
      }
      ctx.closePath()
      ctx.fill()
    }
    const linkSeed = simLinks.map((_, i) => ((i * 2654435761) % 1000) / 1000)

    // ----- drawing
    let frame = 0
    let last = 0
    const draw = (time: number) => {
      const { selected: sel, dimmed: isDim, ringLabels: rings } = props.current
      // orbits revolve, inner rings faster, like planets (Kepler's third law, roughly)
      if (orbits && !reduce && last) {
        const dt = Math.min(time - last, 100)
        for (const n of nodes) {
          if (n.fx != null) continue
          const x = n.x ?? 0
          const y = n.y ?? 0
          const a = 0.00012 * (ORBIT.overdue / Math.max(Math.hypot(x, y), ORBIT.overdue)) ** 1.5 * dt
          n.x = x * Math.cos(a) - y * Math.sin(a)
          n.y = x * Math.sin(a) + y * Math.cos(a)
        }
      }
      last = time
      // a ring is lit unless the urgency filter is showing other rings
      const lit = (u: Urgency) => !isDim({ id: `ring:${u}`, kind: 'hub', ref: u, label: '' })
      const focus = sel ? new Set([sel, ...(neighbours.get(sel) ?? [])]) : null
      const v = view.current
      if (!fitted && (reduce || simulation.alpha() < 0.3)) {
        fit()
        fitted = true
      }
      sky.draw(ctx, time, v.x, v.y, reduce)
      ctx.save()
      ctx.translate(w / 2 + v.x, h / 2 + v.y)
      ctx.scale(v.k, v.k)

      if (orbits) {
        // the rings, each in its urgency colour and named at the top, round the sun of "now"
        for (const u of ['overdue', 'today', 'week', 'later', 'none'] as const) {
          const r = ORBIT[u]
          ctx.globalAlpha = lit(u) ? 0.3 : 0.07
          ctx.strokeStyle = colours[URGENCY_VAR[u]]
          ctx.lineWidth = 1.2 / v.k
          if (u === 'none') ctx.setLineDash([3 / v.k, 6 / v.k])
          ctx.beginPath()
          ctx.arc(0, 0, r, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.globalAlpha = lit(u) ? 0.8 : 0.25
          ctx.fillStyle = colours[URGENCY_VAR[u]]
          ctx.font = `650 ${10 / Math.max(v.k, 0.6)}px system-ui, -apple-system, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText(rings[u].toUpperCase(), 0, -r - 4)
        }
        ctx.globalAlpha = 0.08
        ctx.strokeStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(0, 0, ORBIT.goal, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalCompositeOperation = 'lighter'
        drawGlow(colours['--warning-fill'], 0, 0, 70 * (reduce ? 1 : 1 + 0.06 * Math.sin(time * 0.0015)), 0.5)
        drawGlow('#fff4d6', 0, 0, 30, 0.95)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 0.9
        ctx.fillStyle = 'rgba(244,246,255,0.96)'
        ctx.font = `650 ${12 / Math.max(v.k, 0.6)}px system-ui, -apple-system, sans-serif`
        ctx.textBaseline = 'top'
        ctx.fillText(rings.now, 0, 26)
      }

      // orbits: faint turning circles round each due-date sun, where its tasks settle
      for (const n of nodes) {
        if (n.kind !== 'hub' || isDim(n)) continue
        ctx.globalAlpha = focus && !focus.has(n.id) ? 0.03 : 0.14
        ctx.strokeStyle = nodeColour(n)
        ctx.lineWidth = 1 / v.k
        ctx.setLineDash([2 / v.k, 6 / v.k])
        ctx.lineDashOffset = reduce ? 0 : -time * 0.004
        ctx.beginPath()
        ctx.arc(n.x ?? 0, n.y ?? 0, LINK_DISTANCE.due, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // links: thin beams blending from one end's colour to the other's; in focus, photons travel along them
      ctx.globalCompositeOperation = 'lighter'
      simLinks.forEach((l, i) => {
        const s = l.source as SimNode
        const t = l.target as SimNode
        const sx = s.x ?? 0
        const sy = s.y ?? 0
        const tx = t.x ?? 0
        const ty = t.y ?? 0
        const on = focus ? focus.has(s.id) && focus.has(t.id) : true
        const faded = isDim(s) || isDim(t)
        ctx.globalAlpha = faded ? 0.04 : focus ? (on ? 0.9 : 0.04) : 0.32
        if (focus && on) ctx.strokeStyle = colours['--accent']
        else {
          const g = ctx.createLinearGradient(sx, sy, tx, ty)
          g.addColorStop(0, nodeColour(s))
          g.addColorStop(1, nodeColour(t))
          ctx.strokeStyle = g
        }
        ctx.lineWidth = (focus && on ? 1.6 : 0.9) / Math.sqrt(v.k)
        if (l.kind === 'due') ctx.setLineDash([2 / v.k, 5 / v.k])
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.setLineDash([])
        if (focus && on && !faded && !reduce) {
          const p = (time / 1400 + linkSeed[i]) % 1
          drawGlow('#ffffff', sx + (tx - sx) * p, sy + (ty - sy) * p, 5, 0.9)
        }
      })

      // nodes
      for (const n of nodes) {
        const r = radius(n)
        const x = n.x ?? 0
        const y = n.y ?? 0
        const faded = isDim(n) || (focus !== null && !focus.has(n.id))
        const dim = faded ? 0.14 : 1
        const colour = nodeColour(n)

        ctx.globalCompositeOperation = 'lighter'
        // overdue tasks send out a flare
        if (n.kind === 'task' && n.urgency === 'overdue' && !faded && !reduce) {
          const p = (time % 1800) / 1800
          ctx.globalAlpha = 0.5 * (1 - p)
          ctx.strokeStyle = colour
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(x, y, r + 2 + p * 14, 0, Math.PI * 2)
          ctx.stroke()
        }

        if (n.kind === 'hub') {
          // a sun: a wide corona, then a white-hot core fading to its colour
          const pulse = reduce ? 1 : 1 + 0.05 * Math.sin(time * 0.002 + x)
          drawGlow(colour, x, y, r * 3.6 * pulse, 0.55 * dim)
          drawGlow(colour, x, y, r * 1.8, 0.8 * dim)
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = dim
          const core = ctx.createRadialGradient(x, y, 0, x, y, r * 0.75)
          core.addColorStop(0, '#ffffff')
          core.addColorStop(0.45, colour)
          core.addColorStop(1, colour)
          ctx.fillStyle = core
          ctx.beginPath()
          ctx.arc(x, y, r * 0.75, 0, Math.PI * 2)
          ctx.fill()
        } else if (n.kind === 'goal' || n.kind === 'milestone') {
          // a planet with an atmosphere; goals wear a ring and an orbit that fills with their progress
          drawGlow(colour, x, y, r * 2.4, 0.45 * dim)
          ctx.globalCompositeOperation = 'source-over'
          if (n.kind === 'goal') ring(colour, x, y, r, 'back', 0.55 * dim)
          ctx.globalAlpha = dim
          sphere(colour, x, y, r)
          if (n.kind === 'goal') {
            ring(colour, x, y, r, 'front', 0.85 * dim)
            if (n.progress != null) {
              ctx.strokeStyle = '#ffffff'
              ctx.globalAlpha = 0.16 * dim
              ctx.lineWidth = 1.5
              ctx.beginPath()
              ctx.arc(x, y, r * 2.05, 0, Math.PI * 2)
              ctx.stroke()
              ctx.globalAlpha = 0.95 * dim
              ctx.lineWidth = 2
              ctx.lineCap = 'round'
              ctx.beginPath()
              ctx.arc(x, y, r * 2.05, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * n.progress) / 100)
              ctx.stroke()
              ctx.lineCap = 'butt'
            }
          }
        } else if (n.kind === 'tag') {
          // a four-point sparkle, turning slowly
          const spin = reduce ? Math.PI / 4 : time * 0.0004
          drawGlow(colour, x, y, r * 3, 0.5 * dim)
          ctx.globalAlpha = dim
          ctx.fillStyle = colour
          sparkle(x, y, r, spin)
          ctx.fillStyle = '#ffffff'
          sparkle(x, y, r * 0.45, spin)
        } else if (n.kind === 'habit') {
          // a small moon with a satellite going round it
          drawGlow(colour, x, y, r * 2.6, 0.4 * dim)
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = dim
          sphere(colour, x, y, r)
          const a = reduce ? -Math.PI / 4 : time * 0.0012 + y
          ctx.globalAlpha = 0.35 * dim
          ctx.strokeStyle = colour
          ctx.lineWidth = 0.8
          ctx.beginPath()
          ctx.arc(x, y, r + 5, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = dim
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5), 1.4, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // a task is a star: a twinkling halo in its urgency colour round a bright point
          const tw = reduce ? 1 : 0.85 + 0.15 * Math.sin(time * 0.003 + x * 0.7)
          drawGlow(colour, x, y, r * 3.4 * tw, 0.75 * dim)
          drawGlow('#ffffff', x, y, r * 1.1, 0.9 * dim)
        }
        ctx.globalCompositeOperation = 'source-over'

        if (n.id === sel) {
          // a targeting reticle turning round the selected body
          const rr = (n.kind === 'goal' ? r * 2.4 : n.kind === 'hub' ? r * 1.2 : r * 1.8) + 5 / v.k
          ctx.globalAlpha = 0.95
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5 / v.k
          ctx.setLineDash([6 / v.k, 5 / v.k])
          ctx.lineDashOffset = reduce ? 0 : -time * 0.01
          ctx.beginPath()
          ctx.arc(x, y, rr, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }

        // labels: big bodies always, the rest when zoomed in or in focus
        const showLabel = n.kind === 'goal' || n.kind === 'hub' || (focus?.has(n.id) ?? false) || v.k > 1.3 || (n.kind === 'tag' && v.k > 0.8)
        if (showLabel && !faded) {
          const big = n.kind === 'goal' || n.kind === 'hub'
          const size = (big ? 13 : 11) / Math.max(v.k, 0.6)
          ctx.font = `${big ? 650 : 500} ${size}px system-ui, -apple-system, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          const text = n.kind === 'hub' ? `${n.label} · ${n.count}` : n.kind === 'tag' ? `#${n.label}` : n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label
          const ly = y + (n.kind === 'goal' ? r * 1.3 : n.kind === 'hub' ? r * 0.9 : r * 1.6) + 4
          ctx.globalAlpha = 1
          ctx.lineWidth = 3 / v.k
          ctx.strokeStyle = 'rgba(4,5,16,0.85)'
          ctx.strokeText(text, x, ly)
          ctx.fillStyle = big ? 'rgba(244,246,255,0.96)' : 'rgba(205,212,235,0.82)'
          ctx.fillText(text, x, ly)
        }
      }
      ctx.restore()
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)

    // ----- pointer: pan, drag a node, pinch, tap
    const pointers = new Map<number, { x: number; y: number }>()
    let dragNode: SimNode | null = null
    let moved = 0
    let pinch: { d: number } | null = null
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      const p = local(e)
      pointers.set(e.pointerId, p)
      moved = 0
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }
        dragNode = null
        return
      }
      dragNode = hit(p.x, p.y)
      if (dragNode && !reduce) {
        dragNode.fx = dragNode.x
        dragNode.fy = dragNode.y
        simulation.alphaTarget(0.25).restart()
      }
    }
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) {
        canvas.style.cursor = hit(local(e).x, local(e).y) ? 'pointer' : 'grab'
        return
      }
      const p = local(e)
      pointers.set(e.pointerId, p)
      moved += Math.hypot(p.x - prev.x, p.y - prev.y)
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2)
        pinch.d = d
        return
      }
      if (dragNode) {
        const wpt = toWorld(p.x, p.y)
        dragNode.fx = wpt.x
        dragNode.fy = wpt.y
        if (reduce) {
          dragNode.x = wpt.x
          dragNode.y = wpt.y
        }
      } else {
        view.current = { ...view.current, x: view.current.x + p.x - prev.x, y: view.current.y + p.y - prev.y }
      }
    }
    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (dragNode) {
        if (!reduce) simulation.alphaTarget(0)
        dragNode.fx = null
        dragNode.fy = null
      }
      if (p && moved < 6) props.current.onSelect(hit(p.x, p.y)) // a tap, not a drag
      dragNode = null
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = { x: e.offsetX, y: e.offsetY }
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', wheel, { passive: false })

    return () => {
      cancelAnimationFrame(frame)
      simulation.stop()
      ro.disconnect()
      mo.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel)
      controls.current = null
    }
  }, [nodes, links, layout, controls])

  return <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" aria-hidden />
}
