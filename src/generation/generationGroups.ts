import type { Person } from '../types/family'

export interface GenerationGroup {
  generation: number
  persons: Person[]
}

export function groupPeopleByGeneration(persons: Iterable<Person>, generations: Map<string, number>): GenerationGroup[] {
  const grouped = new Map<number, Person[]>()
  for (const person of persons) {
    const generation = generations.get(person.id)
    if (generation === undefined) continue
    grouped.set(generation, [...(grouped.get(generation) ?? []), person])
  }
  return [...grouped]
    .sort(([left], [right]) => right - left)
    .map(([generation, members]) => ({ generation, persons: members }))
}
