import { describe, expect, it } from 'vitest'
import { calculateAllGenerations, calculateGeneration, calculateGenerationOrdinals } from '../generation/generationEngine'
import { buildFamilyGraph } from '../graph/familyGraph'
import { createBranchVisibleGraph } from '../lineage/branchVisibility'
import { classifyRelativeScope } from '../lineage/lineageClassifier'
import { getNearestRelatives } from '../relatives/nearestRelatives'
import type { Person, Relationship } from '../types/family'

const people: Person[] = [
  { id: 'S', name: 'Chủ thể', gender: 'male' },
  { id: 'F', name: 'Bố', gender: 'male' },
  { id: 'M', name: 'Mẹ', gender: 'female' },
  { id: 'PGF', name: 'Ông nội', gender: 'male' },
  { id: 'MGF', name: 'Ông ngoại', gender: 'male' },
  { id: 'B', name: 'Anh ruột', gender: 'male' },
  { id: 'W', name: 'Vợ của anh', gender: 'female' },
  { id: 'WF', name: 'Bố của chị dâu', gender: 'male' },
  { id: 'WM', name: 'Mẹ của chị dâu', gender: 'female' },
  { id: 'BC', name: 'Cháu ruột', gender: 'female' },
  { id: 'SW', name: 'Vợ chủ thể', gender: 'female' },
  { id: 'C', name: 'Con', gender: 'male' },
  { id: 'GC', name: 'Cháu', gender: 'female' },
]

const relationships: Relationship[] = [
  { id: 'r1', person1Id: 'F', person2Id: 'S', type: 'parent' },
  { id: 'r2', person1Id: 'M', person2Id: 'S', type: 'parent' },
  { id: 'r3', person1Id: 'PGF', person2Id: 'F', type: 'parent' },
  { id: 'r4', person1Id: 'MGF', person2Id: 'M', type: 'parent' },
  { id: 'r5', person1Id: 'F', person2Id: 'B', type: 'parent' },
  { id: 'r6', person1Id: 'M', person2Id: 'B', type: 'parent' },
  { id: 'r7', person1Id: 'B', person2Id: 'W', type: 'spouse', status: 'divorced' },
  { id: 'r8', person1Id: 'WF', person2Id: 'W', type: 'parent' },
  { id: 'r9', person1Id: 'WM', person2Id: 'W', type: 'parent' },
  { id: 'r10', person1Id: 'B', person2Id: 'BC', type: 'parent' },
  { id: 'r11', person1Id: 'W', person2Id: 'BC', type: 'parent' },
  { id: 'r12', person1Id: 'S', person2Id: 'SW', type: 'spouse', status: 'married' },
  { id: 'r13', person1Id: 'S', person2Id: 'C', type: 'parent' },
  { id: 'r14', person1Id: 'C', person2Id: 'GC', type: 'parent' },
]

describe('generation and lineage engines', () => {
  const graph = buildFamilyGraph(people, relationships)

  it('uses positive generations for ancestors and negative for descendants', () => {
    expect(calculateGeneration('S', 'PGF', graph)).toBe(2)
    expect(calculateGeneration('S', 'GC', graph)).toBe(-2)
    expect(calculateAllGenerations('S', graph).get('SW')).toBe(0)
  })

  it('numbers generations from the highest known ancestor and shifts when an earlier generation is added', () => {
    const currentOrdinals = calculateGenerationOrdinals(calculateAllGenerations('S', graph))
    expect(currentOrdinals.get('PGF')).toBe(1)
    expect(currentOrdinals.get('F')).toBe(2)
    expect(currentOrdinals.get('S')).toBe(3)

    const extendedPeople = [...people, { id: 'GGP', name: 'Cụ nội', gender: 'male' as const }]
    const extendedRelationships = [...relationships, { id: 'r15', person1Id: 'GGP', person2Id: 'PGF', type: 'parent' as const }]
    const extendedGraph = buildFamilyGraph(extendedPeople, extendedRelationships)
    const shiftedOrdinals = calculateGenerationOrdinals(calculateAllGenerations('S', extendedGraph))
    expect(shiftedOrdinals.get('GGP')).toBe(1)
    expect(shiftedOrdinals.get('PGF')).toBe(2)
    expect(shiftedOrdinals.get('S')).toBe(4)
  })

  it('classifies father and mother branches without persisting scope', () => {
    expect(classifyRelativeScope('S', 'PGF', graph)).toBe('paternal')
    expect(classifyRelativeScope('S', 'MGF', graph)).toBe('maternal')
    expect(classifyRelativeScope('S', 'SW', graph)).toBe('spouse')
    expect(classifyRelativeScope('S', 'W', graph)).toBe('spouse')
    expect(classifyRelativeScope('S', 'WF', graph)).toBe('affinal')
  })

  it('stops at the spouse boundary but retains shared children', () => {
    const compact = createBranchVisibleGraph(graph, 'S', { ancestorDepth: 2, descendantDepth: 1, collateral: 'immediate' })
    expect(compact.visibleIds.has('B')).toBe(true)
    expect(compact.visibleIds.has('W')).toBe(true)
    expect(compact.visibleIds.has('BC')).toBe(true)
    expect(compact.visibleIds.has('WF')).toBe(false)
    expect(compact.visibleIds.has('WM')).toBe(false)
    expect(compact.hiddenCounts.get('W')).toBeGreaterThanOrEqual(2)

    const expanded = createBranchVisibleGraph(graph, 'S', { ancestorDepth: 2, descendantDepth: 1, collateral: 'immediate', expandedPersonIds: new Set(['W']) })
    expect(expanded.visibleIds.has('WF')).toBe(true)
    expect(expanded.visibleIds.has('WM')).toBe(true)

    const collapsedAfterExpandAll = createBranchVisibleGraph(graph, 'S', { ancestorDepth: 99, descendantDepth: 99, collateral: 'all', revealAllBranches: true, collapsedPersonIds: new Set(['W']) })
    expect(collapsedAfterExpandAll.visibleIds.has('W')).toBe(true)
    expect(collapsedAfterExpandAll.visibleIds.has('WF')).toBe(false)
    expect(collapsedAfterExpandAll.visibleIds.has('WM')).toBe(false)
    expect(collapsedAfterExpandAll.visibleIds.has('BC')).toBe(true)
  })

  it('builds nearest relative groups around the temporary target', () => {
    const groups = getNearestRelatives('S', graph, { maxDistance: 3, includeSpouse: true, includeAffinal: false })
    expect(groups.direct.map((item) => item.person.id)).toEqual(expect.arrayContaining(['F', 'M', 'B']))
    expect(groups.spouse.map((item) => item.person.id)).toEqual(['SW'])
    expect(groups.paternal.map((item) => item.person.id)).toContain('PGF')
    expect(groups.maternal.map((item) => item.person.id)).toContain('MGF')
    expect(groups.direct.map((item) => item.person.id)).not.toContain('WF')
  })
})
