import type { FamilyGraph } from '../types/family'
import { findKinshipPath } from '../kinship/kinshipPath'

export function calculateGeneration(subjectId: string, personId: string, graph: FamilyGraph): number | undefined {
  const path = findKinshipPath(subjectId, personId, graph)
  if (!path) return undefined
  return path.reduce((generation, step) => generation + (step.type === 'parent' ? 1 : step.type === 'child' ? -1 : 0), 0)
}

export function calculateAllGenerations(subjectId: string, graph: FamilyGraph): Map<string, number> {
  const generations = new Map<string, number>()
  for (const personId of graph.personsById.keys()) {
    const generation = calculateGeneration(subjectId, personId, graph)
    if (generation !== undefined) generations.set(personId, generation)
  }
  return generations
}

export function calculateGenerationOrdinals(generations: Map<string, number>): Map<string, number> {
  if (generations.size === 0) return new Map()
  const highestGeneration = Math.max(...generations.values())
  return new Map([...generations].map(([personId, generation]) => [personId, highestGeneration - generation + 1]))
}
