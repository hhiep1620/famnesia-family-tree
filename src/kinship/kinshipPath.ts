import type { FamilyGraph, Relationship } from '../types/family'

export type KinshipStepType = 'parent' | 'child' | 'spouse'

export interface KinshipStep {
  fromId: string
  toId: string
  type: KinshipStepType
  relationship: Relationship
}

function adjacency(graph: FamilyGraph, personId: string): KinshipStep[] {
  const steps: KinshipStep[] = []
  for (const relationship of graph.relationships) {
    if (relationship.type === 'parent') {
      if (relationship.person2Id === personId) steps.push({ fromId: personId, toId: relationship.person1Id, type: 'parent', relationship })
      if (relationship.person1Id === personId) steps.push({ fromId: personId, toId: relationship.person2Id, type: 'child', relationship })
    } else {
      if (relationship.person1Id === personId) steps.push({ fromId: personId, toId: relationship.person2Id, type: 'spouse', relationship })
      if (relationship.person2Id === personId) steps.push({ fromId: personId, toId: relationship.person1Id, type: 'spouse', relationship })
    }
  }
  return steps.sort((a, b) => Number(a.type === 'spouse') - Number(b.type === 'spouse'))
}

export function findKinshipPath(subjectId: string, targetId: string, graph: FamilyGraph, maxDepth = 10): KinshipStep[] | undefined {
  if (subjectId === targetId) return []
  const queue: Array<{ personId: string; steps: KinshipStep[]; visited: Set<string> }> = [
    { personId: subjectId, steps: [], visited: new Set([subjectId]) },
  ]

  while (queue.length) {
    const current = queue.shift()!
    if (current.steps.length >= maxDepth) continue
    for (const step of adjacency(graph, current.personId)) {
      if (current.visited.has(step.toId)) continue
      const steps = [...current.steps, step]
      if (step.toId === targetId) return steps
      queue.push({ personId: step.toId, steps, visited: new Set([...current.visited, step.toId]) })
    }
  }
  return undefined
}
