import type { FamilyData } from '../types/family'

export interface PersonDeletionSummary {
  data: FamilyData
  relationshipCount: number
  mediaCount: number
}

export function deletePersonCascade(data: FamilyData, personId: string): PersonDeletionSummary {
  if (!data.persons.some((person) => person.id === personId)) throw new Error('Không tìm thấy thành viên cần xóa.')
  const relationshipCount = data.relationships.filter((relationship) => relationship.person1Id === personId || relationship.person2Id === personId).length
  const mediaCount = data.media.filter((media) => media.personId === personId).length
  return {
    relationshipCount,
    mediaCount,
    data: {
      ...data,
      persons: data.persons.filter((person) => person.id !== personId),
      relationships: data.relationships.filter((relationship) => relationship.person1Id !== personId && relationship.person2Id !== personId),
      profiles: data.profiles.map((profile) => profile.subjectPersonId === personId ? { ...profile, subjectPersonId: null } : profile),
      media: data.media.filter((media) => media.personId !== personId),
    },
  }
}
