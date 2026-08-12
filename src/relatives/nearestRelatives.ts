import { findKinshipPath } from '../kinship/kinshipPath'
import { getAllKinships } from '../kinship/kinshipEngine'
import { classifyRelativeScope } from '../lineage/lineageClassifier'
import type { FamilyGraph, KinshipResult, Person } from '../types/family'

export interface NearestRelative extends KinshipResult {
  person: Person
}

export interface NearestRelativeGroups {
  direct: NearestRelative[]
  paternal: NearestRelative[]
  maternal: NearestRelative[]
  descendants: NearestRelative[]
  spouse: NearestRelative[]
}

export interface NearestRelativesOptions {
  maxDistance?: number
  includeSpouse?: boolean
  includeAffinal?: boolean
}

function isDirectFamily(personId: string, targetId: string, graph: FamilyGraph): boolean {
  const steps = findKinshipPath(personId, targetId, graph)
  if (!steps) return false
  if (steps.length === 1 && steps[0].type === 'parent') return true
  return steps.length === 2 && steps[0].type === 'parent' && steps[1].type === 'child'
}

export function getNearestRelatives(personId: string, graph: FamilyGraph, options: NearestRelativesOptions = {}): NearestRelativeGroups {
  const maxDistance = options.maxDistance ?? 3
  const groups: NearestRelativeGroups = { direct: [], paternal: [], maternal: [], descendants: [], spouse: [] }
  const kinships = getAllKinships(personId, graph)
  for (const [targetId, kinship] of kinships) {
    if (targetId === personId || kinship.distance > maxDistance) continue
    const person = graph.personsById.get(targetId)
    if (!person) continue
    const scope = classifyRelativeScope(personId, targetId, graph)
    if (!options.includeAffinal && scope === 'affinal') continue
    const relative = { ...kinship, person }
    const steps = findKinshipPath(personId, targetId, graph)
    if (scope === 'spouse') {
      if (options.includeSpouse !== false && steps?.length === 1) groups.spouse.push(relative)
    } else if (scope === 'descendant') groups.descendants.push(relative)
    else if (isDirectFamily(personId, targetId, graph)) groups.direct.push(relative)
    else if (scope === 'paternal') groups.paternal.push(relative)
    else if (scope === 'maternal') groups.maternal.push(relative)
    else if (options.includeAffinal) groups.direct.push(relative)
  }
  for (const relatives of Object.values(groups) as NearestRelative[][]) relatives.sort((left, right) => left.distance - right.distance || left.person.name.localeCompare(right.person.name, 'vi'))
  return groups
}
