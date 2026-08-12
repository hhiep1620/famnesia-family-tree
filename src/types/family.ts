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
  ancestralRole?: AncestralRole
  photoFileId?: string | null
  sortOrder?: number
  createdAt?: string
  updatedAt?: string
}

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
}

export interface FamilyProfile {
  id: string
  name: string
  description?: string
  photoFileId?: string | null
  subjectPersonId?: string | null
  requiresSecret: boolean
  isActive: boolean
}

export interface FamilySettings {
  timezone: string
  locale: string
}

export interface FamilyData {
  schemaVersion: number
  updatedAt?: string
  profiles: FamilyProfile[]
  persons: Person[]
  relationships: Relationship[]
  settings: FamilySettings
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed'

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
  relationshipId?: string
  message: string
}

export interface DataAudit {
  validRelationships: Relationship[]
  issues: DataIssue[]
}

export interface GoogleUser {
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
  isDeceased: boolean
  deathDate?: string
  deathLunarDay?: number
  deathLunarMonth?: number
  deathLunarLeapMonth?: boolean
  ancestralRole: AncestralRole
  sortOrder?: number
  photo?: File
}

export type WorkspaceRole = 'owner' | 'editor' | 'viewer'

export interface WorkspaceInfo {
  id: string
  name: string
  role: WorkspaceRole
  canRead: boolean
  canEdit: boolean
  canUpload: boolean
  canManageMembers: boolean
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
}

export interface FamilyBackup {
  id: string
  name: string
  createdTime?: string
  modifiedTime?: string
  reason?: string
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
}

export type FriendlyRelationship = 'child' | 'parent' | 'spouse'

export interface RelativeConnection {
  person1Id: string
  person2Id: string
  type: RelationshipType
  sortOrder?: number
}
