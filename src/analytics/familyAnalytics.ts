import { calculateAge } from '../calendar/dateUtils'
import { calculateAllGenerations } from '../generation/generationEngine'
import { buildFamilyGraph } from '../graph/familyGraph'
import { classifyRelativeScope } from '../lineage/lineageClassifier'
import type { FamilyData, FamilyScope, Person } from '../types/family'

export type AnalyticsScope = 'all' | 'paternal' | 'maternal' | 'descendant'
export interface FamilyAnalyticsResult {
  people: Person[]
  population: { total: number; living: number; deceased: number }
  gender: Record<'male' | 'female' | 'other' | 'unknown', number>
  age: Record<string, number>
  locations: Array<{ label: string; count: number }>
  generations: Array<{ generation: number; count: number }>
}
export function calculateFamilyAnalytics(data: FamilyData, subjectId: string | undefined, scope: AnalyticsScope = 'all'): FamilyAnalyticsResult {
  const graph = buildFamilyGraph(data.persons, data.relationships)
  const matchesScope = (person: Person): boolean => {
    if (scope === 'all' || !subjectId || person.id === subjectId) return true
    const relativeScope: FamilyScope = classifyRelativeScope(subjectId, person.id, graph)
    return relativeScope === scope
  }
  const people = data.persons.filter(matchesScope)
  const gender = { male: 0, female: 0, other: 0, unknown: 0 }
  const age: Record<string, number> = { '0–18': 0, '19–30': 0, '31–45': 0, '46–60': 0, '61–75': 0, '76+': 0, 'Không rõ': 0 }
  const locationMap = new Map<string, number>()
  for (const person of people) {
    gender[person.gender ?? 'unknown'] += 1
    const years = calculateAge(person.birthDate ?? undefined)
    const band = years === undefined ? 'Không rõ' : years <= 18 ? '0–18' : years <= 30 ? '19–30' : years <= 45 ? '31–45' : years <= 60 ? '46–60' : years <= 75 ? '61–75' : '76+'
    age[band] += 1
    const location = person.address?.split(',').at(-1)?.trim() || 'Không rõ'
    locationMap.set(location, (locationMap.get(location) ?? 0) + 1)
  }
  const generations = subjectId ? calculateAllGenerations(subjectId, graph) : new Map<string, number>()
  const generationMap = new Map<number, number>()
  for (const person of people) { const value = generations.get(person.id); if (value !== undefined) generationMap.set(value, (generationMap.get(value) ?? 0) + 1) }
  return {
    people,
    population: { total: people.length, living: people.filter((person) => !person.isDeceased).length, deceased: people.filter((person) => person.isDeceased).length },
    gender, age,
    locations: [...locationMap].map(([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count).slice(0, 8),
    generations: [...generationMap].map(([generation, count]) => ({ generation, count })).sort((left, right) => right.generation - left.generation),
  }
}
