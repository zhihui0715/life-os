import { forceCenter, forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { useEffect, useRef } from 'react'

import { createScene, drawGlow as glowOn, SERIF } from '../../lib/academia/scene'
import { activeScene, DARK_SCENES, type Scene } from '../../lib/theme'
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
 * pinch or scroll to zoom, tap a node to focus it and its neighbours. Drawn as a scholar's chart over an Academia
 * scene: goals are wax seals (their progress a gilt ring), due dates brass astrolabes with their tasks in orbit, tasks
 * ink dots in their urgency colour (overdue ones pulse), tags ribbon bookmarks, habits hourglasses.
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
    // the backdrop: in Academia the scene you picked; elsewhere the observatory by night, parchment by day
    const root = document.documentElement
    const scene = (): Scene =>
      root.dataset.look === 'academia' ? activeScene(root.dataset.bg ?? '') : root.dataset.theme === 'dark' ? 'observatory' : 'parchment'
    const sky = createScene(scene())
    // ink for the chart, by the darkness of the page it's drawn on
    const inks = {
      dark: { line: '#e9d9b8', text: 'rgba(242,232,212,0.96)', soft: 'rgba(214,198,168,0.85)', halo: 'rgba(18,12,8,0.85)', seal: '#8c2f25', brass: '#d8ad60' },
      light: { line: '#3b2b1d', text: 'rgba(42,31,22,0.96)', soft: 'rgba(79,62,46,0.88)', halo: 'rgba(250,244,230,0.92)', seal: '#7a2a22', brass: '#9a6f2a' },
    }
    const darkScene = () => DARK_SCENES.has(scene())
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
      sky.set(scene())
    })
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'data-bg', 'data-look', 'data-palette'] })

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

    const circle = (x: number, y: number, r: number) => {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
    }
    // a wax seal: a scalloped disc, lit from the top left, pressed with the goal's initial
    const seal = (x: number, y: number, r: number, colour: string, letter: string) => {
      ctx.beginPath()
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2
        const rr = r * (1 + 0.07 * Math.sin(a * 9) + 0.03 * Math.sin(a * 23))
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      }
      const wax = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1)
      wax.addColorStop(0, '#c4574a')
      wax.addColorStop(0.55, colour)
      wax.addColorStop(1, '#4a140f')
      ctx.fillStyle = wax
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx.lineWidth = 1.4
      circle(x, y, r * 0.68)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,220,200,0.25)'
      ctx.lineWidth = 1
      circle(x + 0.8, y + 0.8, r * 0.68)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,228,210,0.85)'
      ctx.font = `italic 600 ${r * 0.95}px ${SERIF}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letter, x, y + r * 0.05)
    }
    // an astrolabe: a brass rim with degree ticks round a disc of the hub's colour
    const astrolabe = (x: number, y: number, r: number, colour: string, brass: string, spin: number) => {
      ctx.fillStyle = colour
      const a0 = ctx.globalAlpha
      ctx.globalAlpha = a0 * 0.22
      circle(x, y, r)
      ctx.fill()
      ctx.globalAlpha = a0
      ctx.strokeStyle = brass
      ctx.lineWidth = 2.2
      circle(x, y, r)
      ctx.stroke()
      ctx.lineWidth = 1
      circle(x, y, r * 0.64)
      ctx.stroke()
      for (let i = 0; i < 24; i++) {
        const a = spin + (i / 24) * Math.PI * 2
        const inner = i % 6 === 0 ? r * 0.64 : r * 0.84
        ctx.beginPath()
        ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner)
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
        ctx.stroke()
      }
      ctx.fillStyle = colour
      circle(x, y, r * 0.3)
      ctx.fill()
      ctx.strokeStyle = brass
      ctx.stroke()
    }
    // a ribbon bookmark with a swallowtail end
    const ribbon = (x: number, y: number, r: number) => {
      const hw = r * 0.62
      ctx.beginPath()
      ctx.moveTo(x - hw, y - r * 1.15)
      ctx.lineTo(x + hw, y - r * 1.15)
      ctx.lineTo(x + hw, y + r * 1.15)
      ctx.lineTo(x, y + r * 0.6)
      ctx.lineTo(x - hw, y + r * 1.15)
      ctx.closePath()
    }
    const hourglass = (x: number, y: number, r: number) => {
      ctx.beginPath()
      ctx.moveTo(x - r, y - r)
      ctx.lineTo(x + r, y - r)
      ctx.lineTo(x - r, y + r)
      ctx.lineTo(x + r, y + r)
      ctx.closePath()
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
      const dark = darkScene()
      const ink = dark ? inks.dark : inks.light
      ctx.save()
      ctx.translate(w / 2 + v.x, h / 2 + v.y)
      ctx.scale(v.k, v.k)

      if (orbits) {
        // the rings of an orrery, each in its urgency colour and named in small capitals, round the brass "now"
        for (const u of ['overdue', 'today', 'week', 'later', 'none'] as const) {
          const r = ORBIT[u]
          ctx.globalAlpha = lit(u) ? 0.45 : 0.1
          ctx.strokeStyle = colours[URGENCY_VAR[u]]
          ctx.lineWidth = 1.3 / v.k
          if (u === 'none') ctx.setLineDash([3 / v.k, 6 / v.k])
          circle(0, 0, r)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.globalAlpha = lit(u) ? 0.9 : 0.3
          ctx.fillStyle = colours[URGENCY_VAR[u]]
          ctx.font = `600 ${11 / Math.max(v.k, 0.6)}px ${SERIF}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText(rings[u].toUpperCase(), 0, -r - 4)
        }
        ctx.globalAlpha = 0.25
        ctx.strokeStyle = ink.brass
        ctx.lineWidth = 1 / v.k
        circle(0, 0, ORBIT.goal)
        ctx.stroke()
        ctx.globalAlpha = 1
        astrolabe(0, 0, 26, colours['--warning-fill'], ink.brass, reduce ? 0 : time * 0.0002)
        ctx.fillStyle = ink.text
        ctx.font = `italic 600 ${13 / Math.max(v.k, 0.6)}px ${SERIF}`
        ctx.textBaseline = 'top'
        ctx.fillText(rings.now, 0, 32)
      }

      // faint turning orbits round each due-date astrolabe, where its tasks settle
      for (const n of nodes) {
        if (n.kind !== 'hub' || isDim(n)) continue
        ctx.globalAlpha = focus && !focus.has(n.id) ? 0.04 : 0.22
        ctx.strokeStyle = nodeColour(n)
        ctx.lineWidth = 1 / v.k
        ctx.setLineDash([2 / v.k, 6 / v.k])
        ctx.lineDashOffset = reduce ? 0 : -time * 0.004
        circle(n.x ?? 0, n.y ?? 0, LINK_DISTANCE.due)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // links: ink lines (dotted to a due date); in focus they take the accent and a drop of ink runs along them
      simLinks.forEach((l, i) => {
        const s = l.source as SimNode
        const t = l.target as SimNode
        const sx = s.x ?? 0
        const sy = s.y ?? 0
        const tx = t.x ?? 0
        const ty = t.y ?? 0
        const on = focus ? focus.has(s.id) && focus.has(t.id) : true
        const faded = isDim(s) || isDim(t)
        ctx.globalAlpha = faded ? 0.05 : focus ? (on ? 0.9 : 0.05) : 0.34
        ctx.strokeStyle = focus && on ? colours['--accent'] : ink.line
        ctx.lineWidth = (focus && on ? 1.6 : 0.9) / Math.sqrt(v.k)
        if (l.kind === 'due') ctx.setLineDash([2 / v.k, 5 / v.k])
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.setLineDash([])
        if (focus && on && !faded && !reduce) {
          const p = (time / 1400 + linkSeed[i]) % 1
          ctx.fillStyle = colours['--accent']
          circle(sx + (tx - sx) * p, sy + (ty - sy) * p, 2.6 / Math.sqrt(v.k))
          ctx.fill()
        }
      })

      // nodes
      for (const n of nodes) {
        const r = radius(n)
        const x = n.x ?? 0
        const y = n.y ?? 0
        const faded = isDim(n) || (focus !== null && !focus.has(n.id))
        const dim = faded ? 0.15 : 1
        const colour = nodeColour(n)

        // overdue tasks pulse a ring of their colour
        if (n.kind === 'task' && n.urgency === 'overdue' && !faded && !reduce) {
          const p = (time % 1800) / 1800
          ctx.globalAlpha = 0.55 * (1 - p)
          ctx.strokeStyle = colour
          ctx.lineWidth = 1.5
          circle(x, y, r + 2 + p * 12)
          ctx.stroke()
        }
        // by candlelight, everything glows a little
        if (dark && !faded) {
          ctx.globalCompositeOperation = 'lighter'
          drawGlow(n.kind === 'goal' ? ink.seal : colour, x, y, r * (n.kind === 'hub' ? 2.6 : 2.4), n.kind === 'task' ? 0.4 : 0.25)
          ctx.globalCompositeOperation = 'source-over'
        }

        ctx.globalAlpha = dim
        if (n.kind === 'hub') {
          astrolabe(x, y, r * 0.8, colour, ink.brass, reduce ? 0 : time * 0.00015 + x)
        } else if (n.kind === 'goal') {
          if (n.progress != null) {
            // a gilt ring fills with the goal's progress
            ctx.strokeStyle = ink.brass
            ctx.globalAlpha = 0.22 * dim
            ctx.lineWidth = 2
            circle(x, y, r * 1.45)
            ctx.stroke()
            ctx.globalAlpha = dim
            ctx.lineWidth = 2.6
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.arc(x, y, r * 1.45, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * n.progress) / 100)
            ctx.stroke()
            ctx.lineCap = 'butt'
          }
          ctx.globalAlpha = dim
          seal(x, y, r, ink.seal, (n.label.trim()[0] ?? '·').toUpperCase())
        } else if (n.kind === 'milestone') {
          // a gilt lozenge
          ctx.beginPath()
          ctx.moveTo(x, y - r)
          ctx.lineTo(x + r * 0.8, y)
          ctx.lineTo(x, y + r)
          ctx.lineTo(x - r * 0.8, y)
          ctx.closePath()
          ctx.fillStyle = ink.brass
          ctx.fill()
          ctx.strokeStyle = ink.line
          ctx.lineWidth = 1
          ctx.stroke()
        } else if (n.kind === 'tag') {
          ribbon(x, y, r)
          ctx.fillStyle = colour
          ctx.fill()
          ctx.strokeStyle = ink.line
          ctx.lineWidth = 0.9
          ctx.stroke()
        } else if (n.kind === 'habit') {
          hourglass(x, y, r)
          ctx.fillStyle = colour
          ctx.fill()
          ctx.strokeStyle = ink.line
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(x - r - 1.5, y - r)
          ctx.lineTo(x + r + 1.5, y - r)
          ctx.moveTo(x - r - 1.5, y + r)
          ctx.lineTo(x + r + 1.5, y + r)
          ctx.lineWidth = 1.8
          ctx.stroke()
        } else {
          // a task: a drop of ink in its urgency colour, outlined
          ctx.fillStyle = colour
          circle(x, y, r)
          ctx.fill()
          ctx.strokeStyle = ink.line
          ctx.globalAlpha = 0.75 * dim
          ctx.lineWidth = 1.1
          ctx.stroke()
          ctx.globalAlpha = 0.5 * dim
          ctx.fillStyle = '#ffffff'
          circle(x - r * 0.3, y - r * 0.3, r * 0.28)
          ctx.fill()
        }

        if (n.id === sel) {
          // a dashed circle, slowly turning, round the selected one
          const rr = (n.kind === 'goal' ? r * 1.75 : n.kind === 'hub' ? r * 1.1 : r * 1.9) + 5 / v.k
          ctx.globalAlpha = 0.95
          ctx.strokeStyle = ink.text
          ctx.lineWidth = 1.5 / v.k
          ctx.setLineDash([6 / v.k, 5 / v.k])
          ctx.lineDashOffset = reduce ? 0 : -time * 0.01
          circle(x, y, rr)
          ctx.stroke()
          ctx.setLineDash([])
        }

        // labels: big things always, the rest when zoomed in or in focus
        const showLabel = n.kind === 'goal' || n.kind === 'hub' || (focus?.has(n.id) ?? false) || v.k > 1.3 || (n.kind === 'tag' && v.k > 0.8)
        if (showLabel && !faded) {
          const big = n.kind === 'goal' || n.kind === 'hub'
          const size = (big ? 15 : 11) / Math.max(v.k, 0.6)
          ctx.font = big ? `600 ${size}px ${SERIF}` : `500 ${size}px system-ui, -apple-system, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          const text = n.kind === 'hub' ? `${n.label} · ${n.count}` : n.kind === 'tag' ? `#${n.label}` : n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label
          const ly = y + (n.kind === 'goal' ? r * 1.6 : n.kind === 'hub' ? r * 0.9 : r * 1.6) + 4
          ctx.globalAlpha = 1
          ctx.lineWidth = 3 / v.k
          ctx.strokeStyle = ink.halo
          ctx.strokeText(text, x, ly)
          ctx.fillStyle = big ? ink.text : ink.soft
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
