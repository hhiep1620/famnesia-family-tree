export interface Person {
  id: string
  profileId?: string
  name: string
  nickname?: string | null
  gender?: Gender
  birthDate?: string | null
  isDeceased?: boolean
  deathDate?: string | null
  deathLunar?: LunarDate | null
  phone1?: string
  phone2?: string
  address?: string
  note?: string
  ancestralRole?: AncestralRole
  sortOrder?: number
  createdAt?: string
  updatedAt?: string
  confidence?: {
    birthDate?: FactConfidence
    deathDate?: FactConfidence
  }
}

export type FactConfidence = 'confirmed' | 'likely' | 'estimated' | 'unknown'

export type Gender = 'male' | 'female' | 'other' | 'unknown'
export type AncestralRole = 'none' | 'founding_ancestor'

export interface LunarDate {
  day: number
  month: number
  leapMonth: boolean
}

export type RelationshipType = 'spouse' | 'parent'
export type SpouseStatus = 'married' | 'partner' | 'separated' | 'divorced' | 'widowed' | 'unknown'

export interface Relationship {
  id: string
  profileId?: string
  person1Id: string
  person2Id: string
  type: RelationshipType
  status?: SpouseStatus
  startDate?: string | null
  endDate?: string | null
  sortOrder?: number
  createdAt?: string
  updatedAt?: string
  confidence?: FactConfidence
}

export interface FamilyProfile {
  id: string
  name: string
  lineageSurname?: string
  description?: string
  photoFileId?: string | null
  subjectPersonId?: string | null
  requiresSecret: boolean
  isActive: boolean
}

export interface FamilySettings {
  timezone: string
  locale: string
  duplicateSuppressions?: string[]
}

export interface PersonMedia {
  id: string
  profileId: string
  personId: string
  /** Legacy Google Drive object key. Present only while media comes from Drive. */
  driveFileId?: string
  /** Opaque key consumed by the selected media repository. */
  fileId?: string
  /** Private Supabase Storage path; never treated as a public URL. */
  storagePath?: string
  type: 'photo'
  isPrimary: boolean
  caption?: string
  takenDate?: string | null
  sortOrder?: number
  createdAt?: string
}

export interface FamilyData {
  schemaVersion: number
  updatedAt?: string
  profiles: FamilyProfile[]
  persons: Person[]
  relationships: Relationship[]
  media: PersonMedia[]
  settings: FamilySettings
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed' | 'conflict' | 'offline'

export interface FamilyUnit {
  id: string
  parentIds: string[]
  childIds: string[]
}

export interface FamilyGraph {
  personsById: Map<string, Person>
  relationships: Relationship[]
  parentsByChild: Map<string, string[]>
  childrenByParent: Map<string, string[]>
  spousesByPerson: Map<string, string[]>
}

export interface DataIssue {
  id?: string
  severity?: 'error' | 'warning' | 'info'
  code?: string
  personId?: string
  relationshipId?: string
  message: string
}

export interface DataAudit {
  validRelationships: Relationship[]
  issues: DataIssue[]
}

export interface GoogleUser {
  id: string
  email: string
  name: string
  picture?: string
  avatarUrl?: string
}

export interface PersonDraft {
  name: string
  nickname?: string
  gender: Gender
  birthDate?: string
  birthDateConfidence?: FactConfidence
  isDeceased: boolean
  deathDate?: string
  deathDateConfidence?: FactConfidence
  deathLunarDay?: number
  deathLunarMonth?: number
  deathLunarLeapMonth?: boolean
  ancestralRole: AncestralRole
  sortOrder?: number
  phone1?: string
  phone2?: string
  address?: string
  note?: string
  photos?: File[]
}

export type WorkspaceRole = 'owner' | 'editor' | 'contributor' | 'viewer'

export interface WorkspaceInfo {
  id: string
  name: string
  role: WorkspaceRole
  canRead: boolean
  canEdit: boolean
  canUpload: boolean
  canManageMembers: boolean
  canCommitDirectly: boolean
  canSubmitDraft: boolean
  canReviewDrafts: boolean
  migrationRequired?: boolean
  ownedByMe: boolean
  webViewLink?: string
  rootFolderUrl?: string
}

export interface WorkspaceMember {
  id: string
  email?: string
  name?: string
  photoUrl?: string
  role: WorkspaceRole
  inherited: boolean
  migrationRequired?: boolean
}

export interface FamilyBackup {
  id: string
  name: string
  createdTime?: string
  modifiedTime?: string
  reason?: string
}

export interface ActivityEvent {
  id: string
  workspaceId: string
  actorEmail: string
  actorName?: string
  action: string
  entityType?: string
  entityId?: string
  timestamp: string
  summary: string
  metadata?: Record<string, unknown>
}

export type FamilyEventType = 'birthday' | 'death_anniversary'

export interface FamilyEvent {
  id: string
  type: FamilyEventType
  personId: string
  profileId: string
  date: string
  ageTurning?: number
  lunarDate?: {
    day: number
    month: number
    leapMonth?: boolean
  }
}

export interface ReminderRule {
  type: FamilyEventType | 'all'
  daysBefore: number
}

export type KinshipBranch = 'direct' | 'paternal' | 'maternal' | 'spouse'
export type FamilyScope = 'self' | 'paternal' | 'maternal' | 'descendant' | 'spouse' | 'affinal' | 'unclassified'

export interface KinshipResult {
  subjectId: string
  targetId: string
  generationDelta: number
  ancestorGeneration?: number
  relationCode: string
  label: string
  shortLabel: string
  branch: KinshipBranch
  path: string[]
  explanation: string[]
  isBloodRelation: boolean
  isMarriageRelation: boolean
  confidence: 'exact' | 'generic'
  distance: number
}

export type FriendlyRelationship = 'child' | 'parent' | 'spouse'

export interface RelativeConnection {
  person1Id: string
  person2Id: string
  type: RelationshipType
  sortOrder?: number
}
