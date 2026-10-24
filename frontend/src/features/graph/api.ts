import { useQuery } from '@tanstack/react-query'

import { api } from '../../lib/api'

export type Urgency = 'overdue' | 'today' | 'week' | 'later' | 'none'
export type NodeKind = 'goal' | 'milestone' | 'task' | 'tag' | 'habit' | 'hub'

export interface GraphNode {
  id: string
  kind: NodeKind
  label: string
  ref: string
  urgency?: Urgency
  priority?: number
  subtask?: boolean
  progress?: number | null
  count?: number
  due_date?: string | null
  status?: string
}

export interface GraphLink {
  source: string
  target: string
  kind: 'part_of' | 'subtask' | 'tagged' | 'due' | 'serves'
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
  summary: { tasks: number; truncated: boolean; by_urgency: Record<Urgency, number>; goals: number; tags: number; habits: number }
}

export function useGraph() {
  return useQuery({ queryKey: ['graph'], queryFn: () => api<GraphData>('/graph') })
}
