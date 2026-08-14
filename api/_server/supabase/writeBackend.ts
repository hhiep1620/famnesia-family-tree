import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { compactFamilyOperations } from '../../../src/draft/familyOperations.js'
import { requireValidFamilyData } from '../../../src/schema/familyDataSchema.js'
import type { Database, Json } from '../../../src/types/database.generated.js'
import type { FamilyCommitMeta, FamilyCommitRequest, FamilyCommitStatusResult, FamilyOperationConflict } from '../../../src/types/familyOperations.js'
import type { AuthContext } from '../auth.js'
import type { RequestBackend } from '../backendContracts.js'
import type { BackendSelection } from '../backendSelectors.js'
import { AppError } from '../http.js'
import { createSupabaseUserClient } from './serverClient.js'
import { SupabaseMediaRepository } from './mediaBackend.js'
import { SupabaseReadRepository } from './readBackend.js'
import { SupabaseCollaborationRepository } from './collaborationBackend.js'
import type { FamilyData } from '../../../src/types/family.js'
import type { FamilySaveMode, FamilySnapshot } from '../backendContracts.js'

interface RpcCommitPayload {
  status: 'applied' | 'conflict' | 'missing'
  idempotent?: boolean
  autoMerged?: boolean
  dataVersion?: number
  resultDataVersion?: number
  appliedCount?: number
  counts?: Record<string, number>
  snapshot?: unknown
  conflicts?: FamilyOperationConflict[]
}

interface RpcReplacePayload {
  status: 'applied' | 'conflict'
  dataVersion: number
  snapshot: unknown
}

const COMMIT_COUNT_LABELS: Record<string, string> = {
  'profile.create': 'profileCreated', 'profile.update': 'profileUpdated', 'subject.set': 'subjectSet',
  'person.create': 'personCreated', 'person.update': 'personUpdated', 'person.delete': 'personDeleted',
  'relationship.create': 'relationshipCreated', 'relationship.update': 'relationshipUpdated', 'relationship.delete': 'relationshipDeleted',
  'media.attach': 'mediaAttached', 'media.primary.set': 'mediaPrimarySet', 'media.caption.update': 'mediaCaptionUpdated', 'media.delete': 'mediaDeleted',
  'settings.duplicate_suppression.add': 'duplicateSuppressionAdded',
}

function payloadRecord(value: Json | null): RpcCommitPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(502, 'SUPABASE_COMMIT_RESPONSE_INVALID', 'Supabase returned an invalid family commit response.')
  return value as unknown as RpcCommitPayload
}

function commitError(error: PostgrestError): never {
  const message = error.message || 'Supabase family commit failed.'
  if (error.code === '22023' && message.includes('FAMILY_COMMIT_ID_REUSED')) {
    throw new AppError(409, 'FAMILY_COMMIT_ID_REUSED', 'This commit ID was already used for a different operation batch.')
  }
  if (error.code === '42501') {
    if (message.includes('FAMILY_COMMIT_FORBIDDEN')) throw new AppError(403, 'FAMILY_COMMIT_FORBIDDEN', 'Only workspace owners and editors may commit canonical family data.')
    throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Famnesia workspace was not found or is not shared with this user.')
  }
  if (['22023', '23503', '23505', '23514'].includes(error.code)) {
    throw new AppError(422, 'FAMILY_COMMIT_INVALID', 'The combined changes failed family validation.', { databaseCode: error.code, reason: message })
  }
  console.error({ name: 'SupabaseCommitError', code: error.code, message })
  throw new AppError(502, 'SUPABASE_COMMIT_FAILED', 'Family changes could not be committed to Supabase.')
}

function normalizedCounts(counts: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(Object.entries(counts ?? {}).map(([key, count]) => [COMMIT_COUNT_LABELS[key] ?? key, count]))
}

function commitMeta(commitId: string, payload: RpcCommitPayload): FamilyCommitMeta {
  return {
    commitId,
    operationCount: payload.appliedCount ?? 0,
    counts: normalizedCounts(payload.counts),
    idempotent: payload.idempotent,
    autoMerged: payload.autoMerged,
    resultVersion: payload.resultDataVersion ?? payload.dataVersion,
  }
}

