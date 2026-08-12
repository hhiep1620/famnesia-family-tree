import { describe, expect, it } from 'vitest'
import { samplePersons, sampleRelationships } from '../data/sampleFamily'
import { buildFamilyGraph } from '../graph/familyGraph'
import { getChildren, getParents, getSiblings, getSpouses } from '../graph/familySelectors'
import { createFamilyUnits } from '../graph/familyUnits'
import { detectAncestryCycle, validateRelationship } from '../graph/familyValidation'
import { generateNextPersonId } from '../utils/personId'
import { generateNextRelationshipId } from '../utils/relationshipId'

describe('family graph acceptance data', () => {
  const graph = buildFamilyGraph(samplePersons, sampleRelationships)

  it('derives spouse pairs and shared children without child rows', () => {
    expect(getSpouses(graph, 'P0003').map((person) => person.id)).toEqual(['P0005'])
    expect(getChildren(graph, 'P0001').map((person) => person.id)).toEqual(['P0003', 'P0004'])
    expect(getParents(graph, 'P0006').map((person) => person.id)).toEqual(['P0003', 'P0005'])
    expect(getSiblings(graph, 'P0006').map((person) => person.id)).toEqual(['P0007'])
  })

  it('builds runtime-only family units for both couples', () => {
    const units = createFamilyUnits(graph)
    expect(units.find((unit) => unit.parentIds.join('|') === 'P0001|P0002')?.childIds).toEqual(['P0003', 'P0004'])
    expect(units.find((unit) => unit.parentIds.join('|') === 'P0003|P0005')?.childIds).toEqual(['P0006', 'P0007'])
  })
})

describe('data integrity', () => {
  it('rejects reverse duplicate spouses and deep ancestry cycles', () => {
    expect(validateRelationship({ id: 'R9998', person1Id: 'P0002', person2Id: 'P0001', type: 'spouse' }, sampleRelationships, samplePersons)).toBe('This relationship already exists.')
    const cyclic = [...sampleRelationships, { id: 'R9999', person1Id: 'P0006', person2Id: 'P0001', type: 'parent' as const }]
    expect(detectAncestryCycle(cyclic)).toBe(true)
  })

  it('uses the maximum numeric ID and never the row count', () => {
    expect(generateNextPersonId(['P0001', 'deleted', 'P0042'])).toBe('P0043')
    expect(generateNextRelationshipId(['R0002', 'R0105'])).toBe('R0106')
  })
})
