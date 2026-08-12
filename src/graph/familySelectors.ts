import type { FamilyGraph, Person } from '../types/family'

function people(graph: FamilyGraph, ids: string[]): Person[] {
  return ids.map((id) => graph.personsById.get(id)).filter((person): person is Person => Boolean(person))
}

export const getParents = (graph: FamilyGraph, personId: string) => people(graph, graph.parentsByChild.get(personId) ?? [])
export const getChildren = (graph: FamilyGraph, personId: string) => people(graph, graph.childrenByParent.get(personId) ?? [])
export const getSpouses = (graph: FamilyGraph, personId: string) => people(graph, graph.spousesByPerson.get(personId) ?? [])

export function getCurrentSpouses(graph: FamilyGraph, personId: string): Person[] {
  const currentIds = graph.relationships.filter((relationship) => relationship.type === 'spouse'
    && !['divorced', 'separated'].includes(relationship.status ?? 'unknown')
    && (relationship.person1Id === personId || relationship.person2Id === personId))
    .map((relationship) => relationship.person1Id === personId ? relationship.person2Id : relationship.person1Id)
  return people(graph, currentIds)
}

export function getSiblings(graph: FamilyGraph, personId: string): Person[] {
  const siblingIds = new Set<string>()
  for (const parentId of graph.parentsByChild.get(personId) ?? []) {
    for (const childId of graph.childrenByParent.get(parentId) ?? []) {
      if (childId !== personId) siblingIds.add(childId)
    }
  }
  return people(graph, [...siblingIds])
}

export function getGeneration(graph: FamilyGraph, personId: string, seen = new Set<string>()): number {
  if (seen.has(personId)) return 0
  seen.add(personId)
  const parents = graph.parentsByChild.get(personId) ?? []
  if (!parents.length) return 0
  return 1 + Math.max(...parents.map((parentId) => getGeneration(graph, parentId, new Set(seen))))
}
