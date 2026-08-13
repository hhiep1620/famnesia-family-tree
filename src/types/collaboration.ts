import type { FamilyRevision, FamilyOperation } from './familyOperations'

export type ReviewDraftStatus = 'pending' | 'partially_reviewed' | 'needs_changes' | 'approved' | 'rejected' | 'invalid'

export interface DraftAuthor {
  id: string
  email: string
  name: string
}

export interface DraftAssetIntegrity {
  fileId: string
  version?: string
  md5Checksum?: string
  size?: string
}

export interface SubmittedFamilyDraft {
  schemaVersion: 1
  id: string
  workspaceId: string
  author: DraftAuthor
  baseRevision?: FamilyRevision
  revision: number
  operations: FamilyOperation[]
  assets: DraftAssetIntegrity[]
  clientCreatedAt: string
  submittedAt: string
}

export interface DraftReviewEvent {
  id: string
  reviewerEmail: string
  reviewerName: string
  decision: 'approve' | 'reject'
  operationIds: string[]
  note?: string
  createdAt: string
}

export interface ReviewDraftSummary {
  id: string
  workspaceId: string
  author: DraftAuthor
  revision: number
  status: ReviewDraftStatus
  operationCount: number
  submittedAt: string
  updatedAt: string
  terminalAt?: string
  note?: string
  payloadHash: string
  fileId: string
  cleanupAssetIds?: string[]
  baseRevision?: FamilyRevision
  reviewHistory: DraftReviewEvent[]
}

export interface ReviewDraft extends ReviewDraftSummary {
  operations: FamilyOperation[]
}

export interface SubmitDraftResult {
  draft: ReviewDraft
  mirrorGeneration: number
}

export interface DraftReviewRequest {
  draftId: string
  draftRevision: number
  decision: 'approve' | 'reject'
  operationIds?: string[]
  note?: string
}

export interface DraftReviewResult {
  draft: ReviewDraft
  appliedOperationIds: string[]
  automaticallyIncludedOperationIds: string[]
  mirrorGeneration: number
  snapshot?: { data: import('./family').FamilyData; revision: FamilyRevision }
}

export interface CollaborationStatus {
  enabled: boolean
  workspaceRole: import('./family').WorkspaceRole
  pendingDraftCount: number
  ownDraft?: ReviewDraft
  mirrorGeneration: number
  migrationRequired?: boolean
  mirror?: {
    status: MirrorSyncStatus
    generation: number
    syncedGeneration: number
    lastSyncedAt?: string
    mirrorFolderUrl?: string
    error?: string
  }
}

export type MirrorSyncStatus = 'idle' | 'syncing' | 'synced' | 'pending' | 'failed'

export interface MirrorSyncResult {
  status: MirrorSyncStatus
  generation: number
  processed: number
  remaining: number
  cursor?: string
  mirrorFolderId?: string
  mirrorFolderUrl?: string
  lastSyncedAt?: string
}
