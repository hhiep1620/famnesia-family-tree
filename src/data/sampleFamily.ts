import { CURRENT_SCHEMA_VERSION } from '../schema/familyDataSchema'
import type { FamilyData, Person, Relationship } from '../types/family'

export const samplePersons: Person[] = [
  { id: 'P0001', profileId: 'F0001', name: 'Nguyễn Văn An', nickname: 'Ông Hai', gender: 'male', birthDate: '1938-02-04', isDeceased: true, deathDate: '2010-09-21', deathLunar: { day: 14, month: 8, leapMonth: false }, ancestralRole: 'founding_ancestor', sortOrder: 1, createdAt: '2026-08-11T03:00:00Z', updatedAt: '2026-08-11T03:00:00Z' },
  { id: 'P0002', profileId: 'F0001', name: 'Trần Thị Bình', gender: 'female', birthDate: '1942-06-17', isDeceased: false, ancestralRole: 'none', sortOrder: 2, createdAt: '2026-08-11T03:01:00Z', updatedAt: '2026-08-11T03:01:00Z' },
  { id: 'P0003', profileId: 'F0001', name: 'Nguyễn Văn Cường', nickname: 'Ba Cường', gender: 'male', birthDate: '1968-10-08', isDeceased: false, ancestralRole: 'none', sortOrder: 1, createdAt: '2026-08-11T03:02:00Z', updatedAt: '2026-08-11T03:02:00Z' },
  { id: 'P0004', profileId: 'F0001', name: 'Nguyễn Thị Duyên', gender: 'female', birthDate: '1972-01-24', isDeceased: false, ancestralRole: 'none', sortOrder: 2, createdAt: '2026-08-11T03:03:00Z', updatedAt: '2026-08-11T03:03:00Z' },
  { id: 'P0005', profileId: 'F0001', name: 'Lê Thị Em', gender: 'female', birthDate: '1970-04-20', isDeceased: false, ancestralRole: 'none', sortOrder: 2, createdAt: '2026-08-11T03:04:00Z', updatedAt: '2026-08-11T03:04:00Z' },
  { id: 'P0006', profileId: 'F0001', name: 'Nguyễn Minh Hà', nickname: 'Hà', gender: 'female', birthDate: '1996-08-15', isDeceased: false, ancestralRole: 'none', sortOrder: 1, createdAt: '2026-08-11T03:05:00Z', updatedAt: '2026-08-11T03:05:00Z' },
  { id: 'P0007', profileId: 'F0001', name: 'Nguyễn Gia Huy', gender: 'male', birthDate: '2000-12-05', isDeceased: false, ancestralRole: 'none', sortOrder: 2, createdAt: '2026-08-11T03:06:00Z', updatedAt: '2026-08-11T03:06:00Z' },
]

export const sampleRelationships: Relationship[] = [
  { id: 'R0001', profileId: 'F0001', person1Id: 'P0001', person2Id: 'P0002', type: 'spouse', status: 'widowed', startDate: '1964-02-12', sortOrder: 1 },
  { id: 'R0002', profileId: 'F0001', person1Id: 'P0001', person2Id: 'P0003', type: 'parent', sortOrder: 1 },
  { id: 'R0003', profileId: 'F0001', person1Id: 'P0002', person2Id: 'P0003', type: 'parent', sortOrder: 2 },
  { id: 'R0004', profileId: 'F0001', person1Id: 'P0001', person2Id: 'P0004', type: 'parent', sortOrder: 1 },
  { id: 'R0005', profileId: 'F0001', person1Id: 'P0002', person2Id: 'P0004', type: 'parent', sortOrder: 2 },
  { id: 'R0006', profileId: 'F0001', person1Id: 'P0003', person2Id: 'P0005', type: 'spouse', status: 'married', startDate: '1993-11-20', sortOrder: 1 },
  { id: 'R0007', profileId: 'F0001', person1Id: 'P0003', person2Id: 'P0006', type: 'parent', sortOrder: 1 },
  { id: 'R0008', profileId: 'F0001', person1Id: 'P0005', person2Id: 'P0006', type: 'parent', sortOrder: 2 },
  { id: 'R0009', profileId: 'F0001', person1Id: 'P0003', person2Id: 'P0007', type: 'parent', sortOrder: 1 },
  { id: 'R0010', profileId: 'F0001', person1Id: 'P0005', person2Id: 'P0007', type: 'parent', sortOrder: 2 },
]

export const sampleFamilyData: FamilyData = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  updatedAt: '2026-08-11T03:10:00Z',
  profiles: [{
    id: 'F0001', name: 'Gia đình Nguyễn', lineageSurname: 'Nguyễn', description: 'Dữ liệu mẫu dùng khi phát triển giao diện.',
    subjectPersonId: 'P0006', requiresSecret: false, isActive: true,
  }],
  persons: samplePersons,
  relationships: sampleRelationships,
  media: [],
  settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' },
}
