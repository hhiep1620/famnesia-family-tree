import type { FamilyData } from './family'

export interface FamilyRevision {
  modifiedTime?: string
  version?: string
}

export type FamilyOperationType =
  | 'profile.create'
  | 'profile.update'
  | 'subject.set'
  | 'person.create'
  | 'person.update'
  | 'person.delete'
  | 'relationship.create'
  | 'relationship.update'
  | 'relationship.delete'
  | 'media.attach'
  | 'media.primary.set'
  | 'media.caption.update'
  | 'media.delete'
  | 'settings.duplicate_suppression.add'

export interface FamilyOperation {
  id: string
  type: FamilyOperationType
  entityId?: string
  profileId?: string
  value?: unknown
  changes?: Record<string, unknown>
  baseValues?: Record<string, unknown>
  createdAt: string
}

export interface FamilyCommitRequest {
  commitId: string
  baseRevision?: FamilyRevision
  operations: FamilyOperation[]
  clientCreatedAt: string
}

export interface FamilyCommitMeta {
  commitId: string
  operationCount: number
  idempotent?: boolean
  counts: Record<string, number>
}

export interface FamilyCommitResult {
  snapshot: { data: FamilyData; revision: FamilyRevision }
  commit: FamilyCommitMeta
}

export interface FamilyOperationConflict {
  operationId: string
  operationType: FamilyOperationType
  entityId?: string
  profileId?: string
  field: string
  label?: string
  baseValue?: unknown
  remoteValue?: unknown
  localValue?: unknown
  reason: 'field_changed' | 'entity_deleted' | 'delete_changed' | 'id_exists' | 'missing_reference'
}

export interface FamilyCommitConflictDetails {
  conflicts: FamilyOperationConflict[]
  latestSnapshot: { data: FamilyData; revision: FamilyRevision }
}

export interface StoredFamilyDraft {
  workspaceId: string
  userId: string
  baseRevision?: FamilyRevision
  operations: FamilyOperation[]
  updatedAt: string
  schemaVersion: number
}
