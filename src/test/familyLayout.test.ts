import { describe, expect, it } from 'vitest'
import { buildFamilyGraph } from '../graph/familyGraph'
import { createFamilyUnits } from '../graph/familyUnits'
import { getAllKinships } from '../kinship/kinshipEngine'
import { createFlowEdges, createFlowNodes, layoutFamilyTree, PERSON_HEIGHT, PERSON_WIDTH } from '../layout/familyLayout'
import type { Person, Relationship } from '../types/family'

const people: Person[] = Array.from({ length: 11 }, (_, index) => ({
  id: `P${String(index + 1).padStart(4, '0')}`,
  name: `Thành viên ${index + 1}`,
  gender: index % 2 === 0 ? 'male' : 'female',
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
  { id: 'R0014', person1Id: 'P0001', person2Id: 'P0011', type: 'parent' },
  { id: 'R0015', person1Id: 'P0002', person2Id: 'P0011', type: 'parent' },
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

    const byId = new Map(positioned.map((node) => [node.id, node]))
    expect(byId.get('P0005')?.position.y).toBe(byId.get('P0011')?.position.y)
    expect(byId.get('P0007')?.position.y).toBe(byId.get('P0008')?.position.y)

    const firstParentsCenter = ((byId.get('P0001')?.position.x ?? 0) + (byId.get('P0002')?.position.x ?? 0)) / 2
    const secondParentsCenter = ((byId.get('P0003')?.position.x ?? 0) + (byId.get('P0004')?.position.x ?? 0)) / 2
    const spouseOrder = (byId.get('P0005')?.position.x ?? 0) - (byId.get('P0006')?.position.x ?? 0)
    expect((firstParentsCenter - secondParentsCenter) * spouseOrder).toBeGreaterThanOrEqual(0)
  })

  it('centres the subject and orders paternal relatives before maternal relatives', () => {
    const graph = buildFamilyGraph(people, relationships)
    const units = createFamilyUnits(graph)
    const kinships = getAllKinships('P0005', graph)
    const nodes = createFlowNodes(graph, units, undefined, { subjectId: 'P0005', kinships })
    const edges = createFlowEdges(graph, units)
    const positioned = layoutFamilyTree(nodes, edges, units, { graph, subjectId: 'P0005', kinships }).filter((node) => node.type === 'person')
    const byId = new Map(positioned.map((node) => [node.id, node]))

    expect((byId.get('P0005')?.position.x ?? 0) + PERSON_WIDTH / 2).toBe(0)
    expect(byId.get('P0001')?.position.x).toBeLessThan(byId.get('P0002')?.position.x ?? 0)
    expect(byId.get('P0011')?.position.x).toBeLessThan(byId.get('P0005')?.position.x ?? 0)
  })

  it('shows birth order only for the subject direct siblings', () => {
    const graph = buildFamilyGraph(people, relationships)
    const units = createFamilyUnits(graph)
    const kinships = getAllKinships('P0005', graph)
    const nodes = createFlowNodes(graph, units, undefined, { subjectId: 'P0005', kinships })
      .filter((node) => node.type === 'person')
    const byId = new Map(nodes.map((node) => [node.id, node]))

    expect(kinships.get('P0011')?.relationCode).toMatch(/sibling/)
    expect(byId.get('P0011')?.data.siblingOrder).toBe(11)
    expect(byId.get('P0001')?.data.siblingOrder).toBeUndefined()
    expect(byId.get('P0006')?.data.siblingOrder).toBeUndefined()
  })
})
