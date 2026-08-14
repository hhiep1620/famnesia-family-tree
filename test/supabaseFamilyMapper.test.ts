import { describe, expect, it } from 'vitest'
import { mapFamilyDataToSupabaseRows, mapSupabaseRowsToFamilyData, type SupabaseFamilyRows } from '../api/_server/supabase/familyMapper.js'
import { workspaceInfo } from '../api/_server/supabase/readBackend.js'
import { requireValidFamilyData } from '../src/schema/familyDataSchema.js'
import type { FamilyData } from '../src/types/family.js'

const timestamp = '2026-08-14T03:00:00.000Z'
const workspaceId = '20000000-0000-4000-8000-000000000001'
const profileUuid = '30000000-0000-4000-8000-000000000001'
const personOneUuid = '40000000-0000-4000-8000-000000000001'
const personTwoUuid = '40000000-0000-4000-8000-000000000002'

const rows: SupabaseFamilyRows = {
  workspace: {
    id: workspaceId,
    owner_user_id: '10000000-0000-4000-8000-000000000001',
    name: 'Parity family',
    schema_version: 3,
    data_version: 9,
    timezone: 'Asia/Ho_Chi_Minh',
    locale: 'vi-VN',
    duplicate_suppressions: ['P01:P99'],
    legacy_drive_folder_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  },
  profiles: [{
    id: profileUuid, workspace_id: workspaceId, legacy_id: 'F01', name: 'Gia tộc họ Hoàng', lineage_surname: 'Hoàng',
    description: 'Parity profile', legacy_photo_file_id: null, subject_person_id: personOneUuid,
    requires_secret: false, is_active: true, created_at: timestamp, updated_at: timestamp,
  }],
  persons: [
    {
      id: personTwoUuid, workspace_id: workspaceId, family_profile_id: profileUuid, legacy_id: 'P02', name: 'Nguyễn Thị Bình', nickname: null,
      gender: 'female', birth_date: '1950-04-05', is_deceased: true, death_date: '2024-08-20',
      death_lunar_day: 17, death_lunar_month: 7, death_lunar_leap_month: false,
      phone1: '', phone2: '', address: '', note: 'Ngày giỗ âm lịch', ancestral_role: 'founding_ancestor', sort_order: 2,
      birth_date_confidence: 'estimated', death_date_confidence: 'confirmed', created_at: timestamp, updated_at: timestamp,
    },
    {
      id: personOneUuid, workspace_id: workspaceId, family_profile_id: profileUuid, legacy_id: 'P01', name: 'Hoàng Văn An', nickname: 'An',
      gender: 'male', birth_date: '1980-02-03', is_deceased: false, death_date: null,
      death_lunar_day: null, death_lunar_month: null, death_lunar_leap_month: null,
      phone1: '0901000001', phone2: '', address: 'Hà Nội', note: '', ancestral_role: 'none', sort_order: 1,
      birth_date_confidence: 'confirmed', death_date_confidence: null, created_at: timestamp, updated_at: timestamp,
    },
  ],
  relationships: [{
    id: '50000000-0000-4000-8000-000000000001', workspace_id: workspaceId, family_profile_id: profileUuid, legacy_id: 'R01',
    person1_id: personOneUuid, person2_id: personTwoUuid, type: 'spouse', status: 'divorced',
    start_date: '2000-01-01', end_date: '2020-01-01', sort_order: 1, confidence: 'likely', created_at: timestamp, updated_at: timestamp,
  }],
  media: [{
    id: '60000000-0000-4000-8000-000000000001', workspace_id: workspaceId, family_profile_id: profileUuid, person_id: personOneUuid,
    legacy_id: 'M01', legacy_drive_file_id: null, storage_bucket: 'family-media', storage_path: `${workspaceId}/P01/M01.jpg`,
    type: 'photo', mime_type: 'image/jpeg', byte_size: 1234, checksum: 'checksum', is_primary: true,
    caption: 'Ảnh đại diện', taken_date: '2024-01-02', sort_order: 1, created_at: timestamp, updated_at: timestamp,
  }],
}

