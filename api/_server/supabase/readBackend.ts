import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, Tables } from '../../../src/types/database.generated.js'
import type { ActivityEvent, FamilyBackup, WorkspaceInfo, WorkspaceMember, WorkspaceRole } from '../../../src/types/family.js'
import { requireValidFamilyData } from '../../../src/schema/familyDataSchema.js'
import type { AuthContext } from '../auth.js'
import type { RequestBackend } from '../backendContracts.js'
import type { BackendSelection } from '../backendSelectors.js'
import { AppError } from '../http.js'
import { createSupabaseUserClient } from './serverClient.js'
import { mapSupabaseRowsToFamilyData } from './familyMapper.js'

type WorkspaceRow = Tables<'workspaces'>

function repositoryError(resource: string, error: { message: string; code?: string } | null): never {
  console.error({ name: 'SupabaseReadError', resource, code: error?.code, message: error?.message })
  throw new AppError(502, 'SUPABASE_READ_FAILED', `${resource} could not be read from Supabase.`)
}

function unsupported(operation: string): never {
  throw new AppError(501, 'SUPABASE_WRITE_NOT_ENABLED', `${operation} is read-only until the Supabase transactional write phase is enabled.`)
}

export function readOnlyWorkspaceInfo(row: WorkspaceRow, role: WorkspaceRole): WorkspaceInfo {
  return {
    id: row.id,
    name: row.name,
    role,
    canRead: true,
    canEdit: false,
    canUpload: false,
    canManageMembers: false,
    canCommitDirectly: false,
    canSubmitDraft: false,
    canReviewDrafts: false,
    ownedByMe: role === 'owner',
  }
}

