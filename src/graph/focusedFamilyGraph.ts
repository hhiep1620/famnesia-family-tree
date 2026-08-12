import type { FamilyGraph } from '../types/family'
import { buildFamilyGraph } from './familyGraph'

export interface FocusedFamilyGraph {
  graph: FamilyGraph
  distances: Map<string, number>
  maxDepth: number
}

export function getFamilyDistances(graph: FamilyGraph, subjectId?: string): Map<string, number> {
  const distances = new Map<string, number>()
  if (!subjectId || !graph.personsById.has(subjectId)) return distances

  distances.set(subjectId, 0)
  const queue = [subjectId]
  while (queue.length) {
    const personId = queue.shift()!
    const distance = distances.get(personId)!
    const neighbours = [
      ...(graph.parentsByChild.get(personId) ?? []),
      ...(graph.childrenByParent.get(personId) ?? []),
      ...(graph.spousesByPerson.get(personId) ?? []),
    ]
    for (const neighbourId of neighbours) {
      if (distances.has(neighbourId)) continue
      distances.set(neighbourId, distance + 1)
      queue.push(neighbourId)
    }
  }
  return distances
}

export function createFocusedFamilyGraph(graph: FamilyGraph, subjectId: string | undefined, depth: number): FocusedFamilyGraph {
  const distances = getFamilyDistances(graph, subjectId)
  if (!subjectId || distances.size === 0) return { graph, distances, maxDepth: 0 }

  const maxDepth = Math.max(...distances.values())
  const visibleIds = new Set([...distances].filter(([, distance]) => distance <= depth).map(([personId]) => personId))
  const persons = [...graph.personsById.values()].filter((person) => visibleIds.has(person.id))
  const relationships = graph.relationships.filter((relationship) => visibleIds.has(relationship.person1Id) && visibleIds.has(relationship.person2Id))
  return { graph: buildFamilyGraph(persons, relationships), distances, maxDepth }
}
