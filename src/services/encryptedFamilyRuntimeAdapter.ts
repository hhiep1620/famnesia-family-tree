import { replayFamilyOperations } from '../draft/familyOperations'
import { requireValidFamilyData } from '../schema/familyDataSchema'
import type { ActivityEvent, FamilyBackup, FamilyData, WorkspaceInfo, WorkspaceInvitationResult, WorkspaceMember } from '../types/family'
import type { FamilyCommitRequest, FamilyCommitResult, FamilyCommitStatusResult } from '../types/familyOperations'
import { apiRequest, jsonBody } from './apiClient'
import type { EncryptedFamilyRepository, EncryptedFamilySnapshot } from './encryptedFamilyRepository'
import type { AssignableWorkspaceRole, FamilyDataRevision, FamilyRepositoryContract } from './familyRepository'

export class EncryptedFamilyRuntimeAdapter implements FamilyRepositoryContract {
  readonly workspace: WorkspaceInfo
  readonly workspaces: WorkspaceInfo[]
  private snapshot?: EncryptedFamilySnapshot
  private readonly outcomes = new Map<string, FamilyCommitResult>()

  constructor(workspace: WorkspaceInfo, repository: EncryptedFamilyRepository) {
    this.workspace = { ...workspace, rootFolderUrl: undefined, webViewLink: undefined, canUpload: false, canCreateBackups: false }
    this.workspaces = [this.workspace]
    this.repository = repository
  }

  private readonly repository: EncryptedFamilyRepository

  async load() {
    this.snapshot = await this.repository.load()
    return this.snapshot
  }

  async save(data: FamilyData, expectedRevision?: FamilyDataRevision) {
    const expected = Number(expectedRevision?.version ?? this.snapshot?.revision.version)
    if (!Number.isSafeInteger(expected)) throw new Error('ENCRYPTED_REVISION_REQUIRED')
    this.snapshot = await this.repository.save(requireValidFamilyData(data), expected)
    return this.snapshot
  }

  async commit(request: FamilyCommitRequest): Promise<FamilyCommitResult> {
    const prior = this.snapshot ?? await this.repository.load()
    if (request.baseRevision?.version !== prior.revision.version) throw new Error('ENCRYPTED_REVISION_CONFLICT')
    const next = requireValidFamilyData({ ...replayFamilyOperations(prior.data, request.operations), updatedAt: new Date().toISOString() })
    this.snapshot = await this.repository.save(next, Number(prior.revision.version), request.commitId)
    const result: FamilyCommitResult = {
      snapshot: this.snapshot,
      commit: { commitId: request.commitId, operationCount: request.operations.length, resultVersion: Number(this.snapshot.revision.version), counts: {} },
    }
    this.outcomes.set(request.commitId, result)
    return result
  }

  async commitStatus(commitId: string): Promise<FamilyCommitStatusResult> {
    const result = this.outcomes.get(commitId)
    return result ? { status: 'applied', result } : { status: 'missing' }
  }

  async listActivity(): Promise<ActivityEvent[]> { return [] }
  async backup(): Promise<FamilyBackup> { throw new Error('Backup mã hóa sẽ được bật sau khi workspace hoàn tất recovery vault.') }
  async listBackups(): Promise<FamilyBackup[]> { return [] }
  async loadBackup(): Promise<FamilyData> { throw new Error('Chưa có backup mã hóa để khôi phục.') }
  async uploadPhoto(): Promise<string> { throw new Error('Ảnh mã hóa chưa được bật trong Preview này.') }
  async deletePhoto(): Promise<void> { throw new Error('Ảnh mã hóa chưa được bật trong Preview này.') }
  photoUrl(): string { return '' }

  private path(suffix: string) { return `/api/workspaces/${encodeURIComponent(this.workspace.id)}${suffix}` }
  async listMembers(): Promise<WorkspaceMember[]> { return (await apiRequest<{ members: WorkspaceMember[] }>(this.path('/members'))).members }
  async addMember(email: string, role: AssignableWorkspaceRole): Promise<WorkspaceInvitationResult | void> {
    return (await apiRequest<{ invitation?: WorkspaceInvitationResult }>(this.path('/members'), { method: 'POST', ...jsonBody({ email, role }) })).invitation
  }
  async updateMember(id: string, role: AssignableWorkspaceRole): Promise<void> { await apiRequest(this.path('/members'), { method: 'PATCH', ...jsonBody({ permissionId: id, role }) }) }
  async removeMember(id: string): Promise<void> { await apiRequest(this.path('/members'), { method: 'DELETE', ...jsonBody({ permissionId: id }) }) }
}
