import type { FamilyGraph, Person, Relationship } from '../types/family'

function pushUnique(map: Map<string, string[]>, key: string, value: string) {
  const current = map.get(key) ?? []
  if (!current.includes(value)) current.push(value)
  map.set(key, current)
}

export function buildFamilyGraph(persons: Person[], relationships: Relationship[]): FamilyGraph {
  const graph: FamilyGraph = {
    personsById: new Map(persons.map((person) => [person.id, person])),
    relationships,
    parentsByChild: new Map(),
    childrenByParent: new Map(),
    spousesByPerson: new Map(),
  }

  for (const relationship of relationships) {
    if (relationship.type === 'parent') {
      pushUnique(graph.parentsByChild, relationship.person2Id, relationship.person1Id)
      pushUnique(graph.childrenByParent, relationship.person1Id, relationship.person2Id)
    } else {
      pushUnique(graph.spousesByPerson, relationship.person1Id, relationship.person2Id)
      pushUnique(graph.spousesByPerson, relationship.person2Id, relationship.person1Id)
    }
  }

  return graph
}
