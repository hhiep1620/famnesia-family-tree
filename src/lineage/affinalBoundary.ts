import { findKinshipPath } from '../kinship/kinshipPath'
import type { FamilyGraph } from '../types/family'

export function isDirectSpouse(subjectId: string, targetId: string, graph: FamilyGraph): boolean {
  const path = findKinshipPath(subjectId, targetId, graph)
  return path?.length === 1 && path[0].type === 'spouse'
}

export function crossesAffinalBoundary(subjectId: string, targetId: string, graph: FamilyGraph): boolean {
  const path = findKinshipPath(subjectId, targetId, graph)
  return Boolean(path?.some((step) => step.type === 'spouse') && !isDirectSpouse(subjectId, targetId, graph))
}

export function isBoundarySpouse(subjectId: string, targetId: string, graph: FamilyGraph): boolean {
  const path = findKinshipPath(subjectId, targetId, graph)
  return Boolean(path && path.length > 1 && path.at(-1)?.type === 'spouse' && path.slice(0, -1).every((step) => step.type !== 'spouse'))
}
