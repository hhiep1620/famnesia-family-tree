import { CURRENT_SCHEMA_VERSION, normalizePersonForStorage, requireValidFamilyData } from '../schema/familyDataSchema.js'
import type { FamilyData } from '../types/family.js'

export function prepareFamilyDataForExport(data: FamilyData, updatedAt = data.updatedAt ?? new Date().toISOString()): FamilyData {
  return requireValidFamilyData({
    ...data,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt,
    profiles: data.profiles.map((profile) => ({
      ...profile,
      description: profile.description ?? '',
      photoFileId: profile.photoFileId ?? null,
      subjectPersonId: profile.subjectPersonId ?? null,
    })),
    persons: data.persons.map(normalizePersonForStorage),
    relationships: data.relationships.map((relationship) => ({
      ...relationship,
      status: relationship.type === 'spouse' ? relationship.status ?? 'unknown' : undefined,
      startDate: relationship.startDate ?? null,
      endDate: relationship.endDate ?? null,
    })),
  })
}

export function serializeFamilyData(data: FamilyData, updatedAt?: string): string {
  return `${JSON.stringify(prepareFamilyDataForExport(data, updatedAt), null, 2)}\n`
}

export function createFamilyDataTemplate(): FamilyData {
  return requireValidFamilyData({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    profiles: [{
      id: 'F0001',
      name: 'Gia đình của tôi',
      description: 'Dữ liệu mẫu — hãy thay bằng thông tin gia đình bạn.',
      photoFileId: null,
      subjectPersonId: 'P0001',
      requiresSecret: false,
      isActive: true,
    }],
    persons: [
      {
        id: 'P0001', profileId: 'F0001', name: 'Nguyễn Văn An', nickname: 'Ông An', gender: 'male',
        birthDate: '1950-05-10', isDeceased: false, deathDate: null, deathLunar: null,
        ancestralRole: 'founding_ancestor', photoFileId: null, sortOrder: 1,
      },
      {
        id: 'P0002', profileId: 'F0001', name: 'Trần Thị Bình', nickname: '', gender: 'female',
        birthDate: '1952-08-16', isDeceased: false, deathDate: null, deathLunar: null,
        ancestralRole: 'none', photoFileId: null, sortOrder: 2,
      },
      {
        id: 'P0003', profileId: 'F0001', name: 'Nguyễn Minh Châu', nickname: '', gender: 'female',
        birthDate: '1980-01-01', isDeceased: false, deathDate: null, deathLunar: null,
        ancestralRole: 'none', photoFileId: null, sortOrder: 1,
      },
    ],
    relationships: [
      {
        id: 'R0001', profileId: 'F0001', person1Id: 'P0001', person2Id: 'P0002', type: 'spouse',
        status: 'married', startDate: null, endDate: null, sortOrder: 1,
      },
      {
        id: 'R0002', profileId: 'F0001', person1Id: 'P0001', person2Id: 'P0003', type: 'parent',
        startDate: null, endDate: null, sortOrder: 1,
      },
      {
        id: 'R0003', profileId: 'F0001', person1Id: 'P0002', person2Id: 'P0003', type: 'parent',
        startDate: null, endDate: null, sortOrder: 2,
      },
    ],
    settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' },
  })
}

function downloadText(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function downloadFamilyData(data: FamilyData): void {
  const date = new Date().toISOString().slice(0, 10)
  downloadText(`famnesia-${date}.json`, serializeFamilyData(data))
}

export function downloadFamilyDataTemplate(): void {
  downloadText(`famnesia-template-v${CURRENT_SCHEMA_VERSION}.json`, serializeFamilyData(createFamilyDataTemplate()))
}
