import type { FamilyEvent, Person } from '../types/family'
import { parseIsoDate, toIsoDate } from './dateUtils'
import { personBirthDate } from './partialDate'

export function getBirthdayEvents(persons: Person[], year: number): FamilyEvent[] {
  return persons.flatMap((person) => {
    const parts = personBirthDate(person)
    if (parts?.precision !== 'day' || parts.year > year) return []
    const birth = parseIsoDate(`${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`)!
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
