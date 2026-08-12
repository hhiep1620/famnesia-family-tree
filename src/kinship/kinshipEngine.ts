import type { FamilyGraph, KinshipResult } from '../types/family'
import { findKinshipPath } from './kinshipPath'
import { classifyVietnameseKinship } from './kinshipVietnamese'

function stepExplanation(type: 'parent' | 'child' | 'spouse', gender?: string): string {
  if (type === 'parent') return gender === 'male' ? 'Bố' : gender === 'female' ? 'Mẹ' : 'Cha/mẹ'
  if (type === 'child') return gender === 'male' ? 'Con trai' : gender === 'female' ? 'Con gái' : 'Con'
  return gender === 'male' ? 'Chồng' : gender === 'female' ? 'Vợ' : 'Bạn đời'
}

export function getKinship(subjectId: string, targetId: string, graph: FamilyGraph): KinshipResult | undefined {
  if (!graph.personsById.has(subjectId) || !graph.personsById.has(targetId)) return undefined
  const steps = findKinshipPath(subjectId, targetId, graph)
  if (!steps) return undefined
  const classified = classifyVietnameseKinship(subjectId, steps, graph)
  const parentCount = steps.filter((step) => step.type === 'parent').length
  const childCount = steps.filter((step) => step.type === 'child').length
  const personPath = [subjectId, ...steps.map((step) => step.toId)]
  const explanation = ['Bạn', ...steps.map((step) => stepExplanation(step.type, graph.personsById.get(step.toId)?.gender))]
  return {
    subjectId,
    targetId,
    generationDelta: parentCount - childCount,
    ancestorGeneration: classified.ancestorGeneration,
    relationCode: classified.relationCode,
    label: classified.label,
    shortLabel: classified.shortLabel,
    branch: classified.branch,
    path: personPath,
    explanation,
    isBloodRelation: !steps.some((step) => step.type === 'spouse'),
    isMarriageRelation: steps.some((step) => step.type === 'spouse'),
    confidence: classified.confidence,
    distance: steps.length,
  }
}

export function getAllKinships(subjectId: string | undefined, graph: FamilyGraph): Map<string, KinshipResult> {
  const results = new Map<string, KinshipResult>()
  if (!subjectId) return results
  for (const targetId of graph.personsById.keys()) {
    const result = getKinship(subjectId, targetId, graph)
    if (result) results.set(targetId, result)
  }
  return results
}

export function explainKinshipPath(result: KinshipResult): string {
  return result.explanation.join(' → ')
}
