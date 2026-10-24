import type { GraphLink, GraphNode, Urgency } from './api'

/** Colours come from the theme (tokens.css), so the graph follows light/dark and the accent. */
export const URGENCY_VAR: Record<Urgency, string> = {
  overdue: '--p1',
  today: '--warning-fill',
  week: '--urgency-week',
  later: '--accent',
  none: '--text-subtle',
}
export const KIND_VAR: Record<string, string> = { goal: '--tint-goals', milestone: '--tint-goals', tag: '--tint-focus', habit: '--tint-habits' }
export const LINK_DISTANCE: Record<GraphLink['kind'], number> = { subtask: 26, part_of: 55, serves: 55, tagged: 75, due: 95 }

/** Ring radii of the orbits layout: the sooner something is due, the closer it circles "now"; goals ride the edge. */
export const ORBIT: Record<Urgency | 'goal', number> = { overdue: 110, today: 175, week: 240, later: 305, none: 370, goal: 450 }
export const orbitRadius = (n: GraphNode) =>
  n.kind === 'task' ? ORBIT[n.urgency ?? 'none'] : n.kind === 'goal' ? ORBIT.goal : n.kind === 'milestone' ? ORBIT.goal - 30 : ORBIT.none

export function radius(n: GraphNode) {
  switch (n.kind) {
    case 'goal':
      return 15
    case 'hub':
      return 14 + Math.sqrt(n.count ?? 1) * 2.5
    case 'tag':
      return 5 + Math.sqrt(n.count ?? 1) * 1.6
    case 'milestone':
      return 8
    case 'habit':
      return 7
    default:
      return n.subtask ? 4.5 : n.priority === 1 ? 8 : n.priority === 2 ? 7 : 6
  }
}
