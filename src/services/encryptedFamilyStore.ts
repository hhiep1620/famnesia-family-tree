import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, Tables } from '../types/database.generated'
import type { EncryptedCommitDependency, EncryptedCommitOperation, EncryptedEntityRecord } from '../crypto/encryptedDataContract'

export interface EncryptedWorkspaceState {
  workspaceId: string
  cryptoVersion: number
  encryptedSchemaVersion: number
  keyEpoch: number
  dataVersion: number
  directoryRevision: number
  membershipEpoch: number
  checkpointRevision: number
  checkpointHash?: string
  migrationState: 'parallel' | 'preview_ready' | 'canonical' | 'blocked'
}

export interface CiphertextCommitRequest {
  workspaceId: string
  commitId: string
  requestChecksum: string
  expectedDataVersion: number
  expectedKeyEpoch: number
  expectedMembershipEpoch: number
  dependencies: EncryptedCommitDependency[]
  operations: EncryptedCommitOperation[]
  checkpointId: string
}

export interface CiphertextCommitResult {
  commitId: string
  dataVersion: number
  idempotent: boolean
  checkpointRevision: number
  checkpointHash: string
}

export interface EncryptedFamilyStoreContract {
  loadState(workspaceId: string): Promise<EncryptedWorkspaceState>
  loadEntities(workspaceId: string): Promise<EncryptedEntityRecord[]>
  commit(request: CiphertextCommitRequest): Promise<CiphertextCommitResult>
  committed(workspaceId: string, commitId: string): Promise<CiphertextCommitResult | undefined>
}

function databaseError(error: { message: string; code?: string } | null): never {
  throw new Error(error?.code ? `${error.code}:${error.message}` : error?.message ?? 'SUPABASE_ENCRYPTED_STORE_ERROR')
}

function commitResult(value: Json): CiphertextCommitResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_ENCRYPTED_COMMIT_RESULT')
  const result = value as Record<string, Json | undefined>
  if (typeof result.commitId !== 'string' || typeof result.dataVersion !== 'number' || typeof result.idempotent !== 'boolean' ||
      typeof result.checkpointRevision !== 'number' || typeof result.checkpointHash !== 'string') {
    throw new Error('INVALID_ENCRYPTED_COMMIT_RESULT')
  }
  return { commitId: result.commitId, dataVersion: result.dataVersion, idempotent: result.idempotent,
    checkpointRevision: result.checkpointRevision, checkpointHash: result.checkpointHash }
}

type EncryptedEntityRow = Tables<'encrypted_entities'> & { writer_id: string }

function entityRecord(row: EncryptedEntityRow): EncryptedEntityRecord {
  return {
    workspaceId: row.workspace_id,
    entityId: row.entity_id,
    fieldClass: row.field_class,
    rowVersion: row.row_version,
    keyId: row.key_id,
    keyEpoch: row.key_epoch,
    writerPrincipalId: row.writer_principal_id,
    writerId: row.writer_id,
    envelope: row.envelope as unknown as EncryptedEntityRecord['envelope'],
  }
}

export class SupabaseEncryptedFamilyStore implements EncryptedFamilyStoreContract {
  private readonly client: SupabaseClient<Database>
  constructor(client: SupabaseClient<Database>) { this.client = client }

  async loadState(workspaceId: string): Promise<EncryptedWorkspaceState> {
    const { data, error } = await this.client.from('workspace_crypto_states')
      .select('workspace_id,crypto_version,encrypted_schema_version,key_epoch,data_version,directory_revision,membership_epoch,checkpoint_revision,checkpoint_hash,migration_state')
      .eq('workspace_id', workspaceId).single()
    if (error || !data) databaseError(error)
    return {
      workspaceId: data.workspace_id,
      cryptoVersion: data.crypto_version,
      encryptedSchemaVersion: data.encrypted_schema_version,
      keyEpoch: data.key_epoch,
      dataVersion: data.data_version,
      directoryRevision: data.directory_revision,
      membershipEpoch: data.membership_epoch,
      checkpointRevision: data.checkpoint_revision,
      checkpointHash: data.checkpoint_hash ?? undefined,
      migrationState: data.migration_state,
    }
  }

  async loadEntities(workspaceId: string): Promise<EncryptedEntityRecord[]> {
    const { data, error } = await this.client.from('encrypted_entities')
      .select('workspace_id,entity_id,field_class,row_version,key_id,key_epoch,writer_principal_id,writer_id,envelope')
      .eq('workspace_id', workspaceId)
    if (error || !data) databaseError(error)
    return (data as EncryptedEntityRow[]).map(entityRecord)
  }

  async commit(request: CiphertextCommitRequest): Promise<CiphertextCommitResult> {
    const { data, error } = await this.client.rpc('commit_encrypted_workspace_v2', {
      p_workspace_id: request.workspaceId,
      p_commit_id: request.commitId,
      p_request_checksum: request.requestChecksum,
      p_expected_data_version: request.expectedDataVersion,
      p_expected_key_epoch: request.expectedKeyEpoch,
      p_expected_membership_epoch: request.expectedMembershipEpoch,
      p_dependencies: request.dependencies as unknown as Json,
      p_operations: request.operations as unknown as Json,
      p_checkpoint_id: request.checkpointId,
    })
    if (error || !data) databaseError(error)
    return commitResult(data)
  }

  async committed(workspaceId: string, commitId: string): Promise<CiphertextCommitResult | undefined> {
    const { data, error } = await this.client.from('encrypted_commits')
      .select('commit_id,result_data_version,checkpoint_revision').eq('workspace_id', workspaceId).eq('commit_id', commitId).maybeSingle()
    if (error) databaseError(error)
    if (!data || data.checkpoint_revision === null) return undefined
    const checkpoint = await this.client.from('workspace_operation_checkpoints').select('checkpoint_hash')
      .eq('workspace_id', workspaceId).eq('commit_id', commitId).single()
    if (checkpoint.error || !checkpoint.data) databaseError(checkpoint.error)
    return { commitId: data.commit_id, dataVersion: data.result_data_version, checkpointRevision: data.checkpoint_revision,
      checkpointHash: checkpoint.data.checkpoint_hash, idempotent: true }
  }
}
