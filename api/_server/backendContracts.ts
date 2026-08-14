import type { ActivityEvent, FamilyBackup, FamilyData, WorkspaceInfo, WorkspaceMember, WorkspaceRole } from '../../src/types/family.js'
import type { CollaborationStatus, DraftReviewRequest, DraftReviewResult, MirrorSyncResult, ReviewDraft, SubmitDraftResult } from '../../src/types/collaboration.js'
import type { FamilyCommitMeta, FamilyCommitRequest, FamilyRevision } from '../../src/types/familyOperations.js'
import type { BackendSelection } from './backendSelectors.js'
import type { SafeUser } from './types.js'

export interface FamilySnapshot {
  data: FamilyData
  revision: FamilyRevision
}

export type FamilySaveMode = 'save' | 'replace' | 'restore' | 'merge'
export type ActivityInput = Pick<ActivityEvent, 'actorEmail' | 'actorName' | 'action' | 'entityType' | 'entityId' | 'summary' | 'metadata'>

export interface WorkspaceRepositoryContract {
  list(): Promise<WorkspaceInfo[]>
  connect(workspaceId: string): Promise<WorkspaceInfo>
  get(workspaceId: string): Promise<WorkspaceInfo>
}

export interface FamilyRepositoryContract {
  load(workspaceId: string): Promise<{ snapshot: FamilySnapshot; workspace: WorkspaceInfo }>
  save(workspaceId: string, data: FamilyData, expected: FamilyRevision | undefined, mode?: FamilySaveMode): Promise<FamilySnapshot>
  commit(workspaceId: string, request: FamilyCommitRequest): Promise<{ snapshot: FamilySnapshot; commit: FamilyCommitMeta }>
  listActivity(workspaceId: string): Promise<ActivityEvent[]>
  recordActivity(workspaceId: string, input: ActivityInput): Promise<void>
}

export interface MediaRepositoryContract {
  upload(workspaceId: string, file: Blob, filename: string, profileId?: string, personId?: string): Promise<string>
  read(workspaceId: string, mediaId: string): Promise<Response>
  delete(workspaceId: string, mediaId: string): Promise<void>
}

export interface MemberRepositoryContract {
  list(workspaceId: string): Promise<WorkspaceMember[]>
  add(workspaceId: string, email: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void>
  update(workspaceId: string, memberId: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void>
  remove(workspaceId: string, memberId: string): Promise<void>
}

export interface DraftRepositoryContract {
  submit(workspaceId: string, request: FamilyCommitRequest): Promise<SubmitDraftResult>
  list(workspaceId: string): Promise<ReviewDraft[]>
  status(workspaceId: string): Promise<CollaborationStatus>
  review(workspaceId: string, request: DraftReviewRequest): Promise<DraftReviewResult>
  syncMirror(workspaceId: string): Promise<MirrorSyncResult>
  workspaceInfo(workspaceId: string): Promise<WorkspaceInfo>
  markCanonicalChanged(workspaceId: string): Promise<number>
}

export interface BackupRepositoryContract {
  create(workspaceId: string, data: FamilyData, reason?: string): Promise<FamilyBackup>
  list(workspaceId: string): Promise<FamilyBackup[]>
  load(workspaceId: string, backupId: string): Promise<FamilyData>
}

export interface RequestBackend {
  readonly selection: BackendSelection
  readonly user: SafeUser
  readonly workspaces: WorkspaceRepositoryContract
  readonly family: FamilyRepositoryContract
  readonly media: MediaRepositoryContract
  readonly members: MemberRepositoryContract
  readonly drafts: DraftRepositoryContract
  readonly backups: BackupRepositoryContract
}
