import { describe, expect, it } from 'vitest'
import { buildFamilyGraph } from '../graph/familyGraph'
import { createFamilyUnits } from '../graph/familyUnits'
import { createFlowEdges, createFlowNodes, layoutFamilyTree, PERSON_HEIGHT, PERSON_WIDTH } from '../layout/familyLayout'
import type { Person, Relationship } from '../types/family'

const people: Person[] = Array.from({ length: 10 }, (_, index) => ({
  id: `P${String(index + 1).padStart(4, '0')}`,
  name: `Thành viên ${index + 1}`,
  sortOrder: index + 1,
}))

const relationships: Relationship[] = [
  { id: 'R0001', person1Id: 'P0001', person2Id: 'P0002', type: 'spouse' },
  { id: 'R0002', person1Id: 'P0003', person2Id: 'P0004', type: 'spouse' },
  { id: 'R0003', person1Id: 'P0001', person2Id: 'P0005', type: 'parent' },
  { id: 'R0004', person1Id: 'P0002', person2Id: 'P0005', type: 'parent' },
  { id: 'R0005', person1Id: 'P0003', person2Id: 'P0006', type: 'parent' },
  { id: 'R0006', person1Id: 'P0004', person2Id: 'P0006', type: 'parent' },
  { id: 'R0007', person1Id: 'P0005', person2Id: 'P0006', type: 'spouse' },
  { id: 'R0008', person1Id: 'P0005', person2Id: 'P0007', type: 'parent' },
  { id: 'R0009', person1Id: 'P0006', person2Id: 'P0007', type: 'parent' },
  { id: 'R0010', person1Id: 'P0005', person2Id: 'P0008', type: 'parent' },
  { id: 'R0011', person1Id: 'P0006', person2Id: 'P0008', type: 'parent' },
  { id: 'R0012', person1Id: 'P0007', person2Id: 'P0009', type: 'spouse' },
  { id: 'R0013', person1Id: 'P0008', person2Id: 'P0010', type: 'spouse' },
]

describe('family tree layout', () => {
  it('keeps every person card separated after arranging couples and descendant branches', () => {
    const graph = buildFamilyGraph(people, relationships)
    const units = createFamilyUnits(graph)
    const nodes = createFlowNodes(graph, units)
    const edges = createFlowEdges(graph, units)
    const positioned = layoutFamilyTree(nodes, edges, units).filter((node) => node.type === 'person')

    for (let first = 0; first < positioned.length; first += 1) {
      for (let second = first + 1; second < positioned.length; second += 1) {
        const a = positioned[first]
        const b = positioned[second]
        const horizontalOverlap = a.position.x < b.position.x + PERSON_WIDTH && b.position.x < a.position.x + PERSON_WIDTH
        const verticalOverlap = a.position.y < b.position.y + PERSON_HEIGHT && b.position.y < a.position.y + PERSON_HEIGHT
        expect(horizontalOverlap && verticalOverlap, `${a.id} overlaps ${b.id}`).toBe(false)
      }
    }
  })
})
