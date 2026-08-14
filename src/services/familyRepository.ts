import type { ActivityEvent, FamilyBackup, FamilyData, WorkspaceInfo, WorkspaceMember, WorkspaceRole } from '../types/family'
import type { FamilyCommitRequest, FamilyCommitResult } from '../types/familyOperations'
import type { CollaborationStatus, DraftReviewRequest, DraftReviewResult, MirrorSyncResult, ReviewDraft, SubmitDraftResult } from '../types/collaboration'
import { apiRequest, jsonBody } from './apiClient'

export interface FamilyDataRevision { modifiedTime?: string; version?: string }
export interface FamilyDataSnapshot { data: FamilyData; revision: FamilyDataRevision }
export type AssignableWorkspaceRole = Extract<WorkspaceRole, 'contributor' | 'viewer'>

export interface FamilyRepositoryContract {
  readonly workspace: WorkspaceInfo
  readonly workspaces: WorkspaceInfo[]
  load(): Promise<FamilyDataSnapshot>
  save(data: FamilyData, expectedRevision?: FamilyDataRevision, mode?: 'save' | 'replace' | 'restore' | 'merge'): Promise<FamilyDataSnapshot>
  commit(request: FamilyCommitRequest): Promise<FamilyCommitResult>
  submitDraft(request: FamilyCommitRequest): Promise<SubmitDraftResult>
  listDrafts(): Promise<ReviewDraft[]>
  collaborationStatus(): Promise<CollaborationStatus>
  reviewDraft(request: DraftReviewRequest): Promise<DraftReviewResult>
  syncMirror(): Promise<MirrorSyncResult>
  listActivity(): Promise<ActivityEvent[]>
  backup(data: FamilyData, reason?: string): Promise<FamilyBackup>
  listBackups(): Promise<FamilyBackup[]>
  loadBackup(id: string): Promise<FamilyData>
  uploadPhoto(file: File, profileId?: string, personId?: string): Promise<string>
  deletePhoto(id: string): Promise<void>
  photoUrl(id: string): string
  listMembers(): Promise<WorkspaceMember[]>
  addMember(email: string, role: AssignableWorkspaceRole): Promise<void>
  updateMember(id: string, role: AssignableWorkspaceRole): Promise<void>
  removeMember(id: string): Promise<void>
}

export class FamilyDataConflictError extends Error {
  constructor() { super('Dữ liệu gia đình đã được thay đổi ở phiên khác. Hãy tải lại bản mới nhất trước khi tiếp tục.'); this.name = 'FamilyDataConflictError' }
}

