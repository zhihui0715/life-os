import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { useEffect, useRef } from 'react'

import type { GraphLink, GraphNode, Urgency } from './api'
import { KIND_VAR, LINK_DISTANCE, radius, URGENCY_VAR } from './style'

export interface SimNode extends GraphNode, SimulationNodeDatum {}
type SimLink = SimulationLinkDatum<SimNode> & { kind: GraphLink['kind'] }

interface Props {
  nodes: SimNode[]
  links: GraphLink[]
  selected: string | null
  dimmed: (n: SimNode) => boolean
  onSelect: (n: SimNode | null) => void
  /** gets the canvas's zoom controls once mounted */
  controls: React.MutableRefObject<{ zoom: (factor: number) => void; fit: () => void } | null>
}

/**
 * Draws the graph on a canvas and runs the physics (d3-force). Drag empty space to pan, drag a node to move it,
 * pinch or scroll to zoom, tap a node to focus it and its neighbours. Overdue tasks pulse.
 */
export function GraphCanvas({ nodes, links, selected, dimmed, onSelect, controls }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef({ x: 0, y: 0, k: 1 })
  const sim = useRef<Simulation<SimNode, SimLink> | null>(null)
  const props = useRef({ selected, dimmed, onSelect })
  props.current = { selected, dimmed, onSelect }

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // theme colours, re-read when the theme or accent changes
    let colours: Record<string, string> = {}
    const readColours = () => {
      const cs = getComputedStyle(document.documentElement)
      const get = (v: string) => cs.getPropertyValue(v).trim()
      colours = Object.fromEntries(
        ['--p1', '--warning-fill', '--urgency-week', '--accent', '--text-subtle', '--tint-goals', '--tint-focus', '--tint-habits', '--text', '--text-muted', '--border-strong', '--surface', '--accent-fill'].map((v) => [v, get(v)]),
      )
    }
    readColours()
    const mo = new MutationObserver(readColours)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] })

    const byId = new Map(nodes.map((n) => [n.id, n]))
    const simLinks: SimLink[] = links.filter((l) => byId.has(l.source) && byId.has(l.target)).map((l) => ({ ...l }))
    const neighbours = new Map<string, Set<string>>()
    for (const l of links) {
      ;(neighbours.get(l.source) ?? neighbours.set(l.source, new Set()).get(l.source)!).add(l.target)
      ;(neighbours.get(l.target) ?? neighbours.set(l.target, new Set()).get(l.target)!).add(l.source)
    }

    const simulation = forceSimulation<SimNode, SimLink>(nodes)
      .force('link', forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance((l) => LINK_DISTANCE[l.kind]).strength(0.6))
      .force('charge', forceManyBody<SimNode>().strength((d) => (d.kind === 'hub' ? -380 : d.kind === 'goal' ? -260 : -90)))
      .force('collide', forceCollide<SimNode>((d) => radius(d) + 3))
      .force('center', forceCenter(0, 0))
      .force('x', forceX(0).strength(0.04))
      .force('y', forceY(0).strength(0.06))
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
      const xs = nodes.map((n) => n.x ?? 0)
      const ys = nodes.map((n) => n.y ?? 0)
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

    // ----- drawing
    let frame = 0
    const draw = (time: number) => {
      const { selected: sel, dimmed: isDim } = props.current
      const focus = sel ? new Set([sel, ...(neighbours.get(sel) ?? [])]) : null
      const v = view.current
      if (!fitted && (reduce || simulation.alpha() < 0.3)) {
        fit()
        fitted = true
      }
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2 + v.x, h / 2 + v.y)
      ctx.scale(v.k, v.k)

      // links
      for (const l of simLinks) {
        const s = l.source as SimNode
        const t = l.target as SimNode
        const on = focus ? focus.has(s.id) && focus.has(t.id) : true
        const faded = isDim(s) || isDim(t)
        ctx.globalAlpha = faded ? 0.05 : focus ? (on ? 0.85 : 0.06) : 0.28
        ctx.strokeStyle = focus && on ? colours['--accent'] : colours['--border-strong']
        ctx.lineWidth = (focus && on ? 1.8 : 1) / Math.sqrt(v.k)
        if (l.kind === 'due') ctx.setLineDash([3 / v.k, 4 / v.k])
        ctx.beginPath()
        ctx.moveTo(s.x ?? 0, s.y ?? 0)
        ctx.lineTo(t.x ?? 0, t.y ?? 0)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // nodes
      for (const n of nodes) {
        const r = radius(n)
        const x = n.x ?? 0
        const y = n.y ?? 0
        const faded = isDim(n) || (focus !== null && !focus.has(n.id))
        const colour =
          n.kind === 'task' ? colours[URGENCY_VAR[n.urgency ?? 'none']] : n.kind === 'hub' ? colours[URGENCY_VAR[(n.ref as Urgency) ?? 'none']] : colours[KIND_VAR[n.kind]]
        ctx.globalAlpha = faded ? 0.12 : 1

        // overdue tasks breathe out a ring
        if (n.kind === 'task' && n.urgency === 'overdue' && !faded && !reduce) {
          const p = (time % 1800) / 1800
          ctx.globalAlpha = 0.45 * (1 - p)
          ctx.fillStyle = colour
          ctx.beginPath()
          ctx.arc(x, y, r + 2 + p * 10, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }
        if (n.kind === 'hub') {
          // hubs: a soft disc with a ring, like a planet the tasks orbit
          ctx.fillStyle = colour
          ctx.globalAlpha = faded ? 0.06 : 0.16
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = faded ? 0.12 : 1
          ctx.lineWidth = 2.5
          ctx.strokeStyle = colour
          ctx.stroke()
        } else {
          ctx.fillStyle = colour
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
          if (n.kind === 'goal' && n.progress != null) {
            // progress ring around a goal
            ctx.strokeStyle = colours['--surface']
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.arc(x, y, r - 4, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * n.progress) / 100)
            ctx.stroke()
          }
          if (n.kind === 'tag') {
            ctx.fillStyle = colours['--surface']
            ctx.font = `700 ${Math.max(6, r)}px system-ui`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('#', x, y + 0.5)
          }
        }
        if (n.id === sel) {
          ctx.globalAlpha = 1
          ctx.strokeStyle = colours['--text']
          ctx.lineWidth = 2 / v.k
          ctx.beginPath()
          ctx.arc(x, y, r + 4 / v.k, 0, Math.PI * 2)
          ctx.stroke()
        }

        // labels: big nodes always, the rest when zoomed in or in focus
        const showLabel = n.kind === 'goal' || n.kind === 'hub' || (focus?.has(n.id) ?? false) || v.k > 1.3 || (n.kind === 'tag' && v.k > 0.8)
        if (showLabel && !faded) {
          const size = (n.kind === 'goal' || n.kind === 'hub' ? 13 : 11) / Math.max(v.k, 0.6)
          ctx.font = `${n.kind === 'goal' || n.kind === 'hub' ? 700 : 500} ${size}px system-ui, -apple-system, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          const text = n.kind === 'hub' ? `${n.label} · ${n.count}` : n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label
          ctx.lineWidth = 3 / v.k
          ctx.strokeStyle = colours['--surface']
          ctx.globalAlpha = 0.9
          ctx.strokeText(text, x, y + r + 3)
          ctx.globalAlpha = 1
          ctx.fillStyle = n.kind === 'goal' || n.kind === 'hub' ? colours['--text'] : colours['--text-muted']
          ctx.fillText(text, x, y + r + 3)
        }
      }
      ctx.restore()
      ctx.globalAlpha = 1
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
  }, [nodes, links, controls])

  return <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" aria-hidden />
}
