import type { ActivityEvent, FamilyBackup, FamilyData, WorkspaceInfo, WorkspaceMember, WorkspaceRole } from '../types/family'
import type { FamilyCommitRequest, FamilyCommitResult } from '../types/familyOperations'
import { apiRequest, jsonBody } from './apiClient'

export interface FamilyDataRevision { modifiedTime?: string; version?: string }
export interface FamilyDataSnapshot { data: FamilyData; revision: FamilyDataRevision }

export class FamilyDataConflictError extends Error {
  constructor() { super('Dữ liệu gia đình đã được thay đổi ở phiên khác. Hãy tải lại bản mới nhất trước khi tiếp tục.'); this.name = 'FamilyDataConflictError' }
}

const workspacePath = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}`

export class FamilyRepository {
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
  async addMember(email: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void> { await apiRequest(`${workspacePath(this.workspace.id)}/members`, { method: 'POST', ...jsonBody({ email, role }) }) }
  async updateMember(id: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void> { await apiRequest(`${workspacePath(this.workspace.id)}/members`, { method: 'PATCH', ...jsonBody({ permissionId: id, role }) }) }
  async removeMember(id: string): Promise<void> { await apiRequest(`${workspacePath(this.workspace.id)}/members`, { method: 'DELETE', ...jsonBody({ permissionId: id }) }) }
}
