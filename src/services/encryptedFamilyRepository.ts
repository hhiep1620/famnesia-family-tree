import { canonicalize, encodeBase64Url } from '../crypto/contract'
import { EncryptedFamilyCodec } from '../crypto/encryptedFamilyCodec'
import type { EncryptedCommitOperation, EncryptedEntityRecord } from '../crypto/encryptedDataContract'
import type { WrappedKeyEnvelopeV1 } from '../crypto/keyContract'
import { WorkspaceKeySession } from '../crypto/workspaceKeySession'
import type { FamilyData } from '../types/family'
import type {
  CiphertextCommitRequest,
  EncryptedFamilyStoreContract,
  EncryptedWorkspaceState,
} from './encryptedFamilyStore'
export { parseFamilyRepositoryMode, type FamilyRepositoryMode } from './familyRepositoryMode'

export interface EncryptedFamilySnapshot {
  data: FamilyData
  revision: { version: string }
}

export interface EncryptedCheckpointCoordinator {
  register(request: CiphertextCommitRequest, state: EncryptedWorkspaceState): Promise<void>
}

export class EncryptedCommitOutcomeUnknownError extends Error {
  constructor() { super('ENCRYPTED_COMMIT_OUTCOME_UNKNOWN'); this.name = 'EncryptedCommitOutcomeUnknownError' }
}

async function checksum(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(value)))
  return `sha256:${encodeBase64Url(new Uint8Array(digest))}`
}

function entityKey(record: Pick<EncryptedEntityRecord, 'entityId' | 'fieldClass'>): string {
  return `${record.fieldClass}:${record.entityId}`
}

function logicalRecords(data: FamilyData): Map<string, string> {
  const records = new Map<string, string>()
  for (const value of data.profiles) records.set(`family_profile:${value.id}`, JSON.stringify(value))
  for (const value of data.persons) records.set(`person_core:${value.id}`, JSON.stringify({ ...value, phone1: '', phone2: '', address: '', note: '' }))
  for (const value of data.relationships) records.set(`relationship:${value.id}`, JSON.stringify(value))
  for (const value of data.media) records.set(`media_manifest:${value.id}`, JSON.stringify(value))
  records.set('workspace_settings:root', JSON.stringify({ schemaVersion: data.schemaVersion, settings: data.settings,
    manifest: [...records.keys()].sort() }))
  return records
}

export class EncryptedFamilyRepository {
  private readonly codec: EncryptedFamilyCodec
  private readonly store: EncryptedFamilyStoreContract
  private readonly session: WorkspaceKeySession
  private readonly isOnline: () => boolean
  private readonly checkpoints?: EncryptedCheckpointCoordinator
  private state?: EncryptedWorkspaceState
  private records: EncryptedEntityRecord[] = []
  private currentData?: FamilyData

  constructor(
    store: EncryptedFamilyStoreContract,
    session: WorkspaceKeySession,
    isOnline: () => boolean = () => navigator.onLine,
    checkpoints?: EncryptedCheckpointCoordinator,
  ) {
    this.store = store
    this.session = session
    this.isOnline = isOnline
    this.checkpoints = checkpoints
    this.codec = new EncryptedFamilyCodec(session)
  }

  async load(): Promise<EncryptedFamilySnapshot> {
    const state = await this.store.loadState(this.session.workspaceId)
    if (state.cryptoVersion !== 1 || state.encryptedSchemaVersion !== 1 || state.keyEpoch !== this.session.keyEpoch ||
        state.directoryRevision !== this.session.directoryRevision || state.migrationState === 'blocked') {
      throw new Error('ENCRYPTED_WORKSPACE_STATE_MISMATCH')
    }
    const records = await this.store.loadEntities(this.session.workspaceId)
    const data = await this.codec.decrypt(records, state.dataVersion)
    this.state = state
    this.records = records
    this.currentData = data
    return { data, revision: { version: String(state.dataVersion) } }
  }

  async initialize(data: FamilyData, wrappedKey: WrappedKeyEnvelopeV1, commitId: string = `bootstrap_${crypto.randomUUID()}`): Promise<EncryptedFamilySnapshot> {
    if (!this.isOnline()) throw new Error('ENCRYPTED_OFFLINE_WRITE_DISABLED')
    if (!this.checkpoints) throw new Error('ENCRYPTED_CHECKPOINT_SIGNER_REQUIRED')
    const state = await this.store.loadState(this.session.workspaceId)
    if (state.dataVersion !== 0 || state.keyEpoch !== this.session.keyEpoch || state.directoryRevision !== this.session.directoryRevision || state.migrationState === 'blocked') {
      throw new Error('ENCRYPTED_WORKSPACE_ALREADY_INITIALIZED')
    }
    const records = await this.codec.encrypt(data, 1)
    const operations: EncryptedCommitOperation[] = records.map((record) => ({
      type: 'entity_upsert', entityId: record.entityId, fieldClass: record.fieldClass,
      expectedRowVersion: 0, keyId: record.keyId, keyEpoch: record.keyEpoch, envelope: record.envelope,
    }))
    operations.push({ type: 'key_envelope_insert', wrappedEnvelope: wrappedKey })
    const requestWithoutChecksum = {
      workspaceId: this.session.workspaceId, commitId, expectedDataVersion: 0,
      expectedKeyEpoch: this.session.keyEpoch, operations,
      expectedMembershipEpoch: state.membershipEpoch, dependencies: [], checkpointId: `checkpoint-${commitId}`,
    }
    const request: CiphertextCommitRequest = { ...requestWithoutChecksum, requestChecksum: await checksum(requestWithoutChecksum) }
    await this.checkpoints.register(request, state)
    const committed = await this.store.commit(request)
    if (committed.dataVersion !== 1) throw new Error('ENCRYPTED_BOOTSTRAP_VERSION_MISMATCH')
    this.state = { ...state, dataVersion: 1, checkpointRevision: committed.checkpointRevision, checkpointHash: committed.checkpointHash }
    this.records = records
    this.currentData = data
    return { data, revision: { version: '1' } }
  }

