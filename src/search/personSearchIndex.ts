import type { FamilyScope, KinshipResult, Person } from '../types/family'

export type SearchMatchField = 'name' | 'nickname' | 'phone' | 'address' | 'note' | 'kinship' | 'birthYear'

export interface PersonSearchResult {
  person: Person
  score: number
  matchField: SearchMatchField
  kinship?: KinshipResult
  scope?: FamilyScope
}

interface IndexedPerson {
  person: Person
  name: string
  nickname: string
  phone1: string
  phone2: string
  address: string
  note: string
  birthYear: string
}

export function normalizeVietnameseText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim()
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('84') && digits.length >= 10) return `0${digits.slice(2)}`
  return digits
}

export class PersonSearchIndex {
  private readonly entries: IndexedPerson[]

  constructor(persons: Person[]) {
    this.entries = persons.map((person) => ({
      person,
      name: normalizeVietnameseText(person.name),
      nickname: normalizeVietnameseText(person.nickname ?? ''),
      phone1: normalizePhone(person.phone1 ?? ''),
      phone2: normalizePhone(person.phone2 ?? ''),
      address: normalizeVietnameseText(person.address ?? ''),
      note: normalizeVietnameseText(person.note ?? ''),
      birthYear: person.birthDate?.slice(0, 4) ?? '',
    }))
  }

  search(query: string, options?: { kinships?: Map<string, KinshipResult>; scopes?: Map<string, FamilyScope>; limit?: number }): PersonSearchResult[] {
    const textQuery = normalizeVietnameseText(query)
    const phoneQuery = normalizePhone(query)
    if (!textQuery) return []
    const results: PersonSearchResult[] = []
    for (const entry of this.entries) {
      const kinship = options?.kinships?.get(entry.person.id)
      const normalizedKinship = normalizeVietnameseText(`${kinship?.label ?? ''} ${kinship?.shortLabel ?? ''}`)
      let score = 0
      let matchField: SearchMatchField | undefined
      const consider = (nextScore: number, field: SearchMatchField) => { if (nextScore > score) { score = nextScore; matchField = field } }
      if (entry.name === textQuery) consider(1000, 'name')
      else if (entry.name.startsWith(textQuery)) consider(850, 'name')
      else if (entry.name.includes(textQuery)) consider(700, 'name')
      if (entry.nickname === textQuery) consider(760, 'nickname')
      else if (entry.nickname.includes(textQuery)) consider(630, 'nickname')
      if (normalizedKinship.includes(textQuery)) consider(560, 'kinship')
      if (/^\d{4}$/.test(textQuery) && entry.birthYear === textQuery) consider(520, 'birthYear')
      if (phoneQuery.length >= 4 && (entry.phone1.includes(phoneQuery) || entry.phone2.includes(phoneQuery))) consider(540, 'phone')
      if (entry.address.includes(textQuery)) consider(320, 'address')
      if (entry.note.includes(textQuery)) consider(120, 'note')
      if (matchField) results.push({ person: entry.person, score, matchField, kinship, scope: options?.scopes?.get(entry.person.id) })
    }
    return results.sort((left, right) => right.score - left.score || left.person.name.localeCompare(right.person.name, 'vi')).slice(0, options?.limit ?? 8)
  }
}