function requiredBaseVersion(request: FamilyCommitRequest): number {
  const raw = request.baseRevision?.version
  if (!raw || !/^\d+$/.test(raw)) throw new AppError(422, 'FAMILY_BASE_VERSION_REQUIRED', 'Supabase commits require a numeric base data version.')
  const version = Number(raw)
  if (!Number.isSafeInteger(version) || version < 0) throw new AppError(422, 'FAMILY_BASE_VERSION_REQUIRED', 'Supabase commits require a valid base data version.')
  return version
}

export class SupabaseWriteRepository extends SupabaseReadRepository {
  constructor(client: SupabaseClient<Database>, userId: string) { super(client, userId) }

  async commitFamily(workspaceId: string, request: FamilyCommitRequest) {
    const operations = compactFamilyOperations(request.operations)
    if (!operations.length) throw new AppError(422, 'FAMILY_COMMIT_INVALID', 'A family commit must contain at least one effective operation.')
    const result = await this.client.rpc('commit_family_operations', {
      p_workspace_id: workspaceId,
      p_commit_id: request.commitId,
      p_base_data_version: requiredBaseVersion(request),
      p_operations: operations as unknown as Json,
      p_client_created_at: request.clientCreatedAt,
    })
    if (result.error) commitError(result.error)
    const payload = payloadRecord(result.data)
    const snapshotData = requireValidFamilyData(payload.snapshot)
    const revision = { version: String(payload.dataVersion), modifiedTime: snapshotData.updatedAt }
    if (payload.status === 'conflict') {
      throw new AppError(409, 'FAMILY_COMMIT_CONFLICT', 'Some changes conflict with the latest Supabase version.', {
        conflicts: payload.conflicts ?? [],
        latestSnapshot: { data: snapshotData, revision },
      })
    }
    if (payload.status !== 'applied') throw new AppError(502, 'SUPABASE_COMMIT_RESPONSE_INVALID', 'Supabase did not return an applied family commit.')
    return { snapshot: { data: snapshotData, revision }, commit: commitMeta(request.commitId, payload) }
  }

  async commitStatus(workspaceId: string, commitId: string): Promise<FamilyCommitStatusResult> {
    const result = await this.client.rpc('get_family_commit_status', { p_workspace_id: workspaceId, p_commit_id: commitId })
    if (result.error) commitError(result.error)
    const payload = payloadRecord(result.data)
    if (payload.status === 'missing') return { status: 'missing' }
    if (payload.status !== 'applied' || !payload.snapshot || payload.dataVersion === undefined) return { status: payload.status }
    const data = requireValidFamilyData(payload.snapshot)
    return {
      status: 'applied',
      result: {
        snapshot: { data, revision: { version: String(payload.dataVersion), modifiedTime: data.updatedAt } },
        commit: commitMeta(commitId, payload),
      },
    }
  }

  async replaceFamily(workspaceId: string, data: FamilyData, expected: { version?: string } | undefined, mode: FamilySaveMode): Promise<FamilySnapshot> {
    const rawVersion = expected?.version
    if (!rawVersion || !/^\d+$/.test(rawVersion)) throw new AppError(422, 'FAMILY_BASE_VERSION_REQUIRED', 'Supabase dataset replacement requires a numeric base data version.')
    if (mode === 'save') throw new AppError(422, 'FAMILY_REPLACE_MODE_REQUIRED', 'Full Supabase writes must use replace, restore or merge mode.')
    const valid = requireValidFamilyData(data)
    const result = await this.client.rpc('replace_family_dataset', {
      p_workspace_id: workspaceId,
      p_expected_data_version: Number(rawVersion),
      p_family_data: valid as unknown as Json,
      p_mode: mode,
    })
    if (result.error) commitError(result.error)
    const payload = result.data as unknown as RpcReplacePayload
    const snapshotData = requireValidFamilyData(payload.snapshot)
    const snapshot = { data: snapshotData, revision: { version: String(payload.dataVersion), modifiedTime: snapshotData.updatedAt } }
    if (payload.status === 'conflict') throw new AppError(409, 'FAMILY_COMMIT_CONFLICT', 'The workspace changed before the dataset replacement could be applied.', { conflicts: [], latestSnapshot: snapshot })
    if (payload.status !== 'applied') throw new AppError(502, 'SUPABASE_COMMIT_RESPONSE_INVALID', 'Supabase did not return an applied dataset replacement.')
    return snapshot
  }

