import type { FamilyData, FamilyProfile, Person, PersonMedia, Relationship } from '../../../src/types/family.js'
import type { Tables, TablesInsert } from '../../../src/types/database.generated.js'

type WorkspaceRow = Tables<'workspaces'>
type ProfileRow = Tables<'family_profiles'>
type PersonRow = Tables<'persons'>
type RelationshipRow = Tables<'relationships'>
type MediaRow = Tables<'media'>

export interface SupabaseFamilyRows {
  workspace: WorkspaceRow
  profiles: ProfileRow[]
  persons: PersonRow[]
  relationships: RelationshipRow[]
  media: MediaRow[]
}

function deterministic<T extends { legacy_id: string; sort_order?: number | null }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftOrder = left.sort_order ?? Number.POSITIVE_INFINITY
    const rightOrder = right.sort_order ?? Number.POSITIVE_INFINITY
    return leftOrder - rightOrder || left.legacy_id.localeCompare(right.legacy_id)
  })
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function mapSupabaseRowsToFamilyData(rows: SupabaseFamilyRows): FamilyData {
  const profileLegacyById = new Map(rows.profiles.map((profile) => [profile.id, profile.legacy_id]))
  const personLegacyById = new Map(rows.persons.map((person) => [person.id, person.legacy_id]))

  const profiles: FamilyProfile[] = deterministic(rows.profiles).map((profile) => ({
    id: profile.legacy_id,
    name: profile.name,
    lineageSurname: profile.lineage_surname,
    description: profile.description,
    photoFileId: profile.legacy_photo_file_id,
    subjectPersonId: profile.subject_person_id ? personLegacyById.get(profile.subject_person_id) ?? null : null,
    requiresSecret: profile.requires_secret,
    isActive: profile.is_active,
  }))

  const persons: Person[] = deterministic(rows.persons).map((person) => {
    const birthDateConfidence = person.birth_date_confidence ?? undefined
    const deathDateConfidence = person.death_date_confidence ?? undefined
    return {
      id: person.legacy_id,
      profileId: profileLegacyById.get(person.family_profile_id) ?? '',
      name: person.name,
      nickname: person.nickname,
      gender: person.gender,
      birthDate: person.birth_date,
      isDeceased: person.is_deceased,
      deathDate: person.death_date,
      deathLunar: person.death_lunar_day && person.death_lunar_month && person.death_lunar_leap_month !== null
        ? { day: person.death_lunar_day, month: person.death_lunar_month, leapMonth: person.death_lunar_leap_month }
        : null,
      phone1: person.phone1,
      phone2: person.phone2,
      address: person.address,
      note: person.note,
      ancestralRole: person.ancestral_role,
      sortOrder: person.sort_order ?? undefined,
      createdAt: person.created_at,
      updatedAt: person.updated_at,
      confidence: birthDateConfidence || deathDateConfidence
        ? { birthDate: birthDateConfidence, deathDate: deathDateConfidence }
        : undefined,
    }
  })

  const relationships: Relationship[] = deterministic(rows.relationships).map((relationship) => ({
    id: relationship.legacy_id,
    profileId: profileLegacyById.get(relationship.family_profile_id) ?? '',
    person1Id: personLegacyById.get(relationship.person1_id) ?? '',
    person2Id: personLegacyById.get(relationship.person2_id) ?? '',
    type: relationship.type,
    status: relationship.status ?? undefined,
    startDate: relationship.start_date,
    endDate: relationship.end_date,
    sortOrder: relationship.sort_order ?? undefined,
    createdAt: relationship.created_at,
    updatedAt: relationship.updated_at,
    confidence: relationship.confidence ?? undefined,
  }))

  const media: PersonMedia[] = deterministic(rows.media).map((item) => ({
    id: item.legacy_id,
    profileId: profileLegacyById.get(item.family_profile_id) ?? '',
    personId: personLegacyById.get(item.person_id) ?? '',
    fileId: item.legacy_id,
    driveFileId: item.legacy_drive_file_id ?? undefined,
    storagePath: item.storage_path ?? undefined,
    type: 'photo',
    isPrimary: item.is_primary,
    caption: item.caption,
    takenDate: item.taken_date,
    sortOrder: item.sort_order ?? undefined,
    createdAt: item.created_at,
  }))

  return {
    schemaVersion: rows.workspace.schema_version,
    updatedAt: rows.workspace.updated_at,
    profiles,
    persons,
    relationships,
    media,
    settings: {
      timezone: rows.workspace.timezone,
      locale: rows.workspace.locale,
      duplicateSuppressions: stringArray(rows.workspace.duplicate_suppressions),
    },
  }
}