const expected: FamilyData = {
  schemaVersion: 3,
  updatedAt: timestamp,
  profiles: [{
    id: 'F01', name: 'Gia tộc họ Hoàng', lineageSurname: 'Hoàng', description: 'Parity profile', photoFileId: null,
    subjectPersonId: 'P01', requiresSecret: false, isActive: true,
  }],
  persons: [
    {
      id: 'P01', profileId: 'F01', name: 'Hoàng Văn An', nickname: 'An', gender: 'male', birthDate: '1980-02-03',
      isDeceased: false, deathDate: null, deathLunar: null, phone1: '0901000001', phone2: '', address: 'Hà Nội', note: '',
      ancestralRole: 'none', sortOrder: 1, createdAt: timestamp, updatedAt: timestamp, confidence: { birthDate: 'confirmed', deathDate: undefined },
    },
    {
      id: 'P02', profileId: 'F01', name: 'Nguyễn Thị Bình', nickname: null, gender: 'female', birthDate: '1950-04-05',
      isDeceased: true, deathDate: '2024-08-20', deathLunar: { day: 17, month: 7, leapMonth: false },
      phone1: '', phone2: '', address: '', note: 'Ngày giỗ âm lịch', ancestralRole: 'founding_ancestor', sortOrder: 2,
      createdAt: timestamp, updatedAt: timestamp, confidence: { birthDate: 'estimated', deathDate: 'confirmed' },
    },
  ],
  relationships: [{
    id: 'R01', profileId: 'F01', person1Id: 'P01', person2Id: 'P02', type: 'spouse', status: 'divorced',
    startDate: '2000-01-01', endDate: '2020-01-01', sortOrder: 1, createdAt: timestamp, updatedAt: timestamp, confidence: 'likely',
  }],
  media: [{
    id: 'M01', profileId: 'F01', personId: 'P01', fileId: 'M01', driveFileId: undefined,
    storagePath: `${workspaceId}/P01/M01.jpg`, type: 'photo', isPrimary: true, caption: 'Ảnh đại diện',
    takenDate: '2024-01-02', sortOrder: 1, createdAt: timestamp,
  }],
  settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', duplicateSuppressions: ['P01:P99'] },
}

describe('Supabase FamilyData mapper', () => {
  it('maps normalized rows to a deterministic, schema-valid FamilyData without losing fields', () => {
    const mapped = mapSupabaseRowsToFamilyData(rows)
    expect(mapped).toEqual(expected)
    expect(requireValidFamilyData(mapped)).toEqual(mapped)
  })

  it('maps domain data back to normalized foreign keys without disguising Storage keys as Drive IDs', () => {
    const ids = [profileUuid, personOneUuid, personTwoUuid, '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001']
    const mapped = mapFamilyDataToSupabaseRows(expected, workspaceId, () => ids.shift()!)
    expect(mapped.profiles[0].subject_person_id).toBe(personOneUuid)
    expect(mapped.relationships[0]).toMatchObject({ person1_id: personOneUuid, person2_id: personTwoUuid })
    expect(mapped.media[0]).toMatchObject({ legacy_id: 'M01', legacy_drive_file_id: null, storage_bucket: 'family-media', storage_path: `${workspaceId}/P01/M01.jpg` })
  })

  it('maps an empty workspace to the existing empty FamilyData behavior', () => {
    const empty = mapSupabaseRowsToFamilyData({ ...rows, profiles: [], persons: [], relationships: [], media: [] })
    expect(empty).toMatchObject({ profiles: [], persons: [], relationships: [], media: [] })
    expect(requireValidFamilyData(empty)).toEqual(empty)
  })
})

describe('Supabase CR07 workspace capabilities', () => {
  it.each(['owner', 'editor', 'contributor', 'viewer'] as const)('maps transactional commit and private media capabilities for %s', (role) => {
    const info = workspaceInfo(rows.workspace, role)
    const canCommit = role === 'owner' || role === 'editor'
    expect(info.role).toBe(role)
    expect(info.canRead).toBe(true)
    expect([
      info.canEdit, info.canUpload, info.canManageMembers, info.canCommitDirectly,
      info.canSubmitDraft, info.canReviewDrafts, info.canReplaceData, info.canCreateBackups,
    ]).toEqual([canCommit, role !== 'viewer', false, canCommit, false, false, false, false])
    expect(info.ownedByMe).toBe(role === 'owner')
  })
})
