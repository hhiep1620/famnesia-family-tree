import type { FamilyProfile, Person } from '../types/family'

const LINEAGE_PREFIX = /^(?:gia\s+tộc\s+)?họ\s+/iu

export interface ProfileLineageGroup {
  surname?: string
  label: string
  profiles: FamilyProfile[]
}

export function normalizeLineageSurname(value: string | null | undefined): string {
  const clean = String(value ?? '').normalize('NFC').trim().replace(LINEAGE_PREFIX, '').replace(/\s+/g, ' ')
  return clean.split(' ').filter(Boolean).map((part) => `${part.charAt(0).toLocaleUpperCase('vi')}${part.slice(1).toLocaleLowerCase('vi')}`).join(' ')
}

export function surnameFromPersonName(name: string): string {
  return normalizeLineageSurname(name.trim().split(/\s+/u)[0])
}

export function getMaleSurnameSuggestions(persons: Person[]): Array<{ surname: string; count: number }> {
  const counts = new Map<string, number>()
  for (const person of persons) {
    if (person.gender !== 'male') continue
    const surname = surnameFromPersonName(person.name)
    if (surname) counts.set(surname, (counts.get(surname) ?? 0) + 1)
  }
  return [...counts].map(([surname, count]) => ({ surname, count })).sort((left, right) => right.count - left.count || left.surname.localeCompare(right.surname, 'vi'))
}

export function resolveProfileLineageSurname(profile: FamilyProfile, persons: Person[]): string {
  const explicit = normalizeLineageSurname(profile.lineageSurname)
  if (explicit) return explicit
  const members = persons.filter((person) => person.profileId === profile.id)
  const subject = members.find((person) => person.id === profile.subjectPersonId && person.gender === 'male')
  return subject ? surnameFromPersonName(subject.name) : getMaleSurnameSuggestions(members)[0]?.surname ?? ''
}

export function groupProfilesByLineage(profiles: FamilyProfile[], persons: Person[]): ProfileLineageGroup[] {
  const groups = new Map<string, ProfileLineageGroup>()
  for (const profile of profiles) {
    const surname = resolveProfileLineageSurname(profile, persons)
    const key = surname || '_ungrouped'
    const group = groups.get(key) ?? { surname: surname || undefined, label: surname ? `Gia tộc họ ${surname}` : 'Chưa phân nhóm', profiles: [] }
    group.profiles.push(profile)
    groups.set(key, group)
  }
  return [...groups.values()].sort((left, right) => {
    if (!left.surname) return 1
    if (!right.surname) return -1
    return left.surname.localeCompare(right.surname, 'vi')
  })
}