export interface SupabaseFamilyWriteRows {
  workspace: Pick<TablesInsert<'workspaces'>, 'schema_version' | 'timezone' | 'locale' | 'duplicate_suppressions'>
  profiles: TablesInsert<'family_profiles'>[]
  persons: TablesInsert<'persons'>[]
  relationships: TablesInsert<'relationships'>[]
  media: TablesInsert<'media'>[]
}

/** Pure domain-to-row mapper used by parity tests and later transactional writes. */
export function mapFamilyDataToSupabaseRows(
  data: FamilyData,
  workspaceId: string,
  idFactory: () => string = () => crypto.randomUUID(),
): SupabaseFamilyWriteRows {
  const profileIds = new Map(data.profiles.map((profile) => [profile.id, idFactory()]))
  const personIds = new Map(data.persons.map((person) => [person.id, idFactory()]))
  return {
    workspace: {
      schema_version: data.schemaVersion,
      timezone: data.settings.timezone,
      locale: data.settings.locale,
      duplicate_suppressions: data.settings.duplicateSuppressions ?? [],
    },
    profiles: data.profiles.map((profile) => ({
      id: profileIds.get(profile.id)!, workspace_id: workspaceId, legacy_id: profile.id,
      name: profile.name, lineage_surname: profile.lineageSurname ?? '', description: profile.description ?? '',
      legacy_photo_file_id: profile.photoFileId ?? null,
      subject_person_id: profile.subjectPersonId ? personIds.get(profile.subjectPersonId) ?? null : null,
      requires_secret: profile.requiresSecret, is_active: profile.isActive,
    })),
    persons: data.persons.map((person) => ({
      id: personIds.get(person.id)!, workspace_id: workspaceId, family_profile_id: profileIds.get(person.profileId ?? '')!, legacy_id: person.id,
      name: person.name, nickname: person.nickname ?? null, gender: person.gender ?? 'unknown', birth_date: person.birthDate ?? null,
      is_deceased: person.isDeceased ?? false, death_date: person.deathDate ?? null,
      death_lunar_day: person.deathLunar?.day ?? null, death_lunar_month: person.deathLunar?.month ?? null,
      death_lunar_leap_month: person.deathLunar?.leapMonth ?? null,
      phone1: person.phone1 ?? '', phone2: person.phone2 ?? '', address: person.address ?? '', note: person.note ?? '',
      ancestral_role: person.ancestralRole ?? 'none', sort_order: person.sortOrder,
      birth_date_confidence: person.confidence?.birthDate, death_date_confidence: person.confidence?.deathDate,
      created_at: person.createdAt, updated_at: person.updatedAt,
    })),
    relationships: data.relationships.map((relationship) => ({
      id: idFactory(), workspace_id: workspaceId, family_profile_id: profileIds.get(relationship.profileId ?? '')!, legacy_id: relationship.id,
      person1_id: personIds.get(relationship.person1Id)!, person2_id: personIds.get(relationship.person2Id)!, type: relationship.type,
      status: relationship.status, start_date: relationship.startDate ?? null, end_date: relationship.endDate ?? null,
      sort_order: relationship.sortOrder, confidence: relationship.confidence,
      created_at: relationship.createdAt, updated_at: relationship.updatedAt,
    })),
    media: data.media.map((item) => ({
      id: idFactory(), workspace_id: workspaceId, family_profile_id: profileIds.get(item.profileId)!, person_id: personIds.get(item.personId)!, legacy_id: item.id,
      legacy_drive_file_id: item.driveFileId ?? null,
      storage_bucket: item.storagePath ? 'family-media' : null, storage_path: item.storagePath ?? null,
      type: 'photo', is_primary: item.isPrimary, caption: item.caption ?? '', taken_date: item.takenDate ?? null,
      sort_order: item.sortOrder, created_at: item.createdAt,
    })),
  }
}
