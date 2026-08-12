import { findKinshipPath } from '../kinship/kinshipPath'
import type { FamilyGraph, FamilyScope } from '../types/family'

export function classifyRelativeScope(subjectId: string, targetId: string, graph: FamilyGraph): FamilyScope {
  if (subjectId === targetId) return 'self'
  const steps = findKinshipPath(subjectId, targetId, graph)
  if (!steps) return 'unclassified'
  if (steps.at(-1)?.type === 'spouse' && steps.slice(0, -1).every((step) => step.type !== 'spouse')) return 'spouse'
  if (steps.some((step) => step.type === 'spouse')) return 'affinal'
  if (steps.every((step) => step.type === 'child')) return 'descendant'

  const firstParent = steps.find((step) => step.type === 'parent')
  if (firstParent) {
    const parentGender = graph.personsById.get(firstParent.toId)?.gender
    if (parentGender === 'male') return 'paternal'
    if (parentGender === 'female') return 'maternal'
  }
  return 'unclassified'
}

export function classifyAllRelativeScopes(subjectId: string, graph: FamilyGraph): Map<string, FamilyScope> {
  return new Map([...graph.personsById.keys()].map((personId) => [personId, classifyRelativeScope(subjectId, personId, graph)]))
}

function getBranchByScope(subjectId: string, graph: FamilyGraph, scope: FamilyScope): Set<string> {
  return new Set([...graph.personsById.keys()].filter((personId) => classifyRelativeScope(subjectId, personId, graph) === scope))
}

export function getPaternalBranch(subjectId: string, graph: FamilyGraph): Set<string> {
  return getBranchByScope(subjectId, graph, 'paternal')
}

export function getMaternalBranch(subjectId: string, graph: FamilyGraph): Set<string> {
  return getBranchByScope(subjectId, graph, 'maternal')
}

export function getAffinalBranch(subjectId: string, graph: FamilyGraph): Set<string> {
  return getBranchByScope(subjectId, graph, 'affinal')
}