const workspacePath = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}`

export class FamilyRepository implements FamilyRepositoryContract {
  readonly workspace: WorkspaceInfo
  readonly workspaces: WorkspaceInfo[]

  private constructor(workspace: WorkspaceInfo, workspaces: WorkspaceInfo[]) { this.workspace = workspace; this.workspaces = workspaces }

  static async listWorkspaces(): Promise<WorkspaceInfo[]> {
    return (await apiRequest<{ workspaces: WorkspaceInfo[] }>('/api/workspaces')).workspaces
  }

  static async connect(preferredId?: string): Promise<FamilyRepository> {
    const workspaces = await this.listWorkspaces()
    const remembered = localStorage.getItem('family-tree-workspace') ?? undefined
    const workspace = workspaces.find((item) => item.id === preferredId) ?? workspaces.find((item) => item.id === remembered) ?? workspaces[0]
    if (!workspace) throw new Error('Không tìm thấy workspace Famnesia.')
    localStorage.setItem('family-tree-workspace', workspace.id)
    return new FamilyRepository(workspace, workspaces)
  }

  static async connectShared(workspaceId: string): Promise<FamilyRepository> {
    const result = await apiRequest<{ workspace: WorkspaceInfo }>('/api/workspaces', {
      method: 'POST', ...jsonBody({ workspaceId }),
    })
    const known = await this.listWorkspaces().catch(() => [])
    const workspaces = [result.workspace, ...known.filter((item) => item.id !== result.workspace.id)]
    localStorage.setItem('family-tree-workspace', result.workspace.id)
    return new FamilyRepository(result.workspace, workspaces)
  }

  async load(): Promise<FamilyDataSnapshot> {
    const result = await apiRequest<{ snapshot: FamilyDataSnapshot; workspace: WorkspaceInfo }>(`${workspacePath(this.workspace.id)}/family`)
    Object.assign(this.workspace, result.workspace)
    return result.snapshot
  }

  async save(data: FamilyData, expectedRevision?: FamilyDataRevision, mode: 'save' | 'replace' | 'restore' | 'merge' = 'save'): Promise<FamilyDataSnapshot> {
    const result = await apiRequest<{ snapshot: FamilyDataSnapshot }>(`${workspacePath(this.workspace.id)}/family`, { method: 'PUT', ...jsonBody({ data, expectedRevision, mode }) })
    return result.snapshot
  }

  async commit(request: FamilyCommitRequest): Promise<FamilyCommitResult> {
    return apiRequest<FamilyCommitResult>(`${workspacePath(this.workspace.id)}/family/commit`, { method: 'POST', ...jsonBody(request) })
  }

  async submitDraft(request: FamilyCommitRequest): Promise<SubmitDraftResult> {
    return apiRequest<SubmitDraftResult>(`${workspacePath(this.workspace.id)}/family?operation=draft-submit`, { method: 'POST', ...jsonBody(request) })
  }

  async listDrafts(): Promise<ReviewDraft[]> {
    return (await apiRequest<{ drafts: ReviewDraft[] }>(`${workspacePath(this.workspace.id)}/family?resource=drafts`)).drafts
  }

  async collaborationStatus(): Promise<CollaborationStatus> {
    return (await apiRequest<{ status: CollaborationStatus }>(`${workspacePath(this.workspace.id)}/family?resource=collaboration-status`)).status
  }

  async reviewDraft(request: DraftReviewRequest): Promise<DraftReviewResult> {
    return apiRequest<DraftReviewResult>(`${workspacePath(this.workspace.id)}/family?operation=draft-review`, { method: 'POST', ...jsonBody(request) })
  }

  async syncMirror(): Promise<MirrorSyncResult> {
    return apiRequest<MirrorSyncResult>(`${workspacePath(this.workspace.id)}/family?operation=mirror-sync`, { method: 'POST', ...jsonBody({}) })
  }

  async listActivity(): Promise<ActivityEvent[]> { return (await apiRequest<{ activity: ActivityEvent[] }>(`${workspacePath(this.workspace.id)}/family?resource=activity`)).activity }

  async backup(data: FamilyData, reason = 'manual'): Promise<FamilyBackup> {
    return (await apiRequest<{ backup: FamilyBackup }>(`${workspacePath(this.workspace.id)}/backups`, { method: 'POST', ...jsonBody({ data, reason }) })).backup
  }

  async listBackups(): Promise<FamilyBackup[]> {
    return (await apiRequest<{ backups: FamilyBackup[] }>(`${workspacePath(this.workspace.id)}/backups`)).backups
  }

  async loadBackup(id: string): Promise<FamilyData> {
    return (await apiRequest<{ data: FamilyData }>(`${workspacePath(this.workspace.id)}/backups?backupId=${encodeURIComponent(id)}`)).data
  }

  async uploadPhoto(file: File, profileId?: string, personId?: string): Promise<string> {
    const form = new FormData(); form.append('photo', file)
    if (profileId) form.append('profileId', profileId)
    if (personId) form.append('personId', personId)
    return (await apiRequest<{ id: string }>(`${workspacePath(this.workspace.id)}/photos`, { method: 'POST', body: form })).id
  }

  async deletePhoto(id: string): Promise<void> { await apiRequest(`${workspacePath(this.workspace.id)}/photos/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
  photoUrl(id: string): string { return `${workspacePath(this.workspace.id)}/photos/${encodeURIComponent(id)}` }

  async listMembers(): Promise<WorkspaceMember[]> { return (await apiRequest<{ members: WorkspaceMember[] }>(`${workspacePath(this.workspace.id)}/members`)).members }
  async addMember(email: string, role: AssignableWorkspaceRole): Promise<void> { await apiRequest(`${workspacePath(this.workspace.id)}/members`, { method: 'POST', ...jsonBody({ email, role }) }) }
  async updateMember(id: string, role: AssignableWorkspaceRole): Promise<void> { await apiRequest(`${workspacePath(this.workspace.id)}/members`, { method: 'PATCH', ...jsonBody({ permissionId: id, role }) }) }
  async removeMember(id: string): Promise<void> { await apiRequest(`${workspacePath(this.workspace.id)}/members`, { method: 'DELETE', ...jsonBody({ permissionId: id }) }) }
}
