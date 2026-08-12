import type { FamilyGraph, FamilyUnit } from '../types/family'

const unitId = (parentIds: string[]) => `family:${[...parentIds].sort().join('|')}`

export function createFamilyUnits(graph: FamilyGraph): FamilyUnit[] {
  const units = new Map<string, FamilyUnit>()

  for (const [childId, rawParentIds] of graph.parentsByChild) {
    const parentIds = [...rawParentIds].sort()
    const id = unitId(parentIds)
    const unit = units.get(id) ?? { id, parentIds, childIds: [] }
    unit.childIds.push(childId)
    units.set(id, unit)
  }

  for (const relationship of graph.relationships) {
    if (relationship.type !== 'spouse') continue
    const parentIds = [relationship.person1Id, relationship.person2Id].sort()
    const id = unitId(parentIds)
    if (!units.has(id)) units.set(id, { id, parentIds, childIds: [] })
  }

  for (const unit of units.values()) {
    unit.childIds.sort((a, b) => {
      const personA = graph.personsById.get(a)
      const personB = graph.personsById.get(b)
      const birthOrder = personA?.birthDate && personB?.birthDate ? personA.birthDate.localeCompare(personB.birthDate) : 0
      return birthOrder
        || (personA?.sortOrder ?? Number.MAX_SAFE_INTEGER) - (personB?.sortOrder ?? Number.MAX_SAFE_INTEGER)
        || (personA?.createdAt ?? '').localeCompare(personB?.createdAt ?? '')
        || (personA?.name ?? a).localeCompare(personB?.name ?? b)
    })
  }

  return [...units.values()]
}