  async save(data: FamilyData, expectedVersion: number, commitId: string = crypto.randomUUID()): Promise<EncryptedFamilySnapshot> {
    if (!this.isOnline()) throw new Error('ENCRYPTED_OFFLINE_WRITE_DISABLED')
    if (!this.state || !this.currentData || this.state.dataVersion !== expectedVersion) throw new Error('ENCRYPTED_REVISION_CONFLICT')
    if (!this.checkpoints) throw new Error('ENCRYPTED_CHECKPOINT_SIGNER_REQUIRED')
    const priorByKey = new Map(this.records.map((record) => [entityKey(record), record]))
    const rowVersions = new Map([...priorByKey].map(([key, record]) => [key, record.rowVersion + 1]))
    const resultVersion = expectedVersion + 1
    const nextRecords = await this.codec.encrypt(data, 1, rowVersions)
    const nextKeys = new Set(nextRecords.map(entityKey))
    const priorLogical = logicalRecords(this.currentData)
    const nextLogical = logicalRecords(data)
    const changedLogical = [...nextLogical].filter(([key, value]) => priorLogical.get(key) !== value).map(([key]) => key)
    const changedKeys = new Set(await Promise.all(changedLogical.map(async (key) => {
      const separator = key.indexOf(':')
      const fieldClass = key.slice(0, separator)
      const domainId = key.slice(separator + 1)
      return `${fieldClass}:${await this.session.opaqueEntityId(fieldClass, domainId)}`
    })))
    const operations: EncryptedCommitOperation[] = nextRecords.filter((record) => changedKeys.has(entityKey(record))).map((record) => ({
      type: 'entity_upsert', entityId: record.entityId, fieldClass: record.fieldClass,
      expectedRowVersion: priorByKey.get(entityKey(record))?.rowVersion ?? 0,
      keyId: record.keyId, keyEpoch: record.keyEpoch, envelope: record.envelope,
    }))
    for (const prior of this.records) {
      if (!nextKeys.has(entityKey(prior))) operations.push({
        type: 'entity_delete', entityId: prior.entityId, fieldClass: prior.fieldClass, expectedRowVersion: prior.rowVersion,
      })
    }
    if (operations.length === 0) return { data: this.currentData, revision: { version: String(expectedVersion) } }
    if (operations.length > 500) throw new Error('ENCRYPTED_COMMIT_TOO_LARGE')
    const requestWithoutChecksum = {
      workspaceId: this.session.workspaceId, commitId, expectedDataVersion: expectedVersion,
      expectedKeyEpoch: this.session.keyEpoch, operations,
      expectedMembershipEpoch: this.state.membershipEpoch,
      dependencies: [],
      checkpointId: `checkpoint-${commitId}`,
    }
    const request: CiphertextCommitRequest = {
      ...requestWithoutChecksum,
      requestChecksum: await checksum(requestWithoutChecksum),
    }
    await this.checkpoints.register(request, this.state)
    let committed
    try { committed = await this.store.commit(request) }
    catch {
      const recovered = await this.store.committed(this.session.workspaceId, commitId).catch(() => undefined)
      if (!recovered) throw new EncryptedCommitOutcomeUnknownError()
      committed = recovered
    }
    if (committed.commitId !== commitId) throw new Error('ENCRYPTED_COMMIT_ID_MISMATCH')
    if (committed.dataVersion !== resultVersion) throw new Error('ENCRYPTED_COMMIT_VERSION_MISMATCH')
    this.state = { ...this.state, dataVersion: resultVersion, checkpointRevision: committed.checkpointRevision,
      checkpointHash: committed.checkpointHash }
    const nextByKey = new Map(nextRecords.map((record) => [entityKey(record), record]))
    this.records = [...nextByKey].map(([key, record]) => changedKeys.has(key) ? record : priorByKey.get(key) ?? record)
    this.currentData = { ...data, updatedAt: this.currentData.updatedAt }
    return { data: this.currentData, revision: { version: String(resultVersion) } }
  }
}