  async createBackup(workspaceId: string, reason: string) {
    const result = await this.client.rpc('create_family_snapshot', { p_workspace_id: workspaceId, p_reason: reason })
    if (result.error) commitError(result.error)
    const payload = result.data as { id?: unknown; reason?: unknown; createdAt?: unknown }
    if (typeof payload.id !== 'string') throw new AppError(502, 'SUPABASE_BACKUP_RESPONSE_INVALID', 'Supabase returned an invalid backup response.')
    const createdTime = typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString()
    const name = typeof payload.reason === 'string' ? payload.reason : reason
    return { id: payload.id, name, reason: name, createdTime, modifiedTime: createdTime }
  }
}

export function createSupabaseWriteRequestBackend(auth: AuthContext, selection: BackendSelection): RequestBackend {
  const client = createSupabaseUserClient(auth.accessToken)
  const repository = new SupabaseWriteRepository(client, auth.user.id)
  const media = new SupabaseMediaRepository(client)
  const collaboration = new SupabaseCollaborationRepository(client, auth.user, repository)
  const workspace = (workspaceId: string) => repository.getWorkspace(workspaceId)
  const unsupported = (operation: string): never => { throw new AppError(501, 'SUPABASE_WRITE_NOT_ENABLED', `${operation} is not enabled in the Supabase metadata-write phase.`) }
  return {
    selection,
    user: auth.user,
    workspaces: {
      list: () => repository.listWorkspaces(),
      connect: workspace,
      get: workspace,
      create: (name) => collaboration.createWorkspace(name),
      acceptInvitation: (token) => collaboration.acceptInvitation(token),
    },
    family: {
      load: (workspaceId) => repository.loadFamily(workspaceId),
      save: (workspaceId, data, expected, mode = 'save') => repository.replaceFamily(workspaceId, data, expected, mode),
      async commit(workspaceId, request) {
        const result = await repository.commitFamily(workspaceId, request)
        await media.cleanupQueued(workspaceId).catch((error) => console.error({ name: 'SupabaseMediaCleanupDeferred', workspaceId, error: error instanceof Error ? error.message : String(error) }))
        return result
      },
      commitStatus: (workspaceId, commitId) => repository.commitStatus(workspaceId, commitId),
      listActivity: (workspaceId) => repository.listActivity(workspaceId),
      recordActivity: async () => unsupported('Standalone activity write'),
    },
    media: {
      upload: (workspaceId, file, _filename, profileId, personId, thumbnail) => media.upload(workspaceId, file, profileId, personId, thumbnail),
      read: (workspaceId, mediaId, variant) => media.read(workspaceId, mediaId, variant),
      delete: (workspaceId, mediaId) => media.delete(workspaceId, mediaId),
    },
    members: {
      list: (workspaceId) => collaboration.listMembers(workspaceId),
      add: (workspaceId, email, role) => collaboration.invite(workspaceId, email, role),
      update: (workspaceId, memberId, role) => collaboration.updateMember(workspaceId, memberId, role),
      remove: (workspaceId, memberId) => collaboration.removeMember(workspaceId, memberId),
    },
    drafts: {
      submit: (workspaceId, request) => collaboration.submit(workspaceId, request),
      list: (workspaceId) => collaboration.list(workspaceId),
      status: (workspaceId) => collaboration.status(workspaceId),
      review: (workspaceId, request) => collaboration.review(workspaceId, request),
      async syncMirror(workspaceId) {
        const generation = Number((await repository.getWorkspaceRow(workspaceId)).row.data_version)
        return { status: 'synced', generation, processed: 0, remaining: 0, lastSyncedAt: new Date().toISOString() }
      },
      workspaceInfo: workspace,
      markCanonicalChanged: async (workspaceId) => Number((await repository.getWorkspaceRow(workspaceId)).row.data_version),
    },
    backups: {
      create: (workspaceId, _data, reason = 'manual') => repository.createBackup(workspaceId, reason),
      list: (workspaceId) => repository.listBackups(workspaceId),
      load: (workspaceId, backupId) => repository.loadBackup(workspaceId, backupId),
    },
  }
}
