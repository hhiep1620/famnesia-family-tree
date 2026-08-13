import { requireValidFamilyData } from '../schema/familyDataSchema'
import type { FamilyData, Person, Relationship } from '../types/family'

function relationshipKey(item: Relationship): string {
  return item.type === 'parent' ? `parent:${item.person1Id}:${item.person2Id}` : `spouse:${[item.person1Id, item.person2Id].sort().join(':')}`
}

export function mergePeople(data: FamilyData, canonicalId: string, duplicateId: string): FamilyData {
  if (canonicalId === duplicateId) throw new Error('Hai thành viên cần gộp phải khác nhau.')
  const canonical = data.persons.find((person) => person.id === canonicalId); const duplicate = data.persons.find((person) => person.id === duplicateId)
  if (!canonical || !duplicate || canonical.profileId !== duplicate.profileId) throw new Error('Không tìm thấy hai thành viên trong cùng gia đình.')
  const phones = [canonical.phone1, canonical.phone2, duplicate.phone1, duplicate.phone2]
    .filter((phone, index, values): phone is string => Boolean(phone) && values.indexOf(phone) === index)
  const merged: Person = {
    ...duplicate, ...canonical,
    nickname: canonical.nickname || duplicate.nickname, gender: canonical.gender === 'unknown' ? duplicate.gender : canonical.gender,
    birthDate: canonical.birthDate || duplicate.birthDate, deathDate: canonical.deathDate || duplicate.deathDate,
    deathLunar: canonical.deathLunar || duplicate.deathLunar, phone1: phones[0] ?? '',
    phone2: phones[1] ?? '', address: canonical.address || duplicate.address, note: canonical.note || duplicate.note,
    updatedAt: new Date().toISOString(),
  }
  const seen = new Set<string>(); const relationships: Relationship[] = []
  for (const item of data.relationships) {
    const rewired = { ...item, person1Id: item.person1Id === duplicateId ? canonicalId : item.person1Id, person2Id: item.person2Id === duplicateId ? canonicalId : item.person2Id }
    if (rewired.person1Id === rewired.person2Id) continue
    const key = relationshipKey(rewired)
    if (!seen.has(key)) { seen.add(key); relationships.push(rewired) }
  }
  const personMedia = data.media.filter((item) => item.personId === canonicalId || item.personId === duplicateId)
  const preferredPrimary = personMedia.find((item) => item.personId === canonicalId && item.isPrimary)?.id ?? personMedia.find((item) => item.isPrimary)?.id
  return requireValidFamilyData({
    ...data,
    persons: data.persons.filter((person) => person.id !== duplicateId).map((person) => person.id === canonicalId ? merged : person),
    relationships,
    media: data.media.map((item) => item.personId === duplicateId ? { ...item, personId: canonicalId, isPrimary: item.id === preferredPrimary } : item.personId === canonicalId ? { ...item, isPrimary: item.id === preferredPrimary } : item),
    profiles: data.profiles.map((profile) => profile.subjectPersonId === duplicateId ? { ...profile, subjectPersonId: canonicalId } : profile),
  })
}
