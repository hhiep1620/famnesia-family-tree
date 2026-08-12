import { buildFamilyGraph } from '../graph/familyGraph'
import { findKinshipPath, type KinshipStep } from '../kinship/kinshipPath'
import type { FamilyGraph } from '../types/family'

export type CollateralVisibility = 'immediate' | 'extended' | 'all'

export interface BranchVisibilityOptions {
  ancestorDepth: number
  descendantDepth: number
  collateral: CollateralVisibility
  expandedPersonIds?: Set<string>
}

export interface BranchVisibilityResult {
  graph: FamilyGraph
  visibleIds: Set<string>
  hiddenCounts: Map<string, number>
}

function bloodPathVisible(steps: KinshipStep[], options: BranchVisibilityOptions): boolean {
  if (steps.length === 0) return true
  if (steps.every((step) => step.type === 'parent')) return steps.length <= options.ancestorDepth
  if (steps.every((step) => step.type === 'child')) return steps.length <= options.descendantDepth

  const parentCount = steps.filter((step) => step.type === 'parent').length
  const childCount = steps.filter((step) => step.type === 'child').length
  if (parentCount > options.ancestorDepth || childCount > Math.max(options.descendantDepth + 1, 1)) return false
  if (options.collateral === 'all') return true
  if (options.collateral === 'extended') return steps.length <= 4
  return steps.length <= 2 || (parentCount === 1 && childCount <= 2 && steps.length <= 3)
}

export function shouldShowByDefault(subjectId: string, targetId: string, graph: FamilyGraph, options: BranchVisibilityOptions): boolean {
  const steps = findKinshipPath(subjectId, targetId, graph)
  if (!steps) return false
  if (steps.every((step) => step.type !== 'spouse')) return bloodPathVisible(steps, options)
  if (steps.length === 1 && steps[0].type === 'spouse') return true
  if (steps.at(-1)?.type === 'spouse' && steps.slice(0, -1).every((step) => step.type !== 'spouse')) return bloodPathVisible(steps.slice(0, -1), options)
  return false
}

function localExpansionIds(graph: FamilyGraph, rootId: string): Set<string> {
  const visible = new Set<string>([rootId])
  const parents = graph.parentsByChild.get(rootId) ?? []
  const children = graph.childrenByParent.get(rootId) ?? []
  const spouses = graph.spousesByPerson.get(rootId) ?? []
  const siblings = parents.flatMap((parentId) => graph.childrenByParent.get(parentId) ?? [])
  for (const personId of [...parents, ...children, ...spouses, ...siblings]) visible.add(personId)
  for (const personId of [...visible]) for (const spouseId of graph.spousesByPerson.get(personId) ?? []) visible.add(spouseId)
  return visible
}

function neighbours(graph: FamilyGraph, personId: string): string[] {
  return [...new Set([
    ...(graph.parentsByChild.get(personId) ?? []),
    ...(graph.childrenByParent.get(personId) ?? []),
    ...(graph.spousesByPerson.get(personId) ?? []),
  ])]
}

function countHiddenFrom(graph: FamilyGraph, rootId: string, visibleIds: Set<string>): number {
  const queue = neighbours(graph, rootId).filter((personId) => !visibleIds.has(personId))
  const visited = new Set(queue)
  while (queue.length) {
    const personId = queue.shift()!
    for (const nextId of neighbours(graph, personId)) {
      if (nextId === rootId || visibleIds.has(nextId) || visited.has(nextId)) continue
      visited.add(nextId)
      queue.push(nextId)
    }
  }
  return visited.size
}

export function createBranchVisibleGraph(graph: FamilyGraph, subjectId: string | undefined, options: BranchVisibilityOptions): BranchVisibilityResult {
  if (!subjectId || !graph.personsById.has(subjectId)) return { graph, visibleIds: new Set(graph.personsById.keys()), hiddenCounts: new Map() }
  const visibleIds = new Set([...graph.personsById.keys()].filter((personId) => shouldShowByDefault(subjectId, personId, graph, options)))
  for (const expandedId of options.expandedPersonIds ?? []) for (const personId of localExpansionIds(graph, expandedId)) visibleIds.add(personId)
  const persons = [...graph.personsById.values()].filter((person) => visibleIds.has(person.id))
  const relationships = graph.relationships.filter((relationship) => visibleIds.has(relationship.person1Id) && visibleIds.has(relationship.person2Id))
  const hiddenCounts = new Map<string, number>()
  for (const personId of visibleIds) {
    const count = countHiddenFrom(graph, personId, visibleIds)
    if (count > 0) hiddenCounts.set(personId, count)
  }
  return { graph: buildFamilyGraph(persons, relationships), visibleIds, hiddenCounts }
}

export function getHiddenBranchCount(graph: FamilyGraph, personId: string, visibleIds: Set<string>): number {
  return countHiddenFrom(graph, personId, visibleIds)
}
