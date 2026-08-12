import { buildFamilyGraph } from './familyGraph'
import type { DataAudit, Person, Relationship } from '../types/family'

function equivalent(a: Relationship, b: Relationship): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'parent') return a.person1Id === b.person1Id && a.person2Id === b.person2Id
  return (a.person1Id === b.person1Id && a.person2Id === b.person2Id)
    || (a.person1Id === b.person2Id && a.person2Id === b.person1Id)
}

export function detectAncestryCycle(relationships: Relationship[]): boolean {
  const graph = buildFamilyGraph([], relationships.filter((relationship) => relationship.type === 'parent'))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  function visit(personId: string): boolean {
    if (visiting.has(personId)) return true
    if (visited.has(personId)) return false
    visiting.add(personId)
    for (const childId of graph.childrenByParent.get(personId) ?? []) {
      if (visit(childId)) return true
    }
    visiting.delete(personId)
    visited.add(personId)
    return false
  }

  const ids = new Set(relationships.flatMap((relationship) => [relationship.person1Id, relationship.person2Id]))
  return [...ids].some(visit)
}

export function validateRelationship(
  relationship: Relationship,
  existing: Relationship[],
  persons: Person[],
): string | undefined {
  const personIds = new Set(persons.map((person) => person.id))
  if (!personIds.has(relationship.person1Id) || !personIds.has(relationship.person2Id)) {
    return 'One or both people no longer exist.'
  }
  if (relationship.person1Id === relationship.person2Id) {
    return relationship.type === 'spouse' ? 'A person cannot be their own spouse.' : 'A person cannot be their own parent.'
  }
  if (existing.some((candidate) => equivalent(candidate, relationship))) {
    return 'This relationship already exists.'
  }
  if (relationship.type === 'spouse' && relationship.status
    && !['married', 'partner', 'separated', 'divorced', 'widowed', 'unknown'].includes(relationship.status)) {
    return 'The spouse relationship status is invalid.'
  }
  if (relationship.type === 'parent' && detectAncestryCycle([...existing, relationship])) {
    return 'This relationship would create an ancestry cycle.'
  }
  return undefined
}

export function auditFamilyData(persons: Person[], relationships: Relationship[]): DataAudit {
  const validRelationships: Relationship[] = []
  const issues: DataAudit['issues'] = []

  for (const relationship of relationships) {
    const error = validateRelationship(relationship, validRelationships, persons)
    if (error) issues.push({ relationshipId: relationship.id, message: error })
    else validRelationships.push(relationship)
  }
  return { validRelationships, issues }
}
