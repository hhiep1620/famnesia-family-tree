import { parseIsoDate, todayInFamilyTimezone } from '../calendar/dateUtils'
import { auditFamilyData } from '../graph/familyValidation'
import type { DataIssue, FamilyData, Person } from '../types/family'
import { detectDuplicateCandidates } from './duplicateDetection'

export type IntegrityIssue = DataIssue & Required<Pick<DataIssue, 'id' | 'severity' | 'code' | 'message'>>
export interface IntegrityReport {
  issues: IntegrityIssue[]
  validRelationships: number
  relationshipHealth: number
  duplicates: ReturnType<typeof detectDuplicateCandidates>
  completeness: { overall: number; photo: number; birthDate: number; phone: number; address: number; gender: number }
}

function percent(count: number, total: number): number { return total ? Math.round(count * 100 / total) : 100 }
function year(value?: string | null): number | undefined { return value ? Number(value.slice(0, 4)) : undefined }

export function analyzeFamilyIntegrity(data: FamilyData): IntegrityReport {
  const issues: DataIssue[] = []
  const audit = auditFamilyData(data.persons, data.relationships)
  for (const issue of audit.issues) issues.push({ id: `relationship:${issue.relationshipId ?? issues.length}`, severity: 'error', code: 'INVALID_RELATIONSHIP', ...issue })
  const personById = new Map(data.persons.map((person) => [person.id, person]))
  for (const person of data.persons) {
    const birth = parseIsoDate(person.birthDate ?? undefined)
    if (birth && birth > todayInFamilyTimezone()) issues.push({ id: `future:${person.id}`, severity: 'error', code: 'FUTURE_BIRTH', personId: person.id, message: `${person.name}: ngày sinh nằm trong tương lai.` })
    if (person.birthDate && person.deathDate && person.deathDate < person.birthDate) issues.push({ id: `dates:${person.id}`, severity: 'error', code: 'DEATH_BEFORE_BIRTH', personId: person.id, message: `${person.name}: ngày mất trước ngày sinh.` })
    for (const [field, label] of [['birthDate', 'ngày sinh'], ['phone1', 'số điện thoại'], ['address', 'địa chỉ']] as const) {
      if (!person[field]) issues.push({ id: `missing:${field}:${person.id}`, severity: 'info', code: `MISSING_${field.toUpperCase()}`, personId: person.id, message: `${person.name}: thiếu ${label}.` })
    }
  }
  for (const relationship of data.relationships) {
    if (relationship.type !== 'parent') continue
    const parent = personById.get(relationship.person1Id); const child = personById.get(relationship.person2Id)
    const parentYear = year(parent?.birthDate); const childYear = year(child?.birthDate)
    if (parent && child && parentYear && childYear && childYear - parentYear < 12) issues.push({ id: `age:${relationship.id}`, severity: 'warning', code: 'SUSPICIOUS_PARENT_AGE', relationshipId: relationship.id, message: `${parent.name} chỉ hơn ${child.name} ${childYear - parentYear} tuổi.` })
  }
  const duplicates = detectDuplicateCandidates(data)
  for (const duplicate of duplicates) issues.push({ id: `duplicate:${duplicate.id}`, severity: 'warning', code: 'POSSIBLE_DUPLICATE', personId: duplicate.personA.id, message: `${duplicate.personA.name} và ${duplicate.personB.name} có thể là cùng một người (${Math.round(duplicate.score * 100)}%).` })
  const mediaPeople = new Set(data.media.map((item) => item.personId)); const total = data.persons.length
  const completeness = {
    photo: percent(data.persons.filter((person) => mediaPeople.has(person.id)).length, total),
    birthDate: percent(data.persons.filter((person) => person.birthDate).length, total),
    phone: percent(data.persons.filter((person) => person.phone1 || person.phone2).length, total),
    address: percent(data.persons.filter((person) => person.address).length, total),
    gender: percent(data.persons.filter((person) => person.gender && person.gender !== 'unknown').length, total),
    overall: 0,
  }
  completeness.overall = Math.round((completeness.photo + completeness.birthDate + completeness.phone + completeness.address + completeness.gender) / 5)
  return { issues: issues as IntegrityIssue[], validRelationships: audit.validRelationships.length, relationshipHealth: percent(audit.validRelationships.length, data.relationships.length), duplicates, completeness }
}

export function peopleMissingField(data: FamilyData, code: string): Person[] {
  if (code === 'photo') { const ids = new Set(data.media.map((item) => item.personId)); return data.persons.filter((person) => !ids.has(person.id)) }
  if (code === 'birthDate') return data.persons.filter((person) => !person.birthDate)
  if (code === 'phone') return data.persons.filter((person) => !person.phone1 && !person.phone2)
  if (code === 'address') return data.persons.filter((person) => !person.address)
  if (code === 'gender') return data.persons.filter((person) => !person.gender || person.gender === 'unknown')
  return []
}