function activityMetadata(value: Json): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export class SupabaseReadRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async listWorkspaces(): Promise<WorkspaceInfo[]> {
    const [workspaceResult, membershipResult] = await Promise.all([
      this.client.from('workspaces').select('*').order('name').order('id'),
      this.client.from('workspace_members').select('workspace_id, role').eq('user_id', this.userId),
    ])
    if (workspaceResult.error) repositoryError('Workspaces', workspaceResult.error)
    if (membershipResult.error) repositoryError('Workspace memberships', membershipResult.error)
    const roles = new Map(membershipResult.data.map((membership) => [membership.workspace_id, membership.role as WorkspaceRole]))
    return workspaceResult.data
      .flatMap((workspace) => roles.has(workspace.id) ? [readOnlyWorkspaceInfo(workspace, roles.get(workspace.id)!)] : [])
      .sort((left, right) => Number(right.ownedByMe) - Number(left.ownedByMe) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
  }

  private async workspaceRow(workspaceId: string): Promise<{ row: WorkspaceRow; role: WorkspaceRole }> {
    const [workspaceResult, membershipResult] = await Promise.all([
      this.client.from('workspaces').select('*').eq('id', workspaceId).maybeSingle(),
      this.client.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', this.userId).maybeSingle(),
    ])
    if (workspaceResult.error) repositoryError('Workspace', workspaceResult.error)
    if (membershipResult.error) repositoryError('Workspace membership', membershipResult.error)
    if (!workspaceResult.data || !membershipResult.data) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Famnesia workspace was not found or is not shared with this user.')
    return { row: workspaceResult.data, role: membershipResult.data.role as WorkspaceRole }
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceInfo> {
    const { row, role } = await this.workspaceRow(workspaceId)
    return readOnlyWorkspaceInfo(row, role)
  }

  async loadFamily(workspaceId: string) {
    const { row, role } = await this.workspaceRow(workspaceId)
    const [profiles, persons, relationships, media] = await Promise.all([
      this.client.from('family_profiles').select('*').eq('workspace_id', workspaceId),
      this.client.from('persons').select('*').eq('workspace_id', workspaceId),
      this.client.from('relationships').select('*').eq('workspace_id', workspaceId),
      this.client.from('media').select('*').eq('workspace_id', workspaceId),
    ])
    if (profiles.error) repositoryError('Family profiles', profiles.error)
    if (persons.error) repositoryError('Persons', persons.error)
    if (relationships.error) repositoryError('Relationships', relationships.error)
    if (media.error) repositoryError('Media', media.error)
    const data = mapSupabaseRowsToFamilyData({ workspace: row, profiles: profiles.data, persons: persons.data, relationships: relationships.data, media: media.data })
    return {
      snapshot: { data, revision: { version: String(row.data_version), modifiedTime: row.updated_at } },
      workspace: readOnlyWorkspaceInfo(row, role),
    }
  }

  async listActivity(workspaceId: string): Promise<ActivityEvent[]> {
    await this.workspaceRow(workspaceId)
    const result = await this.client.from('activity_events').select('*').eq('workspace_id', workspaceId).order('occurred_at', { ascending: false }).limit(20)
    if (result.error) repositoryError('Activity', result.error)
    return result.data.map((item) => ({
      id: item.legacy_id ?? item.id,
      workspaceId: item.workspace_id,
      actorEmail: item.actor_email,
      actorName: item.actor_name ?? undefined,
      action: item.action,
      entityType: item.entity_type ?? undefined,
      entityId: item.entity_id ?? undefined,
      timestamp: item.occurred_at,
      summary: item.summary,
      metadata: activityMetadata(item.metadata),
    }))
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    await this.workspaceRow(workspaceId)
    const result = await this.client.from('workspace_members').select('id, user_id, role').eq('workspace_id', workspaceId).order('created_at')
    if (result.error) repositoryError('Workspace members', result.error)
    return result.data.map((member) => ({ id: member.user_id, role: member.role as WorkspaceRole, inherited: false }))
  }

  async listBackups(workspaceId: string): Promise<FamilyBackup[]> {
    await this.workspaceRow(workspaceId)
    const result = await this.client.from('workspace_snapshots').select('id, reason, created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(20)
    if (result.error) repositoryError('Workspace snapshots', result.error)
    return result.data.map((snapshot) => ({ id: snapshot.id, name: snapshot.reason, reason: snapshot.reason, createdTime: snapshot.created_at, modifiedTime: snapshot.created_at }))
  }

  async loadBackup(workspaceId: string, backupId: string) {
    await this.workspaceRow(workspaceId)
    const result = await this.client.from('workspace_snapshots').select('family_data').eq('workspace_id', workspaceId).eq('id', backupId).maybeSingle()
    if (result.error) repositoryError('Workspace snapshot', result.error)
    if (!result.data) throw new AppError(404, 'BACKUP_NOT_FOUND', 'Family backup was not found.')
    return requireValidFamilyData(result.data.family_data)
  }

  async mediaPlaceholder(workspaceId: string, mediaId: string): Promise<Response> {
    await this.workspaceRow(workspaceId)
    const result = await this.client.from('media').select('id').eq('workspace_id', workspaceId).eq('legacy_id', mediaId).maybeSingle()
    if (result.error) repositoryError('Media', result.error)
    if (!result.data) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Photo was not found.')
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#e4ece7"/><path d="M64 178l42-49 28 31 22-24 36 42H64z" fill="#6d8e82"/><circle cx="91" cy="89" r="18" fill="#6d8e82"/></svg>'
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
  }
}

export function createSupabaseReadRequestBackend(auth: AuthContext, selection: BackendSelection): RequestBackend {
  const repository = new SupabaseReadRepository(createSupabaseUserClient(auth.accessToken), auth.user.id)
  const workspace = (workspaceId: string) => repository.getWorkspace(workspaceId)
  return {
    selection,
    user: auth.user,
    workspaces: {
      list: () => repository.listWorkspaces(),
      connect: workspace,
      get: workspace,
    },
    family: {
      load: (workspaceId) => repository.loadFamily(workspaceId),
      save: async () => unsupported('Family save'),
      commit: async () => unsupported('Family commit'),
      listActivity: (workspaceId) => repository.listActivity(workspaceId),
      recordActivity: async () => unsupported('Activity write'),
    },
    media: {
      upload: async () => unsupported('Media upload'),
      read: (workspaceId, mediaId) => repository.mediaPlaceholder(workspaceId, mediaId),
      delete: async () => unsupported('Media delete'),
    },
    members: {
      list: (workspaceId) => repository.listMembers(workspaceId),
      add: async () => unsupported('Member invitation'),
      update: async () => unsupported('Member role update'),
      remove: async () => unsupported('Member removal'),
    },
    drafts: {
      submit: async () => unsupported('Draft submission'),
      list: async (workspaceId) => { await workspace(workspaceId); return [] },
      status: async (workspaceId) => ({ enabled: false, workspaceRole: (await workspace(workspaceId)).role, pendingDraftCount: 0, mirrorGeneration: 0 }),
      review: async () => unsupported('Draft review'),
      syncMirror: async () => unsupported('Drive mirror sync'),
      workspaceInfo: workspace,
      markCanonicalChanged: async () => unsupported('Canonical generation update'),
    },
    backups: {
      create: async () => unsupported('Backup creation'),
      list: (workspaceId) => repository.listBackups(workspaceId),
      load: (workspaceId, backupId) => repository.loadBackup(workspaceId, backupId),
    },
  }
}
