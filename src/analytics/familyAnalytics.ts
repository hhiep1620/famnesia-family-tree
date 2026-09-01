import { todayInFamilyTimezone } from '../calendar/dateUtils'
import { ageFromPartialDate, personBirthDate } from '../calendar/partialDate'
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
  const age: Record<string, number> = { '0–9': 0, '10–19': 0, '20–29': 0, '30–39': 0, '40–49': 0, '50–59': 0, '60–69': 0, '70–79': 0, '80+': 0, 'Không rõ': 0 }
  const locationMap = new Map<string, number>()
  for (const person of people) {
    gender[person.gender ?? 'unknown'] += 1
    const years = ageFromPartialDate(personBirthDate(person), todayInFamilyTimezone())
    const band = years === undefined || years < 0 ? 'Không rõ' : years >= 80 ? '80+' : `${Math.floor(years / 10) * 10}–${Math.floor(years / 10) * 10 + 9}`
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
