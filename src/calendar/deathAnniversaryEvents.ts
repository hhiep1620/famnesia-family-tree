import type { FamilyEvent, Person } from '../types/family'
import { convertLunarToSolar } from './lunarCalendar'

export function getDeathAnniversaryEvents(persons: Person[], year: number): FamilyEvent[] {
  return persons.flatMap((person) => {
    if (!person.isDeceased || !person.deathLunar) return []
    const date = convertLunarToSolar(person.deathLunar.day, person.deathLunar.month, year, person.deathLunar.leapMonth)
    if (!date) return []
    return [{
      id: `death-anniversary:${person.id}:${year}`,
      type: 'death_anniversary' as const,
      personId: person.id,
      profileId: person.profileId ?? 'F0001',
      date,
      lunarDate: {
        day: person.deathLunar.day,
        month: person.deathLunar.month,
        leapMonth: person.deathLunar.leapMonth,
      },
    }]
  })
}
