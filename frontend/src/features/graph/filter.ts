import type { GraphData, GraphLink, GraphNode, NodeKind } from './api'

export type Layout = 'web' | 'orbits'
export type PriorityFilter = 'all' | 'p1' | 'p12'

export interface GraphFilters {
  /** a goal or tag node id to zoom the graph in on ("goal:…", "tag:…"), or null for everything */
  focus: string | null
  priority: PriorityFilter
  subtasks: boolean
  hidden: ReadonlySet<NodeKind>
  layout: Layout
}

// Links that say what a thing belongs to (as opposed to how it's labelled or when it's due)
const STRUCTURE = new Set<GraphLink['kind']>(['part_of', 'subtask', 'serves'])
// In orbits, urgency is the rings themselves, so the due-date hubs go; tags and habits would only crowd the rings
const ORBIT_HIDDEN: NodeKind[] = ['hub', 'tag', 'habit']

/**
 * Narrows the graph to what the filters ask for. Focusing a goal keeps its whole system (milestones, tasks, their
 * subtasks, the habits serving it) plus the tags and due dates those tasks carry; focusing a tag keeps its tasks with
 * their subtasks, the goals they belong to and their due dates. Tags and due dates left with no links are dropped.
 */
export function filterGraph(data: GraphData, f: GraphFilters): { nodes: GraphNode[]; links: GraphLink[] } {
  const hidden = new Set<NodeKind>(f.hidden)
  if (f.layout === 'orbits') ORBIT_HIDDEN.forEach((k) => hidden.add(k))
  const taskOk = (n: GraphNode) =>
    (f.subtasks || !n.subtask) && (f.priority === 'all' || (n.priority != null && n.priority <= (f.priority === 'p1' ? 1 : 2)))
  let keep = new Set(data.nodes.filter((n) => !hidden.has(n.kind) && (n.kind !== 'task' || taskOk(n))).map((n) => n.id))

  if (f.focus && data.nodes.some((n) => n.id === f.focus)) {
    const near = new Map<string, { id: string; kind: GraphLink['kind'] }[]>()
    for (const l of data.links) {
      ;(near.get(l.source) ?? near.set(l.source, []).get(l.source)!).push({ id: l.target, kind: l.kind })
      ;(near.get(l.target) ?? near.set(l.target, []).get(l.target)!).push({ id: l.source, kind: l.kind })
    }
    const spread = (from: Iterable<string>, kinds: Set<GraphLink['kind']>) => {
      const seen = new Set(from)
      const queue = [...seen]
      while (queue.length) {
        for (const n of near.get(queue.pop()!) ?? []) {
          if (!kinds.has(n.kind) || seen.has(n.id) || !keep.has(n.id)) continue
          seen.add(n.id)
          queue.push(n.id)
        }
      }
      return seen
    }
    let system: Set<string>
    if (f.focus.startsWith('tag:')) {
      const tagged = (near.get(f.focus) ?? []).filter((n) => n.kind === 'tagged' && keep.has(n.id)).map((n) => n.id)
      system = spread(tagged, new Set(['subtask']))
      for (const id of [...system]) for (const n of near.get(id) ?? []) if (n.kind === 'part_of' && keep.has(n.id)) system.add(n.id)
      for (const id of [...system]) if (id.startsWith('milestone:')) for (const n of near.get(id) ?? []) if (n.kind === 'part_of' && n.id.startsWith('goal:')) system.add(n.id)
      system.add(f.focus)
    } else system = spread([f.focus], STRUCTURE)
    // the labels and due dates of everything in the system come along
    for (const id of [...system]) if (id.startsWith('task:')) for (const n of near.get(id) ?? []) if (n.kind === 'tagged' || n.kind === 'due') system.add(n.id)
    keep = new Set([...system].filter((id) => keep.has(id)))
  }

  const links = data.links.filter((l) => keep.has(l.source) && keep.has(l.target))
  const counts = new Map<string, number>()
  for (const l of links) if (l.kind === 'tagged' || l.kind === 'due') counts.set(l.target, (counts.get(l.target) ?? 0) + 1)
  // tags and due dates count only the tasks still shown, and go when none are
  const nodes = data.nodes
    .filter((n) => keep.has(n.id) && ((n.kind !== 'tag' && n.kind !== 'hub') || counts.has(n.id) || n.id === f.focus))
    .map((n) => (n.kind === 'tag' || n.kind === 'hub' ? { ...n, count: counts.get(n.id) ?? 0 } : n))
  return { nodes, links }
}
