import type { FamilyEvent, Person } from '../types/family'
import { parseIsoDate, toIsoDate } from './dateUtils'

export function getBirthdayEvents(persons: Person[], year: number): FamilyEvent[] {
  return persons.flatMap((person) => {
    const birth = parseIsoDate(person.birthDate ?? undefined)
    if (!birth || birth.getFullYear() > year) return []
    const eventDate = new Date(year, birth.getMonth(), birth.getDate(), 12)
    // Feb 29 anniversaries use Feb 28 in non-leap years for a predictable V1 rule.
    if (eventDate.getMonth() !== birth.getMonth()) eventDate.setDate(0)
    return [{
      id: `birthday:${person.id}:${year}`,
      type: 'birthday' as const,
      personId: person.id,
      profileId: person.profileId ?? 'F0001',
      date: toIsoDate(eventDate),
      ageTurning: year - birth.getFullYear(),
    }]
  })
}
