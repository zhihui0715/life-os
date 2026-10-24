import { describe, expect, it } from 'vitest'

import type { GraphData, GraphLink, GraphNode } from './api'
import { filterGraph, type GraphFilters } from './filter'

const node = (id: string, extra: Partial<GraphNode> = {}): GraphNode => ({ id, kind: id.split(':')[0] as GraphNode['kind'], label: id, ref: id, ...extra })
const link = (source: string, target: string, kind: GraphLink['kind']): GraphLink => ({ source, target, kind })

// Two goals: "run" with a milestone, a task, its subtask and a habit; "read" with one task. Tags and due hubs on the side.
const data: GraphData = {
  nodes: [
    node('goal:run'),
    node('milestone:10k'),
    node('task:shoes', { priority: 1, urgency: 'overdue' }),
    node('task:laces', { priority: 3, subtask: true, urgency: 'today' }),
    node('habit:jog'),
    node('goal:read'),
    node('task:book', { priority: 2, urgency: 'week' }),
    node('task:loose', { priority: 4, urgency: 'none' }),
    node('tag:shopping', { count: 2 }),
    node('hub:overdue', { count: 1 }),
    node('hub:week', { count: 1 }),
  ],
  links: [
    link('milestone:10k', 'goal:run', 'part_of'),
    link('task:shoes', 'milestone:10k', 'part_of'),
    link('task:laces', 'task:shoes', 'subtask'),
    link('habit:jog', 'goal:run', 'serves'),
    link('task:book', 'goal:read', 'part_of'),
    link('task:shoes', 'tag:shopping', 'tagged'),
    link('task:book', 'tag:shopping', 'tagged'),
    link('task:shoes', 'hub:overdue', 'due'),
    link('task:book', 'hub:week', 'due'),
  ],
  summary: { tasks: 4, truncated: false, by_urgency: { overdue: 1, today: 1, week: 1, later: 0, none: 1 }, goals: 2, tags: 1, habits: 1 },
}
const all: GraphFilters = { focus: null, priority: 'all', subtasks: true, hidden: new Set(), layout: 'web' }
const ids = (f: Partial<GraphFilters>) => filterGraph(data, { ...all, ...f }).nodes.map((n) => n.id).sort()

describe('filterGraph', () => {
  it('keeps everything with no filters', () => {
    expect(ids({})).toHaveLength(data.nodes.length)
  })

  it('focuses a goal on its whole system, with its tags and due dates', () => {
    expect(ids({ focus: 'goal:run' })).toEqual(['goal:run', 'habit:jog', 'hub:overdue', 'milestone:10k', 'tag:shopping', 'task:laces', 'task:shoes'])
  })

  it('focuses a tag on its tasks, their subtasks, goals and due dates', () => {
    expect(ids({ focus: 'tag:shopping' })).toEqual(['goal:read', 'goal:run', 'hub:overdue', 'hub:week', 'milestone:10k', 'tag:shopping', 'task:book', 'task:laces', 'task:shoes'])
  })

  it('filters by priority and drops tags and hubs left without links', () => {
    expect(ids({ priority: 'p1' })).toEqual(['goal:read', 'goal:run', 'habit:jog', 'hub:overdue', 'milestone:10k', 'tag:shopping', 'task:shoes'])
  })

  it('counts only the tasks still shown on tags and due dates', () => {
    const tag = filterGraph(data, { ...all, focus: 'goal:run' }).nodes.find((n) => n.id === 'tag:shopping')
    expect(tag?.count).toBe(1)
  })

  it('hides subtasks', () => {
    expect(ids({ subtasks: false })).not.toContain('task:laces')
  })

  it('leaves hubs, tags and habits out of the orbits layout', () => {
    const shown = ids({ layout: 'orbits' })
    expect(shown.some((id) => /^(hub|tag|habit):/.test(id))).toBe(false)
    expect(shown).toContain('task:loose')
  })

  it('ignores a focus that is no longer in the graph', () => {
    expect(ids({ focus: 'goal:gone' })).toHaveLength(data.nodes.length)
  })
})
