import { CURRENT_SCHEMA_VERSION, normalizePersonForStorage, requireValidFamilyData } from '../schema/familyDataSchema.js'
import type { FamilyData } from '../types/family.js'

export function prepareFamilyDataForServerStorage(data: FamilyData, updatedAt = data.updatedAt ?? new Date().toISOString()): FamilyData {
  return requireValidFamilyData({
    ...data,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt,
    profiles: data.profiles.map((profile) => ({
      ...profile,
      lineageSurname: profile.lineageSurname ?? '',
      description: profile.description ?? '',
      photoFileId: profile.photoFileId ?? null,
      subjectPersonId: profile.subjectPersonId ?? null,
    })),
    persons: data.persons.map(normalizePersonForStorage),
    media: data.media.map((media) => ({ ...media, caption: media.caption ?? '', takenDate: media.takenDate ?? null })),
    relationships: data.relationships.map((relationship) => ({
      ...relationship,
      status: relationship.type === 'spouse' ? relationship.status ?? 'unknown' : undefined,
      startDate: relationship.startDate ?? null,
      endDate: relationship.endDate ?? null,
    })),
  })
}

export function serializeFamilyDataForServer(data: FamilyData, updatedAt?: string): string {
  return `${JSON.stringify(prepareFamilyDataForServerStorage(data, updatedAt), null, 2)}\n`
}
